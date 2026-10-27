use anyhow::{bail, Context, Result};
use chrono::{Duration, Utc};
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

const MINIMUM_JWT_SECRET_BYTES: usize = 32;

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

use axum::http::{HeaderMap, StatusCode};

pub fn get_user_id_from_headers(headers: &HeaderMap) -> Result<String, StatusCode> {
    let auth_header = headers
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let claims = verify_jwt(token).map_err(|_| StatusCode::UNAUTHORIZED)?;
    Ok(claims.sub)
}

#[cfg(test)]
mod tests {
    use super::{validate_secret, MINIMUM_JWT_SECRET_BYTES};

    #[test]
    fn short_secrets_are_rejected() {
        assert!(validate_secret("x".repeat(MINIMUM_JWT_SECRET_BYTES - 1)).is_err());
    }

    #[test]
    fn minimum_length_secrets_are_accepted() {
        assert!(validate_secret("x".repeat(MINIMUM_JWT_SECRET_BYTES)).is_ok());
    }
}
