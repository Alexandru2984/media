use anyhow::{bail, Context, Result};
use argon2::{
    password_hash::{phc::PasswordHash, PasswordHasher, PasswordVerifier},
    Algorithm, Argon2, Params, Version,
};
use tokio::sync::Semaphore;

// OWASP's minimum Argon2id profile. Keep these explicit so future upgrades can
// detect stale hashes and transparently replace them after a valid login.
const ARGON2_MEMORY_KIB: u32 = 19_456;
const ARGON2_ITERATIONS: u32 = 2;
const ARGON2_PARALLELISM: u32 = 1;
const ARGON2_OUTPUT_BYTES: usize = 32;
const MAXIMUM_CONCURRENT_PASSWORD_JOBS: usize = 4;
const MAXIMUM_STORED_MEMORY_KIB: u32 = 65_536;
const MAXIMUM_STORED_ITERATIONS: u32 = 10;
const MAXIMUM_STORED_PARALLELISM: u32 = 4;
const MAXIMUM_STORED_OUTPUT_BYTES: usize = 64;

static PASSWORD_JOB_LIMIT: Semaphore = Semaphore::const_new(MAXIMUM_CONCURRENT_PASSWORD_JOBS);

#[derive(Debug, Eq, PartialEq)]
pub struct PasswordVerification {
    pub valid: bool,
    pub needs_rehash: bool,
}

fn current_params() -> Result<Params> {
    Params::new(
        ARGON2_MEMORY_KIB,
        ARGON2_ITERATIONS,
        ARGON2_PARALLELISM,
        Some(ARGON2_OUTPUT_BYTES),
    )
    .context("invalid Argon2 password parameters")
}

fn current_argon2() -> Result<Argon2<'static>> {
    Ok(Argon2::new(
        Algorithm::Argon2id,
        Version::V0x13,
        current_params()?,
    ))
}

pub async fn hash_password(password: &str) -> Result<String> {
    let permit = PASSWORD_JOB_LIMIT
        .acquire()
        .await
        .context("password worker limit closed")?;
    let password = password.as_bytes().to_vec();

    tokio::task::spawn_blocking(move || {
        // Keep the permit inside the blocking job: dropping a disconnected
        // request must not let an already-running hash escape the limit.
        let _permit = permit;
        current_argon2()?
            .hash_password(&password)
            .map(|hash| hash.to_string())
            .context("failed to hash password")
    })
    .await
    .context("password worker failed")?
}

pub async fn verify_password(password: &str, encoded_hash: &str) -> Result<PasswordVerification> {
    let permit = PASSWORD_JOB_LIMIT
        .acquire()
        .await
        .context("password worker limit closed")?;
    let password = password.as_bytes().to_vec();
    let encoded_hash = encoded_hash.to_owned();

    tokio::task::spawn_blocking(move || {
        let _permit = permit;
        if encoded_hash.starts_with("$argon2") {
            let parsed =
                PasswordHash::new(&encoded_hash).context("malformed Argon2 password hash")?;
            if parsed.algorithm.as_str() != "argon2id" {
                bail!("unsupported Argon2 password algorithm");
            }

            let stored_params =
                Params::try_from(&parsed).context("invalid stored Argon2 parameters")?;
            if stored_params.m_cost() > MAXIMUM_STORED_MEMORY_KIB
                || stored_params.t_cost() > MAXIMUM_STORED_ITERATIONS
                || stored_params.p_cost() > MAXIMUM_STORED_PARALLELISM
                || stored_params
                    .output_len()
                    .unwrap_or(Params::DEFAULT_OUTPUT_LEN)
                    > MAXIMUM_STORED_OUTPUT_BYTES
            {
                bail!("stored Argon2 parameters exceed verification limits");
            }

            let valid = current_argon2()?
                .verify_password(&password, &parsed)
                .is_ok();
            let current_params = current_params()?;
            let uses_current_profile =
                parsed.version == Some(Version::V0x13.into()) && stored_params == current_params;

            return Ok(PasswordVerification {
                valid,
                needs_rehash: valid && !uses_current_profile,
            });
        }

        if encoded_hash.starts_with("$2a$")
            || encoded_hash.starts_with("$2b$")
            || encoded_hash.starts_with("$2y$")
        {
            let valid = bcrypt::verify(&password, &encoded_hash)
                .context("failed to verify legacy bcrypt password")?;
            return Ok(PasswordVerification {
                valid,
                needs_rehash: valid,
            });
        }

        bail!("unsupported password hash format")
    })
    .await
    .context("password worker failed")?
}

pub async fn spend_password_work(password: &str) -> Result<()> {
    hash_password(password).await.map(|_| ())
}

#[cfg(test)]
mod tests {
    use super::{hash_password, verify_password, ARGON2_ITERATIONS, ARGON2_MEMORY_KIB};
    use argon2::{
        password_hash::{phc::PasswordHash, PasswordHasher},
        Algorithm, Argon2, Params, Version,
    };

    #[tokio::test]
    async fn creates_and_verifies_current_argon2id_hashes() {
        let encoded = hash_password("o fraza lunga si memorabila").await.unwrap();
        let parsed = PasswordHash::new(&encoded).unwrap();
        assert_eq!(parsed.algorithm.as_str(), "argon2id");
        assert_eq!(parsed.params.get_decimal("m"), Some(ARGON2_MEMORY_KIB));
        assert_eq!(parsed.params.get_decimal("t"), Some(ARGON2_ITERATIONS));

        assert_eq!(
            verify_password("o fraza lunga si memorabila", &encoded)
                .await
                .unwrap(),
            super::PasswordVerification {
                valid: true,
                needs_rehash: false,
            }
        );
        assert!(
            !verify_password("alta parola", &encoded)
                .await
                .unwrap()
                .valid
        );
    }

    #[tokio::test]
    async fn accepts_legacy_bcrypt_and_marks_it_for_upgrade() {
        let encoded = bcrypt::hash("legacy-password", 4).unwrap();
        let verification = verify_password("legacy-password", &encoded).await.unwrap();
        assert!(verification.valid);
        assert!(verification.needs_rehash);
        assert!(
            !verify_password("wrong-password", &encoded)
                .await
                .unwrap()
                .valid
        );
    }

    #[tokio::test]
    async fn marks_an_outdated_argon2id_profile_for_upgrade() {
        let old_params = Params::new(8_192, 1, 1, Some(32)).unwrap();
        let old_hasher = Argon2::new(Algorithm::Argon2id, Version::V0x13, old_params);
        let encoded = old_hasher
            .hash_password(b"legacy-password")
            .unwrap()
            .to_string();

        let verification = verify_password("legacy-password", &encoded).await.unwrap();
        assert!(verification.valid);
        assert!(verification.needs_rehash);
    }

    #[tokio::test]
    async fn rejects_stored_profiles_that_could_exhaust_the_server() {
        let oversized = "$argon2id$v=19$m=1048576,t=2,p=1$c2FsdHNhbHRzYWx0c2FsdA$8s08pD1QZpNqM1QqJQJ1HcV4oNpuvHBGh7B9lGV7WOM";
        assert!(verify_password("password", oversized).await.is_err());
    }

    #[tokio::test]
    async fn rejects_unknown_hash_formats() {
        assert!(verify_password("password", "$not-a-supported-hash$")
            .await
            .is_err());
    }
}
