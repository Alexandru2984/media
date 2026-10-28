use anyhow::{Context, Result};
use sqlx::{migrate::Migrator, mysql::MySqlPoolOptions, MySqlPool};

pub type DbPool = MySqlPool;

static MIGRATOR: Migrator = sqlx::migrate!();

pub async fn init_db() -> Result<DbPool> {
    let database_url = std::env::var("DATABASE_URL").context("DATABASE_URL must be configured")?;

    let pool = MySqlPoolOptions::new()
        .max_connections(5)
        .connect(&database_url)
        .await
        .context("Failed to connect to the database")?;

    MIGRATOR
        .run(&pool)
        .await
        .context("Failed to apply database migrations")?;

    tracing::info!("database migrations are current");

    Ok(pool)
}
