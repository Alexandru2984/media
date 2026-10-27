mod auth;
mod database;
mod email;
mod handlers;
mod models;
mod routes;

use axum::http::{header, HeaderValue, Method};
use std::net::{IpAddr, SocketAddr};
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt::init();

    auth::validate_configuration().expect("Invalid JWT configuration");

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

    // Build our application with routes
    let cors = CorsLayer::new()
        .allow_origin(cors_origin)
        .allow_methods([
            Method::GET,
            Method::POST,
            Method::PUT,
            Method::DELETE,
            Method::OPTIONS,
        ])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    let app = routes::create_routes(db_pool)
        .nest_service("/uploads", ServeDir::new("uploads"))
        .layer(cors);

    // Run our app with hyper
    let addr = SocketAddr::new(server_host, server_port);
    println!("Server running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
