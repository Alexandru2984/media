use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::Html,
};
use chrono::SecondsFormat;
use serde_json::{json, Value};
use sqlx::MySqlPool;
use uuid::Uuid;

use crate::{
    handlers::{visible_post, visible_profile},
    models::{PostWithUser, ProfileDetail},
};

const DEFAULT_SHELL_PATH: &str = "/var/lib/media/frontend-current/index.html";
const SITE_URL: &str = "https://media.micutu.com";
const DEFAULT_SOCIAL_IMAGE: &str = "https://media.micutu.com/og/media-social-preview.png";
const ROOT_START: &str = "<!--media-app-root-start-->";
const ROOT_END: &str = "<!--media-app-root-end-->";

fn escape_html(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '&' => escaped.push_str("&amp;"),
            '<' => escaped.push_str("&lt;"),
            '>' => escaped.push_str("&gt;"),
            '"' => escaped.push_str("&quot;"),
            '\'' => escaped.push_str("&#39;"),
            _ => escaped.push(character),
        }
    }
    escaped
}

fn condensed_text(value: &str, maximum_characters: usize) -> String {
    let condensed = value.split_whitespace().collect::<Vec<_>>().join(" ");
    if condensed.chars().count() <= maximum_characters {
        return condensed;
    }

    let shortened = condensed
        .chars()
        .take(maximum_characters.saturating_sub(1))
        .collect::<String>();
    format!("{}…", shortened.trim_end())
}

fn absolute_post_image(image_url: Option<&str>) -> Option<String> {
    image_url
        .filter(|path| {
            path.starts_with("/uploads/posts/")
                && path.len() <= 512
                && !path.contains("..")
                && !path.contains('\\')
                && path.bytes().all(|byte| {
                    byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'_' | b'-' | b'.')
                })
        })
        .map(|path| format!("{SITE_URL}{path}"))
}

fn safe_avatar_path(avatar_url: Option<&str>) -> Option<&str> {
    avatar_url.filter(|path| {
        path.starts_with("/uploads/avatars/")
            && path.len() <= 512
            && !path.contains("..")
            && !path.contains('\\')
            && path.bytes().all(|byte| {
                byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'_' | b'-' | b'.')
            })
    })
}

fn replace_tag_with_attribute(
    html: &mut String,
    tag: &str,
    attribute: &str,
    value: &str,
    replacement: &str,
) -> Result<(), &'static str> {
    let marker = format!(r#"{attribute}="{value}""#);
    let marker_index = html.find(&marker).ok_or("metadata marker is missing")?;
    let tag_start = html[..marker_index]
        .rfind(&format!("<{tag}"))
        .ok_or("metadata tag start is missing")?;
    let tag_end = html[marker_index..]
        .find('>')
        .map(|offset| marker_index + offset + 1)
        .ok_or("metadata tag end is missing")?;
    html.replace_range(tag_start..tag_end, replacement);
    Ok(())
}

fn replace_enclosed_element(
    html: &mut String,
    opening_marker: &str,
    closing_marker: &str,
    replacement: &str,
) -> Result<(), &'static str> {
    let start = html
        .find(opening_marker)
        .ok_or("element start is missing")?;
    let end = html[start..]
        .find(closing_marker)
        .map(|offset| start + offset + closing_marker.len())
        .ok_or("element end is missing")?;
    html.replace_range(start..end, replacement);
    Ok(())
}

fn json_for_html(value: &Value) -> Result<String, serde_json::Error> {
    serde_json::to_string(value).map(|serialized| {
        serialized
            .replace('&', "\\u0026")
            .replace('<', "\\u003c")
            .replace('>', "\\u003e")
    })
}

