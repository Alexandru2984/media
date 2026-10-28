# Security Audit

**System:** Media (`media.micutu.com`)

**Audit date:** 2026-10-28

**Status:** Living audit; initial P0 containment complete, application hardening in progress

**Verdict:** 🟠 Core containment, revocable sessions, and versioned migrations are deployed; image re-encoding, authorization coverage, alerting, and recovery work remain

## Scope and limitations

The review covered the deployed frontend bundle, the compiled Rust backend,
public HTTP behavior, Nginx virtual-host configuration, the systemd service,
filesystem permissions, TLS behavior, and recoverable Rust dependency metadata.
Only low-volume, non-destructive public requests were made.

The legacy source and history were recovered on 2026-10-28, sanitized to remove
real user uploads, and merged with the hardened deployment repository. A Rust
lockfile and minimal unit tests now exist, and the backend was rebuilt and
deployed from the tracked source. Disposable accounts exercised login, session
lookup, individual/bulk remote logout, cross-account IDOR rejection, the
20-session cap, idle expiry, revoked-cookie rejection, and cleanup against canary
processes; the production database returned to zero users and sessions afterward.
A staging environment remains absent, so IDOR for other objects, privilege
boundaries, message privacy, and destructive actions are not yet safely covered
end to end. No evidence of compromise was found, but absence of evidence is not
evidence of absence.

## Executive summary

The service has a useful baseline: TLS 1.0/1.1 are rejected, the API and database
bind locally, the database account is not root, dotfiles are denied, SQLx bound
queries are visible in the binary, passwords use Argon2id, secrets are not short
placeholders, and core tables have foreign keys and uniqueness constraints.

Browser sessions now use hashed opaque server-side credentials with expiry,
activity tracking, and revocation; JWT and bearer-token support were removed.
Follow-up containment on 2026-10-28
recovered and sanitized the source history, replaced a publicly known hard-coded
JWT key, eliminated all known RustSec and npm audit findings, blocked direct-origin
access, added layered edge limits, restricted CORS, stopped access logging on
secret-bearing routes, sandboxed the API service, separated source from immutable
frontend releases, and deployed content-aware upload validation. Password bounds,
generic recovery responses, email configuration, and email-change verification
were also repaired. Browser-readable session storage was removed, unsafe API
methods now require the exact configured origin, one-time tokens are hashed at
rest, input boundaries are enforced server-side, engagement writes are
transactional, and feed N+1 queries were collapsed. Embedded versioned MySQL
migrations now replace startup DDL. Session inventory, scoped remote logout,
24-hour idle expiry, seven-day absolute expiry, and a 20-session account cap are
deployed. A private, data-minimized security-event timeline is also deployed
with per-user isolation and bounded retention. Centralized authorization tests,
image re-encoding, metrics/alerting, and tested recovery remain open. One-time links now
keep secrets in URL fragments, scrub them from browser history, and exchange them
through POST bodies. API requests emit redacted JSON events with request IDs,
status, path, and latency.

## Findings

### Critical

#### SEC-001 — Production source and build history were missing

**Status (2026-10-28): mitigated for source recovery and production release isolation.** The
legacy Git history was imported after removing user uploads from every imported
commit. Backend source, migrations, `Cargo.lock`, unit tests, and a reproducible
release command are tracked. Frontend source and `package-lock.json` are recovered;
Vite builds from `frontend/app`, writes to the ignored `frontend/dist`, and Nginx
serves an immutable release under `/var/lib/media` instead of the repository.
Direct requests for source paths no longer expose manifests or application source.

- At initial review, only a minified frontend bundle and an unstripped backend
  executable existed in this checkout.
- The initial checkout had no manifest, source, migration, test, or CI history.
- CI, staging, complete integration tests, signed provenance, and release
  automation remain open.

**Remediation:** recover the exact source and history if possible. Otherwise,
reconstruct behind a new test suite and migrate through a staging/canary release.
Require locked builds, checksums, an SBOM, migrations, and a rollback artifact.

#### SEC-001A — JWTs used a public hard-coded signing key

**Status (2026-10-28): retired and deployed.** Recovered source
revealed that `JWT_SECRET` was ignored and every token used the literal example
key `your-secret-key-here-change-in-production`. A non-destructive token for an
inexistent UUID proved that the live backend accepted that key. An intermediate
release corrected secret handling and rotated the key. The final remediation
removed JWT creation, validation, bearer-token routes, the dependency, and
frontend `localStorage` credentials. The retired migration endpoint returns
`404`, and the obsolete `JWT_SECRET` entry has been removed from the production
environment after a restricted local backup.

**Follow-up:** add session anomaly alerts and review logs and account activity for
evidence of forged-session use before the retirement.

### High

