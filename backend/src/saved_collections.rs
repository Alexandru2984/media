use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::{query, query_as, query_scalar, MySql, MySqlPool, Transaction};
use uuid::Uuid;

use crate::handlers;

const MAXIMUM_COLLECTIONS: i64 = 30;
const MAXIMUM_NAME_CHARACTERS: usize = 60;

#[derive(Serialize, sqlx::FromRow)]
pub(crate) struct SavedCollection {
    id: String,
    name: String,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CollectionName {
    name: String,
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Assignment {
    // Required, explicitly nullable. An omitted field must not silently unfile.
    collection_id: Value,
}

fn clean_name(raw: &str) -> Result<&str, StatusCode> {
    let name = raw.trim();
    if name.is_empty()
        || name.chars().count() > MAXIMUM_NAME_CHARACTERS
        || raw.chars().any(char::is_control)
    {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok(name)
}

fn canonical_id(raw: &str, status: StatusCode) -> Result<String, StatusCode> {
    Uuid::parse_str(raw)
        .map(|id| id.to_string())
        .map_err(|_| status)
}

fn write_error(error: sqlx::Error) -> StatusCode {
    if error
        .as_database_error()
        .is_some_and(|e| e.is_unique_violation())
    {
        StatusCode::CONFLICT
    } else {
        StatusCode::INTERNAL_SERVER_ERROR
    }
}

async fn lock_owner(
    transaction: &mut Transaction<'_, MySql>,
    user_id: &str,
) -> Result<(), StatusCode> {
    query_scalar::<_, String>("SELECT id FROM users WHERE id = ? FOR UPDATE")
        .bind(user_id)
        .fetch_optional(&mut **transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    Ok(())
}

async fn owned_collection(
    transaction: &mut Transaction<'_, MySql>,
    user_id: &str,
    id: &str,
) -> Result<SavedCollection, StatusCode> {
    query_as::<_, SavedCollection>("SELECT id, name, created_at, updated_at FROM saved_collections WHERE id = ? AND user_id = ? FOR UPDATE")
        .bind(id).bind(user_id).fetch_optional(&mut **transaction).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?.ok_or(StatusCode::NOT_FOUND)
}

pub async fn list(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
) -> Result<Json<Vec<SavedCollection>>, StatusCode> {
    let user_id = handlers::get_current_user(&pool, &headers).await?;
    let collections = query_as::<_, SavedCollection>("SELECT id, name, created_at, updated_at FROM saved_collections WHERE user_id = ? ORDER BY created_at ASC, id ASC LIMIT ?")
        .bind(user_id).bind(MAXIMUM_COLLECTIONS).fetch_all(&pool).await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(collections))
}

pub async fn create(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
    Json(payload): Json<CollectionName>,
) -> Result<Json<SavedCollection>, StatusCode> {
    let user_id = handlers::get_current_user(&pool, &headers).await?;
    let name = clean_name(&payload.name)?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    lock_owner(&mut transaction, &user_id).await?;
    let count = query_scalar::<_, i64>("SELECT COUNT(*) FROM saved_collections WHERE user_id = ?")
        .bind(&user_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if count >= MAXIMUM_COLLECTIONS {
        return Err(StatusCode::CONFLICT);
    }
    let id = Uuid::new_v4().to_string();
    query("INSERT INTO saved_collections (id, user_id, name) VALUES (?, ?, ?)")
        .bind(&id)
        .bind(&user_id)
        .bind(name)
        .execute(&mut *transaction)
        .await
        .map_err(write_error)?;
    let collection = owned_collection(&mut transaction, &user_id, &id).await?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(collection))
}

pub async fn rename(
    State(pool): State<MySqlPool>,
    Path(id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CollectionName>,
) -> Result<Json<SavedCollection>, StatusCode> {
    let user_id = handlers::get_current_user(&pool, &headers).await?;
    let id = canonical_id(&id, StatusCode::NOT_FOUND)?;
    let name = clean_name(&payload.name)?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    lock_owner(&mut transaction, &user_id).await?;
    owned_collection(&mut transaction, &user_id, &id).await?;
    query("UPDATE saved_collections SET name = ?, updated_at = CURRENT_TIMESTAMP(6) WHERE id = ? AND user_id = ?")
        .bind(name).bind(&id).bind(&user_id).execute(&mut *transaction).await.map_err(write_error)?;
    let collection = owned_collection(&mut transaction, &user_id, &id).await?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(collection))
}

pub async fn delete(
    State(pool): State<MySqlPool>,
    Path(id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = handlers::get_current_user(&pool, &headers).await?;
    let id = canonical_id(&id, StatusCode::NOT_FOUND)?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    lock_owner(&mut transaction, &user_id).await?;
    owned_collection(&mut transaction, &user_id, &id).await?;
    query("DELETE FROM saved_collections WHERE id = ? AND user_id = ?")
        .bind(id)
        .bind(user_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    Ok(Json(json!({ "deleted": true })))
}

pub async fn assign(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<Assignment>,
) -> Result<Json<Value>, StatusCode> {
    let user_id = handlers::get_current_user(&pool, &headers).await?;
    let post_id = canonical_id(&post_id, StatusCode::NOT_FOUND)?;
    let collection_id = match payload.collection_id {
        Value::Null => None,
        Value::String(value) => Some(canonical_id(&value, StatusCode::BAD_REQUEST)?),
        _ => return Err(StatusCode::BAD_REQUEST),
    };
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    // Serialize account metadata, then lock the owned bookmark. Its FK already
    // guarantees the post exists: avoiding a post lock also avoids reversing
    // account deletion/hide's user-before-post lock order.
    lock_owner(&mut transaction, &user_id).await?;
    query_scalar::<_, String>(
        "SELECT post_id FROM saved_posts WHERE user_id = ? AND post_id = ? FOR UPDATE",
    )
    .bind(&user_id)
    .bind(&post_id)
    .fetch_optional(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;
    if let Some(id) = &collection_id {
        owned_collection(&mut transaction, &user_id, id).await?;
        query("INSERT INTO saved_collection_posts (user_id, post_id, collection_id) VALUES (?, ?, ?)
               ON DUPLICATE KEY UPDATE assigned_at = IF(collection_id = VALUES(collection_id), assigned_at, CURRENT_TIMESTAMP(6)), collection_id = VALUES(collection_id)")
            .bind(&user_id).bind(&post_id).bind(id).execute(&mut *transaction).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    } else {
        query("DELETE FROM saved_collection_posts WHERE user_id = ? AND post_id = ?")
            .bind(&user_id)
            .bind(&post_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    }
    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    // This changes the owner's existing bookmark metadata only. Reading the
    // post still requires current audience/block/mute/hide authorization.
    Ok(Json(json!({ "collection_id": collection_id })))
}

#[cfg(test)]
mod tests {
    use super::clean_name;

    #[test]
    fn collection_names_count_unicode_and_reject_controls() {
        assert_eq!(
            clean_name("  Lecturi de weekend  ").unwrap(),
            "Lecturi de weekend"
        );
        assert!(clean_name(&"📚".repeat(60)).is_ok());
        for invalid in [
            "".to_owned(),
            "　 ".to_owned(),
            "📚".repeat(61),
            "Titlu\nascuns".to_owned(),
            "\tTitlu".to_owned(),
            "Titlu\0".to_owned(),
        ] {
            assert!(clean_name(&invalid).is_err());
        }
    }
}
