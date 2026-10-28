use axum::{
    extract::DefaultBodyLimit,
    http::HeaderValue,
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use sqlx::MySqlPool;

use crate::{handlers, health, security};

pub fn create_routes(pool: MySqlPool, expected_origin: HeaderValue) -> Router {
    let api_routes = Router::new()
        // Operational health routes expose no dependency detail.
        .route("/health/live", get(health::live))
        .route("/health/ready", get(health::ready))
        // Auth routes
        .route("/auth/register", post(handlers::register))
        .route("/auth/login", post(handlers::login))
        .route("/auth/session", post(handlers::create_session))
        .route("/auth/logout", post(handlers::logout))
        .route("/auth/me", get(handlers::me))
        .route(
            "/auth/send-verification",
            post(handlers::send_verification_email),
        )
        .route("/auth/verify-email", get(handlers::verify_email))
        .route("/auth/forgot-password", post(handlers::forgot_password))
        .route("/auth/reset-password", post(handlers::reset_password))
        // User routes
        .route("/users/:id", get(handlers::get_profile))
        .route("/users/me/profile", put(handlers::update_profile))
        .route(
            "/users/me/avatar",
            post(handlers::upload_avatar).layer(DefaultBodyLimit::max(6 * 1024 * 1024)),
        )
        .route("/users/me/change-password", post(handlers::change_password))
        .route("/users/me/change-email", post(handlers::change_email))
        .route(
            "/users/verify-email-change",
            get(handlers::verify_email_change),
        )
        .route("/users/:id/posts", get(handlers::get_user_posts))
        // Post routes
        .route("/posts", get(handlers::get_posts))
        .route("/posts", post(handlers::create_post))
        .route(
            "/posts/upload-image",
            post(handlers::upload_post_image).layer(DefaultBodyLimit::max(11 * 1024 * 1024)),
        )
        .route("/posts/:id", put(handlers::update_post))
        .route("/posts/:id", delete(handlers::delete_post))
        .route("/posts/:id/like", post(handlers::like_post))
        // Comment routes
        .route("/posts/:id/comments", get(handlers::get_comments))
        .route("/posts/:id/comments", post(handlers::create_comment))
        .route("/comments/:id", put(handlers::update_comment))
        .route("/comments/:id", delete(handlers::delete_comment))
        // Message routes
        .route("/messages", post(handlers::send_message))
        .route("/messages", get(handlers::get_messages))
        .with_state(pool)
        .layer(middleware::from_fn_with_state(
            expected_origin,
            security::enforce_same_origin,
        ))
        .layer(middleware::from_fn(security::api_response_policy));

    Router::new().nest("/api", api_routes)
}
