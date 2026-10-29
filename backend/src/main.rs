mod auth;
mod database;
mod email;
mod handlers;
mod health;
mod models;
mod notifications;
mod passwords;
mod routes;
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

    // Initialize database
    let db_pool = database::init_db()
        .await
        .expect("Failed to initialize database");
    upload_lifecycle::spawn_upload_maintenance(db_pool.clone());

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
    axum::serve(listener, app).await.unwrap();
}
