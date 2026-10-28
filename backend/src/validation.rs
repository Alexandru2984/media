pub const MINIMUM_PASSWORD_CHARACTERS: usize = 12;
pub const MAXIMUM_PASSWORD_BYTES: usize = 72;

pub fn password_is_valid(password: &str) -> bool {
    let character_count = password.chars().count();
    character_count >= MINIMUM_PASSWORD_CHARACTERS && password.len() <= MAXIMUM_PASSWORD_BYTES
}

#[cfg(test)]
mod tests {
    use super::{password_is_valid, MAXIMUM_PASSWORD_BYTES, MINIMUM_PASSWORD_CHARACTERS};

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
}
