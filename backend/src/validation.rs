use lettre::Address;

pub const MINIMUM_PASSWORD_CHARACTERS: usize = 12;
pub const MAXIMUM_PASSWORD_BYTES: usize = 72;
pub const MAXIMUM_EMAIL_BYTES_FOR_TOKEN_STORAGE: usize = 190;

pub fn password_is_valid(password: &str) -> bool {
    let character_count = password.chars().count();
    character_count >= MINIMUM_PASSWORD_CHARACTERS && password.len() <= MAXIMUM_PASSWORD_BYTES
}

pub fn email_is_valid(email: &str) -> bool {
    !email.is_empty()
        && email.len() <= MAXIMUM_EMAIL_BYTES_FOR_TOKEN_STORAGE
        && email.parse::<Address>().is_ok()
}

pub fn one_time_token_is_valid(token: &str) -> bool {
    matches!(token.len(), 32 | 48) && token.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

#[cfg(test)]
mod tests {
    use super::{
        email_is_valid, one_time_token_is_valid, password_is_valid, MAXIMUM_PASSWORD_BYTES,
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
        assert!(!email_is_valid(&format!("{}@example.com", "a".repeat(200))));
    }

    #[test]
    fn email_change_tokens_cannot_contain_sql_wildcards() {
        assert!(one_time_token_is_valid(&"a".repeat(48)));
        assert!(one_time_token_is_valid(&"a".repeat(32)));
        assert!(!one_time_token_is_valid("%"));
        assert!(!one_time_token_is_valid(&format!("{}%", "a".repeat(47))));
    }
}
