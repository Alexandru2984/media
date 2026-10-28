use axum::{extract::State, http::StatusCode, response::Json};
use serde_json::{json, Value};
use sqlx::{query_scalar, MySqlPool};

pub async fn live() -> Json<Value> {
    Json(json!({ "status": "ok" }))
}

pub async fn ready(State(pool): State<MySqlPool>) -> (StatusCode, Json<Value>) {
    match query_scalar::<_, i32>("SELECT 1").fetch_one(&pool).await {
        Ok(1) => (StatusCode::OK, Json(json!({ "status": "ready" }))),
        _ => (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "unavailable" })),
        ),
    }
}
