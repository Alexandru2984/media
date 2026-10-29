use anyhow::{Context, Result};
use chrono::{DateTime, Duration, Utc};
use serde::Serialize;
use sqlx::{query, query_as, MySqlPool};
use uuid::Uuid;

const MAXIMUM_EVENTS_PER_USER: u32 = 100;
pub const SECURITY_EVENT_RETENTION_DAYS: i64 = 90;
pub const SECURITY_EVENT_RESPONSE_LIMIT: u32 = 50;

#[derive(Clone, Copy, Debug)]
pub enum SecurityEventKind {
    AccountCreated,
    LoginSucceeded,
    LoggedOut,
    SessionRevoked,
    OtherSessionsRevoked,
    PasswordChanged,
    PasswordReset,
    EmailChangeRequested,
    EmailChanged,
    EmailVerified,
    AccountDataExported,
}

impl SecurityEventKind {
    const fn as_str(self) -> &'static str {
        match self {
            Self::AccountCreated => "account_created",
            Self::LoginSucceeded => "login_succeeded",
            Self::LoggedOut => "logged_out",
            Self::SessionRevoked => "session_revoked",
            Self::OtherSessionsRevoked => "other_sessions_revoked",
            Self::PasswordChanged => "password_changed",
            Self::PasswordReset => "password_reset",
            Self::EmailChangeRequested => "email_change_requested",
            Self::EmailChanged => "email_changed",
            Self::EmailVerified => "email_verified",
            Self::AccountDataExported => "account_data_exported",
        }
    }
}

#[derive(Debug, Serialize, sqlx::FromRow)]
pub struct SecurityEventResponse {
    pub id: String,
    pub event_type: String,
    pub occurred_at: DateTime<Utc>,
}

pub async fn record_security_event(pool: &MySqlPool, user_id: &str, kind: SecurityEventKind) {
    if let Err(error) = record_security_event_inner(pool, user_id, kind).await {
        tracing::warn!(
            error = %error,
            event_type = kind.as_str(),
            "failed to record user security event"
        );
    }
}

async fn record_security_event_inner(
    pool: &MySqlPool,
    user_id: &str,
    kind: SecurityEventKind,
) -> Result<()> {
    let mut transaction = pool
        .begin()
        .await
        .context("failed to begin security event transaction")?;
    let now = Utc::now();

    query(
        "INSERT INTO security_events (id, user_id, event_type, occurred_at)
         VALUES (?, ?, ?, ?)",
    )
    .bind(Uuid::new_v4().to_string())
    .bind(user_id)
    .bind(kind.as_str())
    .bind(now)
    .execute(&mut *transaction)
    .await
    .context("failed to insert security event")?;

    // The derived table keeps this compatible with MySQL/MariaDB's restriction
    // on selecting from the table currently being deleted.
    query(
        "DELETE FROM security_events
         WHERE user_id = ? AND id NOT IN (
             SELECT id FROM (
                 SELECT id FROM security_events
                 WHERE user_id = ?
                 ORDER BY occurred_at DESC, id DESC
                 LIMIT ?
             ) AS retained_security_events
         )",
    )
    .bind(user_id)
    .bind(user_id)
    .bind(MAXIMUM_EVENTS_PER_USER)
    .execute(&mut *transaction)
    .await
    .context("failed to cap security event history")?;

    transaction
        .commit()
        .await
        .context("failed to commit security event")?;

    // Opportunistic bounded cleanup covers inactive accounts without turning a
    // user request into an unbounded table sweep.
    if let Err(error) = query(
        "DELETE FROM security_events
         WHERE occurred_at < ?
         ORDER BY occurred_at ASC
         LIMIT 100",
    )
    .bind(now - Duration::days(SECURITY_EVENT_RETENTION_DAYS))
    .execute(pool)
    .await
    {
        tracing::warn!(error = %error, "failed to prune expired security events");
    }

    Ok(())
}

pub async fn recent_security_events(
    pool: &MySqlPool,
    user_id: &str,
) -> Result<Vec<SecurityEventResponse>> {
    query_as::<_, SecurityEventResponse>(
        "SELECT id, event_type, occurred_at
         FROM security_events
         WHERE user_id = ? AND occurred_at >= ?
         ORDER BY occurred_at DESC, id DESC
         LIMIT ?",
    )
    .bind(user_id)
    .bind(Utc::now() - Duration::days(SECURITY_EVENT_RETENTION_DAYS))
    .bind(SECURITY_EVENT_RESPONSE_LIMIT)
    .fetch_all(pool)
    .await
    .context("failed to load security events")
}

#[cfg(test)]
mod tests {
    use super::{SecurityEventKind, SECURITY_EVENT_RESPONSE_LIMIT, SECURITY_EVENT_RETENTION_DAYS};

    #[test]
    fn event_names_are_stable_and_non_sensitive() {
        let kinds = [
            SecurityEventKind::AccountCreated,
            SecurityEventKind::LoginSucceeded,
            SecurityEventKind::LoggedOut,
            SecurityEventKind::SessionRevoked,
            SecurityEventKind::OtherSessionsRevoked,
            SecurityEventKind::PasswordChanged,
            SecurityEventKind::PasswordReset,
            SecurityEventKind::EmailChangeRequested,
            SecurityEventKind::EmailChanged,
            SecurityEventKind::EmailVerified,
            SecurityEventKind::AccountDataExported,
        ];

        for kind in kinds {
            let value = kind.as_str();
            assert!(!value.is_empty());
            assert!(value
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte == b'_'));
        }
        assert_eq!(SECURITY_EVENT_RESPONSE_LIMIT, 50);
        assert_eq!(SECURITY_EVENT_RETENTION_DAYS, 90);
    }
}