#### SEC-002 — Known vulnerable Rust dependency set in production

**Status (2026-10-28): mitigated and deployed.** The recovered graph originally
matched the nine advisories below. SQLx was upgraded from 0.7.4 to 0.9.0 with
default features disabled and only the required Tokio, MySQL, derive, UUID, and
Chrono features enabled. This removed the unused Rustls, WebPKI, RSA, Paste, and
PEM dependency branches. The unmaintained `dotenv` crate was replaced by
`dotenvy`, and unused direct dependencies were removed.

| Package | Original version | Advisory | Notes |
| --- | ---: | --- | --- |
| `rsa` | 0.9.10 | RUSTSEC-2023-0071 | Timing side channel; no patched stable release listed |
| `rustls` | 0.21.12 | RUSTSEC-2026-0346 | Conditional client-session secret disclosure |
| `rustls` | 0.21.12 | RUSTSEC-2026-0349 | Conditional key-exchange downgrade |
| `rustls-webpki` | 0.101.7 | RUSTSEC-2026-0382 | Distrusted intermediates may be accepted |
| `rustls-webpki` | 0.101.7 | RUSTSEC-2026-0099 | Incorrect wildcard name constraints |
| `rustls-webpki` | 0.101.7 | RUSTSEC-2026-0098 | URI name constraints ignored |
| `rustls-webpki` | 0.101.7 | RUSTSEC-2026-0104 | Conditional CRL parsing panic |
| `sqlx` | 0.7.4 | RUSTSEC-2024-0363 | Binary protocol integer cast issue; fixed in 0.8.1+ |
| `webpki-roots` | 0.25.4 | RUSTSEC-2026-0381 | Bundled trust store includes distrusted intermediates |

The locked graph dropped from 296 to 242 packages. `cargo clippy --all-targets
-- -D warnings`, unit tests, a release build, and `cargo audit` all pass. The
candidate connected to the production database and passed API, session, CORS, and
upload-serving smoke tests before atomic deployment. RustSec reported no known
vulnerabilities or maintenance warnings in the deployed lockfile.

**Follow-up:** enforce the same locked checks in CI, schedule recurring advisory
scans, review SMTP TLS separately, and reassess the feature set if the database
ever moves off loopback or changes authentication method.

#### SEC-003 — XSS can become immediate account takeover

**Status (2026-10-28): browser token exposure and session replay mitigated; CSP
work remains.** The site-specific CSP now denies objects, base URL changes,
foreign form actions, inline event-handler attributes, and inline style elements.
Cloudflare injects a dynamic inline challenge script at the edge, so `script-src
'unsafe-inline'` cannot yet be removed without changing that Cloudflare feature.
The compiled app also relies heavily on inline style attributes.

- New sessions use a `__Host-media_session` cookie with `Secure`, `HttpOnly`,
  `SameSite=Strict`, and host-only scope. Login/register responses no longer copy
  the credential into JSON.
- The frontend deletes any legacy `localStorage` token and never reads or sends
  bearer credentials; the backend no longer accepts them.
- Unsafe API methods require the exact configured `Origin`, mitigating cookie-
  based CSRF including untrusted sibling sites.
- The CSP still permits inline scripts and style attributes for the compatibility
  constraints above.
- Only a SHA-256 digest of each high-entropy token is stored. Logout revokes the
  current session; password and verified-email changes revoke all sessions.
- Active-session inventory, individual/bulk remote logout, a 24-hour idle timeout,
  seven-day absolute timeout, and a 20-session cap are deployed. IP addresses and
  User-Agent strings are deliberately not retained, so device labels are absent.

**Remediation:** add synchronizer CSRF tokens and anomaly alerts. Remove inline
code/styles and deploy a nonce- or hash-based CSP.

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

#### SEC-006 — Recovery and verification secrets traveled in query strings

