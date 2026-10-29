# Security Audit

**System:** Media (`media.micutu.com`)

**Audit date:** 2026-10-29

**Status:** Living audit; initial P0 containment complete, application hardening in progress

**Verdict:** 🟠 Core containment, revocable sessions, versioned migrations,
bounded image re-encoding, user-facing export/deletion controls, private-account
audiences, block-aware social relationships, bounded in-app notifications, and
bounded private trust-and-safety controls are deployed; SMTP delivery is
currently broken, while privileged moderation, broader authorization, privacy
governance, alerting, and recovery work remain

## Scope and limitations

The review covered the deployed frontend bundle, the compiled Rust backend,
public HTTP behavior, Nginx virtual-host configuration, the systemd service,
filesystem permissions, TLS behavior, and recoverable Rust dependency metadata.
The initial review used only low-volume, non-destructive public requests; later
releases used isolated disposable accounts for scoped destructive canaries.

The legacy source and history were recovered on 2026-10-28, sanitized to remove
real user uploads, and merged with the hardened deployment repository. A Rust
lockfile and minimal unit tests now exist, and the backend was rebuilt and
deployed from the tracked source. Disposable accounts exercised login, session
lookup, individual/bulk remote logout, cross-account IDOR rejection, the
20-session cap, idle expiry, revoked-cookie rejection, private saved-post
isolation, export credential exclusion, password/confirmation rejection,
engagement-counter reconciliation, account cascades, physical media cleanup,
follow idempotency, private follow requests, audience revocation, relationship
lists, following-feed isolation, private search/saved filtering, protected media,
bidirectional block filtering, blocked-message rejection, notification IDOR,
deduplication, read state, 500-row retention, source-action cleanup, account
mute, post hide, reporter-only access, duplicate-report rejection, and export v5
against canary processes. Both a
separate-port production-database canary and a Cloudflare Tunnel canary removed
their disposable accounts; the database returned to zero users, sessions, posts,
relationships, pending requests, blocks, mutes, hidden posts, reports, report
rate events, messages, saved rows, managed uploads, queued deletions, and
notifications afterward. A staging environment remains
absent, so IDOR for every object and future privilege boundary is not yet broadly
covered end to end. No evidence of compromise was found, but absence of evidence
is not evidence of absence.

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
with per-user isolation and bounded retention. Image re-encoding, upload quotas,
and abandoned-file cleanup are deployed. Private saved posts use session-scoped
state, transactional toggles, bounded pagination, and foreign-key cleanup; a
two-account production canary verified that saved state does not cross account
boundaries. Password-confirmed JSON export and double-confirmed account deletion
are deployed with strict-origin enforcement, edge throttling, secret-free export
DTOs, transactional counter repair, and a durable upload-deletion queue.
Follow/block writes now use FK-backed, self-relation-constrained tables,
deterministic transactional locks, a per-account following cap, and a dedicated
edge write budget. A block removes follows in both directions and is enforced on
authenticated feeds, search, profile/posts, follower lists, comments,
interactions, and message reads/writes. Relationship data is included in account
exports and removed by account cascades.
Private accounts keep accepted followers while routing new follows through a
bounded request inbox. The same audience rule filters feed, profile, search,
saved, connection, comment, like, save, and media paths. Nginx uses an internal
authorization subrequest for post files, denies stale opaque paths without an
existence oracle, and prevents browser/CDN storage with `private, no-store`.
An isolated three-account matrix and a Cloudflare Tunnel canary verified pending,
accepted, revoked, blocked, public-transition, export-v3, and physical-cleanup
states. The canary returned the production database to zero application rows.
Mute and personal-hide controls are now FK-backed, account-capped, and enforced
across discovery surfaces; muting also suppresses notification creation. Private
report intake uses an allowlisted target/reason shape, reporter-only reads and
withdrawals, one open report per reporter/target, a 100-record open cap, and a
separate seven-day event ledger that enforces 20 submissions per rolling day
even if reports are withdrawn. No privileged moderation endpoint exists yet.
Centralized authorization tests, privacy governance, metrics/alerting, and tested
recovery remain open. One-time links now
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
Relationship mutations now receive a stricter dedicated write budget. The
backend still needs account-aware throttling and abuse telemetry.

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

