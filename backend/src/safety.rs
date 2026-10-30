use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use chrono::{DateTime, Duration, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{query, query_as, query_scalar, MySqlPool};
use std::collections::HashMap;
use uuid::Uuid;

use crate::handlers::get_current_user;

const MAXIMUM_MUTED_USERS: i64 = 5_000;
const MAXIMUM_HIDDEN_POSTS: i64 = 5_000;
const MAXIMUM_OPEN_REPORTS: i64 = 100;
const MAXIMUM_STORED_REPORTS: i64 = 2_000;
const MAXIMUM_REPORTS_PER_DAY: i64 = 20;
const MAXIMUM_REPORT_DETAILS_CHARACTERS: usize = 1_000;
const REPORT_EVENT_RETENTION_DAYS: i64 = 7;
const FINAL_REPORT_RETENTION_DAYS: i64 = 365;

#[derive(Serialize, sqlx::FromRow)]
pub(crate) struct MutedUserResponse {
    id: String,
    username: String,
    bio: Option<String>,
    avatar_url: Option<String>,
    muted_at: DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct HiddenPostRow {
    post_id: String,
    hidden_at: DateTime<Utc>,
    available: bool,
    author_id: Option<String>,
    author_username: Option<String>,
    author_avatar_url: Option<String>,
}

#[derive(Serialize)]
pub(crate) struct HiddenPostResponse {
    post_id: String,
    hidden_at: DateTime<Utc>,
    available: bool,
    author: Option<SafetyUserResponse>,
}

#[derive(Serialize)]
struct SafetyUserResponse {
    id: String,
    username: String,
    avatar_url: Option<String>,
}

#[derive(Deserialize)]
pub(crate) struct CreateReportRequest {
    target_type: String,
    target_id: String,
    reason: String,
    details: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub(crate) struct ReportResponse {
    id: String,
    target_type: String,
    target_id: String,
    target_label: Option<String>,
    reason: String,
    details: Option<String>,
    status: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
}

struct ReportTarget {
    user_id: Option<String>,
    post_id: Option<String>,
    comment_id: Option<String>,
    actor_id: String,
    audience_author_id: Option<String>,
    label: String,
    excerpt: Option<String>,
}

fn pagination(params: &HashMap<String, String>, default_limit: i64, max_offset: i64) -> (i64, i64) {
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(default_limit)
        .clamp(1, 50);
    let offset = params
        .get("offset")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .clamp(0, max_offset);
    (limit, offset)
}

fn report_reason_is_valid(reason: &str) -> bool {
    matches!(
        reason,
        "spam"
            | "harassment"
            | "hate"
            | "violence"
            | "sexual"
            | "self_harm"
            | "impersonation"
            | "privacy"
            | "illegal"
            | "other"
    )
}

fn normalized_report_details(details: Option<&str>) -> Result<Option<String>, StatusCode> {
    let details = details.map(str::trim).filter(|value| !value.is_empty());
    if details.is_some_and(|value| value.chars().count() > MAXIMUM_REPORT_DETAILS_CHARACTERS) {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(details.map(str::to_owned))
}

async fn target_is_visible(
    pool: &MySqlPool,
    viewer_id: &str,
    author_id: &str,
) -> Result<bool, StatusCode> {
    query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM users author
            WHERE author.id = ?
              AND (
                  author.is_private = 0
                  OR author.id = ?
                  OR EXISTS(
                      SELECT 1 FROM follows private_follow
                      WHERE private_follow.follower_id = ?
                        AND private_follow.followed_id = author.id
                  )
              )
              AND NOT EXISTS(
                  SELECT 1 FROM user_blocks block_pair
                  WHERE (block_pair.blocker_id = ? AND block_pair.blocked_id = author.id)
                     OR (block_pair.blocker_id = author.id AND block_pair.blocked_id = ?)
              )
         )",
    )
    .bind(author_id)
    .bind(viewer_id)
    .bind(viewer_id)
    .bind(viewer_id)
    .bind(viewer_id)
    .fetch_one(pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to evaluate report target access");
        StatusCode::INTERNAL_SERVER_ERROR
    })
}

pub async fn mute_user(
    State(pool): State<MySqlPool>,
    Path(target_user_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    if Uuid::parse_str(&target_user_id).is_err() || target_user_id == user_id {
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let locked_users =
        query_scalar::<_, String>("SELECT id FROM users WHERE id IN (?, ?) ORDER BY id FOR UPDATE")
            .bind(&user_id)
            .bind(&target_user_id)
            .fetch_all(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if locked_users.len() != 2 {
        return Err(StatusCode::NOT_FOUND);
    }

    let is_blocked: bool = query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM user_blocks
            WHERE (blocker_id = ? AND blocked_id = ?)
               OR (blocker_id = ? AND blocked_id = ?)
         )",
    )
    .bind(&user_id)
    .bind(&target_user_id)
    .bind(&target_user_id)
    .bind(&user_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if is_blocked {
        return Err(StatusCode::FORBIDDEN);
    }

    let already_muted: bool =
        query_scalar("SELECT EXISTS(SELECT 1 FROM user_mutes WHERE muter_id = ? AND muted_id = ?)")
            .bind(&user_id)
            .bind(&target_user_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !already_muted {
        let count: i64 = query_scalar("SELECT COUNT(*) FROM user_mutes WHERE muter_id = ?")
            .bind(&user_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if count >= MAXIMUM_MUTED_USERS {
            return Err(StatusCode::INSUFFICIENT_STORAGE);
        }
        query("INSERT INTO user_mutes (muter_id, muted_id, created_at) VALUES (?, ?, ?)")
            .bind(&user_id)
            .bind(&target_user_id)
            .bind(Utc::now())
            .execute(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }

    query("DELETE FROM notifications WHERE recipient_id = ? AND actor_id = ?")
        .bind(&user_id)
        .bind(&target_user_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "muted": true })))
}

pub async fn unmute_user(
    State(pool): State<MySqlPool>,
    Path(target_user_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    if Uuid::parse_str(&target_user_id).is_err() || target_user_id == user_id {
        return Err(StatusCode::BAD_REQUEST);
    }
    query("DELETE FROM user_mutes WHERE muter_id = ? AND muted_id = ?")
        .bind(&user_id)
        .bind(&target_user_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "muted": false })))
}

pub async fn list_muted_users(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<MutedUserResponse>>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    let (limit, offset) = pagination(&params, 20, MAXIMUM_MUTED_USERS);
    let users = query_as::<_, MutedUserResponse>(
        "SELECT u.id, u.username, u.bio, u.avatar_url, relationship.created_at AS muted_at
         FROM user_mutes relationship
         INNER JOIN users u ON u.id = relationship.muted_id
         WHERE relationship.muter_id = ?
         ORDER BY relationship.created_at DESC, u.id ASC
         LIMIT ? OFFSET ?",
    )
    .bind(&user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to list muted users");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(users))
}

pub async fn hide_post(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    if Uuid::parse_str(&post_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    query_scalar::<_, String>("SELECT id FROM users WHERE id = ? FOR UPDATE")
        .bind(&user_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|_| StatusCode::UNAUTHORIZED)?;
    let author_id: Option<String> =
        query_scalar("SELECT user_id FROM posts WHERE id = ? FOR UPDATE")
            .bind(&post_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let author_id = author_id.ok_or(StatusCode::NOT_FOUND)?;
    if author_id == user_id {
        return Err(StatusCode::BAD_REQUEST);
    }
    if !target_is_visible(&pool, &user_id, &author_id).await? {
        return Err(StatusCode::FORBIDDEN);
    }

    let already_hidden: bool =
        query_scalar("SELECT EXISTS(SELECT 1 FROM hidden_posts WHERE user_id = ? AND post_id = ?)")
            .bind(&user_id)
            .bind(&post_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if !already_hidden {
        let count: i64 = query_scalar("SELECT COUNT(*) FROM hidden_posts WHERE user_id = ?")
            .bind(&user_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        if count >= MAXIMUM_HIDDEN_POSTS {
            return Err(StatusCode::INSUFFICIENT_STORAGE);
        }
        query("INSERT INTO hidden_posts (user_id, post_id, created_at) VALUES (?, ?, ?)")
            .bind(&user_id)
            .bind(&post_id)
            .bind(Utc::now())
            .execute(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    query("DELETE FROM saved_posts WHERE user_id = ? AND post_id = ?")
        .bind(&user_id)
        .bind(&post_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "hidden": true, "saved": false })))
}

pub async fn unhide_post(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    if Uuid::parse_str(&post_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }
    query("DELETE FROM hidden_posts WHERE user_id = ? AND post_id = ?")
        .bind(&user_id)
        .bind(&post_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "hidden": false })))
}

pub async fn list_hidden_posts(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<HiddenPostResponse>>, StatusCode> {
    let user_id = get_current_user(&pool, &headers).await?;
    let (limit, offset) = pagination(&params, 20, MAXIMUM_HIDDEN_POSTS);
    let rows = query_as::<_, HiddenPostRow>(
        "SELECT hidden.post_id, hidden.created_at AS hidden_at,
                NOT EXISTS(
                    SELECT 1 FROM user_blocks block_pair
                    WHERE (block_pair.blocker_id = hidden.user_id AND block_pair.blocked_id = p.user_id)
                       OR (block_pair.blocker_id = p.user_id AND block_pair.blocked_id = hidden.user_id)
                ) AND (
                    u.is_private = 0 OR p.user_id = hidden.user_id OR EXISTS(
                        SELECT 1 FROM follows private_follow
                        WHERE private_follow.follower_id = hidden.user_id
                          AND private_follow.followed_id = p.user_id
                    )
                ) AS available,
                CASE WHEN NOT EXISTS(
                    SELECT 1 FROM user_blocks block_pair
                    WHERE (block_pair.blocker_id = hidden.user_id AND block_pair.blocked_id = p.user_id)
                       OR (block_pair.blocker_id = p.user_id AND block_pair.blocked_id = hidden.user_id)
                ) THEN u.id ELSE NULL END AS author_id,
                CASE WHEN NOT EXISTS(
                    SELECT 1 FROM user_blocks block_pair
                    WHERE (block_pair.blocker_id = hidden.user_id AND block_pair.blocked_id = p.user_id)
                       OR (block_pair.blocker_id = p.user_id AND block_pair.blocked_id = hidden.user_id)
                ) THEN u.username ELSE NULL END AS author_username,
                CASE WHEN NOT EXISTS(
                    SELECT 1 FROM user_blocks block_pair
                    WHERE (block_pair.blocker_id = hidden.user_id AND block_pair.blocked_id = p.user_id)
                       OR (block_pair.blocker_id = p.user_id AND block_pair.blocked_id = hidden.user_id)
                ) THEN u.avatar_url ELSE NULL END AS author_avatar_url
         FROM hidden_posts hidden
         INNER JOIN posts p ON p.id = hidden.post_id
         INNER JOIN users u ON u.id = p.user_id
         WHERE hidden.user_id = ?
         ORDER BY hidden.created_at DESC, hidden.post_id ASC
         LIMIT ? OFFSET ?",
    )
    .bind(&user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to list hidden posts");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Json(
        rows.into_iter()
            .map(|row| HiddenPostResponse {
                post_id: row.post_id,
                hidden_at: row.hidden_at,
                available: row.available,
                author: match (row.author_id, row.author_username) {
                    (Some(id), Some(username)) => Some(SafetyUserResponse {
                        id,
                        username,
                        avatar_url: row.author_avatar_url,
                    }),
                    _ => None,
                },
            })
            .collect(),
    ))
}

pub async fn create_report(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
    Json(payload): Json<CreateReportRequest>,
) -> Result<Json<Value>, StatusCode> {
    let reporter_id = get_current_user(&pool, &headers).await?;
    if Uuid::parse_str(&payload.target_id).is_err()
        || !report_reason_is_valid(payload.reason.as_str())
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    let details = normalized_report_details(payload.details.as_deref())?;
    let target_key = format!("{}:{}", payload.target_type, payload.target_id);

    let target = match payload.target_type.as_str() {
        "user" => {
            let user: Option<(String, Option<String>)> =
                query_as("SELECT username, bio FROM users WHERE id = ?")
                    .bind(&payload.target_id)
                    .fetch_optional(&pool)
                    .await
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let (username, bio) = user.ok_or(StatusCode::NOT_FOUND)?;
            ReportTarget {
                user_id: Some(payload.target_id.clone()),
                post_id: None,
                comment_id: None,
                actor_id: payload.target_id.clone(),
                audience_author_id: None,
                label: username,
                excerpt: bio,
            }
        }
        "post" => {
            let post: Option<(String, String, String)> = query_as(
                "SELECT post.user_id, author.username, post.content
                     FROM posts post INNER JOIN users author ON author.id = post.user_id
                     WHERE post.id = ?",
            )
            .bind(&payload.target_id)
            .fetch_optional(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let (author_id, author_username, content) = post.ok_or(StatusCode::NOT_FOUND)?;
            ReportTarget {
                user_id: None,
                post_id: Some(payload.target_id.clone()),
                comment_id: None,
                actor_id: author_id.clone(),
                audience_author_id: Some(author_id),
                label: author_username,
                excerpt: Some(content),
            }
        }
        "comment" => {
            let comment: Option<(String, String, String, String)> = query_as(
                "SELECT c.user_id, comment_author.username, c.content, p.user_id
                     FROM comments c
                     INNER JOIN users comment_author ON comment_author.id = c.user_id
                     INNER JOIN posts p ON p.id = c.post_id
                     WHERE c.id = ?",
            )
            .bind(&payload.target_id)
            .fetch_optional(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let (comment_author_id, comment_author_username, content, post_author_id) =
                comment.ok_or(StatusCode::NOT_FOUND)?;
            ReportTarget {
                user_id: None,
                post_id: None,
                comment_id: Some(payload.target_id.clone()),
                actor_id: comment_author_id,
                audience_author_id: Some(post_author_id),
                label: comment_author_username,
                excerpt: Some(content),
            }
        }
        _ => return Err(StatusCode::BAD_REQUEST),
    };

    if target.actor_id == reporter_id {
        return Err(StatusCode::BAD_REQUEST);
    }
    if let Some(author_id) = target.audience_author_id.as_deref() {
        if !target_is_visible(&pool, &reporter_id, author_id).await? {
            return Err(StatusCode::FORBIDDEN);
        }
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    query_scalar::<_, String>("SELECT id FROM users WHERE id = ? FOR UPDATE")
        .bind(&reporter_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|_| StatusCode::UNAUTHORIZED)?;

    let existing: bool = query_scalar(
        "SELECT EXISTS(
            SELECT 1 FROM content_reports
            WHERE reporter_id = ? AND target_key = ? AND active_marker = 1
         )",
    )
    .bind(&reporter_id)
    .bind(&target_key)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if existing {
        return Err(StatusCode::CONFLICT);
    }

    let now = Utc::now();
    query(
        "DELETE FROM content_reports
         WHERE reporter_id = ? AND active_marker IS NULL AND updated_at < ?
         LIMIT 500",
    )
    .bind(&reporter_id)
    .bind(now - Duration::days(FINAL_REPORT_RETENTION_DAYS))
    .execute(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let stored_reports: i64 =
        query_scalar("SELECT COUNT(*) FROM content_reports WHERE reporter_id = ?")
            .bind(&reporter_id)
            .fetch_one(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if stored_reports >= MAXIMUM_STORED_REPORTS {
        return Err(StatusCode::INSUFFICIENT_STORAGE);
    }
    let open_reports: i64 = query_scalar(
        "SELECT COUNT(*) FROM content_reports WHERE reporter_id = ? AND active_marker = 1",
    )
    .bind(&reporter_id)
    .fetch_one(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if open_reports >= MAXIMUM_OPEN_REPORTS {
        return Err(StatusCode::INSUFFICIENT_STORAGE);
    }

    query("DELETE FROM report_submission_events WHERE reporter_id = ? AND created_at < ?")
        .bind(&reporter_id)
        .bind(now - Duration::days(REPORT_EVENT_RETENTION_DAYS))
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let recent_submissions: i64 = query_scalar(
        "SELECT COUNT(*) FROM report_submission_events
         WHERE reporter_id = ? AND created_at >= ?",
    )
    .bind(&reporter_id)
    .bind(now - Duration::hours(24))
    .fetch_one(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if recent_submissions >= MAXIMUM_REPORTS_PER_DAY {
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    let report_id = Uuid::new_v4().to_string();
    query(
        "INSERT INTO content_reports
            (id, reporter_id, target_type, target_key, target_label_snapshot,
             target_excerpt_snapshot, target_actor_reference,
             target_user_id, target_post_id,
             target_comment_id, reason, details, status, active_marker,
             created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', 1, ?, ?)",
    )
    .bind(&report_id)
    .bind(&reporter_id)
    .bind(&payload.target_type)
    .bind(&target_key)
    .bind(&target.label)
    .bind(&target.excerpt)
    .bind(&target.actor_id)
    .bind(target.user_id)
    .bind(target.post_id)
    .bind(target.comment_id)
    .bind(&payload.reason)
    .bind(details)
    .bind(now)
    .bind(now)
    .execute(&mut *transaction)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to store content report");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    query("INSERT INTO report_submission_events (id, reporter_id, created_at) VALUES (?, ?, ?)")
        .bind(Uuid::new_v4().to_string())
        .bind(&reporter_id)
        .bind(now)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({ "id": report_id, "reported": true })))
}

pub async fn list_reports(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<ReportResponse>>, StatusCode> {
    let reporter_id = get_current_user(&pool, &headers).await?;
    let (limit, offset) = pagination(&params, 20, MAXIMUM_STORED_REPORTS);
    let reports = query_as::<_, ReportResponse>(
        "SELECT report.id, report.target_type,
                SUBSTRING_INDEX(report.target_key, ':', -1) AS target_id,
                report.target_label_snapshot AS target_label,
                report.reason, report.details, report.status,
                report.created_at, report.updated_at, report.reviewed_at
         FROM content_reports report
         WHERE report.reporter_id = ?
         ORDER BY report.created_at DESC, report.id DESC
         LIMIT ? OFFSET ?",
    )
    .bind(&reporter_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to list own reports");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(reports))
}

pub async fn withdraw_report(
    State(pool): State<MySqlPool>,
    Path(report_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let reporter_id = get_current_user(&pool, &headers).await?;
    if Uuid::parse_str(&report_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let now = Utc::now();
    let result = query(
        "UPDATE content_reports
         SET status = 'withdrawn', active_marker = NULL, updated_at = ?, reviewed_at = ?
         WHERE id = ? AND reporter_id = ? AND status = 'open'",
    )
    .bind(now)
    .bind(now)
    .bind(&report_id)
    .bind(&reporter_id)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if result.rows_affected() != 1 {
        let exists: bool = query_scalar(
            "SELECT EXISTS(SELECT 1 FROM content_reports WHERE id = ? AND reporter_id = ?)",
        )
        .bind(&report_id)
        .bind(&reporter_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        return Err(if exists {
            StatusCode::CONFLICT
        } else {
            StatusCode::NOT_FOUND
        });
    }
    Ok(Json(json!({ "withdrawn": true })))
}

#[cfg(test)]
mod tests {
    use super::{normalized_report_details, report_reason_is_valid};

    #[test]
    fn report_reasons_are_allowlisted() {
        assert!(report_reason_is_valid("harassment"));
        assert!(report_reason_is_valid("self_harm"));
        assert!(!report_reason_is_valid("anything"));
        assert!(!report_reason_is_valid("HARASSMENT"));
    }

    #[test]
    fn report_details_are_trimmed_and_bounded_by_characters() {
        assert_eq!(
            normalized_report_details(Some("  context  ")).expect("valid details"),
            Some("context".to_owned())
        );
        assert_eq!(
            normalized_report_details(Some("   ")).expect("blank details"),
            None
        );
        assert!(normalized_report_details(Some(&"💬".repeat(1_001))).is_err());
    }
}
