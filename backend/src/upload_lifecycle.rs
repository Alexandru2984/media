use chrono::{Duration as ChronoDuration, Utc};
use sqlx::{query, query_as, query_scalar, MySql, MySqlPool, Transaction};
use std::{path::PathBuf, time::Duration};
use tokio::time::MissedTickBehavior;
use uuid::Uuid;

pub const MAX_ACCOUNT_UPLOAD_BYTES: i64 = 100 * 1024 * 1024;
pub const MAX_PENDING_POST_UPLOADS: i64 = 5;

const PENDING_UPLOAD_LIFETIME_HOURS: i64 = 24;
const WRITING_UPLOAD_LIFETIME_HOURS: i64 = 1;
const MAINTENANCE_INTERVAL_SECONDS: u64 = 15 * 60;
const MAINTENANCE_BATCH_SIZE: i64 = 100;

#[derive(Clone, Copy)]
pub enum ManagedUploadKind {
    Avatar,
    Post,
}

impl ManagedUploadKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::Avatar => "avatar",
            Self::Post => "post",
        }
    }
}

#[derive(Debug)]
pub enum UploadLifecycleError {
    AccountQuotaExceeded,
    PendingLimitExceeded,
    Database(sqlx::Error),
}

impl From<sqlx::Error> for UploadLifecycleError {
    fn from(error: sqlx::Error) -> Self {
        Self::Database(error)
    }
}

#[derive(sqlx::FromRow)]
struct CleanupCandidate {
    id: String,
    url: String,
    state: String,
}

fn upload_path(url: &str) -> Option<PathBuf> {
    let (directory, filename) = if let Some(filename) = url.strip_prefix("/uploads/avatars/") {
        ("uploads/avatars", filename)
    } else {
        let filename = url.strip_prefix("/uploads/posts/")?;
        ("uploads/posts", filename)
    };

    if filename.is_empty()
        || filename == "."
        || filename == ".."
        || filename.contains('/')
        || filename.contains('\\')
    {
        return None;
    }

    Some(PathBuf::from(directory).join(filename))
}

async fn remove_file(url: &str) -> Result<(), std::io::Error> {
    let path = upload_path(url).ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "invalid managed upload URL",
        )
    })?;
    match tokio::fs::remove_file(path).await {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error),
    }
}

async fn finalize_deleting_upload(pool: &MySqlPool, candidate: CleanupCandidate) {
    if candidate.state != "deleting" {
        return;
    }

    if let Err(error) = remove_file(&candidate.url).await {
        tracing::error!(
            error = %error,
            upload_id = %candidate.id,
            "failed to remove managed upload; maintenance will retry"
        );
        return;
    }

    if let Err(error) = query("DELETE FROM managed_uploads WHERE id = ? AND state = 'deleting'")
        .bind(&candidate.id)
        .execute(pool)
        .await
    {
        tracing::error!(
            error = %error,
            upload_id = %candidate.id,
            "failed to finalize managed upload deletion"
        );
    }
}

async fn expire_candidate(
    pool: &MySqlPool,
    candidate: CleanupCandidate,
    pending_cutoff: chrono::DateTime<Utc>,
    writing_cutoff: chrono::DateTime<Utc>,
) {
    let result = match candidate.state.as_str() {
        "pending" => {
            query(
                "UPDATE managed_uploads
                 SET state = 'deleting', post_id = NULL, attached_at = NULL
                 WHERE id = ? AND state = 'pending' AND created_at < ?",
            )
            .bind(&candidate.id)
            .bind(pending_cutoff)
            .execute(pool)
            .await
        }
        "writing" => {
            query(
                "UPDATE managed_uploads
                 SET state = 'deleting', post_id = NULL, attached_at = NULL
                 WHERE id = ? AND state = 'writing' AND created_at < ?",
            )
            .bind(&candidate.id)
            .bind(writing_cutoff)
            .execute(pool)
            .await
        }
        "deleting" => {
            finalize_deleting_upload(pool, candidate).await;
            return;
        }
        _ => return,
    };

    match result {
        Ok(result) if result.rows_affected() == 1 => {
            finalize_deleting_upload(
                pool,
                CleanupCandidate {
                    state: "deleting".to_owned(),
                    ..candidate
                },
            )
            .await;
        }
        Ok(_) => {}
        Err(error) => tracing::error!(
            error = %error,
            upload_id = %candidate.id,
            "failed to expire managed upload"
        ),
    }
}

