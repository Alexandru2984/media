mod models;
mod handlers;
mod database;
mod auth;
mod routes;
mod email;

use std::net::SocketAddr;
use tower_http::cors::CorsLayer;
use tower_http::services::ServeDir;

#[tokio::main]
async fn main() {
    dotenv::dotenv().ok();
    tracing_subscriber::fmt::init();

    // Initialize database
    let db_pool = database::init_db().await.expect("Failed to initialize database");

    // Build our application with routes
    let app = routes::create_routes(db_pool)
        .nest_service("/uploads", ServeDir::new("uploads"))
        .layer(CorsLayer::permissive());

    // Run our app with hyper
    let addr = SocketAddr::from(([127, 0, 0, 1], 8082));
    println!("Server running on http://{}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}