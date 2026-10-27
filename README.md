# Media

Media is a social platform hosted at [media.micutu.com](https://media.micutu.com).
The application currently provides account management, email verification and
password recovery, user profiles, avatars, posts, image uploads, likes, and
comments.

> [!IMPORTANT]
> The application source and its original history were recovered from the
> legacy `social_media` repository on 2026-10-28. Real user uploads were removed
> from the imported history. The backend now has a locked, tested release build;
> the frontend source is present but still needs its source template and build
> output separated from the current production document root.

## Current architecture

```text
Browser
  -> Cloudflare edge
  -> Cloudflare Tunnel (loopback transport)
  -> Nginx (TLS, static SPA, uploads, reverse proxy)
     |-> compiled frontend SPA
     `-> Rust/Axum API -> MySQL
                       `-> SMTP provider
```

- Frontend: Solid.js single-page application built with Vite
- API: Rust with Axum
- Data: MySQL
- Authentication: JWT-based authentication and bcrypt password hashes
- Email: SMTP for verification and password-reset messages
- Edge and origin: Cloudflare Tunnel, Nginx, and a systemd-managed API process

## Repository layout

```text
backend/
  Cargo.toml / Cargo.lock # Rust manifest and locked dependency graph
  src/                  # Axum application source
  migrations/           # recovered SQL migration history
  .env                  # local production secrets; never committed
  .env.example          # safe variable-name and development-value template
  social-media-backend  # generated executable; never committed
  uploads/              # user-generated content; never committed
frontend/
  package.json / package-lock.json # frontend manifest and lockfile
  src/                  # Solid.js application source
  index.html            # current SPA entry document and global metadata
  icon.svg              # scalable application mark
  manifest.webmanifest  # browser/PWA metadata
  robots.txt            # crawler policy for this hostname
  sitemap.xml           # currently indexable public URLs
  assets/               # generated hashed bundles; never committed
```

Generated artifacts and runtime data must stay out of Git.

## Development status

The immediate project goals are:

1. Upgrade the recovered dependency graph and close the remaining RustSec
   findings.
2. Separate frontend source from production build output and reproduce the SPA.
3. Expand automated tests, linting, dependency auditing, and CI.
4. Harden authentication, authorization, uploads, CORS, rate limits, Nginx,
   and the systemd sandbox.
5. Rebuild the interface as an accessible, responsive, mobile-first product.
6. Add complete technical SEO, social metadata, structured data, and public
   indexable pages where appropriate.

See the [security audit](docs/SECURITY_AUDIT.md) and the
[implementation roadmap](docs/ROADMAP.md) for the current findings, priorities,
and planned product work.

## Configuration

Runtime configuration is supplied through environment variables. The current
deployment uses values for the application URLs, allowed CORS origin, database,
JWT signing secret, SMTP, and server binding.

- Never commit `.env` files, credentials, tokens, database dumps, private keys,
  email-provider secrets, or real user uploads.
- Copy `backend/.env.example` for local development and replace every placeholder
  with environment-specific values; never reuse production credentials locally.
- Production secrets must be generated independently and rotated if exposure is
  suspected; examples and tests must use non-production values.

## Development and deployment

Backend checks and a release build can now be reproduced with Cargo:

```bash
cargo fmt --check --manifest-path backend/Cargo.toml
cargo test --locked --manifest-path backend/Cargo.toml
cargo build --release --locked --manifest-path backend/Cargo.toml
cargo audit --file backend/Cargo.lock
```

The complete local environment, frontend release flow, migrations, health
checks, and incident-response procedures still need consolidation. Production
changes must remain independently reversible and verified before reloads or
restarts.

## Git workflow

- Keep each security fix or feature in a focused, reviewable commit.
- Use imperative commit messages, preferably Conventional Commits such as
  `fix: restrict API CORS policy` or `feat: add responsive navigation`.
- Run the relevant checks before every commit.
- Never commit generated deployments, secrets, user data, logs, backups, or
  local audit output.

## Security

Please do not disclose exploitable vulnerabilities in a public issue. Report
them privately to the repository owner with reproduction steps, affected
components, impact, and a proposed mitigation. No security guarantee should be
inferred from the current snapshot; a full threat model and hardening pass are
in progress.
