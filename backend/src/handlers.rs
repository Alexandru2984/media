use axum::{
    extract::{Path, Query, State},
    http::{HeaderMap, StatusCode},
    response::Json,
};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::Utc;
use serde_json::{json, Value};
use sqlx::{query, query_as, query_scalar, MySql, MySqlPool, QueryBuilder};
use std::collections::HashMap;
use uuid::Uuid;

use crate::{
    auth::{create_jwt, get_user_id_from_headers, verify_jwt},
    email::EmailService,
    models::*,
};
use rand::Rng;

// Auth handlers
pub async fn register(
    State(pool): State<MySqlPool>,
    Json(payload): Json<CreateUser>,
) -> Result<Json<Value>, StatusCode> {
    let user_id = Uuid::new_v4().to_string();
    let password_hash =
        hash(&payload.password, DEFAULT_COST).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let now = Utc::now();

    let result = query(
        "INSERT INTO users (id, username, email, password_hash, email_verified, bio, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?, ?)"
    )
    .bind(&user_id)
    .bind(&payload.username)
    .bind(&payload.email)
    .bind(&password_hash)
    .bind(&payload.bio)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await;

    match result {
        Ok(_) => {
            // Generate verification token
            let verification_token: String = rand::thread_rng()
                .sample_iter(&rand::distributions::Alphanumeric)
                .take(32)
                .map(char::from)
                .collect();

            let token_id = Uuid::new_v4().to_string();
            let expires_at = Utc::now() + chrono::Duration::hours(24);

            // Save verification token to database
            let _ = query(
                "INSERT INTO email_tokens (id, user_id, token, token_type, expires_at)
                 VALUES (?, ?, ?, 'verification', ?)",
            )
            .bind(&token_id)
            .bind(&user_id)
            .bind(&verification_token)
            .bind(expires_at)
            .execute(&pool)
            .await;

            // Send verification email (don't block registration if email fails)
            let email_service = EmailService::new();
            let email = payload.email.clone();
            let username = payload.username.clone();
            tokio::spawn(async move {
                let result = email_service
                    .send_verification_email(&email, &username, &verification_token)
                    .await;

                if let Err(e) = result {
                    eprintln!("❌ Failed to send verification email: {}", e);
                }
            });

            let token =
                create_jwt(user_id.clone()).map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            Ok(Json(json!({
                "token": token,
                "user": {
                    "id": user_id,
                    "username": payload.username,
                    "email": payload.email,
                    "bio": payload.bio
                }
            })))
        }
        Err(_) => Err(StatusCode::CONFLICT),
    }
}

