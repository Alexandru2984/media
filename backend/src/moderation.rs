use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{query, query_as, MySql, MySqlPool, Transaction};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    handlers::get_current_user,
    passwords::verify_password,
    validation::{bounded_text_is_valid, password_is_safe_to_verify},
};

const MAXIMUM_RESOLUTION_NOTE_CHARACTERS: usize = 1_000;
const MAXIMUM_QUEUE_OFFSET: i64 = 100_000;

#[derive(Clone)]
struct ModeratorIdentity {
    id: String,
    role: String,
    password_hash: String,
}

#[derive(sqlx::FromRow)]
struct ModeratorAccountRow {
    role: String,
    password_hash: String,
}

#[derive(Serialize, sqlx::FromRow)]
pub(crate) struct ModerationReportResponse {
    id: String,
    target_type: String,
    target_id: String,
    target_label: String,
    target_excerpt: Option<String>,
    reason: String,
    details: Option<String>,
    resolution_note: Option<String>,
    status: String,
    assigned_to_me: bool,
    assigned_moderator_username: Option<String>,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    reviewed_at: Option<DateTime<Utc>>,
}

#[derive(Serialize, sqlx::FromRow)]
pub(crate) struct ModerationAuditResponse {
    id: String,
    report_reference: String,
    moderator_username: Option<String>,
    action: String,
    previous_status: String,
    new_status: String,
    created_at: DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub(crate) struct ModerationRoleAuditResponse {
    id: String,
    user_reference: String,
    username_snapshot: String,
    previous_role: String,
    new_role: String,
    created_at: DateTime<Utc>,
}

#[derive(Deserialize)]
pub(crate) struct PasswordConfirmation {
    password: String,
}

#[derive(Deserialize)]
pub(crate) struct ReportDecisionRequest {
    password: String,
    decision: String,
    note: String,
}

#[derive(sqlx::FromRow)]
struct LockedReport {
    status: String,
    assigned_moderator_id: Option<String>,
    reporter_id: String,
    target_actor_id: Option<String>,
}

fn role_can_moderate(role: &str) -> bool {
    matches!(role, "moderator" | "admin")
}

fn queue_status_is_valid(status: &str) -> bool {
    matches!(status, "open" | "reviewing" | "resolved" | "dismissed")
}

fn decision_is_valid(decision: &str) -> bool {
    matches!(decision, "resolved" | "dismissed")
}

fn pagination(params: &HashMap<String, String>) -> (i64, i64) {
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(20)
        .clamp(1, 50);
    let offset = params
        .get("offset")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .clamp(0, MAXIMUM_QUEUE_OFFSET);
    (limit, offset)
}

async fn require_moderator(
    pool: &MySqlPool,
    headers: &HeaderMap,
) -> Result<ModeratorIdentity, StatusCode> {
    let user_id = get_current_user(pool, headers).await?;
    let account =
        query_as::<_, ModeratorAccountRow>("SELECT role, password_hash FROM users WHERE id = ?")
            .bind(&user_id)
            .fetch_optional(pool)
            .await
            .map_err(|error| {
                tracing::error!(error = %error, "failed to authorize moderation request");
                StatusCode::INTERNAL_SERVER_ERROR
            })?
            .ok_or(StatusCode::UNAUTHORIZED)?;

    if !role_can_moderate(&account.role) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(ModeratorIdentity {
        id: user_id,
        role: account.role,
        password_hash: account.password_hash,
    })
}

async fn require_step_up(
    pool: &MySqlPool,
    headers: &HeaderMap,
    password: &str,
) -> Result<ModeratorIdentity, StatusCode> {
    if !password_is_safe_to_verify(password) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let moderator = require_moderator(pool, headers).await?;
    let verification = verify_password(password, &moderator.password_hash)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, "moderation step-up verification failed");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    if !verification.valid {
        return Err(StatusCode::UNAUTHORIZED);
    }
    Ok(moderator)
}

