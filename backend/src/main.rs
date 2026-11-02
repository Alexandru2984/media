mod auth;
mod database;
mod email;
mod handlers;
mod health;
mod models;
mod moderation;
mod notifications;
mod pagination;
mod passwords;
mod public_pages;
mod routes;
mod safety;
mod security;
mod security_events;
mod tokens;
mod upload_lifecycle;
mod uploads;
mod validation;

use axum::http::{header, HeaderValue, Method};
use std::net::{IpAddr, SocketAddr};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;
use tracing_subscriber::EnvFilter;

fn parse_upload_maintenance_enabled(value: Option<&str>) -> Result<bool, &'static str> {
    match value {
        None | Some("true") => Ok(true),
        Some("false") => Ok(false),
        Some(_) => Err("UPLOAD_MAINTENANCE_ENABLED must be true or false"),
    }
}

async fn shutdown_signal() {
    let interrupt = async {
        if let Err(error) = tokio::signal::ctrl_c().await {
            tracing::error!(%error, "failed to install interrupt signal handler");
            std::future::pending::<()>().await;
        }
    };

    #[cfg(unix)]
    let terminate = async {
        match tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate()) {
            Ok(mut signal) => {
                signal.recv().await;
            }
            Err(error) => {
                tracing::error!(%error, "failed to install termination signal handler");
                std::future::pending::<()>().await;
            }
        }
    };

    #[cfg(not(unix))]
    let terminate = std::future::pending::<()>();

    tokio::select! {
        () = interrupt => {}
        () = terminate => {}
    }
    tracing::info!("shutdown signal received; draining active requests");
}

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    let log_filter = EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| EnvFilter::new("social_media_backend=info"));
    tracing_subscriber::fmt()
        .with_env_filter(log_filter)
        .json()
        .flatten_event(true)
        .with_ansi(false)
        .with_target(false)
        .init();

    auth::validate_configuration().expect("Invalid authentication configuration");
    email::validate_configuration().expect("Invalid email configuration");

    let server_host: IpAddr = std::env::var("SERVER_HOST")
        .unwrap_or_else(|_| "127.0.0.1".to_string())
        .parse()
        .expect("SERVER_HOST must be a valid IP address");
    let server_port: u16 = std::env::var("SERVER_PORT")
        .unwrap_or_else(|_| "8083".to_string())
        .parse()
        .expect("SERVER_PORT must be a valid TCP port");
    let cors_origin: HeaderValue = std::env::var("CORS_ORIGIN")
        .expect("CORS_ORIGIN must be configured")
        .parse()
        .expect("CORS_ORIGIN must be a valid HTTP header value");
    let upload_maintenance_enabled = parse_upload_maintenance_enabled(
        std::env::var("UPLOAD_MAINTENANCE_ENABLED").ok().as_deref(),
    )
    .expect("Invalid upload maintenance configuration");

    // Initialize database
    let db_pool = database::init_db()
        .await
        .expect("Failed to initialize database");
    if upload_maintenance_enabled {
        upload_lifecycle::spawn_upload_maintenance(db_pool.clone());
    } else {
        tracing::info!("upload maintenance disabled for this process");
    }

    // Build our application with routes
    let cors = CorsLayer::new()
        .allow_origin(cors_origin.clone())
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    let app = routes::create_routes(db_pool, cors_origin)
        .nest_service("/uploads", ServeDir::new("uploads"))
        .layer(cors);

    // Run our app with hyper
    let addr = SocketAddr::new(server_host, server_port);
    tracing::info!(listen_address = %addr, "server listening");

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("server terminated unexpectedly");
}

#[cfg(test)]
mod tests {
    use super::parse_upload_maintenance_enabled;

    #[test]
    fn upload_maintenance_remains_enabled_by_default() {
        assert_eq!(parse_upload_maintenance_enabled(None), Ok(true));
        assert_eq!(parse_upload_maintenance_enabled(Some("true")), Ok(true));
    }

    #[test]
    fn deployment_canaries_can_disable_upload_maintenance() {
        assert_eq!(parse_upload_maintenance_enabled(Some("false")), Ok(false));
    }

    #[test]
    fn upload_maintenance_configuration_fails_closed() {
        for value in ["TRUE", "False", "0", "", "disabled"] {
            assert!(parse_upload_maintenance_enabled(Some(value)).is_err());
        }
    }
}
