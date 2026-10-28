use axum::{
    extract::{Path, Query, State},
    http::{header, HeaderMap, StatusCode},
    response::Json,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{DateTime, Utc};
use serde_json::{json, Value};
use sqlx::{query, query_as, query_scalar, MySql, MySqlPool, QueryBuilder};
use std::{collections::HashMap, path::Path as FileSystemPath};
use uuid::Uuid;

use crate::{
    auth::{clear_session_cookie, create_jwt, get_user_id_from_headers, session_cookie},
    email::EmailService,
    models::*,
    tokens::{generate_one_time_token, hash_one_time_token},
    uploads::validated_image_extension,
    validation::{
        bounded_text_is_valid, email_change_address_is_valid, email_is_valid,
        one_time_token_is_valid, password_is_safe_to_verify, password_is_valid,
        search_query_is_valid, stored_image_path_belongs_to_user, username_is_valid,
        MAXIMUM_BIO_CHARACTERS, MAXIMUM_COMMENT_CHARACTERS, MAXIMUM_MESSAGE_CHARACTERS,
        MAXIMUM_POST_CHARACTERS,
    },
};

#[derive(sqlx::FromRow)]
struct PostFeedRow {
    id: String,
    content: String,
    image_url: Option<String>,
    likes_count: i64,
    comments_count: i64,
    created_at: DateTime<Utc>,
    user_id: String,
    username: String,
    bio: Option<String>,
    avatar_url: Option<String>,
    user_posts_count: i64,
    user_created_at: DateTime<Utc>,
    is_liked: bool,
}

#[derive(sqlx::FromRow)]
struct CommentFeedRow {
    id: String,
    content: String,
    created_at: DateTime<Utc>,
    user_id: String,
    username: String,
    avatar_url: Option<String>,
}

fn post_feed_row_to_response(row: PostFeedRow) -> PostWithUser {
    PostWithUser {
        id: row.id,
        content: row.content,
        image_url: row.image_url,
        likes_count: row.likes_count,
        comments_count: row.comments_count,
        created_at: row.created_at,
        user: UserProfile {
            id: row.user_id,
            username: row.username,
            bio: row.bio,
            avatar_url: row.avatar_url,
            posts_count: row.user_posts_count,
            created_at: row.user_created_at,
        },
        is_liked: row.is_liked,
    }
}

async fn remove_managed_upload(url: Option<&str>, expected_prefix: &str, filename_prefix: &str) {
    let Some(url) = url else {
        return;
    };
    if !stored_image_path_belongs_to_user(url, expected_prefix, filename_prefix) {
        return;
    }

    let Some(filename) = url.strip_prefix(expected_prefix) else {
        return;
    };
    if filename.is_empty() || filename.contains('/') {
        return;
    }

    let directory = expected_prefix.trim_matches('/');
    let upload_path = FileSystemPath::new(directory).join(filename);
    if let Err(error) = tokio::fs::remove_file(&upload_path).await {
        if error.kind() != std::io::ErrorKind::NotFound {
            tracing::error!(error = %error, "failed to remove superseded upload");
        }
    }
}

async fn remove_unreferenced_post_upload(pool: &MySqlPool, url: Option<&str>, user_id: &str) {
    let Some(url) = url else {
        return;
    };
    let filename_prefix = format!("post_{}_", user_id);
    if !stored_image_path_belongs_to_user(url, "/uploads/posts/", &filename_prefix) {
        return;
    }

    let references = query_scalar::<_, i64>("SELECT COUNT(*) FROM posts WHERE image_url = ?")
        .bind(url)
        .fetch_one(pool)
        .await;
    match references {
        Ok(0) => remove_managed_upload(Some(url), "/uploads/posts/", &filename_prefix).await,
        Ok(_) => {}
        Err(error) => tracing::error!(error = %error, "failed to check upload references"),
    }
}

fn authenticated_response(
    token: &str,
    payload: Value,
) -> Result<(HeaderMap, Json<Value>), StatusCode> {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        session_cookie(token).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    Ok((headers, Json(payload)))
}

// Auth handlers
pub async fn register(
    State(pool): State<MySqlPool>,
    Json(payload): Json<CreateUser>,
) -> Result<(HeaderMap, Json<Value>), StatusCode> {
    let username = payload.username.trim().to_owned();
    let email = payload.email.trim().to_owned();
    let bio = payload.bio.map(|bio| bio.trim().to_owned());

    if !password_is_valid(&payload.password)
        || !username_is_valid(&username)
        || !email_is_valid(&email)
        || bio
            .as_deref()
            .is_some_and(|bio| !bounded_text_is_valid(bio, 0, MAXIMUM_BIO_CHARACTERS))
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    let user_id = Uuid::new_v4().to_string();
    let password_hash =
        hash(&payload.password, DEFAULT_COST).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let now = Utc::now();

    let result = query(
        "INSERT INTO users (id, username, email, password_hash, email_verified, bio, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)"
    )
    .bind(&user_id)
    .bind(&username)
    .bind(&email)
    .bind(&password_hash)
    .bind(&bio)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => {
            // Generate verification token
            let verification_token = generate_one_time_token();
            let stored_verification_token = hash_one_time_token(&verification_token);

            let token_id = Uuid::new_v4().to_string();
            let expires_at = Utc::now() + chrono::Duration::hours(24);

            // Save verification token to database
            let _ = query(
                "INSERT INTO email_tokens (id, user_id, token, token_type, expires_at)
                 VALUES (?, ?, ?, 'verification', ?)",
            )
            .bind(&token_id)
            .bind(&user_id)
            .bind(&stored_verification_token)
            .bind(expires_at)
            .execute(&pool)
            .await;

            // Send verification email (don't block registration if email fails)
            let email_service =
                EmailService::new().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            let email_for_delivery = email.clone();
            let username_for_delivery = username.clone();
            tokio::spawn(async move {
                let result = email_service
                    .send_verification_email(
                        &email_for_delivery,
                        &username_for_delivery,
                        &verification_token,
                    )
                    .await;

                if let Err(e) = result {
                    tracing::error!(error = %e, "verification email delivery failed");
                }
            });

            let token =
                create_jwt(user_id.clone()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            authenticated_response(
                &token,
                json!({
                    "user": {
                        "id": user_id,
                        "username": username,
                        "email": email,
                        "bio": bio
                    }
                }),
            )
        }
        Err(_) => Err(StatusCode::CONFLICT),
    }
}

pub async fn login(
    State(pool): State<MySqlPool>,
    Json(payload): Json<LoginUser>,
) -> Result<(HeaderMap, Json<Value>), StatusCode> {
    let email = payload.email.trim();
    if !email_is_valid(email) || !password_is_safe_to_verify(&payload.password) {
        return Err(StatusCode::UNAUTHORIZED);
    }

    let user = query_as::<_, User>("SELECT * FROM users WHERE email = ?")
        .bind(email)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    match user {
        Some(user) => {
            let is_valid = verify(&payload.password, &user.password_hash)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            if is_valid {
                let token =
                    create_jwt(user.id.clone()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

                authenticated_response(
                    &token,
                    json!({
                        "user": {
                            "id": user.id,
                            "username": user.username,
                            "email": user.email,
                            "bio": user.bio,
                            "avatar_url": user.avatar_url
                        }
                    }),
                )
            } else {
                Err(StatusCode::UNAUTHORIZED)
            }
        }
        None => Err(StatusCode::UNAUTHORIZED),
    }
}

// Get current authenticated user
pub async fn me(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;

    let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "bio": user.bio,
        "avatar_url": user.avatar_url
    })))
}