**Status (2026-10-29): content decoding, metadata removal, ownership, quotas, and
bounded abandoned-file cleanup deployed.** The upload tree is
now owned by `www-data:www-data` with `0750` directories and `0640` files, is the
service's only writable application path, and remains readable through Nginx.
Nginx enforces route-specific body limits and serves only selected image media
types. The backend now checks filename extension, declared MIME, magic bytes,
basic JPEG/PNG/WebP structure, and decoded dimensions before fully decoding and
re-encoding pixels into the same controlled format. EXIF orientation is applied,
then EXIF/comments/XMP/ICC data are discarded. GIF, SVG, mismatches, excessive
dimensions, malformed streams, and oversized encoded results are rejected.
Decoder work has per-file memory/pixel/dimension limits, a global two-job budget,
blocking-pool isolation, and a systemd memory ceiling. Avatars are capped at 1024
px. Axum and Nginx multipart limits are aligned, filesystem writes no longer
block async workers, image paths are bound to the authenticated owner's UUID,
failed avatar writes are rolled back, and replaced or deleted referenced images
are removed safely. A `managed_uploads` registry now records owner, type, encoded
bytes, attachment, and lifecycle state for every new upload. Each account is
limited to 100 MiB and five pending post images. A post image can be claimed only
once, only by its owner, and in the same transaction as post creation or update.
Pending images expire after 24 hours, incomplete writes after one hour, and
deletions remain retryable until a bounded 15-minute maintenance pass removes
both file and row. Historical unregistered files are not deleted automatically.

- The UI permits files up to 10 MB; the initial vhost had no explicit body limit.
- Processing is now bounded by encoded bytes, decoded bytes, dimensions, pixels,
  concurrency, endpoint rate limits, and the service memory cgroup. A hard
  per-job CPU timeout is not available because blocking decoders cannot be safely
  cancelled mid-operation; concurrency remains the primary CPU containment.
- Uploads are served from the primary origin, increasing active-content risk.
- At initial review, upload directories were `755 micu:micu` while the service
  ran as `www-data`, preventing backend writes.

**Follow-up:** add responsive derivatives, deduplication, decoder performance
telemetry, queue alerts, and a separate cookieless media origin. Reassess the
locked image stack promptly when decoder advisories appear.

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

#### SEC-010 — Privacy and data lifecycle controls are incomplete

**Status (2026-10-29): export and account deletion partially mitigate the
finding; governance and retention remain open.** The database can hold emails,
password hashes, private messages, posts, profile data, recovery tokens, and user
media.

- An authenticated export requires the current password, takes one consistent
  database snapshot, and returns only explicit DTOs. Password hashes, session
  token hashes, and one-time token values are excluded. Export generation is
  recorded in the private security timeline and responses are `no-store`.
- Export format version 5 includes followers, followed accounts, incoming and
  outgoing requests, privacy state, blocked/muted accounts, hidden posts, open
  reports, and the bounded report-submission ledger without exposing credential
  or token material.
- Synchronous export is bounded at 10,000 related records to protect the API;
  an asynchronous, encrypted delivery flow is still required for larger accounts.
- Deletion requires the current password, the exact `STERGE CONTUL` phrase, the
  configured origin, and a second browser confirmation. The edge applies the
  stricter auth rate budget to both privacy endpoints.
- Owned media URLs are copied transactionally into an FK-independent deletion
  queue before the user cascade. A bounded worker rechecks live references,
  removes only flat owner-bound paths, retries I/O failures, and refuses unsafe
  paths. Likes/comments removed from other users' posts decrement their cached
  counters in the same transaction.
- A two-account production canary verified wrong-password/confirmation rejection,
  export coverage and credential exclusion, session invalidation, database
  cascades, counter reconciliation, physical file deletion, and an empty queue.

No complete data inventory, retention schedule, consent/lawful-basis record,
legal-hold procedure, processor inventory, privacy policy implementation, or
breach communication template was found. This feature is not by itself a claim
of GDPR compliance.

**Remediation:** perform a data inventory and DPIA screening, minimize retained
data, add asynchronous export and retention jobs, define deletion behavior for
backups/legal holds, document lawful bases and processors, publish the privacy
policy, and test the GDPR incident workflow.

#### SEC-018 — Production email delivery is unavailable

**Status (2026-10-29): open, P1 operational incident.** Registration can still
create accounts, but both isolated and production canaries received permanent
Brevo SMTP `535 Authentication failed` responses. The production service journal
shows the same failure. Verification, password-reset delivery, email-change
confirmation, and any future email notification cannot be relied on until the
credential is repaired. No SMTP secret was printed, copied into Git, or replaced
with a guessed value during this review.

