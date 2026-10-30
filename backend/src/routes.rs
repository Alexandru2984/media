use axum::{
    extract::DefaultBodyLimit,
    http::HeaderValue,
    middleware,
    routing::{delete, get, post, put},
    Router,
};
use sqlx::MySqlPool;

use crate::{handlers, health, moderation, notifications, safety, security};

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
        .route(
            "/users/:id/mute",
            put(safety::mute_user).delete(safety::unmute_user),
        )
        .route("/users/:id/followers", get(handlers::get_followers))
        .route("/users/:id/following", get(handlers::get_following))
        .route("/users/me/privacy", put(handlers::update_privacy))
        .route("/users/me/mutes", get(safety::list_muted_users))
        .route(
            "/users/me/follow-requests",
            get(handlers::get_follow_requests),
        )
        .route(
            "/users/me/follow-requests/:id",
            put(handlers::accept_follow_request).delete(handlers::reject_follow_request),
        )
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
        .route("/hidden-posts", get(safety::list_hidden_posts))
        .route(
            "/posts/upload-image",
            post(handlers::upload_post_image).layer(DefaultBodyLimit::max(11 * 1024 * 1024)),
        )
        .route("/posts/:id", put(handlers::update_post))
        .route("/posts/:id", delete(handlers::delete_post))
        .route("/posts/:id/like", post(handlers::like_post))
        .route("/posts/:id/save", post(handlers::save_post))
        .route(
            "/posts/:id/hide",
            put(safety::hide_post).delete(safety::unhide_post),
        )
        // Reporter-private trust and safety controls. No moderation data is
        // exposed until a real privileged role model exists.
        .route(
            "/reports",
            get(safety::list_reports).post(safety::create_report),
        )
        .route("/reports/:id", delete(safety::withdraw_report))
        // Least-privilege moderation. Role grants are intentionally offline;
        // every mutation also requires a fresh password confirmation.
        .route("/moderation/reports", get(moderation::list_reports))
        .route("/moderation/audit", get(moderation::list_audit_events))
        .route(
            "/moderation/reports/:id/claim",
            put(moderation::claim_report),
        )
        .route(
            "/moderation/reports/:id/release",
            put(moderation::release_report),
        )
        .route(
            "/moderation/reports/:id/decision",
            put(moderation::decide_report),
        )
        // Private in-app notifications
        .route("/notifications", get(notifications::list_notifications))
        .route(
            "/notifications/unread-count",
            get(notifications::unread_notification_count),
        )
        .route(
            "/notifications/read-all",
            put(notifications::mark_all_notifications_read),
        )
        .route(
            "/notifications/:id/read",
            put(notifications::mark_notification_read),
        )
        .route(
            "/notifications/:id",
            delete(notifications::delete_notification),
        )
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
        // Nginx exposes this only as an internal auth subrequest for post media.
        .route("/media/post-access", get(handlers::authorize_post_media))
        .with_state(pool)
        .layer(middleware::from_fn_with_state(
            expected_origin,
            security::enforce_same_origin,
        ))
        .layer(middleware::from_fn(security::api_response_policy))
        .layer(middleware::from_fn(security::request_observability));

    Router::new().nest("/api", api_routes)
}