pub async fn cleanup_expired_uploads(pool: &MySqlPool, user_id: Option<&str>, limit: i64) {
    let pending_cutoff = Utc::now() - ChronoDuration::hours(PENDING_UPLOAD_LIFETIME_HOURS);
    let writing_cutoff = Utc::now() - ChronoDuration::hours(WRITING_UPLOAD_LIFETIME_HOURS);

    let candidates = if let Some(user_id) = user_id {
        query_as::<_, CleanupCandidate>(
            "SELECT id, url, state
             FROM managed_uploads
             WHERE user_id = ? AND (
                 state = 'deleting'
                 OR (state = 'pending' AND created_at < ?)
                 OR (state = 'writing' AND created_at < ?)
             )
             ORDER BY created_at ASC
             LIMIT ?",
        )
        .bind(user_id)
        .bind(pending_cutoff)
        .bind(writing_cutoff)
        .bind(limit)
        .fetch_all(pool)
        .await
    } else {
        query_as::<_, CleanupCandidate>(
            "SELECT id, url, state
             FROM managed_uploads
             WHERE state = 'deleting'
                 OR (state = 'pending' AND created_at < ?)
                 OR (state = 'writing' AND created_at < ?)
             ORDER BY created_at ASC
             LIMIT ?",
        )
        .bind(pending_cutoff)
        .bind(writing_cutoff)
        .bind(limit)
        .fetch_all(pool)
        .await
    };

    let candidates = match candidates {
        Ok(candidates) => candidates,
        Err(error) => {
            tracing::error!(error = %error, "failed to select expired managed uploads");
            return;
        }
    };

    for candidate in candidates {
        expire_candidate(pool, candidate, pending_cutoff, writing_cutoff).await;
    }
}

pub fn spawn_upload_maintenance(pool: MySqlPool) {
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(MAINTENANCE_INTERVAL_SECONDS));
        interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

        loop {
            interval.tick().await;
            cleanup_expired_uploads(&pool, None, MAINTENANCE_BATCH_SIZE).await;
        }
    });
}

pub async fn reserve_upload(
    pool: &MySqlPool,
    user_id: &str,
    url: &str,
    kind: ManagedUploadKind,
    size_bytes: usize,
) -> Result<String, UploadLifecycleError> {
    cleanup_expired_uploads(pool, Some(user_id), 20).await;

    let size_bytes =
        i64::try_from(size_bytes).map_err(|_| UploadLifecycleError::AccountQuotaExceeded)?;
    let mut transaction = pool.begin().await?;

    let account_exists: Option<String> =
        query_scalar("SELECT id FROM users WHERE id = ? FOR UPDATE")
            .bind(user_id)
            .fetch_optional(&mut *transaction)
            .await?;
    if account_exists.is_none() {
        return Err(UploadLifecycleError::Database(sqlx::Error::RowNotFound));
    }

    let total_bytes: i64 = if matches!(kind, ManagedUploadKind::Avatar) {
        query_scalar(
            "SELECT CAST(COALESCE(SUM(size_bytes), 0) AS SIGNED)
             FROM managed_uploads
             WHERE user_id = ? AND state <> 'deleting'
                 AND NOT (kind = 'avatar' AND state = 'attached')",
        )
        .bind(user_id)
        .fetch_one(&mut *transaction)
        .await?
    } else {
        query_scalar(
            "SELECT CAST(COALESCE(SUM(size_bytes), 0) AS SIGNED)
             FROM managed_uploads
             WHERE user_id = ? AND state <> 'deleting'",
        )
        .bind(user_id)
        .fetch_one(&mut *transaction)
        .await?
    };

    if total_bytes.saturating_add(size_bytes) > MAX_ACCOUNT_UPLOAD_BYTES {
        return Err(UploadLifecycleError::AccountQuotaExceeded);
    }

    if matches!(kind, ManagedUploadKind::Post) {
        let pending_count: i64 = query_scalar(
            "SELECT COUNT(*) FROM managed_uploads
             WHERE user_id = ? AND kind = 'post' AND state IN ('writing', 'pending')",
        )
        .bind(user_id)
        .fetch_one(&mut *transaction)
        .await?;
        if pending_count >= MAX_PENDING_POST_UPLOADS {
            return Err(UploadLifecycleError::PendingLimitExceeded);
        }
    }

    let upload_id = Uuid::new_v4().to_string();
    query(
        "INSERT INTO managed_uploads
             (id, user_id, url, kind, state, size_bytes, created_at)
         VALUES (?, ?, ?, ?, 'writing', ?, ?)",
    )
    .bind(&upload_id)
    .bind(user_id)
    .bind(url)
    .bind(kind.as_str())
    .bind(size_bytes)
    .bind(Utc::now())
    .execute(&mut *transaction)
    .await?;

    transaction.commit().await?;
    Ok(upload_id)
}

pub async fn mark_post_upload_pending(
    pool: &MySqlPool,
    upload_id: &str,
) -> Result<(), sqlx::Error> {
    let result = query(
        "UPDATE managed_uploads SET state = 'pending'
         WHERE id = ? AND kind = 'post' AND state = 'writing'",
    )
    .bind(upload_id)
    .execute(pool)
    .await?;
    if result.rows_affected() == 1 {
        Ok(())
    } else {
        Err(sqlx::Error::RowNotFound)
    }
}