pub async fn login(
    State(pool): State<MySqlPool>,
    Json(payload): Json<LoginUser>,
) -> Result<Json<Value>, StatusCode> {
    let user = query_as::<_, User>("SELECT * FROM users WHERE email = ?")
        .bind(&payload.email)
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

                Ok(Json(json!({
                    "token": token,
                    "user": {
                        "id": user.id,
                        "username": user.username,
                        "email": user.email,
                        "bio": user.bio,
                        "avatar_url": user.avatar_url
                    }
                })))
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

// Helper function to extract user from token
pub async fn get_current_user(headers: &HeaderMap) -> Result<String, StatusCode> {
    let auth_header = headers
        .get("authorization")
        .and_then(|h| h.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or(StatusCode::UNAUTHORIZED)?;

    let claims = verify_jwt(token).map_err(|_| StatusCode::UNAUTHORIZED)?;
    Ok(claims.sub)
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
    let post_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    query(
        "INSERT INTO posts (id, user_id, content, image_url, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&post_id)
    .bind(&user_id)
    .bind(&payload.content)
    .bind(&payload.image_url)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|e| {
        eprintln!("Error creating post: {}", e);
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let post = query_as::<_, Post>("SELECT * FROM posts WHERE id = ?")
        .bind(&post_id)
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            eprintln!("Error fetching created post: {}", e);
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
    let limit: i64 = params
        .get("limit")
        .and_then(|l| l.parse().ok())
        .unwrap_or(10);
    let offset: i64 = params
        .get("offset")
        .and_then(|o| o.parse().ok())
        .unwrap_or(0);

    // First get all posts
    let posts =
        query_as::<_, Post>("SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .bind(limit)
            .bind(offset)
            .fetch_all(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut result = Vec::new();

    for post in posts {
        // Get user info
        let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
            .bind(&post.user_id)
            .fetch_one(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Get user posts count
        let user_posts_count: i64 = query_scalar("SELECT COUNT(*) FROM posts WHERE user_id = ?")
            .bind(&post.user_id)
            .fetch_one(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        // Check if liked by current user
        let is_liked = if let Some(ref uid) = current_user_id {
            let count: i64 =
                query_scalar("SELECT COUNT(*) FROM likes WHERE post_id = ? AND user_id = ?")
                    .bind(&post.id)
                    .bind(uid)
                    .fetch_one(&pool)
                    .await
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            count > 0
        } else {
            false
        };

        result.push(PostWithUser {
            id: post.id,
            content: post.content,
            image_url: post.image_url,
            likes_count: post.likes_count,
            comments_count: post.comments_count,
            created_at: post.created_at,
            user: UserProfile {
                id: user.id,
                username: user.username,
                bio: user.bio,
                avatar_url: user.avatar_url,
                posts_count: user_posts_count,
                created_at: user.created_at,
            },
            is_liked,
        });
    }

    Ok(Json(result))
}

pub async fn like_post(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Value>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let like_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    // Check if already liked
    let count: i64 = query_scalar("SELECT COUNT(*) FROM likes WHERE post_id = ? AND user_id = ?")
        .bind(&post_id)
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if count > 0 {
        // Unlike
        query("DELETE FROM likes WHERE post_id = ? AND user_id = ?")
            .bind(&post_id)
            .bind(&user_id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        query("UPDATE posts SET likes_count = likes_count - 1 WHERE id = ?")
            .bind(&post_id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(Json(json!({"liked": false})))
    } else {
        // Like
        query("INSERT INTO likes (id, post_id, user_id, created_at) VALUES (?, ?, ?, ?)")
            .bind(&like_id)
            .bind(&post_id)
            .bind(&user_id)
            .bind(now)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        query("UPDATE posts SET likes_count = likes_count + 1 WHERE id = ?")
            .bind(&post_id)
            .execute(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        Ok(Json(json!({"liked": true})))
    }
}

// Comment handlers
pub async fn create_comment(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
    Json(payload): Json<CreateComment>,
) -> Result<Json<Comment>, StatusCode> {
    let user_id = get_current_user(&headers).await?;
    let comment_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    query(
        "INSERT INTO comments (id, post_id, user_id, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&comment_id)
    .bind(&post_id)
    .bind(&user_id)
    .bind(&payload.content)
    .bind(now)
    .bind(now)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let comment = query_as::<_, Comment>("SELECT * FROM comments WHERE id = ?")
        .bind(&comment_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Update comments count
    query("UPDATE posts SET comments_count = comments_count + 1 WHERE id = ?")
        .bind(&post_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(comment))
}

pub async fn get_comments(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
) -> Result<Json<Vec<Value>>, StatusCode> {
    let comments =
        query_as::<_, Comment>("SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC")
            .bind(&post_id)
            .fetch_all(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut result = Vec::new();

    for comment in comments {
        let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
            .bind(&comment.user_id)
            .fetch_one(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        result.push(json!({
            "id": comment.id,
            "content": comment.content,
            "created_at": comment.created_at,
            "user": {
                "id": user.id,
                "username": user.username,
                "avatar_url": user.avatar_url
            }
        }));
    }

    Ok(Json(result))
} // Fișier temporar pentru handler-ele noi - voi merge manual
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

    let mut builder = QueryBuilder::<MySql>::new("UPDATE users SET ");
    {
        let mut updates = builder.separated(", ");

        if let Some(username) = &payload.username {
            updates.push("username = ").push_bind(username);
        }
        if let Some(bio) = &payload.bio {
            updates.push("bio = ").push_bind(bio);
        }
        if let Some(avatar_url) = &payload.avatar_url {
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

    // Check if new email already exists
    let existing = query_scalar::<_, i64>("SELECT COUNT(*) FROM users WHERE email = ? AND id != ?")
        .bind(&payload.new_email)
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if existing > 0 {
        return Err(StatusCode::CONFLICT);
    }

    // Generate verification token
    let token: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    let token_id = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::hours(24);

    // Save token with new email in metadata (we'll store it in a new way)
    // For now, let's just save to email_tokens with special type
    query(
        "INSERT INTO email_tokens (id, user_id, token, token_type, expires_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&token_id)
    .bind(&user_id)
    .bind(format!("{}:{}", token, payload.new_email)) // Store email with token
    .bind("email_change")
    .bind(expires_at)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Send verification email to NEW email
    let email_service = EmailService::new();
    email_service
        .send_verification_email(&payload.new_email, &user.username, &token)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "message": "Email de verificare trimis la noua adresă"
    })))
}

// Verify Email Change
pub async fn verify_email_change(
    State(pool): State<MySqlPool>,
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    let token = params.get("token").ok_or(StatusCode::BAD_REQUEST)?;

    // Find token with prefix search
    let tokens: Vec<(String, String, chrono::DateTime<Utc>)> = query_as(
        "SELECT id, token, user_id FROM email_tokens
         WHERE token_type = 'email_change' AND expires_at > ? AND token LIKE ?",
    )
    .bind(Utc::now())
    .bind(format!("{}:%", token))
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    if tokens.is_empty() {
        return Err(StatusCode::NOT_FOUND);
    }

    let (token_id, stored_token, user_id) = &tokens[0];

    // Extract new email from token
    let parts: Vec<&str> = stored_token.split(':').collect();
    if parts.len() != 2 {
        return Err(StatusCode::INTERNAL_SERVER_ERROR);
    }
    let new_email = parts[1];

    // Update user email
    query("UPDATE users SET email = ?, updated_at = ? WHERE id = ?")
        .bind(new_email)
        .bind(Utc::now())
        .bind(user_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Delete token
    query("DELETE FROM email_tokens WHERE id = ?")
        .bind(token_id)
        .execute(&pool)
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
    use std::fs;
    use std::path::Path;

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

            // Validate file extension
            let ext = Path::new(&filename)
                .extension()
                .and_then(|s| s.to_str())
                .ok_or(StatusCode::BAD_REQUEST)?
                .to_lowercase();

            if !["jpg", "jpeg", "png", "gif", "webp"].contains(&ext.as_str()) {
                return Err(StatusCode::BAD_REQUEST);
            }

            // Generate unique filename
            let new_filename = format!("{}_{}.{}", user_id, Uuid::new_v4(), ext);
            let upload_path = format!("uploads/avatars/{}", new_filename);

            // Read file data
            let data = field
                .bytes()
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            // Validate file size (max 5MB)
            if data.len() > 5 * 1024 * 1024 {
                return Err(StatusCode::PAYLOAD_TOO_LARGE);
            }

            // Save file
            fs::write(&upload_path, &data).map_err(|e| {
                eprintln!("Failed to save file: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

            // Update user avatar_url in database
            let avatar_url = format!("/uploads/avatars/{}", new_filename);
            query("UPDATE users SET avatar_url = ?, updated_at = ? WHERE id = ?")
                .bind(&avatar_url)
                .bind(Utc::now())
                .bind(&user_id)
                .execute(&pool)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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
    use std::fs;
    use std::path::Path;

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

            // Validate file extension
            let ext = Path::new(&filename)
                .extension()
                .and_then(|s| s.to_str())
                .ok_or(StatusCode::BAD_REQUEST)?
                .to_lowercase();

            if !["jpg", "jpeg", "png", "gif", "webp"].contains(&ext.as_str()) {
                return Err(StatusCode::BAD_REQUEST);
            }

            // Generate unique filename
            let new_filename = format!("post_{}_{}.{}", user_id, Uuid::new_v4(), ext);
            let upload_path = format!("uploads/posts/{}", new_filename);

            // Read file data
            let data = field
                .bytes()
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

            // Validate file size (max 10MB for posts)
            if data.len() > 10 * 1024 * 1024 {
                return Err(StatusCode::PAYLOAD_TOO_LARGE);
            }

            // Create directory if it doesn't exist
            fs::create_dir_all("uploads/posts").map_err(|e| {
                eprintln!("Failed to create directory: {}", e);
                StatusCode::INTERNAL_SERVER_ERROR
            })?;

            // Save file
            fs::write(&upload_path, &data).map_err(|e| {
                eprintln!("Failed to save file: {}", e);
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

    query("UPDATE posts SET content = ?, image_url = ?, updated_at = ? WHERE id = ?")
        .bind(&payload.content)
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

    query("DELETE FROM posts WHERE id = ?")
        .bind(&post_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

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
        .bind(&payload.content)
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

    let post_id = comment.post_id.clone();

    query("DELETE FROM comments WHERE id = ?")
        .bind(&comment_id)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Update comments count
    query("UPDATE posts SET comments_count = comments_count - 1 WHERE id = ?")
        .bind(&post_id)
        .execute(&pool)
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
    let message_id = Uuid::new_v4().to_string();
    let now = Utc::now();

    query(
        "INSERT INTO messages (id, sender_id, receiver_id, content, created_at)
         VALUES (?, ?, ?, ?, ?)",
    )
    .bind(&message_id)
    .bind(&sender_id)
    .bind(&payload.receiver_id)
    .bind(&payload.content)
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

    let messages = query_as::<_, Message>(
        "SELECT * FROM messages
         WHERE (sender_id = ? AND receiver_id = ?) OR (sender_id = ? AND receiver_id = ?)
         ORDER BY created_at ASC",
    )
    .bind(&user_id)
    .bind(other_user_id)
    .bind(other_user_id)
    .bind(&user_id)
    .fetch_all(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut result = Vec::new();

    for message in messages {
        let sender = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
            .bind(&message.sender_id)
            .fetch_one(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

        result.push(MessageWithUser {
            id: message.id,
            sender_id: message.sender_id,
            receiver_id: message.receiver_id,
            content: message.content,
            read: message.read,
            created_at: message.created_at,
            sender_username: sender.username,
            sender_avatar: sender.avatar_url,
        });
    }

    // Mark messages as read
    query("UPDATE messages SET read = 1 WHERE receiver_id = ? AND sender_id = ?")
        .bind(&user_id)
        .bind(other_user_id)
        .execute(&pool)
        .await
        .ok();

    Ok(Json(result))
}

// Get User Posts
pub async fn get_user_posts(
    State(pool): State<MySqlPool>,
    Path(user_id): Path<String>,
    headers: HeaderMap,
) -> Result<Json<Vec<PostWithUser>>, StatusCode> {
    let current_user_id = get_current_user(&headers).await.ok();

    let posts =
        query_as::<_, Post>("SELECT * FROM posts WHERE user_id = ? ORDER BY created_at DESC")
            .bind(&user_id)
            .fetch_all(&pool)
            .await
            .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let mut result = Vec::new();

    let user = query_as::<_, User>("SELECT * FROM users WHERE id = ?")
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let user_posts_count: i64 = query_scalar("SELECT COUNT(*) FROM posts WHERE user_id = ?")
        .bind(&user_id)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    for post in posts {
        let is_liked = if let Some(ref uid) = current_user_id {
            let count: i64 =
                query_scalar("SELECT COUNT(*) FROM likes WHERE post_id = ? AND user_id = ?")
                    .bind(&post.id)
                    .bind(uid)
                    .fetch_one(&pool)
                    .await
                    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
            count > 0
        } else {
            false
        };

        result.push(PostWithUser {
            id: post.id,
            content: post.content,
            image_url: post.image_url,
            likes_count: post.likes_count,
            comments_count: post.comments_count,
            created_at: post.created_at,
            user: UserProfile {
                id: user.id.clone(),
                username: user.username.clone(),
                bio: user.bio.clone(),
                avatar_url: user.avatar_url.clone(),
                posts_count: user_posts_count,
                created_at: user.created_at,
            },
            is_liked,
        });
    }

    Ok(Json(result))
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

    // Generate random token
    let token: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    let token_id = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::hours(24);

    // Save token to database
    query(
        "INSERT INTO email_tokens (id, user_id, token, token_type, expires_at)
         VALUES (?, ?, ?, 'verification', ?)",
    )
    .bind(&token_id)
    .bind(&user_id)
    .bind(&token)
    .bind(expires_at)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Send email
    let email_service = EmailService::new();
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
    Query(params): Query<HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    let token = params.get("token").ok_or(StatusCode::BAD_REQUEST)?;

    // Find token
    let token_record: (String, String, chrono::DateTime<Utc>) = query_as(
        "SELECT id, user_id, expires_at FROM email_tokens
         WHERE token = ? AND token_type = 'verification'",
    )
    .bind(token)
    .fetch_one(&pool)
    .await
    .map_err(|_| StatusCode::NOT_FOUND)?;

    // Check if expired
    if token_record.2 < Utc::now() {
        return Err(StatusCode::GONE);
    }

    // Update user as verified
    query("UPDATE users SET email_verified = 1 WHERE id = ?")
        .bind(&token_record.1)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Delete token
    query("DELETE FROM email_tokens WHERE id = ?")
        .bind(&token_record.0)
        .execute(&pool)
        .await
        .ok();

    Ok(Json(json!({
        "message": "Email verificat cu succes"
    })))
}

pub async fn forgot_password(
    State(pool): State<MySqlPool>,
    Json(payload): Json<HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    let email = payload.get("email").ok_or(StatusCode::BAD_REQUEST)?;

    // Find user
    let user: User = query_as("SELECT * FROM users WHERE email = ?")
        .bind(email)
        .fetch_one(&pool)
        .await
        .map_err(|_| StatusCode::NOT_FOUND)?;

    // Generate random token
    let token: String = rand::thread_rng()
        .sample_iter(&rand::distributions::Alphanumeric)
        .take(32)
        .map(char::from)
        .collect();

    let token_id = Uuid::new_v4().to_string();
    let expires_at = Utc::now() + chrono::Duration::hours(1);

    // Save token to database
    query(
        "INSERT INTO email_tokens (id, user_id, token, token_type, expires_at)
         VALUES (?, ?, ?, 'password_reset', ?)",
    )
    .bind(&token_id)
    .bind(&user.id)
    .bind(&token)
    .bind(expires_at)
    .execute(&pool)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Send email
    let email_service = EmailService::new();
    email_service
        .send_password_reset_email(&user.email, &user.username, &token)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(json!({
        "message": "Email de resetare trimis"
    })))
}

pub async fn reset_password(
    State(pool): State<MySqlPool>,
    Json(payload): Json<HashMap<String, String>>,
) -> Result<Json<Value>, StatusCode> {
    let token = payload.get("token").ok_or(StatusCode::BAD_REQUEST)?;
    let new_password = payload.get("password").ok_or(StatusCode::BAD_REQUEST)?;

    // Find token
    let token_record: (String, String, chrono::DateTime<Utc>) = query_as(
        "SELECT id, user_id, expires_at FROM email_tokens
         WHERE token = ? AND token_type = 'password_reset'",
    )
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

    // Update password
    query("UPDATE users SET password_hash = ? WHERE id = ?")
        .bind(&password_hash)
        .bind(&token_record.1)
        .execute(&pool)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    // Delete token
    query("DELETE FROM email_tokens WHERE id = ?")
        .bind(&token_record.0)
        .execute(&pool)
        .await
        .ok();

    Ok(Json(json!({
        "message": "Parola a fost resetată cu succes"
    })))
}
