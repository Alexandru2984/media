use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::{query, query_as, query_scalar, MySql, MySqlPool, Transaction};
use std::collections::HashMap;
use uuid::Uuid;

use crate::handlers::get_current_user;

const MAXIMUM_NOTIFICATIONS_PER_ACCOUNT: i64 = 500;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub(crate) enum NotificationKind {
    FollowRequest,
    FollowAccepted,
    NewFollower,
    PostLike,
    PostComment,
}

impl NotificationKind {
    fn as_str(self) -> &'static str {
        match self {
            Self::FollowRequest => "follow_request",
            Self::FollowAccepted => "follow_accepted",
            Self::NewFollower => "new_follower",
            Self::PostLike => "post_like",
            Self::PostComment => "post_comment",
        }
    }

    fn requires_post(self) -> bool {
        matches!(self, Self::PostLike | Self::PostComment)
    }
}

fn notification_event_key(
    kind: NotificationKind,
    actor_id: &str,
    post_id: Option<&str>,
) -> Result<String, StatusCode> {
    if kind.requires_post() != post_id.is_some() {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    Ok(match post_id {
        Some(post_id) => format!("{}:{actor_id}:{post_id}", kind.as_str()),
        None => format!("{}:{actor_id}", kind.as_str()),
    })
}

/// The caller must hold the recipient user's row lock. This makes the hard cap
/// deterministic even when several interactions arrive concurrently.
pub(crate) async fn upsert_notification(
    transaction: &mut Transaction<'_, MySql>,
    recipient_id: &str,
    actor_id: &str,
    kind: NotificationKind,
    post_id: Option<&str>,
) -> Result<(), StatusCode> {
    if recipient_id == actor_id {
        return Ok(());
    }

    let event_key = notification_event_key(kind, actor_id, post_id)?;
    query(
        "INSERT INTO notifications
            (id, recipient_id, actor_id, kind, post_id, event_key, read_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
         ON DUPLICATE KEY UPDATE
            created_at = VALUES(created_at),
            read_at = NULL,
            post_id = VALUES(post_id)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(recipient_id)
    .bind(actor_id)
    .bind(kind.as_str())
    .bind(post_id)
    .bind(event_key)
    .bind(Utc::now())
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to store notification");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let count: i64 = query_scalar("SELECT COUNT(*) FROM notifications WHERE recipient_id = ?")
        .bind(recipient_id)
        .fetch_one(&mut **transaction)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to count notification retention");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    let excess = count.saturating_sub(MAXIMUM_NOTIFICATIONS_PER_ACCOUNT);
    if excess > 0 {
        query(
            "DELETE FROM notifications
             WHERE recipient_id = ?
             ORDER BY created_at ASC, id ASC
             LIMIT ?",
        )
        .bind(recipient_id)
        .bind(excess)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to enforce notification retention");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    }

    Ok(())
}

pub(crate) async fn delete_notification_event(
    transaction: &mut Transaction<'_, MySql>,
    recipient_id: &str,
    actor_id: &str,
    kind: NotificationKind,
    post_id: Option<&str>,
) -> Result<(), StatusCode> {
    let event_key = notification_event_key(kind, actor_id, post_id)?;
    query("DELETE FROM notifications WHERE recipient_id = ? AND event_key = ?")
        .bind(recipient_id)
        .bind(event_key)
        .execute(&mut **transaction)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to remove notification");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    Ok(())
}

#[derive(sqlx::FromRow)]
struct NotificationRow {
    id: String,
    kind: String,
    post_id: Option<String>,
    is_read: bool,
    created_at: DateTime<Utc>,
    actor_id: String,
    actor_username: String,
    actor_avatar_url: Option<String>,
}

#[derive(Serialize)]
struct NotificationActor {
    id: String,
    username: String,
    avatar_url: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct NotificationResponse {
    id: String,
    kind: String,
    post_id: Option<String>,
    is_read: bool,
    created_at: DateTime<Utc>,
    actor: NotificationActor,
}

pub async fn list_notifications(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<NotificationResponse>>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(20)
        .clamp(1, 50);
    let offset = params
        .get("offset")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .clamp(0, MAXIMUM_NOTIFICATIONS_PER_ACCOUNT);

    let rows = query_as::<_, NotificationRow>(
        "SELECT n.id, n.kind, n.post_id, (n.read_at IS NOT NULL) AS is_read,
                n.created_at, actor.id AS actor_id,
                actor.username AS actor_username,
                actor.avatar_url AS actor_avatar_url
         FROM notifications n
         INNER JOIN users actor ON actor.id = n.actor_id
         WHERE n.recipient_id = ?
           AND NOT EXISTS (
               SELECT 1 FROM user_blocks block_pair
               WHERE (block_pair.blocker_id = n.recipient_id AND block_pair.blocked_id = n.actor_id)
                  OR (block_pair.blocker_id = n.actor_id AND block_pair.blocked_id = n.recipient_id)
           )
         ORDER BY n.created_at DESC, n.id DESC
         LIMIT ? OFFSET ?",
    )
    .bind(&user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to fetch notifications");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        rows.into_iter()
            .map(|row| NotificationResponse {
                id: row.id,
                kind: row.kind,
                post_id: row.post_id,
                is_read: row.is_read,
                created_at: row.created_at,
                actor: NotificationActor {
                    id: row.actor_id,
                    username: row.actor_username,
                    avatar_url: row.actor_avatar_url,
                },
            })
            .collect(),
    ))
}

pub async fn unread_notification_count(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    let count: i64 = query_scalar(
        "SELECT COUNT(*)
         FROM notifications n
         WHERE n.recipient_id = ? AND n.read_at IS NULL
           AND NOT EXISTS (
               SELECT 1 FROM user_blocks block_pair
               WHERE (block_pair.blocker_id = n.recipient_id AND block_pair.blocked_id = n.actor_id)
                  OR (block_pair.blocker_id = n.actor_id AND block_pair.blocked_id = n.recipient_id)
           )",
    )
    .bind(&user_id)
    .fetch_one(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to count unread notifications");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(json!({ "count": count })))
}

pub async fn mark_notification_read(
    State(pool): State<MySqlPool>,
    Path(notification_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    if Uuid::parse_str(&notification_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let user_id = get_current_user(&pool, &headers).await?;
    let updated = query(
        "UPDATE notifications SET read_at = COALESCE(read_at, ?)
         WHERE id = ? AND recipient_id = ?",
    )
    .bind(Utc::now())
    .bind(&notification_id)
    .bind(&user_id)
    .execute(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to mark notification read");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    if updated.rows_affected() != 1 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(json!({ "read": true })))
}

pub async fn mark_all_notifications_read(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    let updated = query(
        "UPDATE notifications SET read_at = ?
         WHERE recipient_id = ? AND read_at IS NULL",
    )
    .bind(Utc::now())
    .bind(&user_id)
    .execute(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to mark all notifications read");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(json!({ "updated": updated.rows_affected() })))
}

pub async fn delete_notification(
    State(pool): State<MySqlPool>,
    Path(notification_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    if Uuid::parse_str(&notification_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let user_id = get_current_user(&pool, &headers).await?;
    let deleted = query("DELETE FROM notifications WHERE id = ? AND recipient_id = ?")
        .bind(&notification_id)
        .bind(&user_id)
        .execute(&pool)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "failed to delete notification");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    if deleted.rows_affected() != 1 {
        return Err(StatusCode::NOT_FOUND);
    }
    Ok(Json(json!({ "deleted": true })))
}

#[cfg(test)]
mod tests {
    use super::{notification_event_key, NotificationKind};

    #[test]
    fn event_keys_group_repeated_interactions() {
        assert_eq!(
            notification_event_key(NotificationKind::FollowRequest, "actor", None).unwrap(),
            "follow_request:actor"
        );
        assert_eq!(
            notification_event_key(NotificationKind::PostLike, "actor", Some("post")).unwrap(),
            "post_like:actor:post"
        );
    }

    #[test]
    fn event_shape_must_match_kind() {
        assert!(notification_event_key(NotificationKind::PostComment, "actor", None).is_err());
        assert!(
            notification_event_key(NotificationKind::NewFollower, "actor", Some("post")).is_err()
        );
    }
}