pub async fn create_session(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
) -> Result<(HeaderMap, Json<Value>), StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let token = create_jwt(user_id).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    authenticated_response(
        &token,
        json!({
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "bio": user.bio,
                "avatar_url": user.avatar_url
            }
        }),
    )
}

pub async fn logout() -> Result<(HeaderMap, Json<Value>), StatusCode> {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        clear_session_cookie().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
    );
    Ok((headers, Json(json!({ "message": "Sesiune încheiată" }))))
}

// Helper function to extract user from token
pub async fn get_current_user(headers: &HeaderMap) -> Result<String, StatusCode> {
    get_user_id_from_headers(headers)
}

// User handlers
pub async fn get_profile(
    State(pool): State<MySqlPool>,
    Path(user_id): Path<String>,
) -> Result<Json<UserProfile>, StatusCode> {
    let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    let posts_count: i64 = query_scalar("SELECT COUNT(*) FROM posts WHERE user_id = ?")
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(UserProfile {
        id: user.id,
        username: user.username,
        bio: user.bio,
        avatar_url: user.avatar_url,
        posts_count,
        created_at: user.created_at,
    }))
}

// Post handlers
pub async fn create_post(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
    Json(payload): Json<CreatePost>,
) -> Result<Json<Post>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let content = payload.content.trim();
    let image_filename_prefix = format!("post_{}_", user_id);
    if !bounded_text_is_valid(content, 1, MAXIMUM_POST_CHARACTERS)
        || payload.image_url.as_deref().is_some_and(|path| {
            !stored_image_path_belongs_to_user(path, "/uploads/posts/", &image_filename_prefix)
        })
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    let post_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    query(
        "INSERT INTO posts (id, user_id, content, image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&post_id)
    .bind(&user_id)
    .bind(content)
    .bind(&payload.image_url)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!(error = %e, "failed to create post");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let post = query_as::<_, Post>("SELECT * FROM posts WHERE id = ?")
        .bind(&post_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            tracing::error!(error = %e, "failed to fetch newly created post");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;

    Ok(Json(post))
}

pub async fn get_posts(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<PostWithUser>>, StatusCode> {
    let current_user_id = get_current_user(&headers).await.ok();
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(10)
        .clamp(1, 50);
    let offset = params
        .get("offset")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .clamp(0, 1_000_000);

    let rows = query_as::<_, PostFeedRow>(
        "SELECT p.id, p.content, p.image_url, p.likes_count, p.comments_count, p.created_at,
                u.id AS user_id, u.username, u.bio, u.avatar_url,
                post_counts.posts_count AS user_posts_count,
                u.created_at AS user_created_at,
                (current_like.id IS NOT NULL) AS is_liked
         FROM posts p
         INNER JOIN users u ON u.id = p.user_id
         INNER JOIN (
             SELECT user_id, COUNT(*) AS posts_count
             FROM posts
             GROUP BY user_id
         ) post_counts ON post_counts.user_id = p.user_id
         LEFT JOIN likes current_like
           ON current_like.post_id = p.id AND current_like.user_id = ?
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(current_user_id.as_deref())
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(
        rows.into_iter().map(post_feed_row_to_response).collect(),
    ))
}

pub async fn like_post(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let like_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Lock the post so concurrent toggles cannot race the denormalized counter.
    let post_exists: Option<String> = query_scalar("SELECT id FROM posts WHERE id = ? FOR UPDATE")
        .bind(&post_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if post_exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    let existing_like: Option<String> =
        query_scalar("SELECT id FROM likes WHERE post_id = ? AND user_id = ? FOR UPDATE")
            .bind(&post_id)
            .bind(&user_id)
            .fetch_optional(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let liked = if existing_like.is_some() {
        query("DELETE FROM likes WHERE post_id = ? AND user_id = ?")
            .bind(&post_id)
            .bind(&user_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        query("UPDATE posts SET likes_count = GREATEST(likes_count - 1, 0) WHERE id = ?")
            .bind(&post_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        false
    } else {
        query("INSERT INTO likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)")
            .bind(&like_id)
            .bind(&post_id)
            .bind(&user_id)
            .bind(now)
            .execute(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        query("UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?")
            .bind(&post_id)
            .execute(&mut *transaction)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        true
    };

    let likes_count: i64 = query_scalar("SELECT likes_count FROM posts WHERE id = ?")
        .bind(&post_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "liked": liked,
        "likes_count": likes_count
    })))
}

// Comment handlers
pub async fn create_comment(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateComment>,
) -> Result<Json<Comment>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let content = payload.content.trim();
    if !bounded_text_is_valid(content, 1, MAXIMUM_COMMENT_CHARACTERS) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let comment_id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let post_exists: Option<String> = query_scalar("SELECT id FROM posts WHERE id = ? FOR UPDATE")
        .bind(&post_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if post_exists.is_none() {
        return Err(StatusCode::NOT_FOUND);
    }

    query(
        "INSERT INTO comments (id, post_id, user_id, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&comment_id)
    .bind(&post_id)
    .bind(&user_id)
    .bind(content)
    .bind(now)
    .bind(now)
    .execute(&mut *transaction)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let comment = query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
        .bind(&comment_id)
        .fetch_one(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Update comments count
    query("UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?")
        .bind(&post_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(comment))
}

pub async fn get_comments(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    let comments = query_as::<_, CommentFeedRow>(
        "SELECT c.id, c.content, c.created_at,
                u.id AS user_id, u.username, u.avatar_url
         FROM comments c
         INNER JOIN users u ON u.id = c.user_id
         WHERE c.post_id = ?
         ORDER BY c.created_at ASC",
    )
    .bind(&post_id)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(
        comments
            .into_iter()
            .map(|comment| {
                json!({
                    "id": comment.id,
                    "content": comment.content,
                    "created_at": comment.created_at,
                    "user": {
                        "id": comment.user_id,
                        "username": comment.username,
                        "avatar_url": comment.avatar_url
                    }
                })
            })
            .collect(),
    ))
}

// Update User Profile
pub async fn update_profile(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
    Json(payload): Json<UpdateUser>,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let now = Utc::now();

    if payload.username.is_none() && payload.bio.is_none() && payload.avatar_url.is_none() {
        return Err(StatusCode::BAD_REQUEST);
    }

    let username = payload.username.map(|username| username.trim().to_owned());
    let bio = payload.bio.map(|bio| bio.trim().to_owned());
    let avatar_url = payload
        .avatar_url
        .map(|avatar_url| avatar_url.trim().to_owned());
    let avatar_filename_prefix = format!("{}_", user_id);

    if username
        .as_deref()
        .is_some_and(|username| !username_is_valid(username))
        || bio
            .as_deref()
            .is_some_and(|bio| !bounded_text_is_valid(bio, 0, MAXIMUM_BIO_CHARACTERS))
        || avatar_url.as_deref().is_some_and(|path| {
            !stored_image_path_belongs_to_user(path, "/uploads/avatars/", &avatar_filename_prefix)
        })
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    let mut builder = QueryBuilder::<MySql>::new("UPDATE users SET ");
    {
        let mut updates = builder.separated(", ");

        if let Some(username) = username {
            updates.push("username = ").push_bind(username);
        }
        if let Some(bio) = bio {
            updates.push("bio = ").push_bind(bio);
        }
        if let Some(avatar_url) = avatar_url {
            updates.push("avatar_url = ").push_bind(avatar_url);
        }

        updates.push("updated_at = ").push_bind(now);
    }
    builder.push(" WHERE id = ").push_bind(&user_id);

    builder
        .build()
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Return updated user
    let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "bio": user.bio,
        "avatar_url": user.avatar_url
    })))
}

// Change Password
pub async fn change_password(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
    Json(payload): Json<ChangePassword>,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;

    if !password_is_valid(&payload.new_password)
        || !password_is_safe_to_verify(&payload.old_password)
        || payload.old_password == payload.new_password
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Get current user
    let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Verify old password
    let is_valid = verify(&payload.old_password, &user.password_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !is_valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    // Hash new password
    let new_password_hash =
        hash(&payload.new_password, DEFAULT_COST).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Update password
    query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(&new_password_hash)
        .bind(Utc::now())
        .bind(&user_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "message": "Parola a fost schimbată cu succes"
    })))
}

