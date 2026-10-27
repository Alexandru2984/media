use anyhow::Result;
use lettre::{
    message::header::ContentType, transport::smtp::authentication::Credentials, Message,
    SmtpTransport, Transport,
};

pub struct EmailService {
    smtp_username: String,
    smtp_password: String,
    smtp_server: String,
    from_email: String,
    app_url: String,
}

impl EmailService {
    pub fn new() -> Self {
        // Determine app URL based on environment
        let environment =
            std::env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string());

        let app_url = if environment == "production" {
            std::env::var("APP_URL_PRODUCTION")
                .unwrap_or_else(|_| "http://localhost:3005".to_string())
        } else {
            std::env::var("APP_URL_LOCAL").unwrap_or_else(|_| "http://localhost:3005".to_string())
        };

        Self {
            smtp_username: std::env::var("SMTP_USERNAME")
                .unwrap_or_else(|_| "your-email@example.com".to_string()),
            smtp_password: std::env::var("SMTP_PASSWORD")
                .unwrap_or_else(|_| "your-password".to_string()),
            smtp_server: std::env::var("SMTP_SERVER")
                .unwrap_or_else(|_| "smtp-relay.brevo.com".to_string()),
            from_email: std::env::var("FROM_EMAIL")
                .unwrap_or_else(|_| "noreply@socialapp.com".to_string()),
            app_url,
        }
    }

    pub async fn send_verification_email(
        &self,
        to_email: &str,
        username: &str,
        token: &str,
    ) -> Result<()> {
        let verification_url = format!("{}/verify-email?token={}", self.app_url, token);

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
                        <h1>🎉 Bun venit pe Social Media!</h1>
                    </div>
                    <div class="content">
                        <h2>Salut, {}!</h2>
                        <p>Mulțumim că te-ai înscris pe platforma noastră. Pentru a-ți activa contul, te rugăm să verifici adresa de email.</p>
                        <p>Apasă pe butonul de mai jos pentru a verifica contul:</p>
                        <a href="{}" class="button">Verifică Email-ul</a>
                        <p>Sau copiază și lipește acest link în browser:</p>
                        <p style="word-break: break-all; color: #667eea;">{}</p>
                        <p>Dacă nu te-ai înregistrat pe platforma noastră, te rugăm să ignori acest email.</p>
                    </div>
                    <div class="footer">
                        <p>© 2025 Social Media App. Toate drepturile rezervate.</p>
                    </div>
                </div>
            </body>
            </html>
            "#,
            username, verification_url, verification_url
        );

        self.send_email(to_email, "Verifică-ți contul", &html_body)
            .await
    }

    pub async fn send_password_reset_email(
        &self,
        to_email: &str,
        username: &str,
        token: &str,
    ) -> Result<()> {
        let reset_url = format!("{}/reset-password?token={}", self.app_url, token);

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
                        <p>© 2025 Social Media App. Toate drepturile rezervate.</p>
                    </div>
                </div>
            </body>
            </html>
            "#,
            username, reset_url, reset_url
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
            .port(587)
            .build();

        match mailer.send(&email) {
            Ok(_) => {
                println!("✅ Email sent successfully to: {}", to_email);
                Ok(())
            }
            Err(e) => {
                eprintln!("❌ Failed to send email to {}: {}", to_email, e);
                Err(e.into())
            }
        }
    }
}