**Status (2026-10-28): mitigated and deployed.** New email links place one-time
secrets in URL fragments, which are not transmitted to Cloudflare or Nginx. The
frontend immediately replaces the history entry and sends the secret only in a
POST JSON body; direct GET exchanges return `405`. Already-issued query-string
links remain compatible through the frontend and are scrubbed before the API
request. Access logging remains disabled on browser and exchange routes, which
also receive `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.

New one-time tokens are stored as SHA-256 digests and consumed transactionally;
legacy plaintext database records are accepted only for the migration window.
Third-party application analytics have been removed, sensitive routes are marked
`noindex`, token wildcard injection is rejected, and the email-change link
targets the correct route.

At initial review, the frontend routes used `?token=` for password reset, email
verification, and email change. Those query strings could enter Nginx logs,
browser history, screenshots, analytics page URLs, support reports, and
referrers.

**Follow-up:** expire the legacy plaintext-token migration window, add recovery
audit events without token material, and cover token reuse/expiry in integration
tests.

#### SEC-007 — Upload validation is insufficient

**Status (2026-10-28): content, ownership, and lifecycle controls improved; re-encoding remains open.** The upload tree is
now owned by `www-data:www-data` with `0750` directories and `0640` files, is the
service's only writable application path, and remains readable through Nginx.
Nginx enforces route-specific body limits and serves only selected image media
types. The backend now checks filename extension, declared MIME, magic bytes,
basic JPEG/PNG/WebP structure, and decoded dimensions before creating a
server-controlled filename. GIF, SVG, mismatches, excessive dimensions, and
malformed headers are rejected. Axum and Nginx multipart limits are aligned,
filesystem writes no longer block async workers, image paths are bound to the
authenticated owner's UUID, failed avatar writes are rolled back, and replaced
or deleted referenced images are removed safely. Abandoned pre-attachment
uploads, full decoder validation, metadata stripping, re-encoding, and quotas
remain open.

- The UI permits files up to 10 MB; the initial vhost had no explicit body limit.
- Upload handling still does not fully decode/re-encode images or cap processing
  time and decompression cost beyond header-derived pixel limits.
- Uploads are served from the primary origin, increasing active-content risk.
- At initial review, upload directories were `755 micu:micu` while the service
  ran as `www-data`, preventing backend writes.

**Remediation:** use a dedicated writable directory owned by the service, outside
the release tree; accept a minimal image allowlist; inspect magic bytes; decode
and re-encode; strip metadata; cap bytes, pixels, frames, and processing time;
generate names; reject SVG/HTML; scan when appropriate; and serve from a separate
cookieless media origin with strict content headers.

#### SEC-008 — Authentication controls are below a safe baseline

**Status (2026-10-28): password, recovery, cookie, CSRF-origin, and revocation
baseline improved.**

- Registration, password change, and reset now enforce 12 characters minimum and
  72 bytes maximum in both backend and frontend, retaining unambiguous
  compatibility while legacy bcrypt hashes remain.
- New credentials use Argon2id v19 with 19 MiB of memory, two iterations, one
  lane, random salts, and 32-byte outputs. Valid bcrypt and outdated Argon2id
  credentials are upgraded atomically at login or reauthentication.
- Password work runs outside the async executor and is capped at four concurrent
  jobs. Oversized stored Argon2 profiles are rejected before allocation, and
  unknown accounts with valid inputs take a comparable memory-hard path.
- Password recovery returns one generic response for existing and nonexistent
  accounts, and email-change verification rejects wildcard tokens.
- Login and reauthentication inputs are bounded before password verification.
- New browser sessions are script-inaccessible, and unsafe requests require the
  exact production origin.
- Server-side logout revocation is deployed; password and verified-email changes
  revoke every active session and password change rotates into a fresh session.
- Users can inspect active sessions and revoke one or all other sessions. Inactive
  sessions expire after 24 hours and each account is capped at 20.
- Users can inspect the last 50 important account-security events. Events contain
  only a server-controlled type and timestamp, are isolated by account, and are
  retained for at most 90 days and 100 records per user.
- No MFA/passkeys, recovery codes, breached-password check, or login alert was
  observed.

**Remediation:** add email verification gates, optional passkeys/TOTP, hashed
recovery codes, reauthentication for risk events, and generic auth/recovery
responses. The user-facing timeline is not a tamper-evident forensic audit log;
add a separately protected audit pipeline before relying on it for investigations.

#### SEC-009 — Detection, response, and recovery are not demonstrated

**Status (2026-10-28): health endpoints and privacy-redacted request logs deployed; alerting and recovery remain open.**

- `/api/health/live` and dependency-aware `/api/health/ready` are deployed and
  exercised after releases through Cloudflare.
- API requests emit JSON logs with a validated request ID, method, path, status,
  and latency. Query strings and bodies are deliberately excluded.
- API failures use non-cacheable problem JSON and repeat the request ID for
  support correlation without disclosing internal errors.
- A Media-specific incident runbook now covers classification, containment,
  evidence handling, upload rollback, secret rotation, recovery, and GDPR
  escalation. No alert, dashboard, named backup on-call, retention policy, live
  restore drill, or multi-person tabletop exists yet. Per-release rollback
  artifacts exist, but the process is not automated.

**Remediation:** define SLOs, metrics, actionable alerts, log retention,
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

**Status (2026-10-28): mitigated and deployed.** The backend now requires one
configured origin and an explicit method/header set. Nginx continues to hide
backend CORS headers from undocumented cross-origin clients.

At initial review, preflights from an unrelated origin received wildcard origin,
methods, and headers on auth and content endpoints.

**Remediation:** same-origin browser traffic needs no CORS. Disable it by default
or use an exact allowlist only for documented external clients. Never combine a
reflected arbitrary origin with credentials.

#### SEC-012 — Database schema is mutated at application startup

**Status (2026-10-28): mitigated with versioned migrations.** SQLx embeds and
records forward-only MySQL migrations in `_sqlx_migrations`; the recovered SQLite
artifact is explicitly disabled. Baseline and session migrations were applied
twice to an isolated schema, then through a production canary after a checksummed
root-only database dump. The application still owns migration privileges.

**Follow-up:** move production migration privileges into a separate role/job, add
schema-drift CI and migration rollback/restore drills.

#### SEC-013 — Insecure configuration fallbacks are embedded

**Status (2026-10-28): mitigated for security-sensitive production configuration.**
CORS, database, environment, SMTP credentials/sender, and application URLs now
fail closed or are validated at startup. Production application URLs require
HTTPS, database configuration has no embedded credential fallback, and SMTP
recipient addresses are no longer written to application logs. The SMTP port has
a conventional `587` default and the loopback server bind retains a safe default.

Placeholder values remain only in the non-secret `.env.example`; production
startup rejects missing required values.

**Remediation:** make production secrets and URLs mandatory, validate them at
startup, reject placeholders and non-loopback database defaults, and emit only
redacted configuration diagnostics.

#### SEC-014 — Sensitive responses lack explicit cache policy

**Status (2026-10-28): mitigated at Nginx.** API responses use `no-store`, SPA
documents revalidate, recovery routes add stricter no-store/no-referrer policy,
and content-hashed assets receive one-year immutable caching.

**Remediation:** use `no-store` on auth/private responses, `no-cache` or short
revalidation for HTML, and one-year immutable caching for content-hashed assets.

#### SEC-015 — Data consistency and indexing need source-level review

**Status (2026-10-28): core response, consistency, and query issues mitigated; integration coverage remains open.**
The database-only `User` type is no longer serializable, and profile-update
responses explicitly select safe fields, preventing accidental password-hash
serialization. Like/comment row and counter changes now share transactions,
counter decrements cannot become negative, and a production read-only integrity
check found no drift. Central server-side limits cover identity, posts, comments,
messages, pagination, passwords, email, and image paths. Feed, profile-post,
comment, and message N+1 queries were replaced with joins, and composite comment
and conversation indexes were deployed. Authenticated concurrency and query-plan
regression tests remain open.

Post like/comment counters remain denormalized, and database-level text length
constraints are not yet encoded in versioned migrations. Ownership checks exist
in handlers but still need a centralized authorization matrix and end-to-end IDOR
tests.

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

1. **Spoofing / elevation of privilege — medium likelihood, high impact:**
   credential stuffing, stolen opaque-session replay, or an untested authorization bypass.
2. **Information disclosure / tampering — medium likelihood, high impact:**
   unsafe upload handling, token leakage, IDOR, or a compromised unsandboxed API.
3. **Denial of service — medium likelihood, medium impact:** memory-hard password
   work is concurrency-bounded and edge-limited, while recovery email, upload,
   and database endpoints still need broader application-aware budgets.

### Blast radius

Worst case: all account emails and password hashes, private messages, posts,
profile data, media, one-time tokens, active session hashes, SMTP credentials,
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

- Incident response runbook: ✅ documented; live drill remains open
- Tested restore procedure: ❌ not found
- Tabletop exercise: ❌ not documented
- Pre-written user/regulator communications: ❌ not found

### Regulatory and vendors

GDPR is presumed relevant because the system is operated in the EU and processes
personal data. A qualifying personal-data breach may require supervisory-authority
notification within 72 hours. Vendors/processors in observed scope include the
hosting provider, Cloudflare, Brevo SMTP, GitHub, and Let's Encrypt; ownership,
DPAs, retention, regions, and last security review are unknown.

## Reference baseline

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [systemd execution sandboxing](https://www.freedesktop.org/software/systemd/man/systemd.exec.html)
- [RustSec Advisory Database](https://rustsec.org/)

## Exit criteria for the P0 gate

- Source and locked backend/frontend builds are recoverable from a clean checkout.
- Critical dependencies are upgraded and `cargo audit` has no unaccepted finding.
- Origin bypass, wildcard CORS, auth abuse, and upload permissions are fixed.
- Opaque cookie sessions, CSRF origin enforcement, token-log containment, and
  server-side revocation, inventory, idle expiry, and remote logout are deployed.
- systemd sandbox score is materially reduced without breaking required I/O.
- Health checks, alerts, backup restore, rollback, and incident ownership work.
- Authz/IDOR, recovery, upload, and data lifecycle tests pass on staging.
