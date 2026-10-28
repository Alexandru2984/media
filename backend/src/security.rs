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
    use super::{origin_is_allowed, request_id, valid_request_id, REQUEST_ID_HEADER};
    use axum::http::{header, HeaderMap, HeaderValue, Method};

    fn expected_origin() -> HeaderValue {
        HeaderValue::from_static("https://media.example.com")
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
}
