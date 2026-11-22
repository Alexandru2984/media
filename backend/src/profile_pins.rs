use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use serde_json::{json, Value};
use sqlx::{query, query_scalar, MySqlPool};
use uuid::Uuid;

use crate::{handlers, models::PostWithUser};

pub async fn get_pin(
    State(pool): State<MySqlPool>,
    Path(user_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Option<PostWithUser>>, StatusCode> {
    let user_id = Uuid::parse_str(&user_id)
        .map_err(|_| StatusCode::NOT_FOUND)?
        .to_string();
    let viewer = match handlers::get_current_user(&pool, &headers).await {
        Ok(user) => Some(user),
        Err(StatusCode::UNAUTHORIZED) => None,
        Err(status) => return Err(status),
    };
    if !handlers::profile_content_is_visible(&pool, viewer.as_deref(), &user_id).await? {
        return Ok(Json(None));
    }
    let post_id = query_scalar::<_, String>("SELECT post_id FROM profile_pins WHERE user_id = ?")
        .bind(&user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    let Some(post_id) = post_id else {
        return Ok(Json(None));
    };
    // Re-evaluate the post audience and personal hides. A concurrent pin change
    // must not label a formerly pinned post as the current featured post.
    let post = handlers::visible_post_for_viewer(&pool, viewer.as_deref(), &post_id)
        .await?
        .filter(|post| post.is_pinned && post.user.id == user_id);
    Ok(Json(post))
}

async fn change_pin(
    pool: MySqlPool,
    post_id: String,
    headers: HeaderMap,
    pin: bool,
) -> Result<Json<Value>, StatusCode> {
    let user_id = handlers::get_current_user(&pool, &headers).await?;
    let post_id = Uuid::parse_str(&post_id)
        .map_err(|_| StatusCode::NOT_FOUND)?
        .to_string();
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    // Serialize choices for one profile. All ownership checks are repeated on
    // the server, and the composite FK also rejects cross-owner pin rows.
    query_scalar::<_, String>("SELECT id FROM users WHERE id = ? FOR UPDATE")
        .bind(&user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let owner = query_scalar::<_, String>("SELECT user_id FROM posts WHERE id = ? FOR UPDATE")
        .bind(&post_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;
    if owner != user_id {
        return Err(StatusCode::FORBIDDEN);
    }
    if pin {
        query("INSERT INTO profile_pins (user_id, post_id) VALUES (?, ?)
               ON DUPLICATE KEY UPDATE pinned_at = IF(post_id = VALUES(post_id), pinned_at, CURRENT_TIMESTAMP(6)), post_id = VALUES(post_id)")
            .bind(&user_id).bind(&post_id).execute(&mut *transaction).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    } else {
        // An old unpin action for A must never clear a newer choice B.
        query("DELETE FROM profile_pins WHERE user_id = ? AND post_id = ?")
            .bind(&user_id)
            .bind(&post_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    let current = query_scalar::<_, String>("SELECT post_id FROM profile_pins WHERE user_id = ?")
        .bind(&user_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "pinned_post_id": current })))
}

pub async fn pin(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    change_pin(pool, post_id, headers, true).await
}
pub async fn unpin(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    change_pin(pool, post_id, headers, false).await
}
