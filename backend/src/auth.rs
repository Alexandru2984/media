use crate::tokens::{generate_one_time_token, hash_one_time_token, ONE_TIME_TOKEN_LENGTH};
use anyhow::{bail, Context, Result};
use axum::http::{header, HeaderMap, HeaderValue, StatusCode};
use chrono::{Duration, Utc};
use sqlx::{query, query_as, query_scalar, MySqlPool};
use uuid::Uuid;

const SESSION_MAX_AGE_SECONDS: usize = 7 * 24 * 60 * 60;
const SESSION_ACTIVITY_WRITE_INTERVAL_MINUTES: i64 = 5;
const SESSION_IDLE_TIMEOUT_HOURS: i64 = 24;
const MAXIMUM_ACTIVE_SESSIONS_PER_USER: usize = 20;
const PRODUCTION_COOKIE_NAME: &str = "__Host-media_session";
const DEVELOPMENT_COOKIE_NAME: &str = "media_session";

pub fn validate_configuration() -> Result<()> {
    is_production().map(|_| ())
}

fn is_production() -> Result<bool> {
    match std::env::var("ENVIRONMENT")
        .context("ENVIRONMENT must be configured")?
        .as_str()
    {
        "production" => Ok(true),
        "development" | "test" => Ok(false),
        _ => bail!("ENVIRONMENT must be production, development, or test"),
    }
}

fn build_session_cookie(token: &str, production: bool) -> String {
    let name = if production {
        PRODUCTION_COOKIE_NAME
    } else {
        DEVELOPMENT_COOKIE_NAME
    };
    let secure = if production { "; Secure" } else { "" };
    format!(
        "{}={}; Path=/; Max-Age={}; HttpOnly; SameSite=Strict{}",
        name, token, SESSION_MAX_AGE_SECONDS, secure
    )
}

fn build_clear_session_cookie(production: bool) -> String {
    let name = if production {
        PRODUCTION_COOKIE_NAME
    } else {
        DEVELOPMENT_COOKIE_NAME
    };
    let secure = if production { "; Secure" } else { "" };
    format!(
        "{}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict{}",
        name, secure
    )
}

pub fn session_cookie(token: &str) -> Result<HeaderValue> {
    if !session_token_is_valid(token) {
        bail!("Invalid session token format");
    }
    HeaderValue::from_str(&build_session_cookie(token, is_production()?))
        .context("Failed to build session cookie")
}

pub fn clear_session_cookie() -> Result<HeaderValue> {
    HeaderValue::from_str(&build_clear_session_cookie(is_production()?))
        .context("Failed to build session cookie")
}

fn cookie_token(headers: &HeaderMap) -> Option<&str> {
    let expected_name = if is_production().ok()? {
        PRODUCTION_COOKIE_NAME
    } else {
        DEVELOPMENT_COOKIE_NAME
    };
    cookie_token_for_name(headers, expected_name)
}

fn cookie_token_for_name<'a>(headers: &'a HeaderMap, expected_name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
        .find_map(|(name, value)| (name == expected_name && !value.is_empty()).then_some(value))
}

