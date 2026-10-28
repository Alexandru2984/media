use rand::{distributions::Alphanumeric, Rng};
use sha2::{Digest, Sha256};

pub const ONE_TIME_TOKEN_LENGTH: usize = 48;

pub fn generate_one_time_token() -> String {
    rand::thread_rng()
        .sample_iter(&Alphanumeric)
        .take(ONE_TIME_TOKEN_LENGTH)
        .map(char::from)
        .collect()
}

pub fn hash_one_time_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

#[cfg(test)]
mod tests {
    use super::{generate_one_time_token, hash_one_time_token, ONE_TIME_TOKEN_LENGTH};

    #[test]
    fn generates_url_safe_tokens_with_expected_entropy_length() {
        let token = generate_one_time_token();
        assert_eq!(token.len(), ONE_TIME_TOKEN_LENGTH);
        assert!(token.bytes().all(|byte| byte.is_ascii_alphanumeric()));
    }

    #[test]
    fn hashes_tokens_without_storing_the_secret() {
        let digest = hash_one_time_token("temporary-secret");
        assert_eq!(digest.len(), 64);
        assert_ne!(digest, "temporary-secret");
        assert_eq!(digest, hash_one_time_token("temporary-secret"));
    }
}
