# Media

Media is a social platform hosted at [media.micutu.com](https://media.micutu.com).
The application currently provides account management, email verification and
password recovery, user profiles, avatars, posts, image uploads, likes, and
comments. It also includes a paginated feed, community search, responsive mobile
navigation, active-session controls, a private security-activity timeline,
public project/community pages, and real HTTP 404 handling.

> [!IMPORTANT]
> The application source and its original history were recovered from the
> legacy `social_media` repository on 2026-10-28. Real user uploads were removed
> from the imported history. Both applications now have locked, tested release
> builds. Frontend source and build output are separated, and production Nginx
> serves an immutable release outside the repository.

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
- Authentication: hashed, revocable server-side sessions in a `__Host-`
  HttpOnly cookie; new passwords use Argon2id and legacy bcrypt hashes upgrade
  after a valid login
- Email: SMTP for verification and password-reset messages
- Edge and origin: Cloudflare Tunnel, Nginx, and a systemd-managed API process

## Repository layout

```text
backend/
  Cargo.toml / Cargo.lock # Rust manifest and locked dependency graph
  src/                  # Axum application source
  migrations/           # embedded, versioned MySQL migrations
  .env                  # local production secrets; never committed
  .env.example          # safe variable-name and development-value template
  social-media-backend  # generated executable; never committed
  uploads/              # user-generated content; never committed
frontend/
  package.json / package-lock.json # frontend manifest and lockfile
  app/
    src/                # Solid.js application source
    index.html          # SPA entry document and global metadata
  public/               # icon, manifest, robots policy, and sitemap
  dist/                 # generated release output; never committed
deploy/
  nginx/                # tracked vhost, snippets, and rate-limit zones
  systemd/              # tracked hardened API service unit
docs/                   # living security audit and delivery roadmap
```

Generated artifacts and runtime data must stay out of Git.

## Development status

The next project goals are:

1. Add login alerts, MFA/passkeys, breached-password screening, and stronger
   reauthentication for high-risk account changes.
2. Add database integration tests, browser CI, migration checks, and automated
   release/rollback workflows around the deployed versioned migrations.
3. Complete upload decode/re-encode, metadata stripping, quotas, and scheduled
   cleanup for abandoned uploads.
4. Add metrics, alerts, retention policy, and restore drills around the deployed
   health endpoints and privacy-redacted JSON request logs.
5. Expand the responsive product with relationships, notifications, moderation,
   privacy controls, cursor pagination, and richer discovery.
6. Add server-rendered or pre-rendered public profiles/posts, privacy/terms/help
   pages, Search Console integration, and real-user Core Web Vitals monitoring.

See the [security audit](docs/SECURITY_AUDIT.md) and the
[implementation roadmap](docs/ROADMAP.md) for the current findings, priorities,
and planned product work.

## Configuration

Runtime configuration is supplied through environment variables. The current
deployment uses values for the application URLs, allowed CORS origin, database,
SMTP, environment, and loopback server binding. Authentication tokens are random
opaque values; no signing secret or browser-readable credential is used.

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
cargo clippy --locked --manifest-path backend/Cargo.toml --all-targets -- -D warnings
cargo test --locked --manifest-path backend/Cargo.toml
cargo build --release --locked --manifest-path backend/Cargo.toml
cargo audit --file backend/Cargo.lock
```

The complete local environment, frontend release flow, migrations, health
checks, and incident-response procedures still need consolidation. Production
changes must remain independently reversible and verified before reloads or
restarts.

Frontend checks and its production build run from the `frontend` directory:

```bash
npm ci
npm audit --audit-level=low
npm run build
```

Vite writes the generated application to `frontend/dist`; that directory must
never be used as a source directory or committed.

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
