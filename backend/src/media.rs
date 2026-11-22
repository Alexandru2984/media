use axum::{
    extract::{OriginalUri, Request, State},
    http::{HeaderValue, Method, StatusCode},
    middleware::{self, Next},
    response::Response,
    Router,
};
use sqlx::MySqlPool;
use tower_http::services::ServeDir;

use crate::{handlers, security, validation::stored_image_path_is_valid};

fn managed_namespace(path: &str) -> Option<bool> {
    for (prefix, is_post) in [("/uploads/posts/", true), ("/uploads/avatars/", false)] {
        if let Some(filename) = path.strip_prefix(prefix) {
            if !filename.is_empty()
                && !filename.contains('/')
                && stored_image_path_is_valid(path, prefix)
                && [".jpg", ".jpeg", ".png", ".webp"]
                    .iter()
                    .any(|extension| filename.ends_with(extension))
            {
                return Some(is_post);
            }
        }
    }
    None
}

async fn enforce_media_access(
    State(pool): State<MySqlPool>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if !matches!(*request.method(), Method::GET | Method::HEAD) {
        return Err(StatusCode::METHOD_NOT_ALLOWED);
    }
    let path = request
        .extensions()
        .get::<OriginalUri>()
        .map(|uri| uri.0.path())
        .unwrap_or_else(|| request.uri().path());
    let is_post = managed_namespace(path).ok_or(StatusCode::NOT_FOUND)?;
    if is_post {
        // Never trust a caller-supplied authorization-probe path. The file
        // being served and the object being authorized must be identical.
        let mut headers = request.headers().clone();
        headers.insert(
            "x-media-path",
            HeaderValue::from_str(path).map_err(|_| StatusCode::NOT_FOUND)?,
        );
        handlers::authorize_post_media(State(pool), headers).await?;
    }
    Ok(next.run(request).await)
}

async fn media_response_policy(request: Request, next: Next) -> Response {
    let mut response = next.run(request).await;
    for (name, value) in [
        ("cache-control", "private, no-store"),
        ("content-security-policy", "default-src 'none'; sandbox"),
        ("cross-origin-resource-policy", "same-origin"),
        ("referrer-policy", "no-referrer"),
        ("x-content-type-options", "nosniff"),
        ("x-frame-options", "DENY"),
    ] {
        response
            .headers_mut()
            .insert(name, HeaderValue::from_static(value));
    }
    response
}

pub fn routes(pool: MySqlPool, directory: &str) -> Router {
    Router::new()
        .nest_service("/uploads", ServeDir::new(directory))
        .layer(middleware::from_fn_with_state(pool, enforce_media_access))
        .layer(middleware::from_fn(security::api_response_policy))
        .layer(middleware::from_fn(media_response_policy))
        .layer(middleware::from_fn(security::request_observability))
}

#[cfg(test)]
mod tests {
    use super::{managed_namespace, routes};
    use axum::{
        body::{to_bytes, Body},
        http::{header, Method, Request, StatusCode},
    };
    use sqlx::mysql::MySqlPoolOptions;
    use std::time::Duration;
    use tower::ServiceExt;

    #[test]
    fn only_flat_managed_image_paths_are_allowed() {
        assert_eq!(
            managed_namespace("/uploads/posts/post_user_id.webp"),
            Some(true)
        );
        assert_eq!(
            managed_namespace("/uploads/avatars/avatar_user_id.jpg"),
            Some(false)
        );
        for path in [
            "/uploads/private/secret.png",
            "/uploads/posts/",
            "/uploads/posts/a/b.jpg",
            "/uploads/posts/../avatars/image.png",
            "/uploads/posts/%2e%2e/image.png",
            "/uploads/posts/file.svg",
            "/uploads/posts/file.html",
            "/uploads/posts/a\\b.jpg",
        ] {
            assert_eq!(managed_namespace(path), None, "{path}");
        }
    }

    #[tokio::test]
    async fn direct_media_denies_unknown_paths_writes_and_database_failures() {
        let directory =
            std::env::temp_dir().join(format!("media-boundary-{}", uuid::Uuid::new_v4()));
        tokio::fs::create_dir_all(directory.join("posts"))
            .await
            .unwrap();
        tokio::fs::create_dir_all(directory.join("avatars"))
            .await
            .unwrap();
        let fixture = b"private-image-regression-fixture";
        tokio::fs::write(directory.join("posts/post_user_id.webp"), fixture)
            .await
            .unwrap();
        tokio::fs::write(directory.join("avatars/avatar_user_id.webp"), fixture)
            .await
            .unwrap();
        let pool = MySqlPoolOptions::new()
            .acquire_timeout(Duration::from_millis(20))
            .connect_lazy("mysql://unused:unused@127.0.0.1:1/unused")
            .unwrap();
        let app = routes(pool, directory.to_str().unwrap());

        for (path, method, status) in [
            (
                "/uploads/posts/post_user_id.webp",
                Method::GET,
                StatusCode::INTERNAL_SERVER_ERROR,
            ),
            (
                "/uploads/posts/post_user_id.webp",
                Method::HEAD,
                StatusCode::INTERNAL_SERVER_ERROR,
            ),
            (
                "/uploads/private/secret.png",
                Method::GET,
                StatusCode::NOT_FOUND,
            ),
            (
                "/uploads/posts/a%2fb.webp",
                Method::GET,
                StatusCode::NOT_FOUND,
            ),
            (
                "/uploads/avatars/avatar_user_id.webp",
                Method::POST,
                StatusCode::METHOD_NOT_ALLOWED,
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .uri(path)
                        .method(method.clone())
                        .header("x-media-path", "/uploads/avatars/avatar_user_id.webp")
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), status, "{path}");
            assert_eq!(
                response.headers()[header::CACHE_CONTROL],
                "private, no-store"
            );
            assert_eq!(response.headers()["x-content-type-options"], "nosniff");
            let body = to_bytes(response.into_body(), 8192).await.unwrap();
            assert!(!body.windows(fixture.len()).any(|window| window == fixture));
            if method == Method::HEAD {
                assert!(body.is_empty());
            }
        }

        let response = app
            .oneshot(
                Request::builder()
                    .uri("/uploads/avatars/avatar_user_id.webp")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers()[header::CACHE_CONTROL],
            "private, no-store"
        );
        assert_eq!(
            to_bytes(response.into_body(), 8192).await.unwrap().as_ref(),
            fixture
        );
        tokio::fs::remove_dir_all(directory).await.unwrap();
    }
}
