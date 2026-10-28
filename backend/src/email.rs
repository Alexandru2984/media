use anyhow::{bail, Context, Result};
use lettre::{
    message::header::ContentType, transport::smtp::authentication::Credentials, Address, Message,
    SmtpTransport, Transport,
};
use url::Url;

pub struct EmailService {
    smtp_username: String,
    smtp_password: String,
    smtp_server: String,
    smtp_port: u16,
    from_email: String,
    app_url: String,
}

impl EmailService {
    pub fn new() -> Result<Self> {
        let environment = required_env("ENVIRONMENT")?;
        let is_production = match environment.as_str() {
            "production" => true,
            "development" | "test" => false,
            _ => bail!("ENVIRONMENT must be production, development, or test"),
        };

        let app_url = if is_production {
            required_env("APP_URL_PRODUCTION")?
        } else {
            required_env("APP_URL_LOCAL")?
        };
        let app_url = validate_app_url(&app_url, is_production)?;

        let smtp_server = required_env("SMTP_SERVER")?;
        if smtp_server.chars().any(char::is_whitespace)
            || smtp_server.contains('/')
            || smtp_server.contains('@')
        {
            bail!("SMTP_SERVER must be a hostname");
        }

        let smtp_port = std::env::var("SMTP_PORT")
            .unwrap_or_else(|_| "587".to_string())
            .parse::<u16>()
            .context("SMTP_PORT must be a valid TCP port")?;

        let from_email = required_env("FROM_EMAIL")?;
        from_email
            .parse::<Address>()
            .context("FROM_EMAIL must be a valid email address")?;

        Ok(Self {
            smtp_username: required_env("SMTP_USERNAME")?,
            smtp_password: required_env("SMTP_PASSWORD")?,
            smtp_server,
            smtp_port,
            from_email,
            app_url,
        })
    }

    pub async fn send_verification_email(
        &self,
        to_email: &str,
        username: &str,
        token: &str,
    ) -> Result<()> {
        self.send_verification_message(
            to_email,
            username,
            token,
            "verify-email",
            "Bun venit pe Media",
            "Pentru a activa contul, confirmă adresa de email folosind butonul de mai jos.",
            "Verifică adresa",
            "Verifică-ți contul",
        )
        .await
    }

    pub async fn send_email_change_verification(
        &self,
        to_email: &str,
        username: &str,
        token: &str,
    ) -> Result<()> {
        self.send_verification_message(
            to_email,
            username,
            token,
            "verify-email-change",
            "Confirmă noua adresă",
            "Am primit o solicitare de schimbare a adresei de email. Confirm-o folosind butonul de mai jos.",
            "Confirmă adresa nouă",
            "Confirmă schimbarea adresei de email",
        )
        .await
    }