fn render_post_shell(shell: &str, post: &PostWithUser) -> Result<String, &'static str> {
    let canonical_url = format!("{SITE_URL}/post/{}", post.id);
    let title = format!("Postare de {} — Media", post.user.username);
    let description = condensed_text(&post.content, 180);
    let social_image = absolute_post_image(post.image_url.as_deref())
        .unwrap_or_else(|| DEFAULT_SOCIAL_IMAGE.to_owned());
    let escaped_title = escape_html(&title);
    let escaped_description = escape_html(&description);
    let escaped_canonical = escape_html(&canonical_url);
    let escaped_social_image = escape_html(&social_image);
    let escaped_username = escape_html(&post.user.username);
    let escaped_content = escape_html(&post.content);
    let published_at = post.created_at.to_rfc3339_opts(SecondsFormat::Secs, true);
    let displayed_at = post.created_at.format("%d.%m.%Y, %H:%M UTC").to_string();
    let mut html = shell.to_owned();

    replace_enclosed_element(
        &mut html,
        "<title>",
        "</title>",
        &format!("<title>{escaped_title}</title>"),
    )?;
    for (attribute, key, content) in [
        ("name", "description", escaped_description.as_str()),
        ("name", "robots", "noindex, nofollow, noarchive"),
        ("property", "og:type", "article"),
        ("property", "og:url", escaped_canonical.as_str()),
        ("property", "og:title", escaped_title.as_str()),
        ("property", "og:description", escaped_description.as_str()),
        ("property", "og:image", escaped_social_image.as_str()),
        (
            "property",
            "og:image:secure_url",
            escaped_social_image.as_str(),
        ),
        (
            "property",
            "og:image:alt",
            "Imaginea postării distribuite pe Media",
        ),
        ("name", "twitter:title", escaped_title.as_str()),
        ("name", "twitter:description", escaped_description.as_str()),
        ("name", "twitter:image", escaped_social_image.as_str()),
        (
            "name",
            "twitter:image:alt",
            "Imaginea postării distribuite pe Media",
        ),
    ] {
        replace_tag_with_attribute(
            &mut html,
            "meta",
            attribute,
            key,
            &format!(
                r#"<meta {attribute}="{}" content="{content}" />"#,
                escape_html(key)
            ),
        )?;
    }
    for (language, label) in [
        (None, "canonical"),
        (Some("ro-RO"), "alternate"),
        (Some("x-default"), "alternate"),
    ] {
        let marker_attribute = language.map(|_| "hreflang").unwrap_or("rel");
        let marker_value = language.unwrap_or(label);
        let language_attribute = language
            .map(|value| format!(r#" hreflang="{}""#, escape_html(value)))
            .unwrap_or_default();
        replace_tag_with_attribute(
            &mut html,
            "link",
            marker_attribute,
            marker_value,
            &format!(r#"<link rel="{label}"{language_attribute} href="{escaped_canonical}" />"#),
        )?;
    }

    let mut structured_data = json!({
        "@context": "https://schema.org",
        "@type": "SocialMediaPosting",
        "headline": title,
        "articleBody": post.content,
        "datePublished": published_at,
        "url": canonical_url,
        "inLanguage": "ro-RO",
        "author": {
            "@type": "Person",
            "name": post.user.username,
        },
        "isPartOf": {
            "@type": "WebSite",
            "name": "Media",
            "url": format!("{SITE_URL}/"),
        },
    });
    if let Some(object) = structured_data.as_object_mut() {
        object.insert("image".to_owned(), Value::String(social_image));
    }
    let structured_data = json_for_html(&structured_data).map_err(|_| "structured data failed")?;
    replace_enclosed_element(
        &mut html,
        "<script id=\"page-structured-data\"",
        "</script>",
        &format!(
            "<script id=\"page-structured-data\" type=\"application/ld+json\">{structured_data}</script>"
        ),
    )?;

    let image = post.image_url.as_deref().and_then(|path| {
        absolute_post_image(Some(path)).map(|_| {
            format!(
                r#"<img class="post-media" src="{}" alt="Imagine publicată de {escaped_username}" loading="eager" />"#,
                escape_html(path),
            )
        })
    }).unwrap_or_default();
    let static_root = format!(
        r#"{ROOT_START}<div id="root">
  <main class="post-detail-page app-container" id="main-content">
    <p class="post-detail-eyebrow">Postare distribuită</p>
    <article class="surface post-card post-detail-card">
      <header class="post-header">
        <span class="post-author-copy"><strong class="post-author-name">{escaped_username}</strong><time class="post-time" datetime="{published_at}">{displayed_at}</time></span>
      </header>
      <p class="post-content">{escaped_content}</p>
      {image}
      <div class="post-actions" aria-label="Activitatea postării">
        <span class="post-action">{likes} aprecieri</span>
        <span class="post-action">{comments} comentarii</span>
      </div>
    </article>
    <p class="post-detail-static-note"><a class="btn btn-primary" href="/login?next=%2Fpost%2F{post_id}">Conectează-te pentru a participa</a></p>
  </main>
</div>{ROOT_END}"#,
        likes = post.likes_count.max(0),
        comments = post.comments_count.max(0),
        post_id = escape_html(&post.id),
    );
    let root_start = html
        .find(ROOT_START)
        .ok_or("application root start is missing")?;
    let root_end = html[root_start..]
        .find(ROOT_END)
        .map(|offset| root_start + offset + ROOT_END.len())
        .ok_or("application root end is missing")?;
    html.replace_range(root_start..root_end, &static_root);

    Ok(html)
}

fn render_profile_shell(shell: &str, profile: &ProfileDetail) -> Result<String, &'static str> {
    let canonical_url = format!("{SITE_URL}/profile/{}", profile.id);
    let title = format!("{} — profil Media", profile.username);
    let description = profile
        .bio
        .as_deref()
        .map(|bio| condensed_text(bio, 180))
        .filter(|bio| !bio.is_empty())
        .unwrap_or_else(|| {
            if profile.is_private {
                format!("Profilul privat al lui {} pe Media.", profile.username)
            } else {
                format!(
                    "Vezi profilul public al lui {} și postările sale pe Media.",
                    profile.username
                )
            }
        });
    let escaped_title = escape_html(&title);
    let escaped_description = escape_html(&description);
    let escaped_canonical = escape_html(&canonical_url);
    let escaped_social_image = escape_html(DEFAULT_SOCIAL_IMAGE);
    let escaped_username = escape_html(&profile.username);
    let escaped_bio = escape_html(
        profile
            .bio
            .as_deref()
            .filter(|bio| !bio.trim().is_empty())
            .unwrap_or("Acest profil nu are încă o descriere."),
    );
    let joined_at = profile.created_at.format("%m.%Y").to_string();
    let mut html = shell.to_owned();

    replace_enclosed_element(
        &mut html,
        "<title>",
        "</title>",
        &format!("<title>{escaped_title}</title>"),
    )?;
    for (attribute, key, content) in [
        ("name", "description", escaped_description.as_str()),
        ("name", "robots", "noindex, nofollow, noarchive"),
        ("property", "og:type", "profile"),
        ("property", "og:url", escaped_canonical.as_str()),
        ("property", "og:title", escaped_title.as_str()),
        ("property", "og:description", escaped_description.as_str()),
        ("property", "og:image", escaped_social_image.as_str()),
        (
            "property",
            "og:image:secure_url",
            escaped_social_image.as_str(),
        ),
        (
            "property",
            "og:image:alt",
            "Conversații și conexiuni în comunitatea Media",
        ),
        ("name", "twitter:title", escaped_title.as_str()),
        ("name", "twitter:description", escaped_description.as_str()),
        ("name", "twitter:image", escaped_social_image.as_str()),
        (
            "name",
            "twitter:image:alt",
            "Conversații și conexiuni în comunitatea Media",
        ),
    ] {
        replace_tag_with_attribute(
            &mut html,
            "meta",
            attribute,
            key,
            &format!(
                r#"<meta {attribute}="{}" content="{content}" />"#,
                escape_html(key)
            ),
        )?;
    }
    for (language, label) in [
        (None, "canonical"),
        (Some("ro-RO"), "alternate"),
        (Some("x-default"), "alternate"),
    ] {
        let marker_attribute = language.map(|_| "hreflang").unwrap_or("rel");
        let marker_value = language.unwrap_or(label);
        let language_attribute = language
            .map(|value| format!(r#" hreflang="{}""#, escape_html(value)))
            .unwrap_or_default();
        replace_tag_with_attribute(
            &mut html,
            "link",
            marker_attribute,
            marker_value,
            &format!(r#"<link rel="{label}"{language_attribute} href="{escaped_canonical}" />"#),
        )?;
    }

    let structured_data = json_for_html(&json!({
        "@context": "https://schema.org",
        "@type": "ProfilePage",
        "name": title,
        "description": description,
        "url": canonical_url,
        "inLanguage": "ro-RO",
        "mainEntity": {
            "@type": "Person",
            "name": profile.username,
            "description": profile.bio,
        },
        "isPartOf": {
            "@type": "WebSite",
            "name": "Media",
            "url": format!("{SITE_URL}/"),
        },
    }))
    .map_err(|_| "structured data failed")?;
    replace_enclosed_element(
        &mut html,
        "<script id=\"page-structured-data\"",
        "</script>",
        &format!(
            "<script id=\"page-structured-data\" type=\"application/ld+json\">{structured_data}</script>"
        ),
    )?;

    let avatar = safe_avatar_path(profile.avatar_url.as_deref())
        .map(|path| {
            format!(
                r#"<img class="profile-avatar avatar" src="{}" alt="Avatarul lui {escaped_username}" />"#,
                escape_html(path)
            )
        })
        .unwrap_or_else(|| {
            let initial = profile
                .username
                .chars()
                .next()
                .map(|character| character.to_uppercase().collect::<String>())
                .unwrap_or_else(|| "M".to_owned());
            format!(
                r#"<span class="profile-avatar avatar-fallback">{}</span>"#,
                escape_html(&initial)
            )
        });
    let privacy_badge = if profile.is_private {
        r#"<span class="privacy-badge">Privat</span>"#
    } else {
        r#"<span class="privacy-badge profile-public-badge">Public</span>"#
    };
    let visibility_note = if profile.is_private {
        "Postările acestui cont sunt vizibile numai urmăritorilor acceptați."
    } else {
        "Postările publice ale acestui cont pot fi citite fără autentificare."
    };
    let static_root = format!(
        r#"{ROOT_START}<div id="root">
  <main class="profile-page app-container" id="main-content">
    <section class="surface profile-hero">
      <div class="profile-cover"></div>
      <div class="profile-body">
        <div class="profile-avatar-wrap">{avatar}</div>
        <div class="profile-action-row"></div>
        <div class="profile-copy">
          <div class="profile-title-row"><h1>{escaped_username}</h1>{privacy_badge}</div>
          <p class="profile-bio">{escaped_bio}</p>
          <div class="profile-meta">
            <span><strong>{posts}</strong> postări</span>
            <span><strong>{followers}</strong> urmăritori</span>
            <span><strong>{following}</strong> urmăriri</span>
            <span>Membru din {joined_at}</span>
          </div>
        </div>
      </div>
    </section>
    <section class="surface profile-static-summary">
      <p>{visibility_note}</p>
      <a class="btn btn-primary" href="/login?next=%2Fprofile%2F{profile_id}">Conectează-te pentru a interacționa</a>
    </section>
  </main>
</div>{ROOT_END}"#,
        posts = profile.posts_count.max(0),
        followers = profile.followers_count.max(0),
        following = profile.following_count.max(0),
        profile_id = escape_html(&profile.id),
    );
    let root_start = html
        .find(ROOT_START)
        .ok_or("application root start is missing")?;
    let root_end = html[root_start..]
        .find(ROOT_END)
        .map(|offset| root_start + offset + ROOT_END.len())
        .ok_or("application root end is missing")?;
    html.replace_range(root_start..root_end, &static_root);

    Ok(html)
}

pub async fn post_page(
    State(pool): State<MySqlPool>,
    Path(post_id): Path<String>,
    headers: HeaderMap,
) -> Result<Html<String>, StatusCode> {
    if Uuid::parse_str(&post_id).is_err() {
        return Err(StatusCode::NOT_FOUND);
    }
    let post = visible_post(&pool, &headers, &post_id)
        .await?
        .ok_or(StatusCode::NOT_FOUND)?;
    let shell_path =
        std::env::var("FRONTEND_SHELL_PATH").unwrap_or_else(|_| DEFAULT_SHELL_PATH.to_owned());
    let shell = tokio::fs::read_to_string(&shell_path)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, path = shell_path, "failed to read frontend shell");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    let rendered = render_post_shell(&shell, &post).map_err(|error| {
        tracing::error!(error, "failed to render post page");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Html(rendered))
}

pub async fn profile_page(
    State(pool): State<MySqlPool>,
    Path(user_id): Path<String>,
    headers: HeaderMap,
) -> Result<Html<String>, StatusCode> {
    if Uuid::parse_str(&user_id).is_err() {
        return Err(StatusCode::NOT_FOUND);
    }
    let profile = visible_profile(&pool, &headers, &user_id)
        .await?
        .ok_or(StatusCode::NOT_FOUND)?;
    let shell_path =
        std::env::var("FRONTEND_SHELL_PATH").unwrap_or_else(|_| DEFAULT_SHELL_PATH.to_owned());
    let shell = tokio::fs::read_to_string(&shell_path)
        .await
        .map_err(|error| {
            tracing::error!(error = %error, path = shell_path, "failed to read frontend shell");
            StatusCode::INTERNAL_SERVER_ERROR
        })?;
    let rendered = render_profile_shell(&shell, &profile).map_err(|error| {
        tracing::error!(error, "failed to render profile page");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    Ok(Html(rendered))
}

#[cfg(test)]
mod tests {
    use super::{
        absolute_post_image, condensed_text, render_post_shell, render_profile_shell,
        safe_avatar_path, DEFAULT_SOCIAL_IMAGE, ROOT_END, ROOT_START,
    };
    use crate::models::{PostWithUser, ProfileDetail, UserProfile};
    use chrono::{TimeZone, Utc};

    fn shell() -> String {
        format!(
            r#"<!doctype html><html><head>
<meta name="description" content="default"><meta name="robots" content="index">
<meta property="og:type" content="website"><meta property="og:url" content="default">
<meta property="og:title" content="default"><meta property="og:description" content="default">
<meta property="og:image" content="default"><meta property="og:image:secure_url" content="default">
<meta property="og:image:alt" content="default"><meta name="twitter:title" content="default">
<meta name="twitter:description" content="default"><meta name="twitter:image" content="default">
<meta name="twitter:image:alt" content="default"><link rel="canonical" href="default">
<link rel="alternate" hreflang="ro-RO" href="default"><link rel="alternate" hreflang="x-default" href="default">
<title>Default</title><script id="page-structured-data" type="application/ld+json">{{}}</script></head>
<body>{ROOT_START}<div id="root"></div>{ROOT_END}<script src="/assets/app.js"></script></body></html>"#
        )
    }

    fn post(content: &str, image_url: Option<&str>) -> PostWithUser {
        PostWithUser {
            id: "01234567-89ab-4def-8123-456789abcdef".to_owned(),
            content: content.to_owned(),
            image_url: image_url.map(str::to_owned),
            likes_count: 4,
            comments_count: 2,
            created_at: Utc.with_ymd_and_hms(2026, 11, 2, 10, 30, 0).unwrap(),
            user: UserProfile {
                id: "fedcba98-7654-4321-8123-fedcba987654".to_owned(),
                username: "alice".to_owned(),
                bio: None,
                avatar_url: None,
                posts_count: 1,
                created_at: Utc.with_ymd_and_hms(2026, 10, 1, 8, 0, 0).unwrap(),
            },
            is_liked: false,
            is_saved: false,
        }
    }

    fn profile(bio: Option<&str>, is_private: bool) -> ProfileDetail {
        ProfileDetail {
            id: "fedcba98-7654-4321-8123-fedcba987654".to_owned(),
            username: "alice".to_owned(),
            bio: bio.map(str::to_owned),
            avatar_url: Some("/uploads/avatars/alice.webp".to_owned()),
            posts_count: 3,
            followers_count: 4,
            following_count: 5,
            is_following: false,
            follow_request_pending: false,
            is_blocked: false,
            is_muted: false,
            is_private,
            can_view_content: !is_private,
            pending_follow_requests_count: 0,
            created_at: Utc.with_ymd_and_hms(2026, 10, 1, 8, 0, 0).unwrap(),
        }
    }

    #[test]
    fn post_shell_is_noindex_and_preserves_runtime_assets() {
        let rendered = render_post_shell(
            &shell(),
            &post(
                "O postare pentru distribuire",
                Some("/uploads/posts/example.webp"),
            ),
        )
        .unwrap();

        assert!(rendered.contains("noindex, nofollow, noarchive"));
        assert!(
            rendered.contains("https://media.micutu.com/post/01234567-89ab-4def-8123-456789abcdef")
        );
        assert!(rendered.contains("https://media.micutu.com/uploads/posts/example.webp"));
        assert!(rendered.contains("<script src=\"/assets/app.js\"></script>"));
        assert!(rendered.contains("Postare distribuită"));
    }

    #[test]
    fn post_shell_escapes_user_content_in_html_and_json() {
        let rendered = render_post_shell(
            &shell(),
            &post("</script><img src=x onerror=alert(1)>", None),
        )
        .unwrap();

        assert!(!rendered.contains("</script><img"));
        assert!(rendered.contains("&lt;/script&gt;&lt;img"));
        assert!(rendered.contains("\\u003c/script\\u003e\\u003cimg"));
    }

    #[test]
    fn social_copy_and_media_paths_are_bounded() {
        assert_eq!(condensed_text("  salut   lume  ", 20), "salut lume");
        assert_eq!(condensed_text("abcdef", 4), "abc…");
        assert!(absolute_post_image(Some("/uploads/posts/safe-file.webp")).is_some());
        assert!(absolute_post_image(Some("https://attacker.example/image.png")).is_none());
        assert!(absolute_post_image(Some("/uploads/posts/../secret")).is_none());
        assert!(safe_avatar_path(Some("/uploads/avatars/safe.webp")).is_some());
        assert!(safe_avatar_path(Some("https://attacker.example/avatar.png")).is_none());
        assert!(safe_avatar_path(Some("/uploads/avatars/../secret")).is_none());
    }

    #[test]
    fn profile_shell_is_noindex_and_uses_generic_social_image() {
        let rendered =
            render_profile_shell(&shell(), &profile(Some("Salut din profil"), false)).unwrap();

        assert!(rendered.contains("noindex, nofollow, noarchive"));
        assert!(rendered
            .contains("https://media.micutu.com/profile/fedcba98-7654-4321-8123-fedcba987654"));
        assert!(rendered.contains(DEFAULT_SOCIAL_IMAGE));
        assert!(!rendered.contains("https://media.micutu.com/uploads/avatars/alice.webp"));
        assert!(rendered.contains("src=\"/uploads/avatars/alice.webp\""));
        assert!(rendered.contains("<script src=\"/assets/app.js\"></script>"));
    }

    #[test]
    fn profile_shell_escapes_bio_and_marks_private_accounts() {
        let rendered = render_profile_shell(
            &shell(),
            &profile(Some("</script><img src=x onerror=alert(1)>"), true),
        )
        .unwrap();

        assert!(!rendered.contains("</script><img"));
        assert!(rendered.contains("&lt;/script&gt;&lt;img"));
        assert!(rendered.contains("\\u003c/script\\u003e\\u003cimg"));
        assert!(rendered.contains("Postările acestui cont sunt vizibile numai"));
    }
}
