use axum::{
    body::Body,
    extract::{OriginalUri, Request, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode},
    middleware::Next,
    response::Response,
};
use serde_json::json;
use std::time::Instant;
use uuid::Uuid;

const REQUEST_ID_HEADER: HeaderName = HeaderName::from_static("x-request-id");

fn origin_is_allowed(method: &Method, headers: &HeaderMap, expected_origin: &HeaderValue) -> bool {
    if matches!(*method, Method::GET | Method::HEAD | Method::OPTIONS) {
        return true;
    }

    headers
        .get(header::ORIGIN)
        .is_some_and(|origin| origin == expected_origin)
}

pub async fn enforce_same_origin(
    State(expected_origin): State<HeaderValue>,
    request: Request,
    next: Next,
) -> Result<Response, StatusCode> {
    if !origin_is_allowed(request.method(), request.headers(), &expected_origin) {
        return Err(StatusCode::FORBIDDEN);
    }

    Ok(next.run(request).await)
}

fn valid_request_id(value: &HeaderValue) -> bool {
    let bytes = value.as_bytes();
    !bytes.is_empty()
        && bytes.len() <= 64
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'-')
}

fn request_id(headers: &HeaderMap) -> HeaderValue {
    headers
        .get(&REQUEST_ID_HEADER)
        .filter(|value| valid_request_id(value))
        .cloned()
        .unwrap_or_else(|| {
            HeaderValue::from_str(&Uuid::new_v4().to_string())
                .expect("UUIDs are always valid header values")
        })
}

pub async fn api_response_policy(request: Request, next: Next) -> Response {
    let response_request_id = request_id(request.headers());
    let is_head = request.method() == Method::HEAD;
    let mut response = next.run(request).await;

    response
        .headers_mut()
        .insert(REQUEST_ID_HEADER, response_request_id.clone());

    let status = response.status();
    if status.is_client_error() || status.is_server_error() {
        let request_id_text = response_request_id
            .to_str()
            .expect("validated request IDs contain only ASCII");
        let payload = json!({
            "type": "about:blank",
            "title": status.canonical_reason().unwrap_or("Request failed"),
            "status": status.as_u16(),
            "request_id": request_id_text,
        })
        .to_string();

        response.headers_mut().insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/problem+json"),
        );
        response
            .headers_mut()
            .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
        response.headers_mut().remove(header::CONTENT_LENGTH);
        *response.body_mut() = if is_head {
            Body::empty()
        } else {
            Body::from(payload)
        };
    }

    response
}

pub async fn request_observability(request: Request, next: Next) -> Response {
    let method = request.method().clone();
    // Deliberately log only the path. Query strings can contain search terms,
    // identifiers, or secrets from legacy clients.
    let path = request
        .extensions()
        .get::<OriginalUri>()
        .map(|original_uri| original_uri.0.path())
        .unwrap_or_else(|| request.uri().path())
        .to_owned();
    let started_at = Instant::now();
    let response = next.run(request).await;
    let status = response.status();
    let duration_ms = started_at.elapsed().as_millis() as u64;
    let response_request_id = response
        .headers()
        .get(&REQUEST_ID_HEADER)
        .and_then(|value| value.to_str().ok())
        .unwrap_or("missing");

    if status.is_server_error() {
        tracing::error!(
            request_id = response_request_id,
            http_method = %method,
            url_path = path,
            status_code = status.as_u16(),
            duration_ms,
            "API request completed"
        );
    } else if status.is_client_error() {
        tracing::warn!(
            request_id = response_request_id,
            http_method = %method,
            url_path = path,
            status_code = status.as_u16(),
            duration_ms,
            "API request completed"
        );
    } else {
        tracing::info!(
            request_id = response_request_id,
            http_method = %method,
            url_path = path,
            status_code = status.as_u16(),
            duration_ms,
            "API request completed"
        );
    }

    response
}

#[cfg(test)]
mod tests {
    use super::{
        api_response_policy, origin_is_allowed, request_id, valid_request_id, REQUEST_ID_HEADER,
    };
    use axum::{
        body::{to_bytes, Body},
        http::{header, HeaderMap, HeaderValue, Method, Request, StatusCode},
        middleware,
        routing::{get, post},
        Json, Router,
    };
    use serde_json::{json, Value};
    use tower::ServiceExt;

    fn expected_origin() -> HeaderValue {
        HeaderValue::from_static("https://media.example.com")
    }

    fn response_policy_app() -> Router {
        Router::new()
            .route(
                "/json",
                post(|Json(payload): Json<Value>| async move { Json(payload) }),
            )
            .route(
                "/error",
                get(|| async { StatusCode::INTERNAL_SERVER_ERROR }),
            )
            .route("/missing", get(|| async { StatusCode::NOT_FOUND }))
            .route("/ok", get(|| async { Json(json!({ "ok": true })) }))
            .layer(middleware::from_fn(api_response_policy))
    }

