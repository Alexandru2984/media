use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};
use chrono::{Duration, Utc};
use anyhow::Result;

const JWT_SECRET: &[u8] = b"your-secret-key-here-change-in-production";

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
    let encoding_key = EncodingKey::from_secret(JWT_SECRET);
    
    encode(&header, &claims, &encoding_key)
        .map_err(|e| anyhow::anyhow!("Failed to create JWT: {}", e))
}

pub fn verify_jwt(token: &str) -> Result<Claims> {
    let decoding_key = DecodingKey::from_secret(JWT_SECRET);
    let validation = Validation::default();
    
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