fn session_token_is_valid(token: &str) -> bool {
    token.len() == ONE_TIME_TOKEN_LENGTH && token.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

pub fn session_idle_cutoff(now: chrono::DateTime<Utc>) -> chrono::DateTime<Utc> {
    now - Duration::hours(SESSION_IDLE_TIMEOUT_HOURS)
}

pub async fn issue_session(pool: &MySqlPool, user_id: &str) -> Result<String> {
    let token = generate_one_time_token();
    let token_hash = hash_one_time_token(&token);
    let session_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let expires_at = now + Duration::seconds(SESSION_MAX_AGE_SECONDS as i64);
    let mut transaction = pool.begin().await.context("Failed to begin session")?;

    query(
        "INSERT INTO sessions
            (id, user_id, token_hash, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&session_id)
    .bind(user_id)
    .bind(token_hash)
    .bind(now)
    .bind(now)
    .bind(expires_at)
    .execute(&mut *transaction)
    .await
    .context("Failed to create session")?;

    let excess_session_ids = query_scalar::<_, String>(
        "SELECT id FROM sessions
         WHERE user_id = ? AND id != ? AND revoked_at IS NULL
           AND expires_at > ? AND last_seen_at > ?
         ORDER BY last_seen_at DESC, created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(user_id)
    .bind(&session_id)
    .bind(now)
    .bind(session_idle_cutoff(now))
    .bind(100_u32)
    .bind((MAXIMUM_ACTIVE_SESSIONS_PER_USER - 1) as u32)
    .fetch_all(&mut *transaction)
    .await
    .context("Failed to enforce the active session limit")?;

    for excess_session_id in excess_session_ids {
        query("DELETE FROM sessions WHERE id = ? AND user_id = ?")
            .bind(excess_session_id)
            .bind(user_id)
            .execute(&mut *transaction)
            .await
            .context("Failed to remove an excess session")?;
    }

    transaction
        .commit()
        .await
        .context("Failed to commit session")?;

    let cleanup_before = now - Duration::days(1);
    if let Err(error) = query(
        "DELETE FROM sessions
         WHERE expires_at <= ? OR last_seen_at <= ?
            OR (revoked_at IS NOT NULL AND revoked_at <= ?)
         LIMIT 100",
    )
    .bind(now)
    .bind(session_idle_cutoff(now))
    .bind(cleanup_before)
    .execute(pool)
    .await
    {
        tracing::warn!(error = %error, "failed to prune expired sessions");
    }

    Ok(token)
}

#[derive(Debug)]
pub struct AuthenticatedSession {
    pub user_id: String,
    pub session_id: String,
}

pub async fn get_authenticated_session(
    pool: &MySqlPool,
    headers: &HeaderMap,
) -> Result<AuthenticatedSession, StatusCode> {
    let token = cookie_token(headers).ok_or(StatusCode::UNAUTHORIZED)?;
    if !session_token_is_valid(token) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let token_hash = hash_one_time_token(token);
    let now = Utc::now();
    let (user_id, session_id) = query_as::<_, (String, String)>(
        "SELECT user_id, id FROM sessions
         WHERE token_hash = ? AND revoked_at IS NULL
           AND expires_at > ? AND last_seen_at > ?
         LIMIT 1",
    )
    .bind(&token_hash)
    .bind(now)
    .bind(session_idle_cutoff(now))
    .fetch_optional(pool)
    .await
    .map_err(|error| {
        tracing::error!(error = %error, "failed to validate session");
        StatusCode::INTERNAL_SERVER_ERROR
    })?
    .ok_or(StatusCode::UNAUTHORIZED)?;

    let activity_cutoff = now - Duration::minutes(SESSION_ACTIVITY_WRITE_INTERVAL_MINUTES);
    if let Err(error) = query(
        "UPDATE sessions SET last_seen_at = ?
         WHERE token_hash = ? AND last_seen_at < ?",
    )
    .bind(now)
    .bind(&token_hash)
    .bind(activity_cutoff)
    .execute(pool)
    .await
    {
        tracing::warn!(error = %error, "failed to update session activity");
    }

    Ok(AuthenticatedSession {
        user_id,
        session_id,
    })
}

pub async fn get_user_id_from_headers(
    pool: &MySqlPool,
    headers: &HeaderMap,
) -> Result<String, StatusCode> {
    get_authenticated_session(pool, headers)
        .await
        .map(|session| session.user_id)
}

pub async fn revoke_current_session(pool: &MySqlPool, headers: &HeaderMap) -> Result<()> {
    let Some(token) = cookie_token(headers).filter(|token| session_token_is_valid(token)) else {
        return Ok(());
    };

    query("UPDATE sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL")
        .bind(Utc::now())
        .bind(hash_one_time_token(token))
        .execute(pool)
        .await
        .context("Failed to revoke current session")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{
        build_clear_session_cookie, build_session_cookie, cookie_token_for_name,
        session_idle_cutoff, session_token_is_valid, ONE_TIME_TOKEN_LENGTH,
    };
    use axum::http::{header, HeaderMap, HeaderValue};
    use chrono::{Duration, Utc};

    #[test]
    fn sessions_expire_after_one_day_without_activity() {
        let now = Utc::now();
        assert_eq!(now - session_idle_cutoff(now), Duration::hours(24));
    }

    #[test]
    fn production_cookie_is_host_bound_and_script_inaccessible() {
        let token = "a".repeat(ONE_TIME_TOKEN_LENGTH);
        let cookie = build_session_cookie(&token, true);
        assert!(cookie.starts_with(&format!("__Host-media_session={};", token)));
        assert!(cookie.contains("; Path=/;"));
        assert!(cookie.contains("; HttpOnly;"));
        assert!(cookie.contains("; SameSite=Strict"));
        assert!(cookie.ends_with("; Secure"));
        assert!(!cookie.contains("Domain="));
    }

    #[test]
    fn clear_cookie_uses_the_same_security_attributes() {
        let cookie = build_clear_session_cookie(true);
        assert!(cookie.contains("Max-Age=0"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.ends_with("; Secure"));
    }

    #[test]
    fn reads_only_the_expected_cookie_name() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("theme=dark; __Host-media_session=opaque; other=value"),
        );
        assert_eq!(
            cookie_token_for_name(&headers, "__Host-media_session"),
            Some("opaque")
        );
        assert_eq!(cookie_token_for_name(&headers, "media_session"), None);
    }

    #[test]
    fn session_tokens_have_one_strict_format() {
        assert!(session_token_is_valid(&"a".repeat(ONE_TIME_TOKEN_LENGTH)));
        assert!(!session_token_is_valid(&"a".repeat(32)));
        assert!(!session_token_is_valid(&format!(
            "{}-",
            "a".repeat(ONE_TIME_TOKEN_LENGTH - 1)
        )));
    }
}