    #[test]
    fn safe_methods_do_not_require_an_origin() {
        let headers = HeaderMap::new();
        assert!(origin_is_allowed(
            &Method::GET,
            &headers,
            &expected_origin()
        ));
        assert!(origin_is_allowed(
            &Method::OPTIONS,
            &headers,
            &expected_origin()
        ));
    }

    #[test]
    fn mutations_require_the_exact_configured_origin() {
        let mut headers = HeaderMap::new();
        assert!(!origin_is_allowed(
            &Method::POST,
            &headers,
            &expected_origin()
        ));

        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://evil.example.com"),
        );
        assert!(!origin_is_allowed(
            &Method::DELETE,
            &headers,
            &expected_origin()
        ));

        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://media.example.com"),
        );
        assert!(origin_is_allowed(
            &Method::PUT,
            &headers,
            &expected_origin()
        ));
    }

    #[test]
    fn accepts_only_short_opaque_request_ids() {
        assert!(valid_request_id(&HeaderValue::from_static("abc-123")));
        assert!(!valid_request_id(&HeaderValue::from_static("has spaces")));
        assert!(!valid_request_id(&HeaderValue::from_static("path/value")));
        assert!(!valid_request_id(
            &HeaderValue::from_str(&"a".repeat(65)).unwrap()
        ));
    }

    #[test]
    fn generates_a_request_id_when_the_proxy_does_not_supply_one() {
        let generated = request_id(&HeaderMap::new());
        assert!(valid_request_id(&generated));

        let mut headers = HeaderMap::new();
        headers.insert(REQUEST_ID_HEADER, HeaderValue::from_static("proxy-123"));
        assert_eq!(request_id(&headers), "proxy-123");
    }

    #[tokio::test]
    async fn malformed_json_is_replaced_with_a_safe_problem_response() {
        let response = response_policy_app()
            .oneshot(
                Request::builder()
                    .method(Method::POST)
                    .uri("/json")
                    .header(header::CONTENT_TYPE, "application/json")
                    .header(REQUEST_ID_HEADER, "proxy-123")
                    .body(Body::from(r#"{"private_field":"unterminated"#))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/problem+json"
        );
        assert_eq!(
            response.headers().get(header::CACHE_CONTROL).unwrap(),
            "no-store"
        );
        assert_eq!(
            response.headers().get(REQUEST_ID_HEADER).unwrap(),
            "proxy-123"
        );
        let declared_length = response
            .headers()
            .get(header::CONTENT_LENGTH)
            .map(|value| value.to_str().unwrap().parse::<usize>().unwrap());

        let body = to_bytes(response.into_body(), 8_192).await.unwrap();
        if let Some(declared_length) = declared_length {
            assert_eq!(declared_length, body.len());
        }
        let problem: Value = serde_json::from_slice(&body).unwrap();
        assert_eq!(
            problem,
            json!({
                "type": "about:blank",
                "title": "Bad Request",
                "status": 400,
                "request_id": "proxy-123"
            })
        );
        assert!(!String::from_utf8_lossy(&body).contains("private_field"));
    }

    #[tokio::test]
    async fn server_errors_are_replaced_with_a_safe_problem_response() {
        let response = response_policy_app()
            .oneshot(
                Request::builder()
                    .uri("/error")
                    .header(REQUEST_ID_HEADER, "server-error-123")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::INTERNAL_SERVER_ERROR);
        let body = to_bytes(response.into_body(), 8_192).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({
                "type": "about:blank",
                "title": "Internal Server Error",
                "status": 500,
                "request_id": "server-error-123"
            })
        );
    }

    #[tokio::test]
    async fn head_errors_have_no_body_and_regenerate_an_invalid_request_id() {
        let response = response_policy_app()
            .oneshot(
                Request::builder()
                    .method(Method::HEAD)
                    .uri("/missing")
                    .header(REQUEST_ID_HEADER, "invalid/value")
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
        let generated = response.headers().get(REQUEST_ID_HEADER).unwrap();
        assert_ne!(generated, "invalid/value");
        assert!(valid_request_id(generated));
        let body = to_bytes(response.into_body(), 8_192).await.unwrap();
        assert!(body.is_empty());
    }

    #[tokio::test]
    async fn successful_json_is_not_rewritten() {
        let response = response_policy_app()
            .oneshot(Request::builder().uri("/ok").body(Body::empty()).unwrap())
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        assert_eq!(
            response.headers().get(header::CONTENT_TYPE).unwrap(),
            "application/json"
        );
        assert!(valid_request_id(
            response.headers().get(REQUEST_ID_HEADER).unwrap()
        ));
        let body = to_bytes(response.into_body(), 8_192).await.unwrap();
        assert_eq!(
            serde_json::from_slice::<Value>(&body).unwrap(),
            json!({ "ok": true })
        );
    }
}
