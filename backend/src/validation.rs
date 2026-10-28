use lettre::Address;

pub const MINIMUM_PASSWORD_CHARACTERS: usize = 12;
pub const MAXIMUM_PASSWORD_BYTES: usize = 72;
pub const MAXIMUM_EMAIL_BYTES_FOR_TOKEN_STORAGE: usize = 190;
pub const MAXIMUM_EMAIL_BYTES: usize = 254;
pub const MAXIMUM_USERNAME_CHARACTERS: usize = 32;
pub const MAXIMUM_BIO_CHARACTERS: usize = 240;
pub const MAXIMUM_POST_CHARACTERS: usize = 500;
pub const MAXIMUM_COMMENT_CHARACTERS: usize = 500;
pub const MAXIMUM_MESSAGE_CHARACTERS: usize = 2_000;

pub fn password_is_valid(password: &str) -> bool {
    let character_count = password.chars().count();
    character_count >= MINIMUM_PASSWORD_CHARACTERS && password.len() <= MAXIMUM_PASSWORD_BYTES
}

pub fn password_is_safe_to_verify(password: &str) -> bool {
    !password.is_empty() && password.len() <= MAXIMUM_PASSWORD_BYTES
}

pub fn email_is_valid(email: &str) -> bool {
    !email.is_empty() && email.len() <= MAXIMUM_EMAIL_BYTES && email.parse::<Address>().is_ok()
}

pub fn email_change_address_is_valid(email: &str) -> bool {
    email.len() <= MAXIMUM_EMAIL_BYTES_FOR_TOKEN_STORAGE && email_is_valid(email)
}

pub fn bounded_text_is_valid(value: &str, minimum: usize, maximum: usize) -> bool {
    let trimmed = value.trim();
    let length = trimmed.chars().count();
    length >= minimum
        && length <= maximum
        && !trimmed
            .chars()
            .any(|character| character.is_control() && !matches!(character, '\n' | '\t'))
}

pub fn username_is_valid(username: &str) -> bool {
    username == username.trim()
        && bounded_text_is_valid(username, 2, MAXIMUM_USERNAME_CHARACTERS)
        && !username
            .chars()
            .any(|character| matches!(character, '\n' | '\t'))
}

pub fn stored_image_path_is_valid(path: &str, expected_prefix: &str) -> bool {
    path.len() <= 512
        && path.starts_with(expected_prefix)
        && !path.contains("..")
        && path
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'/' | b'_' | b'-' | b'.'))
}

pub fn one_time_token_is_valid(token: &str) -> bool {
    matches!(token.len(), 32 | 48) && token.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::{
        bounded_text_is_valid, email_change_address_is_valid, email_is_valid,
        one_time_token_is_valid, password_is_safe_to_verify, password_is_valid,
        stored_image_path_is_valid, username_is_valid, MAXIMUM_PASSWORD_BYTES,
        MINIMUM_PASSWORD_CHARACTERS,
    };

    #[test]
    fn rejects_short_passwords() {
        assert!(!password_is_valid(
            &"a".repeat(MINIMUM_PASSWORD_CHARACTERS - 1)
        ));
    }

    #[test]
    fn accepts_long_passphrases() {
        assert!(password_is_valid("o fraza lunga si memorabila"));
    }

    #[test]
    fn rejects_passwords_bcrypt_would_truncate() {
        assert!(!password_is_valid(&"a".repeat(MAXIMUM_PASSWORD_BYTES + 1)));
        assert!(!password_is_safe_to_verify(
            &"a".repeat(MAXIMUM_PASSWORD_BYTES + 1)
        ));
        assert!(!password_is_safe_to_verify(""));
        assert!(password_is_safe_to_verify("legacy-password"));
    }

    #[test]
    fn counts_unicode_characters_and_bytes_safely() {
        assert!(password_is_valid("parolă sigură 2026"));
        assert!(!password_is_valid(&"🔐".repeat(19)));
    }

    #[test]
    fn validates_email_addresses_for_storage() {
        assert!(email_is_valid("alex@example.com"));
        assert!(!email_is_valid("not an email"));
        assert!(!email_change_address_is_valid(&format!(
            "{}@example.com",
            "a".repeat(180)
        )));
    }

    #[test]
    fn email_change_tokens_cannot_contain_sql_wildcards() {
        assert!(one_time_token_is_valid(&"a".repeat(48)));
        assert!(one_time_token_is_valid(&"a".repeat(32)));
        assert!(!one_time_token_is_valid("%"));
        assert!(!one_time_token_is_valid(&format!("{}%", "a".repeat(47))));
    }

    #[test]
    fn validates_user_content_boundaries() {
        assert!(username_is_valid("Alex_2026"));
        assert!(!username_is_valid(" a"));
        assert!(!username_is_valid("a"));
        assert!(bounded_text_is_valid("Mesaj valid", 1, 20));
        assert!(!bounded_text_is_valid("   ", 1, 20));
        assert!(!bounded_text_is_valid("mesaj\0ascuns", 1, 20));
    }

    #[test]
    fn accepts_only_server_managed_image_paths() {
        assert!(stored_image_path_is_valid(
            "/uploads/posts/post_user_uuid.webp",
            "/uploads/posts/"
        ));
        assert!(!stored_image_path_is_valid(
            "https://tracker.example/image.png",
            "/uploads/posts/"
        ));
        assert!(!stored_image_path_is_valid(
            "/uploads/posts/../avatars/file.png",
            "/uploads/posts/"
        ));
    }
}
