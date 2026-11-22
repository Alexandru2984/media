use axum::http::StatusCode;
use serde::{Deserialize, Serialize};
use sqlx::{MySql, Transaction};
use url::{Host, Url};

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ProfileDetailsInput {
    pub display_name: Option<String>,
    pub pronouns: Option<String>,
    pub location: Option<String>,
    pub website_url: Option<String>,
}

fn clean_line(value: Option<String>, maximum: usize) -> Result<Option<String>, StatusCode> {
    let Some(value) = value else {
        return Ok(None);
    };
    if value.chars().any(char::is_control) || value.trim().chars().count() > maximum {
        return Err(StatusCode::BAD_REQUEST);
    }
    Ok((!value.trim().is_empty()).then(|| value.trim().to_owned()))
}

pub fn public_website(value: &str) -> Option<String> {
    let trimmed = value.trim();
    if !trimmed.get(..8)?.eq_ignore_ascii_case("https://")
        || value.chars().any(char::is_control)
        || trimmed.chars().any(char::is_whitespace)
        || trimmed.contains('\\')
        || trimmed.len() > 512
    {
        return None;
    }
    let url = Url::parse(trimmed).ok()?;
    if url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.port().is_some()
        || url.as_str().len() > 512
    {
        return None;
    }
    let Some(Host::Domain(host)) = url.host() else {
        return None;
    };
    let host = host.trim_end_matches('.');
    if !host.contains('.')
        || ["local", "localhost", "internal", "invalid", "test"]
            .iter()
            .any(|suffix| host == *suffix || host.ends_with(&format!(".{suffix}")))
    {
        return None;
    }
    Some(url.to_string())
}

impl ProfileDetailsInput {
    pub fn clean(self) -> Result<Self, StatusCode> {
        let website = clean_line(self.website_url, 512)?;
        Ok(Self {
            display_name: clean_line(self.display_name, 50)?,
            pronouns: clean_line(self.pronouns, 30)?,
            location: clean_line(self.location, 80)?,
            website_url: website
                .map(|value| public_website(&value).ok_or(StatusCode::BAD_REQUEST))
                .transpose()?,
        })
    }

    pub async fn store(
        &self,
        transaction: &mut Transaction<'_, MySql>,
        user_id: &str,
    ) -> Result<(), StatusCode> {
        if self.display_name.is_none()
            && self.pronouns.is_none()
            && self.location.is_none()
            && self.website_url.is_none()
        {
            sqlx::query("DELETE FROM profile_details WHERE user_id = ?")
                .bind(user_id)
                .execute(&mut **transaction)
                .await
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        } else {
            sqlx::query("INSERT INTO profile_details (user_id, display_name, pronouns, location, website_url) VALUES (?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE display_name=VALUES(display_name), pronouns=VALUES(pronouns), location=VALUES(location), website_url=VALUES(website_url), updated_at=CURRENT_TIMESTAMP(6)")
                .bind(user_id).bind(&self.display_name).bind(&self.pronouns).bind(&self.location).bind(&self.website_url)
                .execute(&mut **transaction).await.map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{public_website, ProfileDetailsInput};
    #[test]
    fn websites_require_explicit_public_https_without_credentials() {
        assert_eq!(
            public_website(" HTTPS://EXAMPLE.COM:443/portofoliu?q=1#intro ").unwrap(),
            "https://example.com/portofoliu?q=1#intro"
        );
        assert!(public_website("https://exemplu.ro/cărți")
            .unwrap()
            .contains("c%C4%83r"));
        for value in [
            "javascript:alert(1)",
            "data:text/html,x",
            "//example.com",
            "https:example.com",
            "http://example.com",
            "https://user:pass@example.com",
            "https://example.com@evil.com",
            "https://127.0.0.1",
            "https://[::1]",
            "https://localhost.",
            "https://app.internal",
            "https://example.com:8443",
            "https://example.com/a b",
            "https://example.com\\@evil.com",
            "\thttps://example.com",
        ] {
            assert!(public_website(value).is_none(), "accepted {value}");
        }
    }
    #[test]
    fn profile_lines_are_optional_bounded_unicode_text() {
        let input = |name| ProfileDetailsInput {
            display_name: Some(name),
            pronouns: Some("  ".into()),
            location: None,
            website_url: None,
        };
        assert_eq!(
            input("  Mara  ".into())
                .clean()
                .unwrap()
                .display_name
                .as_deref(),
            Some("Mara")
        );
        assert!(input("📚".repeat(50)).clean().is_ok());
        assert!(input("📚".repeat(51)).clean().is_err());
        assert!(input("Mara\nAlt nume".into()).clean().is_err());
        assert!(input("Mara".into()).clean().unwrap().pronouns.is_none());
    }
}
