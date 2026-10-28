use axum::{
    extract::{Request, State},
    http::{header, HeaderMap, HeaderValue, Method, StatusCode},
    middleware::Next,
    response::Response,
};

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

#[cfg(test)]
mod tests {
    use super::origin_is_allowed;
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
}