// Change Email (send verification)
pub async fn change_email(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
    Json(payload): Json<ChangeEmail>,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let new_email = payload.new_email.trim();

    if !email_change_address_is_valid(new_email) || !password_is_safe_to_verify(&payload.password) {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Get current user
    let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Verify password
    let is_valid = verify(&payload.password, &user.password_hash)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if !is_valid {
        return Err(StatusCode::UNAUTHORIZED);
    }

    if user.email.eq_ignore_ascii_case(new_email) {
        return Err(StatusCode::BAD_REQUEST);
    }

    // Check if new email already exists
    let existing = query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = ? AND id != ?")
        .bind(new_email)
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if existing > 0 {
        return Err(StatusCode::CONFLICT);
    }

    // Generate verification token
    let token = generate_one_time_token();

    let token_id = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::hours(24);

    query(
        "INSERT INTO email_tokens (id, user_id, token, token_type, expires_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&token_id)
    .bind(&user_id)
    .bind(format!("{}:{}", hash_one_time_token(&token), new_email))
    .bind("email_change")
    .bind(expires_at)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Send verification email to NEW email
    let email_service = EmailService::new().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    email_service
        .send_email_change_verification(new_email, &user.username, &token)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "message": "Email de verificare trimis la noua adresă"
    })))
}