**Remediation:** rotate the Brevo SMTP credential in the protected environment,
revoke the rejected credential, send verification and password-reset messages to
an owner-controlled test mailbox, confirm TLS/sender-domain configuration, and
add delivery-failure metrics plus an alert. Do not claim recovery availability
until the end-to-end mailbox test passes.

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

**Status (2026-10-29): core response, consistency, relationship authorization,
and query issues mitigated; broad integration coverage remains open.**
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

Follow and block records now use cascading foreign keys, self-relation checks,
composite indexes, bounded pagination, and a 5,000-following cap. Follow is
idempotent and serialized with block changes; block atomically removes follow
edges in both directions. Authenticated feed, saved content, search, profiles,
profile posts, connection lists, comments, likes, saves, and messages apply the
same bidirectional block rule. Disposable two-account canaries verified these
paths both on a separate backend port and through Cloudflare/Nginx.

Blocking remains an authenticated account-level control, not a network-level
privacy boundary for content the author intentionally leaves public. Private
accounts now require owner or accepted-follower access across content and media
paths; public profile identity metadata remains discoverable by design. Existing
likes, comments, saves, and historical messages are retained; they are hidden or
made inaccessible between blocked accounts rather than erased. Retention choices,
centralized policy tests, granular audiences, restrict controls, and abuse
telemetry remain required.

In-app notifications now store only event metadata, never copied post/comment
text. A unique recipient/event key groups repeated interactions, recipient row
locks serialize writes, and the oldest rows are pruned to a hard 500-record
maximum. Source actions remove stale like/follow/comment events, post/account
foreign keys cascade, and blocking deletes both directions atomically. List,
count, read, read-all, and delete operations authorize the recipient server-side;
the two-account canary confirmed cross-account mutation returns `404`.

Mute removes an actor from feeds, people/post search, saved results, comments,
and both stored/future notifications, while explicit profile access remains
available by design. Personal hide removes a post from feed/profile/search/saved
lists and is reversible from a private safety center. Reports store target
metadata and reporter-supplied context without copying target content. All
report list/delete queries scope by reporter; a cross-account deletion canary
returned `404`, duplicate open reports returned `409`, and FK cascades returned
the safety tables to zero rows. A moderation queue, immutable evidence snapshots,
appeals, moderator roles, step-up authentication, and action audit logs remain
explicitly out of scope for this release.

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

1. **Information disclosure / authorization bypass — high impact:** alternate
   feed, search, comment, saved, connection, interaction, or static-media paths
   could have bypassed a profile-only privacy check. One shared audience rule and
   an Nginx media authorization subrequest now cover the observed surfaces.
2. **Spoofing / elevation of privilege — medium likelihood, high impact:**
   credential stuffing, stolen opaque-session replay, or a future untested IDOR.
3. **Abuse / denial of service — medium likelihood, medium impact:** follow-request
   spam, relationship growth, and notifications are bounded per account and
   edge-limited, while recovery email, upload, and database endpoints still need
   account-aware budgets.

**Private-account review verdict:** mitigate then ship. Release gates were
transactional request/block races, 5,000 outgoing and 1,000 incoming pending
limits, server-side audience checks, non-cacheable protected media, export and
deletion coverage, isolated three-account tests, a Tunnel canary, rollback
artifacts, and zero application-row residue. SMTP recovery remains a separate
open P1 and is not accepted by this verdict.

**Notification review verdict:** ship with monitoring. Release gates were a
foreign-key schema, unique event grouping, transactional source-action updates,
the 500-record cap, bidirectional block cleanup, recipient-only mutations,
export-v4 coverage, isolated and Tunnel canaries, rollback artifacts, and zero
residual application rows. Automated notification-velocity/cap alerts and
granular preferences remain required.

**Trust-and-safety review verdict:** mitigate then ship for private user controls,
not for moderation. Release gates were reporter-scoped authorization, strict
target/reason validation, duplicate prevention, independent rolling anti-abuse
events, hard per-account caps, consistent mute/hide filtering, export-v5 and
deletion coverage, edge write limits, isolated/Tunnel canaries, rollback
artifacts, and zero residual application rows. A moderator surface remains
blocked on real roles/scopes, step-up authentication, evidence retention,
tamper-resistant action logs, and an appeals policy.

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
  bursts, follow/block/notification velocity, frequent notification-cap pruning,
  blocked-action denials, upload rejects, 4xx/5xx shifts, DB error/latency,
  process restarts, privilege changes, high egress, and integrity changes to
  release/config files.

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
