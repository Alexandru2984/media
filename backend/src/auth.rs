use anyhow::{bail, Context, Result};
use axum::http::{header, HeaderMap, HeaderValue};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

const MINIMUM_JWT_SECRET_BYTES: usize = 32;
const SESSION_MAX_AGE_SECONDS: usize = 7 * 24 * 60 * 60;
const PRODUCTION_COOKIE_NAME: &str = "__Host-media_session";
const DEVELOPMENT_COOKIE_NAME: &str = "media_session";

fn validate_secret(secret: String) -> Result<String> {
    if secret.len() < MINIMUM_JWT_SECRET_BYTES {
        bail!(
            "JWT_SECRET must contain at least {} bytes",
            MINIMUM_JWT_SECRET_BYTES
        );
    }

    Ok(secret)
}

fn jwt_secret() -> Result<String> {
    let secret = std::env::var("JWT_SECRET").context("JWT_SECRET must be configured")?;
    validate_secret(secret)
}

pub fn validate_configuration() -> Result<()> {
    jwt_secret().map(|_| ())
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String, // user id
    pub exp: usize,  // expiry time
}

impl Claims {
    pub fn new(user_id: String) -> Self {
        Self {
            sub: user_id,
            exp: (Utc::now() + Duration::days(7)).timestamp() as usize,
        }
    }
}

pub fn create_jwt(user_id: String) -> Result<String> {
    let claims = Claims::new(user_id);
    let header = Header::default();
    let secret = jwt_secret()?;
    let encoding_key = EncodingKey::from_secret(secret.as_bytes());

    encode(&header, &claims, &encoding_key)
        .map_err(|e| anyhow::anyhow!("Failed to create JWT: {}", e))
}

pub fn verify_jwt(token: &str) -> Result<Claims> {
    let secret = jwt_secret()?;
    let decoding_key = DecodingKey::from_secret(secret.as_bytes());
    let validation = Validation::new(Algorithm::HS256);

    decode::<Claims>(token, &decoding_key, &validation)
        .map(|data| data.claims)
        .map_err(|e| anyhow::anyhow!("Failed to verify JWT: {}", e))
}

fn is_production() -> Result<bool> {
    match std::env::var("ENVIRONMENT")
        .context("ENVIRONMENT must be configured")?
        .as_str()
    {
        "production" => Ok(true),
        "development" | "test" => Ok(false),
        _ => bail!("ENVIRONMENT must be production, development, or test"),
    }
}

fn build_session_cookie(token: &str, production: bool) -> String {
    let name = if production {
        PRODUCTION_COOKIE_NAME
    } else {
        DEVELOPMENT_COOKIE_NAME
    };
    let secure = if production { "; Secure" } else { "" };
    format!(
        "{}={}; Path=/; Max-Age={}; HttpOnly; SameSite=Strict{}",
        name, token, SESSION_MAX_AGE_SECONDS, secure
    )
}

fn build_clear_session_cookie(production: bool) -> String {
    let name = if production {
        PRODUCTION_COOKIE_NAME
    } else {
        DEVELOPMENT_COOKIE_NAME
    };
    let secure = if production { "; Secure" } else { "" };
    format!(
        "{}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict{}",
        name, secure
    )
}

pub fn session_cookie(token: &str) -> Result<HeaderValue> {
    HeaderValue::from_str(&build_session_cookie(token, is_production()?))
        .context("Failed to build session cookie")
}

pub fn clear_session_cookie() -> Result<HeaderValue> {
    HeaderValue::from_str(&build_clear_session_cookie(is_production()?))
        .context("Failed to build session cookie")
}

fn cookie_token(headers: &HeaderMap) -> Option<&str> {
    let expected_name = if is_production().ok()? {
        PRODUCTION_COOKIE_NAME
    } else {
        DEVELOPMENT_COOKIE_NAME
    };
    cookie_token_for_name(headers, expected_name)
}

fn cookie_token_for_name<'a>(headers: &'a HeaderMap, expected_name: &str) -> Option<&'a str> {
    headers
        .get(header::COOKIE)?
        .to_str()
        .ok()?
        .split(';')
        .filter_map(|cookie| cookie.trim().split_once('='))
        .find_map(|(name, value)| (name == expected_name && !value.is_empty()).then_some(value))
}

use axum::http::StatusCode;

pub fn get_user_id_from_headers(headers: &HeaderMap) -> Result<String, StatusCode> {
    let bearer_token = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "));
    let token = bearer_token
        .or_else(|| cookie_token(headers))
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let claims = verify_jwt(token).map_err(|_| StatusCode::UNAUTHORIZED)?;
    Ok(claims.sub)
}

#[cfg(test)]
mod tests {
    use super::{
        build_clear_session_cookie, build_session_cookie, cookie_token_for_name, validate_secret,
        MINIMUM_JWT_SECRET_BYTES,
    };
    use axum::http::{header, HeaderMap, HeaderValue};

    #[test]
    fn short_secrets_are_rejected() {
        assert!(validate_secret("x".repeat(MINIMUM_JWT_SECRET_BYTES - 1)).is_err());
    }

    #[test]
    fn minimum_length_secrets_are_accepted() {
        assert!(validate_secret("x".repeat(MINIMUM_JWT_SECRET_BYTES)).is_ok());
    }

    #[test]
    fn production_cookie_is_host_bound_and_script_inaccessible() {
        let cookie = build_session_cookie("token", true);
        assert!(cookie.starts_with("__Host-media_session=token;"));
        assert!(cookie.contains("; Path=/;"));
        assert!(cookie.contains("; HttpOnly;"));
        assert!(cookie.contains("; SameSite=Strict"));
        assert!(cookie.ends_with("; Secure"));
        assert!(!cookie.contains("Domain="));
    }

    #[test]
    fn clear_cookie_uses_the_same_security_attributes() {
        let cookie = build_clear_session_cookie(true);
        assert!(cookie.contains("Max-Age=0"));
        assert!(cookie.contains("HttpOnly"));
        assert!(cookie.ends_with("; Secure"));
    }

    #[test]
    fn reads_only_the_expected_cookie_name() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            HeaderValue::from_static("theme=dark; __Host-media_session=signed.jwt; other=value"),
        );
        assert_eq!(
            cookie_token_for_name(&headers, "__Host-media_session"),
            Some("signed.jwt")
        );
        assert_eq!(cookie_token_for_name(&headers, "media_session"), None);
    }
}
