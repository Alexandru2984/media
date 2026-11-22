use anyhow::{bail, Context, Result};
use sqlx::{migrate::Migrator, mysql::MySqlPoolOptions, query_as, MySqlPool};

pub type DbPool = MySqlPool;
static MIGRATOR: Migrator = sqlx::migrate!();

#[derive(sqlx::FromRow)]
struct AppliedMigration {
    version: i64,
    checksum: Vec<u8>,
    success: bool,
}

fn verify_migrations(expected: &[(i64, Vec<u8>)], applied: &[AppliedMigration]) -> Result<()> {
    let latest = expected.last().context("binary contains no migrations")?.0;
    for (version, checksum) in expected {
        if !applied
            .iter()
            .any(|row| row.version == *version && row.success && row.checksum == *checksum)
        {
            bail!("required database migration is missing, failed or changed; use the offline migration command");
        }
    }
    for row in applied {
        if !row.success
            || (row.version <= latest
                && !expected.iter().any(|(version, _)| *version == row.version))
        {
            bail!("database migration history is inconsistent");
        }
    }
    // Later successful migrations are permitted for rollback. Releases must
    // keep such migrations additive and compatible with the prior API binary.
    Ok(())
}

pub async fn init_db() -> Result<DbPool> {
    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be configured")?;
    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .context("Failed to connect to the database")?;
    let applied = query_as::<_, AppliedMigration>(
        "SELECT version, checksum, success FROM _sqlx_migrations ORDER BY version",
    )
    .fetch_all(&pool)
    .await
    .context("failed to read migration history; apply migrations offline first")?;
    let expected = MIGRATOR
        .iter()
        .map(|migration| (migration.version, migration.checksum.to_vec()))
        .collect::<Vec<_>>();
    verify_migrations(&expected, &applied)?;
    tracing::info!(validation_only = true, "database migrations are current");
    Ok(pool)
}

#[cfg(test)]
mod tests {
    use super::{verify_migrations, AppliedMigration};
    fn row(version: i64, checksum: u8, success: bool) -> AppliedMigration {
        AppliedMigration {
            version,
            checksum: vec![checksum],
            success,
        }
    }
    #[test]
    fn permits_later_additive_migrations_for_binary_rollback() {
        assert!(verify_migrations(&[(10, vec![1])], &[row(10, 1, true), row(20, 2, true)]).is_ok());
    }
    #[test]
    fn rejects_missing_changed_and_failed_required_migrations() {
        let expected = [(10, vec![1])];
        for applied in [vec![], vec![row(10, 2, true)], vec![row(10, 1, false)]] {
            assert!(verify_migrations(&expected, &applied).is_err());
        }
    }
    #[test]
    fn rejects_unexpected_older_or_failed_later_migrations() {
        let expected = [(10, vec![1])];
        assert!(verify_migrations(&expected, &[row(5, 2, true), row(10, 1, true)]).is_err());
        assert!(verify_migrations(&expected, &[row(10, 1, true), row(20, 2, false)]).is_err());
        assert!(verify_migrations(&[], &[]).is_err());
    }
}