// Verify Email Change
pub async fn verify_email_change(
    State(pool): State<MySqlPool>,
    Json(payload): Json<OneTimeTokenRequest>,
) -> Result<Json<Value>, StatusCode> {
    let token = payload.token.trim();

    if !one_time_token_is_valid(token) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let token_hash = hash_one_time_token(token);

    // The strict alphanumeric token validation above prevents LIKE wildcard injection.
    let token_record: Option<(String, String, String)> = query_as(
        "SELECT id, token, user_id FROM email_tokens
         WHERE token_type = 'email_change' AND expires_at > ?
           AND (token LIKE ? OR token LIKE ?)",
    )
    .bind(Utc::now())
    .bind(format!("{}:%", token_hash))
    .bind(format!("{}:%", token))
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let (token_id, stored_token, user_id) = token_record.ok_or(StatusCode::NOT_FOUND)?;

    // Extract new email from token
    let (_, new_email) = stored_token
        .split_once(':')
        .ok_or(StatusCode::INTERNAL_SERVER_ERROR)?;
    if !email_is_valid(new_email) {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let consumed = query("DELETE FROM email_tokens WHERE id = ?")
        .bind(&token_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if consumed.rows_affected() != 1 {
        return Err(StatusCode::NOT_FOUND);
    }

    // Update user email
    query("UPDATE users SET email = ?, email_verified = 1, updated_at = ? WHERE id = ?")
        .bind(new_email)
        .bind(Utc::now())
        .bind(&user_id)
        .execute(&mut *transaction)
        .await
        .map_err(|error| {
            if error
                .as_database_error()
                .is_some_and(|database_error| database_error.code().as_deref() == Some("23000"))
            {
                StatusCode::CONFLICT
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?;

    // Consume every outstanding email-change token for this account atomically.
    query("DELETE FROM email_tokens WHERE user_id = ? AND token_type = 'email_change'")
        .bind(&user_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "message": "Email schimbat cu succes"
    })))
}

// Upload Avatar
pub async fn upload_avatar(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;

    // Get the file from multipart
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("").to_string();

        if name == "avatar" {
            let filename = field
                .file_name()
                .ok_or(StatusCode::BAD_REQUEST)?
                .to_string();
            let content_type = field.content_type().map(ToString::to_string);

            // Read file data
            let data = field
                .bytes()
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            // Validate file size (max 5MB)
            if data.len() > 5 * 1024 * 1024 {
                return Err(StatusCode::PAYLOAD_TOO_LARGE);
            }

            let extension = validated_image_extension(&filename, content_type.as_deref(), &data)
                .ok_or(StatusCode::UNSUPPORTED_MEDIA_TYPE)?;

            // Generate a server-controlled filename after validation.
            let new_filename = format!("{}_{}.{}", user_id, Uuid::new_v4(), extension);
            let upload_path = format!("uploads/avatars/{}", new_filename);
            let avatar_filename_prefix = format!("{}_", user_id);
            let previous_avatar: Option<String> =
                query_scalar("SELECT avatar_url FROM users WHERE id = ?")
                    .bind(&user_id)
                    .fetch_one(&pool)
                    .await
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            tokio::fs::create_dir_all("uploads/avatars")
                .await
                .map_err(|error| {
                    tracing::error!(error = %error, "failed to create avatar upload directory");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;
            tokio::fs::write(&upload_path, &data)
                .await
                .map_err(|error| {
                    tracing::error!(error = %error, "failed to save avatar");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

            // Update user avatar_url in database
            let avatar_url = format!("/uploads/avatars/{}", new_filename);
            let update_result =
                query("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?")
                    .bind(&avatar_url)
                    .bind(Utc::now())
                    .bind(&user_id)
                    .execute(&pool)
                    .await;
            if !update_result.is_ok_and(|result| result.rows_affected() == 1) {
                remove_managed_upload(
                    Some(&avatar_url),
                    "/uploads/avatars/",
                    &avatar_filename_prefix,
                )
                .await;
                return Err(StatusCode::INTERNAL_SERVER_ERROR);
            }

            if previous_avatar.as_deref() != Some(avatar_url.as_str()) {
                remove_managed_upload(
                    previous_avatar.as_deref(),
                    "/uploads/avatars/",
                    &avatar_filename_prefix,
                )
                .await;
            }

            return Ok(Json(json!({
                "avatar_url": avatar_url,
                "message": "Avatar uploaded successfully"
            })));
        }
    }

    Err(StatusCode::BAD_REQUEST)
}

// Upload Post Image
pub async fn upload_post_image(
    headers: HeaderMap,
    mut multipart: axum::extract::Multipart,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;

    // Get the file from multipart
    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|_| StatusCode::BAD_REQUEST)?
    {
        let name = field.name().unwrap_or("").to_string();

        if name == "image" {
            let filename = field
                .file_name()
                .ok_or(StatusCode::BAD_REQUEST)?
                .to_string();
            let content_type = field.content_type().map(ToString::to_string);

            // Read file data
            let data = field
                .bytes()
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            // Validate file size (max 10MB for posts)
            if data.len() > 10 * 1024 * 1024 {
                return Err(StatusCode::PAYLOAD_TOO_LARGE);
            }

            let extension = validated_image_extension(&filename, content_type.as_deref(), &data)
                .ok_or(StatusCode::UNSUPPORTED_MEDIA_TYPE)?;

            // Generate a server-controlled filename after validation.
            let new_filename = format!("post_{}_{}.{}", user_id, Uuid::new_v4(), extension);
            let upload_path = format!("uploads/posts/{}", new_filename);

            // Create directory if it doesn't exist
            tokio::fs::create_dir_all("uploads/posts")
                .await
                .map_err(|error| {
                    tracing::error!(error = %error, "failed to create post upload directory");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

            tokio::fs::write(&upload_path, &data)
                .await
                .map_err(|error| {
                    tracing::error!(error = %error, "failed to save post image");
                    StatusCode::INTERNAL_SERVER_ERROR
                })?;

            let image_url = format!("/uploads/posts/{}", new_filename);

            return Ok(Json(json!({
                "image_url": image_url,
                "message": "Image uploaded successfully"
            })));
        }
    }

    Err(StatusCode::BAD_REQUEST)
}

// Update Post
pub async fn update_post(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdatePost>,
) -> Result<Json<Post>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let content = payload.content.trim();
    let image_filename_prefix = format!("post_{}_", user_id);
    if !bounded_text_is_valid(content, 1, MAXIMUM_POST_CHARACTERS)
        || payload.image_url.as_deref().is_some_and(|path| {
            !stored_image_path_belongs_to_user(path, "/uploads/posts/", &image_filename_prefix)
        })
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    let now = Utc::now();

    // Check ownership
    let post = query_as::<_, Post>("SELECT * FROM posts WHERE id = ?")
        .bind(&post_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if post.user_id != user_id {
        return Err(StatusCode::FORBIDDEN);
    }
    let previous_image_url = post.image_url.clone();

    query("UPDATE posts SET content = ?, image_url = ?, updated_at = ? WHERE id = ?")
        .bind(content)
        .bind(&payload.image_url)
        .bind(now)
        .bind(&post_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let updated_post = query_as::<_, Post>("SELECT * FROM posts WHERE id = ?")
        .bind(&post_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if previous_image_url != payload.image_url {
        remove_unreferenced_post_upload(&pool, previous_image_url.as_deref(), &user_id).await;
    }

    Ok(Json(updated_post))
}

// Delete Post
pub async fn delete_post(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;

    // Check ownership
    let post = query_as::<_, Post>("SELECT * FROM posts WHERE id = ?")
        .bind(&post_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if post.user_id != user_id {
        return Err(StatusCode::FORBIDDEN);
    }
    let image_url = post.image_url.clone();

    query("DELETE FROM posts WHERE id = ?")
        .bind(&post_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    remove_unreferenced_post_upload(&pool, image_url.as_deref(), &user_id).await;

    Ok(Json(json!({"success": true})))
}

// Update Comment
pub async fn update_comment(
    State(pool): State<MySqlPool>,
    Path(comment_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<UpdateComment>,
) -> Result<Json<Comment>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let content = payload.content.trim();
    if !bounded_text_is_valid(content, 1, MAXIMUM_COMMENT_CHARACTERS) {
        return Err(StatusCode::BAD_REQUEST);
    }

    let now = Utc::now();

    // Check ownership
    let comment = query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
        .bind(&comment_id)
        .fetch_optional(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if comment.user_id != user_id {
        return Err(StatusCode::FORBIDDEN);
    }

    query("UPDATE comments SET content = ?, updated_at = ? WHERE id = ?")
        .bind(content)
        .bind(now)
        .bind(&comment_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let updated_comment = query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
        .bind(&comment_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(updated_comment))
}

// Delete Comment
pub async fn delete_comment(
    State(pool): State<MySqlPool>,
    Path(comment_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let comment = query_as::<_, Comment>("SELECT * FROM comments WHERE id = ? FOR UPDATE")
        .bind(&comment_id)
        .fetch_optional(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .ok_or(StatusCode::NOT_FOUND)?;

    if comment.user_id != user_id {
        return Err(StatusCode::FORBIDDEN);
    }

    let post_id = comment.post_id.clone();

    query("DELETE FROM comments WHERE id = ?")
        .bind(&comment_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Update comments count
    query("UPDATE posts SET comments_count = GREATEST(comments_count - 1, 0) WHERE id = ?")
        .bind(&post_id)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({"success": true})))
}

// Send Message
pub async fn send_message(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
    Json(payload): Json<CreateMessage>,
) -> Result<Json<Message>, StatusCode> {
    let sender_id = get_current_user(&headers).await?;
    let content = payload.content.trim();
    if !bounded_text_is_valid(content, 1, MAXIMUM_MESSAGE_CHARACTERS)
        || Uuid::parse_str(&payload.receiver_id).is_err()
        || payload.receiver_id == sender_id
    {
        return Err(StatusCode::BAD_REQUEST);
    }

    let message_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    query(
        "INSERT INTO messages (id, sender_id, receiver_id, content, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&message_id)
    .bind(&sender_id)
    .bind(&payload.receiver_id)
    .bind(content)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let message = query_as::<_, Message>("SELECT * FROM messages WHERE id = ?")
        .bind(&message_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(message))
}

// Get Messages (conversations)
pub async fn get_messages(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<MessageWithUser>>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let other_user_id = params.get("user_id").ok_or(StatusCode::BAD_REQUEST)?;

    if Uuid::parse_str(other_user_id).is_err() || other_user_id == &user_id {
        return Err(StatusCode::BAD_REQUEST);
    }

    let messages = query_as::<_, MessageWithUser>(
        "SELECT m.id, m.sender_id, m.receiver_id, m.content, m.`read`, m.created_at,
                sender.username AS sender_username, sender.avatar_url AS sender_avatar
         FROM messages m
         INNER JOIN users sender ON sender.id = m.sender_id
         WHERE (m.sender_id = ? AND m.receiver_id = ?)
            OR (m.sender_id = ? AND m.receiver_id = ?)
         ORDER BY m.created_at ASC",
    )
    .bind(&user_id)
    .bind(other_user_id)
    .bind(other_user_id)
    .bind(&user_id)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Mark messages as read
    query("UPDATE messages SET read = 1 WHERE receiver_id = ? AND sender_id = ?")
        .bind(&user_id)
        .bind(other_user_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(messages))
}

// Get User Posts
pub async fn get_user_posts(
    State(pool): State<MySqlPool>,
    Path(user_id): Path<String>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Vec<PostWithUser>>, StatusCode> {
    let current_user_id = get_current_user(&headers).await.ok();
    let limit = params
        .get("limit")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(50)
        .clamp(1, 50);
    let offset = params
        .get("offset")
        .and_then(|value| value.parse::<i64>().ok())
        .unwrap_or(0)
        .clamp(0, 1_000_000);

    let rows = query_as::<_, PostFeedRow>(
        "SELECT p.id, p.content, p.image_url, p.likes_count, p.comments_count, p.created_at,
                u.id AS user_id, u.username, u.bio, u.avatar_url,
                post_counts.posts_count AS user_posts_count,
                u.created_at AS user_created_at,
                (current_like.id IS NOT NULL) AS is_liked
         FROM posts p
         INNER JOIN users u ON u.id = p.user_id
         INNER JOIN (
             SELECT user_id, COUNT(*) AS posts_count
             FROM posts
             GROUP BY user_id
         ) post_counts ON post_counts.user_id = p.user_id
         LEFT JOIN likes current_like
           ON current_like.post_id = p.id AND current_like.user_id = ?
         WHERE p.user_id = ?
         ORDER BY p.created_at DESC
         LIMIT ? OFFSET ?",
    )
    .bind(current_user_id.as_deref())
    .bind(&user_id)
    .bind(limit)
    .bind(offset)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(
        rows.into_iter().map(post_feed_row_to_response).collect(),
    ))
}

pub async fn search(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let current_user_id = get_current_user(&headers).await?;
    let search_term = params
        .get("q")
        .map(|value| value.trim())
        .filter(|value| search_query_is_valid(value))
        .ok_or(StatusCode::BAD_REQUEST)?;

    let users = query_as::<_, UserProfile>(
        "SELECT u.id, u.username, u.bio, u.avatar_url,
                CAST(COALESCE(post_counts.posts_count, 0) AS SIGNED) AS posts_count,
                u.created_at
         FROM users u
         LEFT JOIN (
             SELECT user_id, COUNT(*) AS posts_count
             FROM posts
             GROUP BY user_id
         ) post_counts ON post_counts.user_id = u.id
         WHERE INSTR(LOWER(u.username), LOWER(?)) > 0
         ORDER BY u.username ASC
         LIMIT 12",
    )
    .bind(search_term)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let post_rows = query_as::<_, PostFeedRow>(
        "SELECT p.id, p.content, p.image_url, p.likes_count, p.comments_count, p.created_at,
                u.id AS user_id, u.username, u.bio, u.avatar_url,
                post_counts.posts_count AS user_posts_count,
                u.created_at AS user_created_at,
                (current_like.id IS NOT NULL) AS is_liked
         FROM posts p
         INNER JOIN users u ON u.id = p.user_id
         INNER JOIN (
             SELECT user_id, COUNT(*) AS posts_count
             FROM posts
             GROUP BY user_id
         ) post_counts ON post_counts.user_id = p.user_id
         LEFT JOIN likes current_like
           ON current_like.post_id = p.id AND current_like.user_id = ?
         WHERE INSTR(LOWER(p.content), LOWER(?)) > 0
         ORDER BY p.created_at DESC
         LIMIT 20",
    )
    .bind(&current_user_id)
    .bind(search_term)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let posts: Vec<PostWithUser> = post_rows
        .into_iter()
        .map(post_feed_row_to_response)
        .collect();

    Ok(Json(json!({
        "query": search_term,
        "users": users,
        "posts": posts
    })))
}

// Email verification handlers
pub async fn send_verification_email(
    State(pool): State<MySqlPool>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_user_id_from_headers(&headers)?;

    // Get user info
    let user: User = query_as("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    if user.email_verified.unwrap_or(0) == 1 {
        return Err(StatusCode::BAD_REQUEST);
    }

    let token = generate_one_time_token();
    let stored_token = hash_one_time_token(&token);

    let token_id = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::hours(24);

    // Save token to database
    query(
        "INSERT INTO email_tokens (id, user_id, token, token_type, expires_at)
         VALUES (?, ?, ?, 'verification', ?)",
    )
    .bind(&token_id)
    .bind(&user_id)
    .bind(&stored_token)
    .bind(expires_at)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Send email
    let email_service = EmailService::new().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    email_service
        .send_verification_email(&user.email, &user.username, &token)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "message": "Email de verificare trimis"
    })))
}

pub async fn verify_email(
    State(pool): State<MySqlPool>,
    Json(payload): Json<OneTimeTokenRequest>,
) -> Result<Json<Value>, StatusCode> {
    let token = payload.token.trim();

    if !one_time_token_is_valid(token) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let token_hash = hash_one_time_token(token);

    // Find token
    let token_record: (String, String, chrono::DateTime<Utc>) = query_as(
        "SELECT id, user_id, expires_at FROM email_tokens
         WHERE token_type = 'verification' AND (token = ? OR token = ?)",
    )
    .bind(&token_hash)
    .bind(token)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    // Check if expired
    if token_record.2 < Utc::now() {
        return Err(StatusCode::GONE);
    }

    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let consumed = query("DELETE FROM email_tokens WHERE id = ?")
        .bind(&token_record.0)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if consumed.rows_affected() != 1 {
        return Err(StatusCode::NOT_FOUND);
    }

    query("UPDATE users SET email_verified = 1 WHERE id = ?")
        .bind(&token_record.1)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "message": "Email verificat cu succes"
    })))
}

pub async fn forgot_password(
    State(pool): State<MySqlPool>,
    Json(payload): Json<HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    let email = payload
        .get("email")
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .ok_or(StatusCode::BAD_REQUEST)?;
    if !email_is_valid(email) {
        return Ok(Json(json!({
            "message": "Dacă există un cont pentru această adresă, vei primi instrucțiunile de resetare"
        })));
    }
    let email_service = EmailService::new().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // A missing account is intentionally indistinguishable from an existing one.
    let user = query_as::<_, (String, String, String)>(
        "SELECT id, email, username FROM users WHERE email = ?",
    )
    .bind(email)
    .fetch_optional(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if let Some((user_id, user_email, username)) = user {
        let token = generate_one_time_token();
        let stored_token = hash_one_time_token(&token);
        let token_id = Uuid::new_v4().to_string();
        let expires_at = Utc::now() + chrono::Duration::hours(1);

        query(
            "INSERT INTO email_tokens (id, user_id, token, token_type, expires_at)
             VALUES (?, ?, ?, 'password_reset', ?)",
        )
        .bind(&token_id)
        .bind(&user_id)
        .bind(&stored_token)
        .bind(expires_at)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        tokio::spawn(async move {
            if let Err(error) = email_service
                .send_password_reset_email(&user_email, &username, &token)
                .await
            {
                tracing::error!(error = %error, "password reset email delivery failed");
            }
        });
    }

    Ok(Json(json!({
        "message": "Dacă există un cont pentru această adresă, vei primi instrucțiunile de resetare"
    })))
}

pub async fn reset_password(
    State(pool): State<MySqlPool>,
    Json(payload): Json<HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    let token = payload.get("token").ok_or(StatusCode::BAD_REQUEST)?;
    let new_password = payload.get("password").ok_or(StatusCode::BAD_REQUEST)?;

    if !password_is_valid(new_password) || !one_time_token_is_valid(token) {
        return Err(StatusCode::BAD_REQUEST);
    }
    let token_hash = hash_one_time_token(token);

    // Find token
    let token_record: (String, String, chrono::DateTime<Utc>) = query_as(
        "SELECT id, user_id, expires_at FROM email_tokens
         WHERE token_type = 'password_reset' AND (token = ? OR token = ?)",
    )
    .bind(&token_hash)
    .bind(token)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    // Check if expired
    if token_record.2 < Utc::now() {
        return Err(StatusCode::GONE);
    }

    // Hash new password
    let password_hash =
        hash(new_password, DEFAULT_COST).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut transaction = pool
        .begin()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let consumed = query("DELETE FROM email_tokens WHERE id = ?")
        .bind(&token_record.0)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
    if consumed.rows_affected() != 1 {
        return Err(StatusCode::NOT_FOUND);
    }

    query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(&password_hash)
        .bind(Utc::now())
        .bind(&token_record.1)
        .execute(&mut *transaction)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    transaction
        .commit()
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "message": "Parola a fost resetată cu succes"
    })))
}
