# Security Audit

**System:** Media (`media.micutu.com`)

**Audit date:** 2026-10-28

**Status:** Initial unauthenticated production audit

**Verdict:** 🔴 Mitigate P0 risks before feature expansion

## Scope and limitations

The review covered the deployed frontend bundle, the compiled Rust backend,
public HTTP behavior, Nginx virtual-host configuration, the systemd service,
filesystem permissions, TLS behavior, and recoverable Rust dependency metadata.
Only low-volume, non-destructive public requests were made.

The original source, lockfiles, tests, database migrations, authenticated test
accounts, and a staging environment are absent. Consequently, this review does
not claim complete code coverage and could not safely test IDOR, privilege
boundaries, authenticated uploads, account recovery, message privacy, or
destructive actions. No evidence of compromise was found, but absence of
evidence is not evidence of absence.

## Executive summary

The service has a useful baseline: TLS 1.0/1.1 are rejected, the API and database
bind locally, the database account is not root, dotfiles are denied, SQLx bound
queries are visible in the binary, passwords use bcrypt, secrets are not short
placeholders, and core tables have foreign keys and uniqueness constraints.

The system is nevertheless not ready for broad feature development. The source
and reproducible build are missing, the production binary matches nine RustSec
vulnerabilities, browser sessions are exposed to XSS through `localStorage`, and
recovery tokens may still enter URLs, analytics, and browser history. Follow-up
containment on 2026-10-28 blocked direct-origin access, added edge limits, hid the
backend's wildcard CORS headers, stopped access logging on secret-bearing routes,
sandboxed the API service, and repaired upload ownership. Application-level
authorization, upload validation, session security, dependency upgrades, and
observability remain open.

## Findings

### Critical

#### SEC-001 — Production cannot be reproduced or patched from source

- Only a minified frontend bundle and an unstripped backend executable exist.
- There is no `Cargo.toml`, `Cargo.lock`, package manifest, source tree, migration
  history, test suite, CI, or release procedure.
- A security patch cannot currently be reviewed, rebuilt, or rolled back with
  confidence.

**Remediation:** recover the exact source and history if possible. Otherwise,
reconstruct behind a new test suite and migrate through a staging/canary release.
Require locked builds, checksums, an SBOM, migrations, and a rollback artifact.

### High

#### SEC-002 — Known vulnerable Rust dependency set in production

`cargo audit bin` recovered 95 dependencies and matched nine vulnerabilities
against a RustSec database updated on 2026-10-27.

| Package | Deployed | Advisory | Notes |
| --- | ---: | --- | --- |
| `bytes` | 1.10.1 | RUSTSEC-2026-0007 | Memory corruption; fixed in 1.11.1+ |
| `lettre` | 0.11.19 | RUSTSEC-2026-0141 | BoringTLS-only; that feature was not observed |
| `rsa` | 0.9.8 | RUSTSEC-2023-0071 | Timing side channel; no patched stable release listed |
| `rustls` | 0.21.12 | RUSTSEC-2026-0346 | Conditional client-session secret disclosure |
| `rustls` | 0.21.12 | RUSTSEC-2026-0349 | Conditional key-exchange downgrade |
| `rustls-webpki` | 0.101.7 | RUSTSEC-2026-0382 | Distrusted intermediates may be accepted |
| `rustls-webpki` | 0.101.7 | RUSTSEC-2026-0099 | Incorrect wildcard name constraints |
| `rustls-webpki` | 0.101.7 | RUSTSEC-2026-0098 | URI name constraints ignored |
| `rustls-webpki` | 0.101.7 | RUSTSEC-2026-0104 | Conditional CRL parsing panic |

Additional warnings include unsound versions of `anyhow 1.0.100`, `rand 0.8.5`,
and `tokio 1.48.0`; unmaintained `dotenv 0.15.0` and `rustls-pemfile 1.0.4`;
and yanked `spin 0.9.8`. Reachability must be confirmed from restored source, but
the dependency set should be upgraded as a unit and regression-tested.

#### SEC-003 — XSS can become immediate account takeover

- The frontend stores the bearer JWT in `localStorage`.
- The CSP permits `'unsafe-inline'` for scripts and styles.
- The token persists across browser sessions and is available to any JavaScript
  executing on the origin.

**Remediation:** replace browser-readable bearer tokens with an opaque server-side
session in a `__Host-` prefixed `Secure; HttpOnly; SameSite` cookie. Add CSRF
protection, rotation, revocation, idle/absolute expiry, and a session-management
screen. Remove inline code/styles and deploy a nonce- or hash-based CSP.

#### SEC-004 — Cloudflare can be bypassed and auth abuse is not throttled

**Status (2026-10-28): partially mitigated at the origin.** Nginx now rejects
direct external origin traffic, preserves loopback access for Cloudflare Tunnel,
and applies separate connection, auth, write, upload, and general API limits.
The backend still needs account-aware throttling and abuse telemetry.

