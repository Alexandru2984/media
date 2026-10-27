# Media

Media is a social platform hosted at [media.micutu.com](https://media.micutu.com).
The application currently provides account management, email verification and
password recovery, user profiles, avatars, posts, image uploads, likes, and
comments.

> [!IMPORTANT]
> This repository currently contains an initial snapshot of production deploy
> artifacts, not the original application source or a reproducible build. Do
> not treat it as a deployable source checkout until the frontend and backend
> sources, lockfiles, migrations, tests, and build pipeline have been restored.

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

- Frontend: compiled JavaScript single-page application (the source framework
  is not recoverable from the current snapshot with sufficient confidence)
- API: Rust with Axum
- Data: MySQL
- Authentication: JWT-based authentication and bcrypt password hashes
- Email: SMTP for verification and password-reset messages
- Edge and origin: Cloudflare Tunnel, Nginx, and a systemd-managed API process

## Repository layout

```text
backend/
  .env                  # local production secrets; never committed
  social-media-backend  # generated executable; never committed
  uploads/              # user-generated content; never committed
frontend/
  index.html            # current SPA entry document
  assets/               # generated hashed bundles; never committed
```

The intended source layout will be documented once the source tree is
recovered. Generated artifacts and runtime data must stay out of Git.

## Development status

The immediate project goals are:

1. Recover or reconstruct the original frontend and backend source.
2. Add reproducible, locked builds and database migrations.
3. Establish automated tests, linting, dependency auditing, and CI.
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
- A redacted `.env.example` must be added alongside the restored source.
- Production secrets must be generated independently and rotated if exposure is
  suspected; examples and tests must use non-production values.

## Development and deployment

Local setup, tests, builds, migrations, release steps, health checks, rollback,
and incident-response procedures cannot yet be reproduced from this snapshot.
They will be added with the source recovery work. Until then, production
changes should be small, independently reversible, and verified before service
reloads or restarts.

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