    #[allow(clippy::too_many_arguments)]
    async fn send_verification_message(
        &self,
        to_email: &str,
        username: &str,
        token: &str,
        route: &str,
        heading: &str,
        introduction: &str,
        button_label: &str,
        subject: &str,
    ) -> Result<()> {
        let verification_url = one_time_link(&self.app_url, route, token);

        let html_body = format!(
            r#"
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                    .button {{ display: inline-block; padding: 15px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                    .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>{}</h1>
                    </div>
                    <div class="content">
                        <h2>Salut, {}!</h2>
                        <p>{}</p>
                        <a href="{}" class="button">{}</a>
                        <p>Sau copiază și lipește acest link în browser:</p>
                        <p style="word-break: break-all; color: #667eea;">{}</p>
                        <p>Dacă nu ai făcut această solicitare, ignoră mesajul.</p>
                    </div>
                    <div class="footer">
                        <p>© 2026 Media. Toate drepturile rezervate.</p>
                    </div>
                </div>
            </body>
            </html>
            "#,
            heading,
            escape_html(username),
            introduction,
            verification_url,
            button_label,
            verification_url
        );

        self.send_email(to_email, subject, &html_body).await
    }

    pub async fn send_password_reset_email(
        &self,
        to_email: &str,
        username: &str,
        token: &str,
    ) -> Result<()> {
        let reset_url = one_time_link(&self.app_url, "reset-password", token);

        let html_body = format!(
            r#"
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                    .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                    .header {{ background: linear-gradient(135deg, #fc8181 0%, #e53e3e 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }}
                    .content {{ background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }}
                    .button {{ display: inline-block; padding: 15px 30px; background: #e53e3e; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }}
                    .footer {{ text-align: center; margin-top: 20px; color: #666; font-size: 12px; }}
                    .warning {{ background: #fff5f5; border-left: 4px solid #e53e3e; padding: 15px; margin: 20px 0; }}
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>🔒 Resetare Parolă</h1>
                    </div>
                    <div class="content">
                        <h2>Salut, {}!</h2>
                        <p>Am primit o solicitare pentru resetarea parolei contului tău.</p>
                        <p>Apasă pe butonul de mai jos pentru a seta o nouă parolă:</p>
                        <a href="{}" class="button">Resetează Parola</a>
                        <p>Sau copiază și lipește acest link în browser:</p>
                        <p style="word-break: break-all; color: #e53e3e;">{}</p>
                        <div class="warning">
                            <strong>⚠️ Atenție:</strong> Acest link este valabil 1 oră. Dacă nu ai solicitat resetarea parolei, ignoră acest email.
                        </div>
                    </div>
                    <div class="footer">
                        <p>© 2026 Media. Toate drepturile rezervate.</p>
                    </div>
                </div>
            </body>
            </html>
            "#,
            escape_html(username),
            reset_url,
            reset_url
        );

        self.send_email(to_email, "Resetare Parolă", &html_body)
            .await
    }

    async fn send_email(&self, to_email: &str, subject: &str, html_body: &str) -> Result<()> {
        let email = Message::builder()
            .from(self.from_email.parse()?)
            .to(to_email.parse()?)
            .subject(subject)
            .header(ContentType::TEXT_HTML)
            .body(html_body.to_string())?;

        let creds = Credentials::new(self.smtp_username.clone(), self.smtp_password.clone());

        let mailer = SmtpTransport::starttls_relay(&self.smtp_server)?
            .credentials(creds)
            .port(self.smtp_port)
            .build();

        match mailer.send(&email) {
            Ok(_) => {
                tracing::info!("email sent");
                Ok(())
            }
            Err(e) => {
                tracing::error!(error = %e, "email delivery failed");
                Err(e.into())
            }
        }
    }
}

pub fn validate_configuration() -> Result<()> {
    EmailService::new().map(|_| ())
}

fn required_env(name: &str) -> Result<String> {
    let value = std::env::var(name).with_context(|| format!("{} must be configured", name))?;
    let value = value.trim();
    if value.is_empty() {
        bail!("{} must not be empty", name);
    }
    Ok(value.to_string())
}

fn validate_app_url(value: &str, is_production: bool) -> Result<String> {
    let parsed = Url::parse(value).context("Application URL must be an absolute URL")?;
    if !matches!(parsed.scheme(), "http" | "https") || parsed.host_str().is_none() {
        bail!("Application URL must use HTTP or HTTPS and include a host");
    }
    if is_production && parsed.scheme() != "https" {
        bail!("APP_URL_PRODUCTION must use HTTPS");
    }
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.query().is_some()
        || parsed.fragment().is_some()
    {
        bail!("Application URL must not contain credentials, a query, or a fragment");
    }
    Ok(value.trim_end_matches('/').to_string())
}

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

fn one_time_link(app_url: &str, route: &str, token: &str) -> String {
    format!("{}/{}#token={}", app_url, route, token)
}

#[cfg(test)]
mod tests {
    use super::{escape_html, one_time_link, validate_app_url};

    #[test]
    fn escapes_user_content_for_html_email() {
        assert_eq!(
            escape_html("<b>A&B's</b>"),
            "&lt;b&gt;A&amp;B&#39;s&lt;/b&gt;"
        );
    }

    #[test]
    fn production_url_requires_https() {
        assert!(validate_app_url("http://media.example.com", true).is_err());
        assert_eq!(
            validate_app_url("https://media.example.com/", true).unwrap(),
            "https://media.example.com"
        );
    }

    #[test]
    fn application_url_rejects_embedded_credentials_and_fragments() {
        assert!(validate_app_url("https://user:pass@example.com", true).is_err());
        assert!(validate_app_url("https://example.com/#token", true).is_err());
    }

    #[test]
    fn one_time_secrets_are_kept_out_of_http_requests() {
        assert_eq!(
            one_time_link("https://media.example.com", "verify-email", "abc123"),
            "https://media.example.com/verify-email#token=abc123"
        );
    }
}