async fn lock_moderator(
    transaction: &mut Transaction<'_, MySql>,
    moderator: &ModeratorIdentity,
) -> Result<(), StatusCode> {
    let current = query_as::<_, ModeratorAccountRow>(
        "SELECT role, password_hash FROM users WHERE id = ? FOR UPDATE",
    )
    .bind(&moderator.id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to lock moderator account");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::UNAUTHORIZED)?;

    if current.password_hash != moderator.password_hash {
        return Err(StatusCode::UNAUTHORIZED);
    }
    if current.role != moderator.role || !role_can_moderate(&current.role) {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(())
}

async fn lock_report(
    transaction: &mut Transaction<'_, MySql>,
    report_id: &str,
) -> Result<LockedReport, StatusCode> {
    query_as::<_, LockedReport>(
        "SELECT report.status, report.assigned_moderator_id, report.reporter_id,
                report.target_actor_reference AS target_actor_id
         FROM content_reports report
         WHERE report.id = ?
         FOR UPDATE",
    )
    .bind(report_id)
    .fetch_optional(&mut **transaction)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to lock moderation report");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::NOT_FOUND)
}

fn ensure_no_self_moderation(
    moderator: &ModeratorIdentity,
    report: &LockedReport,
) -> Result<(), StatusCode> {
    if report.reporter_id == moderator.id
        || report.target_actor_id.as_deref() == Some(moderator.id.as_str())
    {
        return Err(StatusCode::FORBIDDEN);
    }
    Ok(())
}

async fn record_audit_event(
    transaction: &mut Transaction<'_, MySql>,
    report_id: &str,
    moderator_id: &str,
    action: &str,
    previous_status: &str,
    new_status: &str,
    now: DateTime<Utc>,
) -> Result<(), StatusCode> {
    query(
        "INSERT INTO moderation_audit_events
            (id, report_id, report_reference, moderator_id, action,
             previous_status, new_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(report_id)
    .bind(report_id)
    .bind(moderator_id)
    .bind(action)
    .bind(previous_status)
    .bind(new_status)
    .bind(now)
    .execute(&mut **transaction)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to append moderation audit event");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(())
}

pub async fn list_reports(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<ModerationReportResponse>>, StatusCode> {
    let moderator = require_moderator(&pool, &headers).await?;
    let status = params.get("status").map(String::as_str).unwrap_or("open");
    if !queue_status_is_valid(status) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let (limit, offset) = pagination(&params);
    let reports = query_as::<_, ModerationReportResponse>(
        "SELECT report.id, report.target_type,
                SUBSTRING_INDEX(report.target_key, ':', -1) AS target_id,
                report.target_label_snapshot AS target_label,
                report.target_excerpt_snapshot AS target_excerpt,
                report.reason, report.details, report.resolution_note, report.status,
                COALESCE(report.assigned_moderator_id = ?, 0) AS assigned_to_me,
                assigned_moderator.username AS assigned_moderator_username,
                report.created_at, report.updated_at, report.reviewed_at
         FROM content_reports report
         LEFT JOIN users assigned_moderator
            ON assigned_moderator.id = report.assigned_moderator_id
         WHERE report.status = ?
           AND report.reporter_id <> ?
           AND report.target_actor_reference <> ?
           AND (? = 'open' OR ? = 'admin' OR report.assigned_moderator_id = ?)
         ORDER BY report.updated_at ASC, report.id ASC
         LIMIT ? OFFSET ?",
    )
    .bind(&moderator.id)
    .bind(status)
    .bind(&moderator.id)
    .bind(&moderator.id)
    .bind(status)
    .bind(&moderator.role)
    .bind(&moderator.id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to list moderation queue");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(reports))
}

pub async fn list_audit_events(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<ModerationAuditResponse>>, StatusCode> {
    let moderator = require_moderator(&pool, &headers).await?;
    let (limit, offset) = pagination(&params);
    let events = query_as::<_, ModerationAuditResponse>(
        "SELECT event.id, event.report_reference, actor.username AS moderator_username,
                event.action, event.previous_status, event.new_status, event.created_at
         FROM moderation_audit_events event
         LEFT JOIN users actor ON actor.id = event.moderator_id
         WHERE (? = 'admin' OR event.moderator_id = ?)
         ORDER BY event.created_at DESC, event.id DESC
         LIMIT ? OFFSET ?",
    )
    .bind(&moderator.role)
    .bind(&moderator.id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to list moderation audit events");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(events))
}

pub async fn list_role_audit_events(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<ModerationRoleAuditResponse>>, StatusCode> {
    let moderator = require_moderator(&pool, &headers).await?;
    if moderator.role != "admin" {
        return Err(StatusCode::FORBIDDEN);
    }
    let (limit, offset) = pagination(&params);
    let events = query_as::<_, ModerationRoleAuditResponse>(
        "SELECT id, user_reference, username_snapshot, previous_role, new_role, created_at
         FROM moderation_role_events
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to list moderation role audit events");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;
    Ok(Json(events))
}

pub async fn claim_report(
    State(pool): State<MySqlPool>,
    Path(report_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<PasswordConfirmation>,
) -> Result<Json<Value>, StatusCode> {
    if Uuid::parse_str(&report_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let moderator = require_step_up(&pool, &headers, &payload.password).await?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    lock_moderator(&mut transaction, &moderator).await?;
    let report = lock_report(&mut transaction, &report_id).await?;
    ensure_no_self_moderation(&moderator, &report)?;

    if report.status == "reviewing"
        && report.assigned_moderator_id.as_deref() == Some(moderator.id.as_str())
    {
        transaction
            .commit()
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        return Ok(Json(json!({ "claimed": true, "status": "reviewing" })));
    }
    if report.status != "open" || report.assigned_moderator_id.is_some() {
        return Err(StatusCode::CONFLICT);
    }

    let now = Utc::now();
    query(
        "UPDATE content_reports
         SET status = 'reviewing', assigned_moderator_id = ?, updated_at = ?
         WHERE id = ? AND status = 'open' AND assigned_moderator_id IS NULL",
    )
    .bind(&moderator.id)
    .bind(now)
    .bind(&report_id)
    .execute(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    record_audit_event(
        &mut transaction,
        &report_id,
        &moderator.id,
        "report_claimed",
        "open",
        "reviewing",
        now,
    )
    .await?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    tracing::info!(moderator_id = %moderator.id, report_id = %report_id, action = "report_claimed", "moderation transition committed");
    Ok(Json(json!({ "claimed": true, "status": "reviewing" })))
}

pub async fn release_report(
    State(pool): State<MySqlPool>,
    Path(report_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<PasswordConfirmation>,
) -> Result<Json<Value>, StatusCode> {
    if Uuid::parse_str(&report_id).is_err() {
        return Err(StatusCode::BAD_REQUEST);
    }
    let moderator = require_step_up(&pool, &headers, &payload.password).await?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    lock_moderator(&mut transaction, &moderator).await?;
    let report = lock_report(&mut transaction, &report_id).await?;
    ensure_no_self_moderation(&moderator, &report)?;
    if report.status != "reviewing" {
        return Err(StatusCode::CONFLICT);
    }
    if report.assigned_moderator_id.as_deref() != Some(moderator.id.as_str())
        && moderator.role != "admin"
    {
        return Err(StatusCode::FORBIDDEN);
    }

    let now = Utc::now();
    query(
        "UPDATE content_reports
         SET status = 'open', assigned_moderator_id = NULL, updated_at = ?
         WHERE id = ? AND status = 'reviewing'",
    )
    .bind(now)
    .bind(&report_id)
    .execute(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    record_audit_event(
        &mut transaction,
        &report_id,
        &moderator.id,
        "report_released",
        "reviewing",
        "open",
        now,
    )
    .await?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    tracing::info!(moderator_id = %moderator.id, report_id = %report_id, action = "report_released", "moderation transition committed");
    Ok(Json(json!({ "released": true, "status": "open" })))
}

pub async fn decide_report(
    State(pool): State<MySqlPool>,
    Path(report_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<ReportDecisionRequest>,
) -> Result<Json<Value>, StatusCode> {
    if Uuid::parse_str(&report_id).is_err() || !decision_is_valid(&payload.decision) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let note = payload.note.trim();
    if !bounded_text_is_valid(note, 1, MAXIMUM_RESOLUTION_NOTE_CHARACTERS) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let moderator = require_step_up(&pool, &headers, &payload.password).await?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    lock_moderator(&mut transaction, &moderator).await?;
    let report = lock_report(&mut transaction, &report_id).await?;
    ensure_no_self_moderation(&moderator, &report)?;
    if report.status != "reviewing" {
        return Err(StatusCode::CONFLICT);
    }
    if report.assigned_moderator_id.as_deref() != Some(moderator.id.as_str())
        && moderator.role != "admin"
    {
        return Err(StatusCode::FORBIDDEN);
    }

    let now = Utc::now();
    let action = if payload.decision == "resolved" {
        "report_resolved"
    } else {
        "report_dismissed"
    };
    query(
        "UPDATE content_reports
         SET status = ?, active_marker = NULL, resolution_note = ?,
             updated_at = ?, reviewed_at = ?
         WHERE id = ? AND status = 'reviewing'",
    )
    .bind(&payload.decision)
    .bind(note)
    .bind(now)
    .bind(now)
    .bind(&report_id)
    .execute(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    record_audit_event(
        &mut transaction,
        &report_id,
        &moderator.id,
        action,
        "reviewing",
        &payload.decision,
        now,
    )
    .await?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    tracing::info!(moderator_id = %moderator.id, report_id = %report_id, action, "moderation transition committed");
    Ok(Json(json!({ "decided": true, "status": payload.decision })))
}

#[cfg(test)]
mod tests {
    use super::{decision_is_valid, queue_status_is_valid, role_can_moderate};

    #[test]
    fn only_privileged_roles_can_moderate() {
        assert!(!role_can_moderate("user"));
        assert!(role_can_moderate("moderator"));
        assert!(role_can_moderate("admin"));
        assert!(!role_can_moderate("owner"));
    }

    #[test]
    fn moderation_states_are_allowlisted() {
        assert!(queue_status_is_valid("open"));
        assert!(queue_status_is_valid("reviewing"));
        assert!(queue_status_is_valid("resolved"));
        assert!(queue_status_is_valid("dismissed"));
        assert!(!queue_status_is_valid("withdrawn"));
        assert!(decision_is_valid("resolved"));
        assert!(decision_is_valid("dismissed"));
        assert!(!decision_is_valid("open"));
    }
}