- At initial review, direct-origin HTTP/TLS requests returned the application.
- The Nginx Cloudflare-origin variable existed but was not enforced by the vhost.
- No Media-specific Nginx rate/connection zones existed at initial review.
- No application-level throttling dependency or response was observable.

**Remediation:** allow the public application only from verified Cloudflare edge
ranges (plus explicit loopback health checks), preserve ACME safely, and enforce
layered limits for login/register/recovery, uploads, writes, reads, and concurrent
connections. Add account-aware throttling and abuse telemetry in the application.

#### SEC-005 — systemd process has almost no sandbox

**Status (2026-10-28): mitigated and deployed.** The tracked production unit now
uses an empty capability set, strict filesystem protection with one explicit
writable path, private temp/devices/mounts, namespace and syscall restrictions,
resource ceilings, and a restrictive umask. `systemd-analyze security` reports
`1.5 OK`; local and tunneled API smoke checks pass after restart.

At initial review, `systemd-analyze security` reported `9.2 UNSAFE`. The service
lacked `NoNewPrivileges`, `ProtectSystem`, `ProtectHome`, `PrivateTmp`,
`PrivateDevices`, capability restrictions, namespace restrictions, syscall
filtering, and a restrictive `UMask`.

**Remediation:** start with `NoNewPrivileges=true`, an empty capability set,
`ProtectSystem=strict`, explicit read/write paths, home/kernel/control-group
protection, private temp/devices, restricted address families/namespaces, and
resource limits. Validate email, MySQL, DNS, and uploads on staging before rollout.

#### SEC-006 — Recovery and verification secrets travel in query strings

**Status (2026-10-28): partially mitigated at Nginx.** Access logging is disabled
for the known recovery and verification routes, and those responses receive
`Cache-Control: no-store` and `Referrer-Policy: no-referrer`. URL tokens,
storage design, browser history, and the POST exchange still require source
changes. Umami query-string collection is disabled globally, and sensitive
routes are marked `noindex`.

The frontend routes use `?token=` for password reset, email verification, and
email change. Query strings can enter Nginx logs, browser history, screenshots,
analytics page URLs, support reports, and referrers.

**Remediation:** exchange a one-time token through a POST body, hash tokens at
rest, make them single-use and short-lived, immediately remove secrets from the
address bar, disable analytics on secret-bearing routes, redact request logging,
and return `Referrer-Policy: no-referrer` plus `Cache-Control: no-store`.

#### SEC-007 — Upload validation is unverifiable

**Status (2026-10-28): filesystem and edge limits mitigated.** The upload tree is
now owned by `www-data:www-data` with `0750` directories and `0640` files, is the
service's only writable application path, and remains readable through Nginx.
Nginx enforces route-specific body limits and serves only selected image media
types. Content validation and re-encoding remain unverified without source.

- The UI permits files up to 10 MB; the initial vhost had no explicit body limit.
- Extension, MIME, magic-byte, decoded-image, dimension, and decompression limits
  cannot be verified without source.
- Uploads are served from the primary origin, increasing active-content risk.
- At initial review, upload directories were `755 micu:micu` while the service
  ran as `www-data`, preventing backend writes.

**Remediation:** use a dedicated writable directory owned by the service, outside
the release tree; accept a minimal image allowlist; inspect magic bytes; decode
and re-encode; strip metadata; cap bytes, pixels, frames, and processing time;
generate names; reject SVG/HTML; scan when appropriate; and serve from a separate
cookieless media origin with strict content headers.

#### SEC-008 — Authentication controls are below a safe baseline

- Client validation accepts passwords with six characters.
- No MFA/passkeys, server-side session revocation, recovery codes, breached-
  password check, security event history, or login alert was observed.
- JWT claims visible in the binary appear minimal; issuer, audience, token ID,
  rotation, and revocation could not be verified.

**Remediation:** adopt modern password guidance, Argon2id for new hashes with
transparent migration, email verification gates, optional passkeys/TOTP, hashed
recovery codes, server-side sessions, reauthentication for risk events, and
generic auth/recovery responses.

#### SEC-009 — Detection, response, and recovery are not demonstrated

- There is no health/readiness endpoint.
- No Media-specific structured security log, alert, dashboard, on-call path,
  incident runbook, tested restore, or documented rollback was found.
- Application errors are mostly empty responses or console messages.

**Remediation:** define SLOs, structured redacted logs, metrics, actionable alerts,
backup/restore tests, a rollback command, and tabletop-tested incident runbooks.

#### SEC-010 — Privacy and data lifecycle controls are not demonstrated

The database can hold emails, password hashes, private messages, posts, profile
data, recovery tokens, and user media. No retention schedule, consent record,
export/delete workflow, processor inventory, privacy policy implementation, or
breach communication template was found.

**Remediation:** perform a data inventory and DPIA screening, minimize retained
data, implement export/delete and retention jobs, document lawful bases and
processors, and test the GDPR incident workflow.

### Medium

#### SEC-011 — CORS trusts every origin, method, and header

Preflights from an unrelated origin receive wildcard origin, methods, and headers
on auth and content endpoints, despite a configured production origin.

