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
        .route("/auth/logout", post(handlers::logout))
        .route("/auth/me", get(handlers::me))
        .route(
            "/auth/sessions",
            get(handlers::list_sessions).delete(handlers::revoke_other_sessions),
        )
        .route("/auth/sessions/:id", delete(handlers::revoke_session))
        .route("/auth/security-events", get(handlers::list_security_events))
        .route(
            "/auth/send-verification",
            post(handlers::send_verification_email),
        )
        .route("/auth/verify-email", post(handlers::verify_email))
        .route("/auth/forgot-password", post(handlers::forgot_password))
        .route("/auth/reset-password", post(handlers::reset_password))
        // User routes
        .route("/users/:id", get(handlers::get_profile))
        .route(
            "/users/:id/follow",
            put(handlers::follow_user).delete(handlers::unfollow_user),
        )
        .route(
            "/users/:id/block",
            put(handlers::block_user).delete(handlers::unblock_user),
        )
        .route("/users/:id/followers", get(handlers::get_followers))
        .route("/users/:id/following", get(handlers::get_following))
        .route("/users/me", delete(handlers::delete_account))
        .route("/users/me/export", post(handlers::export_account_data))
        .route("/users/me/profile", put(handlers::update_profile))
        .route(
            "/users/me/avatar",
            post(handlers::upload_avatar).layer(DefaultBodyLimit::max(6 * 1024 * 1024)),
        )
        .route("/users/me/change-password", post(handlers::change_password))
        .route("/users/me/change-email", post(handlers::change_email))
        .route(
            "/users/verify-email-change",
            post(handlers::verify_email_change),
        )
        .route("/users/:id/posts", get(handlers::get_user_posts))
        // Post routes
        .route("/posts", get(handlers::get_posts))
        .route("/posts", post(handlers::create_post))
        .route("/feed/following", get(handlers::get_following_feed))
        .route("/saved-posts", get(handlers::get_saved_posts))
        .route(
            "/posts/upload-image",
            post(handlers::upload_post_image).layer(DefaultBodyLimit::max(11 * 1024 * 1024)),
        )
        .route("/posts/:id", put(handlers::update_post))
        .route("/posts/:id", delete(handlers::delete_post))
        .route("/posts/:id/like", post(handlers::like_post))
        .route("/posts/:id/save", post(handlers::save_post))
        // Comment routes
        .route("/posts/:id/comments", get(handlers::get_comments))
        .route("/posts/:id/comments", post(handlers::create_comment))
        .route("/comments/:id", put(handlers::update_comment))
        .route("/comments/:id", delete(handlers::delete_comment))
        // Message routes
        .route("/messages", post(handlers::send_message))
        .route("/messages", get(handlers::get_messages))
        // Discovery routes
        .route("/search", get(handlers::search))
        .with_state(pool)
        .layer(middleware::from_fn_with_state(
            expected_origin,
            security::enforce_same_origin,
        ))
        .layer(middleware::from_fn(security::api_response_policy))
        .layer(middleware::from_fn(security::request_observability));

    Router::new().nest("/api", api_routes)
}
