//! Offline migration command. It never starts an HTTP listener or mail worker.
use anyhow::{bail, Context, Result};
use serde::Serialize;
use sqlx::{migrate::Migrator, mysql::MySqlPoolOptions, query_scalar};

static MIGRATOR: Migrator = sqlx::migrate!();

#[derive(Debug, PartialEq)]
enum Operation {
    Manifest,
    Apply(String),
}

fn operation(arguments: &[String]) -> Result<Operation> {
    match arguments {
        [command] if command == "manifest" => Ok(Operation::Manifest),
        [command, database]
            if command == "apply"
                && !database.is_empty()
                && database.len() <= 64
                && database
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_') =>
        {
            Ok(Operation::Apply(database.clone()))
        }
        _ => bail!("Usage: migrate manifest | migrate apply EXPECTED_DATABASE"),
    }
}

#[derive(Serialize)]
struct ManifestEntry {
    version: i64,
    checksum: String,
}

#[tokio::main]
async fn main() -> Result<()> {
    let arguments = std::env::args().skip(1).collect::<Vec<_>>();
    let Operation::Apply(expected_database) = operation(&arguments)? else {
        let manifest = MIGRATOR
            .iter()
            .map(|migration| ManifestEntry {
                version: migration.version,
                checksum: migration
                    .checksum
                    .iter()
                    .map(|byte| format!("{byte:02x}"))
                    .collect(),
            })
            .collect::<Vec<_>>();
        println!("{}", serde_json::to_string(&manifest)?);
        return Ok(());
    };
    dotenvy::dotenv().ok();
    let url = std::env::var("DATABASE_URL").context("DATABASE_URL must be configured")?;
    let pool = MySqlPoolOptions::new()
        .max_connections(1)
        .connect(&url)
        .await
        .map_err(|_| anyhow::anyhow!("migration database connection failed"))?;
    let actual = query_scalar::<_, Option<String>>("SELECT DATABASE()")
        .fetch_one(&pool)
        .await
        .context("failed to verify migration target")?;
    if actual.as_deref() != Some(expected_database.as_str()) {
        bail!("migration target does not match the expected database");
    }
    MIGRATOR
        .run(&pool)
        .await
        .context("migration application failed")?;
    pool.close().await;
    println!("migration_only=passed; no listener or maintenance worker started");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{operation, Operation};

    #[test]
    fn requires_an_explicit_operation_and_safe_expected_database() {
        assert_eq!(
            operation(&["manifest".into()]).unwrap(),
            Operation::Manifest
        );
        assert_eq!(
            operation(&["apply".into(), "media_test".into()]).unwrap(),
            Operation::Apply("media_test".into())
        );
        for arguments in [
            vec![],
            vec!["apply".into()],
            vec!["apply".into(), "".into()],
            vec!["apply".into(), "db;DROP DATABASE x".into()],
            vec!["apply".into(), "x".repeat(65)],
            vec!["manifest".into(), "extra".into()],
        ] {
            assert!(operation(&arguments).is_err());
        }
    }
}