**Remediation:** same-origin browser traffic needs no CORS. Disable it by default
or use an exact allowlist only for documented external clients. Never combine a
reflected arbitrary origin with credentials.

#### SEC-012 — Database schema is mutated at application startup

The binary contains `CREATE TABLE IF NOT EXISTS` and index statements instead of
versioned migrations. This hides drift, prevents reliable rollback, and couples
application startup to DDL privileges.

**Remediation:** add forward-only reviewed migrations, schema versioning, a
separate migration role/job, transaction-safe data changes, and restore tests.

#### SEC-013 — Insecure configuration fallbacks are embedded

The executable includes development defaults for the database, JWT key, SMTP,
and application URL. Production currently supplies stronger values, but a missing
environment file may start an unsafe configuration instead of failing closed.

**Remediation:** make production secrets and URLs mandatory, validate them at
startup, reject placeholders and non-loopback database defaults, and emit only
redacted configuration diagnostics.

#### SEC-014 — Sensitive responses lack explicit cache policy

API and auth responses do not consistently return `Cache-Control: no-store`.
The SPA document also has no explicit revalidation policy, while hashed assets
receive only a short edge cache lifetime.

**Remediation:** use `no-store` on auth/private responses, `no-cache` or short
revalidation for HTML, and one-year immutable caching for content-hashed assets.

#### SEC-015 — Data consistency and indexing need source-level review

Post like/comment counters are denormalized and likely updated separately from
their rows. The schema lacks visible length constraints and some useful composite
indexes. Correct ownership checks and transaction boundaries cannot be proven.

**Remediation:** add authorization matrix tests, transactions, nonnegative counter
guards or derived counts, content length constraints, normalized email/username
keys, and query-plan tests for feeds, messages, and moderation.

### Low

#### SEC-016 — Production binary exposes implementation detail

The executable is unstripped and exposes module names, schema, SQL, dependency
paths, compiler version, fallback configuration, and handler names.

**Remediation:** produce a release build with debug symbols separated/stripped,
while retaining an auditable SBOM and symbol artifact in restricted storage.

#### SEC-017 — Framework errors are returned verbatim

Malformed JSON returns an Axum deserialization message with internal target-field
detail. Other failures often return empty bodies, making clients inconsistent.

**Remediation:** use a stable JSON problem format with request IDs and safe public
messages; keep detailed causes only in redacted server logs.

## CISO review

### Threat model (STRIDE)

1. **Spoofing / elevation of privilege — high likelihood, high impact:** stolen
   browser JWT through XSS, session replay, or credential stuffing.
2. **Information disclosure / tampering — medium likelihood, high impact:**
   unsafe upload handling, token leakage, IDOR, or a compromised unsandboxed API.
3. **Denial of service — high likelihood, medium impact:** expensive bcrypt,
   recovery email, upload, and database endpoints without layered limits.

### Blast radius

Worst case: all account emails and password hashes, private messages, posts,
profile data, media, one-time tokens, the JWT signing secret, SMTP credentials,
and database credentials available to the application could be exposed or
modified. The user count and revenue impact were not available, so a defensible
FAIR annualized-loss estimate cannot yet be produced. Inventory user count,
revenue, incident cost, and control frequency before assigning an ALE.

### Detection

- **Target MTTD:** 15 minutes for account takeover, credential stuffing, mass
  export, or upload abuse; 5 minutes for outage/resource exhaustion.
- **Current MTTD:** unknown and potentially unbounded.
- **Required detections:** auth failure velocity, session anomalies, recovery
  bursts, upload rejects, 4xx/5xx shifts, DB error/latency, process restarts,
  privilege changes, high egress, and integrity changes to release/config files.

### Response

- Incident response runbook: ❌ not found
- Tested restore procedure: ❌ not found
- Tabletop exercise: ❌ not documented
- Pre-written user/regulator communications: ❌ not found

### Regulatory and vendors

GDPR is presumed relevant because the system is operated in the EU and processes
personal data. A qualifying personal-data breach may require supervisory-authority
notification within 72 hours. Vendors/processors in observed scope include the
hosting provider, Cloudflare, Brevo SMTP, GitHub, Let's Encrypt, and the analytics
service; ownership, DPAs, retention, regions, and last security review are unknown.

## Reference baseline

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [systemd execution sandboxing](https://www.freedesktop.org/software/systemd/man/systemd.exec.html)
- [RustSec Advisory Database](https://rustsec.org/)

## Exit criteria for the P0 gate

- Source and locked builds are recoverable from a clean checkout.
- Critical dependencies are upgraded and `cargo audit` has no unaccepted finding.
- Origin bypass, wildcard CORS, auth abuse, and upload permissions are fixed.
- Session migration and token-log containment are designed and tested.
- systemd sandbox score is materially reduced without breaking required I/O.
- Health checks, alerts, backup restore, rollback, and incident ownership work.
- Authz/IDOR, recovery, upload, and data lifecycle tests pass on staging.