pub async fn attach_avatar_upload(
    pool: &MySqlPool,
    upload_id: &str,
    user_id: &str,
    avatar_url: &str,
) -> Result<Option<String>, sqlx::Error> {
    let mut transaction = pool.begin().await?;
    let previous_avatar: Option<String> =
        query_scalar("SELECT avatar_url FROM users WHERE id = ? FOR UPDATE")
            .bind(user_id)
            .fetch_one(&mut *transaction)
            .await?;

    let attached = query(
        "UPDATE managed_uploads
         SET state = 'attached', attached_at = ?
         WHERE id = ? AND user_id = ? AND url = ?
             AND kind = 'avatar' AND state = 'writing'",
    )
    .bind(Utc::now())
    .bind(upload_id)
    .bind(user_id)
    .bind(avatar_url)
    .execute(&mut *transaction)
    .await?;
    if attached.rows_affected() != 1 {
        return Err(sqlx::Error::RowNotFound);
    }

    query(
        "UPDATE managed_uploads
         SET state = 'deleting', post_id = NULL, attached_at = NULL
         WHERE user_id = ? AND kind = 'avatar' AND state = 'attached' AND id <> ?",
    )
    .bind(user_id)
    .bind(upload_id)
    .execute(&mut *transaction)
    .await?;

    let updated = query("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?")
        .bind(avatar_url)
        .bind(Utc::now())
        .bind(user_id)
        .execute(&mut *transaction)
        .await?;
    if updated.rows_affected() != 1 {
        return Err(sqlx::Error::RowNotFound);
    }

    transaction.commit().await?;
    Ok(previous_avatar)
}

pub async fn claim_post_upload(
    transaction: &mut Transaction<'_, MySql>,
    user_id: &str,
    image_url: &str,
    post_id: &str,
) -> Result<bool, sqlx::Error> {
    let result = query(
        "UPDATE managed_uploads
         SET state = 'attached', post_id = ?, attached_at = ?
         WHERE user_id = ? AND url = ? AND kind = 'post' AND state = 'pending'",
    )
    .bind(post_id)
    .bind(Utc::now())
    .bind(user_id)
    .bind(image_url)
    .execute(&mut **transaction)
    .await?;
    Ok(result.rows_affected() == 1)
}

pub async fn mark_post_upload_deleting(
    transaction: &mut Transaction<'_, MySql>,
    post_id: &str,
    image_url: &str,
) -> Result<(), sqlx::Error> {
    query(
        "UPDATE managed_uploads
         SET state = 'deleting', post_id = NULL, attached_at = NULL
         WHERE post_id = ? AND url = ? AND kind = 'post' AND state = 'attached'",
    )
    .bind(post_id)
    .bind(image_url)
    .execute(&mut **transaction)
    .await?;
    Ok(())
}

pub async fn discard_upload(pool: &MySqlPool, upload_id: &str) {
    let candidate =
        query_as::<_, CleanupCandidate>("SELECT id, url, state FROM managed_uploads WHERE id = ?")
            .bind(upload_id)
            .fetch_optional(pool)
            .await;

    let candidate = match candidate {
        Ok(Some(candidate)) => candidate,
        Ok(None) => return,
        Err(error) => {
            tracing::error!(error = %error, upload_id, "failed to load discarded upload");
            return;
        }
    };

    let marked = query(
        "UPDATE managed_uploads
         SET state = 'deleting', post_id = NULL, attached_at = NULL
         WHERE id = ? AND state IN ('writing', 'pending')",
    )
    .bind(upload_id)
    .execute(pool)
    .await;

    match marked {
        Ok(result) if result.rows_affected() == 1 || candidate.state == "deleting" => {
            finalize_deleting_upload(
                pool,
                CleanupCandidate {
                    state: "deleting".to_owned(),
                    ..candidate
                },
            )
            .await;
        }
        Ok(_) => {}
        Err(error) => tracing::error!(error = %error, upload_id, "failed to discard upload"),
    }
}

pub async fn finish_deleting_upload_by_url(pool: &MySqlPool, url: &str) {
    match remove_file(url).await {
        Ok(()) => {
            if let Err(error) =
                query("DELETE FROM managed_uploads WHERE url = ? AND state = 'deleting'")
                    .bind(url)
                    .execute(pool)
                    .await
            {
                tracing::error!(error = %error, url, "failed to finalize upload deletion");
            }
        }
        Err(error) => {
            tracing::error!(error = %error, url, "failed to remove upload; maintenance will retry")
        }
    }
}

#[cfg(test)]
mod tests {
    use super::upload_path;

    #[test]
    fn resolves_only_flat_managed_upload_paths() {
        assert_eq!(
            upload_path("/uploads/posts/post_user_uuid.webp"),
            Some("uploads/posts/post_user_uuid.webp".into())
        );
        assert_eq!(
            upload_path("/uploads/avatars/user_uuid.png"),
            Some("uploads/avatars/user_uuid.png".into())
        );
        assert_eq!(upload_path("/uploads/posts/../avatars/a.png"), None);
        assert_eq!(upload_path("/uploads/posts/nested/a.png"), None);
        assert_eq!(upload_path("/etc/passwd"), None);
    }
}
