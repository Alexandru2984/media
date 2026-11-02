# Security Audit

**System:** Media (`media.micutu.com`)

**Audit date:** 2026-10-30

**Status:** Living audit; initial P0 containment complete, application hardening in progress

**Verdict:** 🟠 Core containment, revocable sessions, versioned migrations,
bounded image re-encoding, user-facing export/deletion controls, private-account
audiences, block-aware social relationships, bounded in-app notifications, and
bounded private trust-and-safety controls are deployed. Least-privilege report
moderation is also deployed with offline grants, password step-up, reporter
pseudonymity, self-moderation prevention, transactional transitions, and durable
action/role audit. SMTP delivery is currently broken, while broader
authorization, appeals/enforcement policy, privacy governance, alerting, and
recovery work remain

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
against canary processes. The moderation release additionally exercised regular
user rejection, offline role grants, pseudonymous queue reads, password-confirmed
claim, administrator override, reporter-safe terminal state, action audit,
administrator-only role audit, and export v6. Both a
separate-port production-database canary and a Cloudflare Tunnel canary removed
their disposable accounts; the database returned to zero users, sessions, posts,
relationships, pending requests, blocks, mutes, hidden posts, reports, report
rate events, moderation action/role events, messages, saved rows, managed
uploads, queued deletions, and notifications afterward. A staging environment remains
absent, so IDOR for every object and future privilege boundary is not yet broadly
covered end to end. No evidence of compromise was found, but absence of evidence
is not evidence of absence.

The notification-preference release additionally exercised strict full-payload
validation, all-enabled defaults, suppression and re-enablement for follower,
like, and comment events, export v7 coverage, and account-delete cascades against
a disposable isolated database. Its public Cloudflare Tunnel canary then
reconfirmed defaults, strict `422` rejection, suppression and re-enablement for
new-follower events, and export v7. One account deletion completed before the
edge mutation budget returned `429`; exact canary-only database cleanup removed
the remaining account and every checked application table returned to zero.

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
even if reports are withdrawn. Privileged moderation now uses explicit
`moderator`/`admin` roles, offline-only grants, database role-change audit,
per-request role checks, password-confirmed writes, row locks, assignment rules,
evidence snapshots, and transactional action audit. Reporter identity is omitted
from moderator DTOs, self-moderation remains forbidden after target deletion,
and terminal report decisions do not silently delete or suspend anything.
Appeals, user notices, enforcement actions, centralized authorization tests,
privacy governance, metrics/alerting, and tested recovery remain open. One-time links now
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
legal-hold procedure, approved processor inventory, formal operator/contact
notice, or breach communication template was found. A public privacy disclosure,
terms page, and help center now describe the implemented controls, vendors,
known SMTP incident, deletion caveats, and unfinished governance without claiming
GDPR compliance; they are not a substitute for legal review and approval.

**Remediation:** perform a data inventory and DPIA screening, minimize retained
data, add asynchronous export and retention jobs, define deletion behavior for
backups/legal holds, document lawful bases and processors, add verified operator
and private contact details, obtain legal approval for the public policy text,
and test the GDPR incident workflow.

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

All list handlers now share a strict pagination parser. Malformed, fractional,
negative, zero-limit, over-limit, and over-offset values return a generic `400`
instead of being silently coerced. General feed/profile offsets are capped at
10,000 rather than 1,000,000; notifications, follow requests, reports, mutes,
and hidden posts use their smaller storage budgets. This reduces deep-scan DoS
exposure while cursor pagination remains the long-term replacement.

The browser client now constructs dynamic API and profile URLs through shared
segment and query encoders. UUID-like values remain server-validated, but a
malformed route parameter or compromised response can no longer introduce a
slash, query parameter, or fragment into the intended navigation target. URL
contract tests run before every production build.

Browser storage access is isolated behind fail-safe helpers. A browser policy,
privacy mode, unavailable storage implementation, or quota exception can no
longer crash module initialization or theme mounting before the global recovery
boundary exists. Only `light` and `dark` are accepted from persistence, and the
legacy cleanup removes only the obsolete `token` key.

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
Five owner-only preferences now independently gate future follow-request,
follow-acceptance, new-follower, like, and comment events at the server-side
write boundary. Missing or unknown fields are rejected, every category defaults
to enabled for backward compatibility, existing history is left unchanged, and
the preference row follows the account deletion cascade. Account export format
v7 includes the effective settings even when no explicit row has yet been stored.

Mute removes an actor from feeds, people/post search, saved results, comments,
and both stored/future notifications, while explicit profile access remains
available by design. Personal hide removes a post from feed/profile/search/saved
lists and is reversible from a private safety center. Reports store target
labels plus bounded evidence excerpts and reporter-supplied context. All reporter
list/withdraw queries scope by reporter; a cross-account withdrawal canary
returned `404`, duplicate open reports returned `409`, and FK cascades returned
the safety tables to zero rows. The deployed moderation queue uses offline-granted
roles, current-role checks on every request, password step-up for every mutation,
row-locked state transitions, assignment ownership, administrator override, and
self-moderation checks against both reporter and snapshotted target actor. Queue
DTOs never include reporter identity. Resolution notes stay internal, while the
reporter sees only lifecycle state. Action events commit with transitions, and a
database trigger records every role change even when it occurs outside the API.
Role events survive account deletion for accountability; retention approval and
legal/privacy review remain open.

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

**Status (2026-10-30): mitigated and regression-tested.** Every API `4xx`/`5xx`
response is replaced by a bounded `application/problem+json` document containing
only the generic status title/code and a validated or server-generated request
ID. Responses are `no-store`; `HEAD` failures carry no body; successful JSON is
not rewritten. Nginx owns the final API cache policy and suppresses the backend
field before adding one canonical `Cache-Control: no-store` value.

Malformed JSON, internal failure, invalid request-ID, `HEAD`, and successful JSON
regressions cover the middleware. A public malformed-login canary confirmed that
Axum deserialization detail and submitted field names do not reach the client.
Detailed causes remain confined to privacy-redacted server logs.

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
quiet hours/digests remain required; granular preferences are now enforced at
notification creation and covered by export/deletion tests.

**Trust-and-safety review verdict:** mitigate then ship for private user controls
and non-destructive moderation triage. Release gates were reporter-scoped
authorization, strict target/reason validation, independent rolling anti-abuse
events, offline-granted roles, per-request authorization, password step-up,
row-locked transitions, reporter pseudonymity, evidence snapshots,
self-moderation prevention, database role audit, action audit, export-v6 and
deletion coverage, edge write limits, isolated/Tunnel canaries, rollback
artifacts, and zero residual application rows. Automated enforcement, appeals,
transparent notices, dual-control grants, approved retention/legal-hold policy,
and operational alerts remain outside this verdict.

### Moderation production checkpoint

The 2026-10-30 release applied migration `20261029007000`, deployed backend
SHA-256 `f80be03717a37f89aff0ee69171dc7c1ad82ee83252cdf845eee938a71a74b60`,
and activated frontend release `20261030T000952Z-b7bb7e7`. The public
Cloudflare Tunnel canary returned expected `403/200` role boundaries, excluded
reporter identity and internal notes, recorded claim/decision and role events,
and left users, sessions, tokens, reports, submission events, and both audit
tables at zero after scoped cleanup. Nginx produced no recent `5xx`, the service
retained zero unexpected restarts, and public liveness/readiness returned `200`.

Root-only rollback artifacts are
`media-binary-pre-moderation-20261030T000952Z-b7bb7e7`,
`media-nginx-pre-moderation-20261030T000952Z-b7bb7e7/`, and
`media-db-pre-moderation-20261030T000952Z-b7bb7e7.sql`. The old binary is not a
safe long-term target after real terminal moderation data exists; prefer a
forward fix unless a documented restore/data-loss decision is made. Strict
Clippy, 44 backend tests plus five seed tests, a release build, a 265-crate
RustSec scan with no findings, and npm build/audit with zero findings passed.
The host has no browser, so this screen was build/API/route tested but did not
receive a new visual-regression pass on the VPS. Brevo SMTP `535` remains an
independent open P1 incident.

### Notification-preference production checkpoint

The 2026-10-30 release applied migration `20261030000000`, deployed backend
SHA-256 `2ff86f22319d94f0cf5aae26aece2fe88a2d172e04ba838b1a28c7a1c102db0f`,
and activated frontend release `20261030T005331Z-94bb5a6`. Root-only rollback
artifacts are `media-binary-pre-notification-preferences-20261030T005331Z-94bb5a6`
and `media-db-pre-notification-preferences-20261030T005331Z-94bb5a6.sql` under
`/var/backups`, with a separate checksum manifest. Direct Nginx and public
Tunnel health checks returned `200`, the new anonymous endpoint boundary
returned `401`, immutable asset caching remained active, and the API service
retained zero unexpected restarts. Brevo still returned the known SMTP `535`.

### Public trust and crawlability checkpoint

The 2026-10-30 frontend release `20261030T005926Z-dda5e2a` added responsive
privacy, terms, and help pages plus build-time crawlable content for all six
stable public routes. Each route has distinct canonical/social metadata and
JSON-LD, while the sitemap contains only those six editorial URLs. Nginx's
explicit pre-render allowlist was expanded without changing the private-route
policy. Direct Nginx and Cloudflare Tunnel checks returned `200` for every
public route, an unknown route remained a real `404`, and `/login` retained
`X-Robots-Tag: noindex, nofollow, noarchive`.

The first promotion intentionally exercised the automatic rollback path when an
immediate smoke check raced Nginx worker convergence. The prior frontend and
configuration were restored successfully; a second promotion with bounded
polling passed. The root-only rollback artifact is
`media-nginx-pre-public-trust-20261030T005926Z-dda5e2a.conf` under
`/var/backups`, the prior frontend release remains immutable, and the API kept
zero unexpected restarts.

### Frontend performance checkpoint

Frontend release `20261030T010226Z-89d62c0` moved every non-home route into a
lazy chunk behind an accessible loading state. Entry JavaScript decreased from
219,850 bytes (61.77 KiB gzip) to 102,600 bytes (32.53 KiB gzip). The build now
enforces explicit entry/CSS/total-JavaScript budgets, six public-page canonical
and crawlability checks, sitemap cardinality, and absence of source maps. A
local preview served all 25 assets and eight sampled routes; the production
canary fetched the entry, profile, and privacy chunks through Cloudflare with
`200`, JavaScript MIME, and immutable caching. Homepage/readiness stayed `200`,
all services remained active, and the previous immutable frontend release is
the rollback target.

### Strict-pagination production checkpoint

Backend commit `8fe1995` deployed SHA-256
`b61231783b97f7b69c3e16cbd342beffcbe4052cc2e60f4cd905a82a67398e56`
on 2026-10-30 without a schema or data mutation. The public Cloudflare Tunnel
canary returned `200` for default pagination and the exact `limit=50`,
`offset=10000` boundary. Zero, negative, malformed, fractional, over-limit, and
over-offset inputs returned generic `400` problem responses without reflecting
query details; an unauthenticated private endpoint retained its auth-first `401`
boundary.

Direct and public liveness/readiness returned `200`. The API, Nginx, and
Cloudflare Tunnel services remained active with zero unexpected restarts; the
API journal contained no query strings and no warning-or-higher messages during
the canary. The root-only rollback binary is
`media-binary-pre-pagination-20261030T112302Z-8fe1995` and the immutable staged
candidate is `social-media-backend-20261030T112302Z-8fe1995`. The release used no
database backup because it performs no migration or data write; the existing
preference-release database backup remains the most recent schema checkpoint.

### Frontend recovery and accessibility checkpoint

Frontend release `20261030T112630Z-4aa95ac` adds a global lazy-chunk/render
error boundary with an auto-focused recovery screen, a live offline indicator,
and a keyboard skip link on every client route. The build gate now requires all
three runtime markers while retaining the entry, stylesheet, total-JavaScript,
source-map, crawlability, canonical, and sitemap checks. The measured entry is
105,241 bytes, CSS is 68,002 bytes, and total JavaScript is 234,942 bytes; all
remain within their enforced budgets. `npm audit --audit-level=low` returned no
findings.

The immutable release carries one generation of compatibility assets so tabs
that loaded the pre-error-boundary entry can still resolve their old lazy chunks
during this transition. Direct and public Cloudflare canaries verified the new
entry, a new profile chunk, the old entry chunk, JavaScript MIME, immutable
caching, all recovery markers, crawlable privacy HTML, private-route `noindex`,
a real unknown-route `404`, and public health. API, Nginx, and Tunnel services
retained zero unexpected restarts and no warning-or-higher journal messages.
The atomic symlink's rollback target is
`20261030T010226Z-89d62c0`; no schema, data, service restart, or Nginx reload was
required. The VPS has no browser, so this checkpoint does not claim a new visual
or screen-reader regression pass.

### Bounded frontend transport checkpoint

Frontend release `20261030T112913Z-bcdfdc7` routes JSON and multipart API calls
through one same-origin transport. Ordinary calls now abort after 15 seconds and
bounded image uploads after 45 seconds; explicit caller cancellation remains
distinct. Bodyless requests no longer send a misleading JSON content type,
multipart boundaries remain browser-generated, and timeout, network, abort, and
malformed-success responses expose only stable generic errors. Mutations are not
automatically retried, avoiding duplicate writes after an ambiguous timeout.

Eight Node contract tests run as a mandatory build prerequisite. The build and
zero-finding low-threshold npm audit passed; the 105,995-byte entry and
235,696-byte total JavaScript remain within enforced budgets. Direct and public
canaries verified the new entry, profile chunk, prior entry compatibility,
immutable JavaScript delivery, all transport/recovery runtime markers, bodyless
public API reads, health, and real `404` handling. API, Nginx, and Tunnel retained
zero unexpected restarts and no warning-or-higher journal events. The atomic
rollback release is `20261030T112630Z-4aa95ac`; no schema, data, service restart,
or configuration change was required. Browser interaction testing remains open
because the VPS has no browser runtime.

### Dynamic URL encoding checkpoint

Frontend release `20261030T113145Z-065e29e` applies shared encoding to every
dynamic API path segment and query value plus every profile navigation target.
Eleven mandatory Node contracts include path traversal, injected query
delimiters, nullish query handling, transport limits, and safe error behavior.
The production build and low-threshold npm audit passed with no findings; entry
JavaScript remained within budget at 106,071 bytes.

Direct and public Tunnel canaries verified the new entry, profile chunk, prior
entry compatibility, immutable JavaScript, and health. A percent-encoded `&`
remained part of one invalid pagination value and returned generic `400` rather
than introducing an `offset`; a percent-encoded slash in a user identifier
remained in the intended route and returned `404`. All services retained zero
unexpected restarts and no warning-or-higher journal events. The atomic rollback
release is `20261030T112913Z-bcdfdc7`; no backend, database, Nginx, or Tunnel
mutation was required.

### Fail-safe browser-storage checkpoint

Frontend release `20261030T113313Z-6eac6de` moves theme persistence and obsolete
token cleanup behind allowlisted, exception-safe storage helpers. Application
bootstrap and theme mounting now continue when Web Storage is absent, denied by
browser policy/privacy mode, or rejects writes. Fifteen mandatory Node contracts
cover denied getters, rejected writes, unavailable storage, invalid stored
themes, system preference, and exact legacy-key removal in addition to transport
and URL security.

The production build and zero-finding low-threshold npm audit passed; entry
JavaScript remained within budget at 106,301 bytes. Direct and public canaries
verified the new entry, profile chunk, prior entry compatibility, immutable
JavaScript, four crawlable public routes, health, and real `404` handling. API,
Nginx, and Tunnel retained zero unexpected restarts and no warning-or-higher
journal events, and production application users remained at zero. The atomic
rollback release is `20261030T113145Z-065e29e`; no backend, database, Nginx, or
Tunnel mutation was required. A real blocked-storage browser pass remains open
because this VPS has no browser runtime.

### Graceful API shutdown checkpoint

Backend commit `5e4f9fc` makes `SIGTERM` and `SIGINT` stop new accepts while
allowing in-flight requests to finish. Handler-installation failures are logged
without crashing the running API, and systemd's existing 15-second stop timeout
remains the non-negotiable bound against slow-request drain exhaustion.

Strict Clippy, 55 backend tests plus five seed tests, the locked release build,
and an isolated production-database signal canary passed. The canary proved that
new connections were refused after `SIGTERM`, an incomplete active request kept
the process alive, and closing that request produced a clean systemd `success`
result with no remaining process or listener.

The production binary checksum is
`c1b1393d41bb0e1d80b8a7a3d48b42a83d2f0fea3f882cc0f97dd77714d0026d`.
Direct and Cloudflare Tunnel liveness/readiness checks, the public feed, and a
generic invalid-pagination response passed. A controlled restart of the deployed
binary recorded the drain transition and returned to readiness; the API, Nginx,
and Tunnel are active with zero unexpected API restarts and no warning-or-higher
API journal events during the rollout. Production application users remained at
zero, and migration `20261030000000` remained current. No database, frontend,
Nginx, or Tunnel mutation was required.

The root-only rollback binary is
`/var/backups/media-binary-pre-graceful-shutdown-20261101T135646Z-5e4f9fc`;
the immutable deployed candidate is
`/var/lib/media/backend-candidates/social-media-backend-20261101T135646Z-5e4f9fc`.
Automated alerting, a multi-person tabletop, and a tested restore remain open.

### Mobile icon and build-tooling checkpoint

Lockfile commit `5c3da44` advances the transitive build-only `sucrase` package
from 3.35.0 to 3.35.1 and removes its vulnerable `glob`/`minimatch` subtree.
A clean `npm ci` and the low-threshold audit report zero known vulnerabilities;
no runtime dependency or vendor was added.

Frontend commit `fe8768a` adds deterministic 192 px and 512 px standard icons,
an opaque 512 px maskable icon with a safe logo area, and a 180 px Apple touch
icon. The manifest and HTML expose the matching mobile metadata. The production
gate now validates navigation scope, standalone display, shell colors, icon
purposes, PNG signatures, exact dimensions, and the existing JavaScript/CSS
budgets. No service worker or offline cache was introduced, so authenticated API
responses are not persisted by this release.

Fifteen Node contracts, a clean locked install, production build, and audit
passed. Entry JavaScript remained 106,301 bytes, CSS 68,002 bytes, and total
JavaScript 235,914 bytes. Direct-origin and Cloudflare Tunnel canaries verified
the HTML link, all manifest icon entries, `image/png` responses with exact byte
sizes, the maskable checksum, API readiness, and real unknown-route `404`
behavior. The API, Nginx, and Tunnel remained active with zero unexpected API
restarts. An unrelated request for `/.git/HEAD` during the checkpoint was denied
by the existing dotfile rule as designed.

Frontend release `20261101T140207Z-fe8768a` is active. Its atomic rollback target
is `20261030T113313Z-6eac6de`; no database, backend, Nginx, or Tunnel mutation was
required. Browser installation testing remains open because the VPS has no
browser runtime.

### Generated sitemap consistency checkpoint

Frontend commit `56706e0` removes the independently maintained source sitemap.
The same route registry now generates each public page's JSON-LD modification
date and the complete sitemap, preventing metadata drift. The production gate
rejects missing or duplicate URLs, malformed modification dates, unsupported
change frequencies, public `noindex`, and any canonical/date mismatch between a
page and its sitemap record.

Fifteen Node contracts, the production build, the extended six-page SEO gate,
and a zero-finding low-threshold npm audit passed. Direct-origin and Cloudflare
Tunnel canaries returned the identical sitemap SHA-256
`8464bf374bc36c34c077fc017c7daa08717fd697ae49db77976a97d5d56868b7`
with `200` and an XML MIME type. All six public pages exposed their exact
canonical URL and route-specific `dateModified`; real `404` behavior and API
readiness were unchanged. The API, Nginx, and Tunnel remained active with zero
unexpected API restarts.

Frontend release `20261101T140418Z-56706e0` is active. Its atomic rollback target
is `20261101T140207Z-fe8768a`; no database, backend, Nginx, or Tunnel mutation was
required. Search Console ownership and crawl/index alerting remain open.

### Atomic frontend deployment checkpoint

Operations commit `706ef08` adds a fail-closed frontend deployer and runbook.
Only a strict UTC timestamp plus lowercase Git SHA can select a fixed release
path. The deployer rejects source symlinks, current targets outside the release
root, existing destinations, non-root activation, and staging mismatches. It
builds nothing as root, never deletes a release, changes no service or proxy
configuration, and compares file count plus critical hashes before activation.

Bash syntax, ShellCheck, positive dry-run, traversal-shaped ID rejection, and
existing-target rejection passed. The committed script then staged and activated
release `20261101T140635Z-706ef08`; all direct-origin and Cloudflare Tunnel gates
passed, with `20261101T140418Z-56706e0` recorded as the exact rollback target.
A controlled drill atomically switched to that prior release, verified direct
API readiness and the public sitemap checksum, restored the new release, and
verified readiness plus manifest content again.

The API, Nginx, and Tunnel remained active with zero unexpected API restarts,
and `/var/lib/media/frontend-current` resolves to the new release. No database,
backend, Nginx, or Tunnel mutation was required. Backend release automation,
external availability alerting, retention policy, and scheduled rollback drills
remain open.

### Guarded backend deployment checkpoint

Backend commit `d10cd0c` adds a strict, default-enabled upload-maintenance switch.
Only isolated release candidates set it to `false`, preventing their immediate
maintenance tick from processing production cleanup rows or files. Unit tests
reject misspelled or ambiguous values. An isolated candidate logged the disabled
worker, drained on shutdown, left no listener, and preserved zero users, managed
uploads, and deletion-queue rows before and after the test.

Operations commit `98e755e` adds a backend deployer that validates fixed paths,
ELF artifacts, SHA-256 integrity, root-only secrets, active dependencies, exact
SQLx migration parity, isolated candidate behavior, live health boundaries, and
zero automatic restarts. It refuses migration-bearing releases so they continue
through the dump-backed manual workflow. The first live exercise safely stopped
before backup or promotion when `www-data` could not traverse the root-only
candidate directory; the live hash and all services remained unchanged. Commit
`f52489d` corrected this with a `root:www-data` mode-`0750` directory and candidate,
without making artifacts world-accessible.

The second exercise activated candidate
`/var/lib/media/backend-candidates/social-media-backend-20261101T141520Z-f52489d`
with SHA-256
`221d34b40616045469b8177de4a893b60175f674c1f1bce2c65db3dcdd45cbd1`.
Its root-only rollback binary is
`/var/backups/media-binary-pre-backend-20261101T141520Z-f52489d`, with prior
SHA-256 `c1b1393d41bb0e1d80b8a7a3d48b42a83d2f0fea3f882cc0f97dd77714d0026d`.
All 12 migrations through `20261030000000`, direct and public readiness, feed,
auth and pagination boundaries, services, and restart count passed.

A controlled drill atomically restored the prior binary and readiness, then
restored the new binary and both direct and public readiness. The API, Nginx, and
Tunnel are active with zero unexpected API restarts; production users and both
upload-lifecycle tables remain empty. At that checkpoint migration-job
automation, database restore testing, external alerting, and scheduled drills
were open; recovery drills and backup-specific alerts are closed below, while
migration automation and broader application alerting remain open.

### Isolated database restore checkpoint

Operations commit `01db316` adds a root-only restore drill that cannot accept an
operator-selected target name. It produces a transaction-consistent temporary
dump, creates only a generated `<source>_restore_drill_<timestamp>` database,
and verifies schema SHA-256, every base-table row count, the complete SQLx
version/success/checksum fingerprint, and `mariadb-check`. The source database is
hashed again before success. Both the isolated database and root-only temporary
dump are removed; the tool does not create an undeclared retained backup.

The first production-data drill completed in 6.7 seconds. All 23 base tables and
12 rows matched; at this zero-user checkpoint those rows were the migration
history. The temporary dump SHA-256 was
`7d22781e5ba35869c16387ea362890217698e0bddf631c694858095a91ae904d`,
the schema SHA-256 was
`ff67072384a5277123cba20e1729114962f370b6d5e9c4b14b1a172ee1a6c0b4`,
and the migration fingerprint was
`58776476252caba16714b592cbcbdee082d63ae5281442b10b1f9736ab4855f5`.

Post-drill inventory found no restore database and no temporary backup directory.
The live database retained 23 tables, zero users, and successful migration
`20261030000000`. The API binary remained at SHA-256
`221d34b40616045469b8177de4a893b60175f674c1f1bce2c65db3dcdd45cbd1`;
API, Nginx, Tunnel, and MySQL remained active with zero unexpected API restarts
and passing direct/public readiness. Encrypted scheduled backups, a 35-day
retention policy, and a real off-host restore drill are now implemented and
exercised. Measured RPO/RTO under realistic data volume, offline crypt-key
escrow, backup-unit-specific failure injection, email fallback, and independent
notifier monitoring remain open. The common Telegram delivery path is exercised
by the service-health checkpoint below.

### Encrypted off-site recovery checkpoint

Operations commits `e2482d1` and `20361ef` add a daily client-side encrypted
Google Drive backup and a weekly isolated restore drill. The bundle contains a
transaction-consistent MariaDB dump, managed uploads, minimal recovery metadata,
and SHA-256 manifest; it excludes `backend/.env` and application/SMTP secrets.
Every upload uses a unique directory below the fixed
`gdrive-vps-crypt:media-social/backups` prefix, uses `copy` rather than `sync`,
and is downloaded and hashed again before success or retention pruning.

Commit `77093d0` closes two root-boundary issues found during the live exercise:
systemd now executes immutable `root:root` copies from `/usr/local/libexec`, not
the user-owned checkout, and the dedicated root-only rclone config includes no
R2 credentials and pins its Drive root to the encrypted folder ID. Both services
have empty capability sets; the backup receives only the `www-data` supplementary
group to read uploads. Their systemd exposure scores are 1.8 and 2.0 (`OK`).

The first bundle, `20261101T142349Z`, uploaded and passed remote-download
verification. The initial systemd restore attempt failed closed because systemd
259's `RestrictSUIDSGID` filter returned `ENOSYS` for GNU tar's safe `openat2`
path traversal. No database or staging residue remained. Commit `1fbf4d4`
removed only that incompatible restore-unit control and added compensating
archive type/mode checks, owner/permission suppression, `UMask=0077`, and a
root-only write boundary. The scheduled path then restored successfully.

The fully hardened end-to-end exercise created backup `20261101T143350Z`,
redownloaded and verified all four objects, and restored its database and upload
archive in seven seconds at the current tiny data volume. It verified 23 tables,
12 migration-history rows, schema SHA-256
`ff67072384a5277123cba20e1729114962f370b6d5e9c4b14b1a172ee1a6c0b4`, and
SQLx fingerprint
`58776476252caba16714b592cbcbdee082d63ae5281442b10b1f9736ab4855f5`.
It also extracted one 24,627-byte upload. Post-drill inventory found no temporary
database or local staging; all production services remained active with zero API
restarts and passing direct/Tunnel readiness.

Residual risk remains material: the current OAuth token has full Drive scope and
uses rclone's shared client ID, which rclone states will stop working during
2026. Logical folder pinning limits normal rclone operations but does not narrow
the stolen token's Google authorization. Create a private OAuth client, review a
`drive.file` migration, reauthorize, rerun the installer and both drills, and
store the crypt material in a separate offline controlled location. Backup
failures are explicitly detected by `OnFailure` and routed through the existing
Telegram/email operator notifier. An hourly 0.9/10 (`SAFE`) sandboxed watchdog
also alerts after 30 hours without a verified backup or nine days without a
successful restore, covering disabled/missed timers. Wiring and healthy execution
are verified. The shared Telegram delivery path is tested below; email fallback,
backup-unit-specific injection, and monitoring of the notifier itself remain open.

### Production service-health checkpoint

Operations commit `9f7e99f` adds a five-minute smoke monitor for all four
production services plus seven fixed HTTP boundaries spanning the direct API,
anonymous auth/pagination rejection, local Nginx/TLS, and the public Cloudflare
Tunnel. Requests contain no credentials, cookies, bodies, or user identifiers.
Each boundary receives one bounded retry to reduce transient alert noise.

The first sandboxed exercise exposed a systemd 259 incompatibility: a
`DynamicUser` could not query manager state and failed closed even though all
services were healthy. That failure changed no application state and triggered
the common `OnFailure` notifier, which reported successful Telegram delivery.
Commit `ddeafec` replaced the transient identity with a dedicated, non-login
`social-media-monitor` system account. The installed root-owned script matches
the repository hash, the timer is enabled/active, all 11 checks pass with zero
API restarts, and the final unit exposure score is 1.5 (`OK`).

Commit `cc518f8` extends the same least-privilege check with two certificate
expiry gates and filesystem capacity limits. Origin and Cloudflare edge
certificates must remain valid for at least 14 days; root block/inode use must
stay below 85% with at least 10 GiB free. The sandboxed production run passed at
79% block use, 13% inode use and about 110 GB free, with both certificates valid
into January 2027. This closes advance detection for these bounded failure modes,
not general capacity forecasting.

Covered availability MTTD is now approximately six minutes or less under a
healthy timer and notification path. This does not detect credential abuse,
authorization anomalies, latency/saturation trends, or notifier failure. Email
fallback, independent notifier monitoring, SLO/burn-rate metrics, alert-storm
behavior and a multi-person tabletop remain open.

### Orphan upload and edge-cache checkpoint

The production upload tree contained one 24,627-byte JPEG from 2025 with no DB
reference in users, posts, `managed_uploads`, or `upload_deletion_queue`. It was
anonymously reachable. The exact file was moved recoverably to root-only
quarantine `20261101T144016Z`, mode `0600`, with SHA-256
`0fc5a98b12e580b29e1c8d3917c4176d5bbf10be5a20c280e33496ab8340e02b`;
the complete quarantine path is mode `0700`. A legacy backup copy is protected
behind a root-only `0700` parent. No copy was destructively removed.

Commit `25c0c8e` extends the hourly backup watchdog with a read-only union of all
internal upload references and a physical-tree inventory. It fails and alerts on
orphans, missing files, symlinks, special entries, unsafe paths, or unexpected
directories, but never auto-deletes. The deployed root-owned script matches the
repository hash, reports 0/0 inventory after quarantine, and retains systemd's
0.9 (`SAFE`) exposure score.

The origin stopped serving the object, but audit caught the exact public URL
still returning `200` from a Cloudflare `HIT`: the previous vhost had emitted
`public, max-age=2592000, immutable`. Commit `cf02df6` now serves managed avatars
with `private, no-store`, keeps post media uncached and authorization-checked,
and returns `404` for every other upload subtree. Fresh origin and Tunnel keys
return `404`; Cloudflare reports `BYPASS`. The old exact cache key remains public.
The existing analytics API token is active but receives Cloudflare error `10000`
on per-URL purge because it lacks the required zone authority. Exact purge with a
separately scoped credential, repeated public-404 proof, log/content attribution,
and a documented GDPR assessment are open P1 exit conditions; this is not marked
contained or closed at the CDN layer.

Commit `a85e5e1` installs an inert root-owned purge utility without reusing or
broadening the analytics token. It accepts one strict managed-image path, requires
the origin to be a `no-store` 404, uses a fixed root-only credential file, offers
no broad purge selector, and verifies the public response after Cloudflare
accepts the request. Traversal and missing-credential tests fail closed; the
installed hash matches the repository. The dedicated `Cache Purge` zone token is
not yet provisioned, so no live purge or containment claim is made.

Retained Nginx logs span 2026-10-28 00:53 through 2026-11-01 21:04 local time
and contain 10 origin requests for this exact path from two client addresses:
five `200`, five `404`, all with curl user agents and no referrer. This is
consistent with audit traffic but does not prove identity or absence of other
access. The window excludes earlier activity, and Cloudflare cache HITs do not
reach Nginx. Edge-log review remains part of the P1 incident assessment. A prior
2026-10-29 record incorrectly called the orphan permanently removed; the current
filesystem, cache, and quarantine evidence supersedes that claim.

Backup `20261101T185747Z` captured the post-quarantine state with 23 tables and
zero uploads, passed remote-download checks, and restored through the scheduled
unit. The drill verified 23 tables, 12 migration rows, zero upload files, and
removed its database and staging. Three encrypted versioned backups now exist;
the first two retain the historical object until their 35-day lifecycle expires.
Commit `3d89f4b` additionally snapshots the user rclone config before any network
call, preventing token refresh from changing its ownership while retaining the
installer's concurrent-modification guard.

### Accessible command-palette release checkpoint

Frontend commit `f0703ee` adds a fixed, role-aware command catalog and accessible
responsive palette without adding an API, dependency, storage mechanism,
telemetry stream, or third-party script. Anonymous sessions receive only public
account/editorial routes; authenticated account commands require the existing
session, and the moderation shortcut appears only for moderator/admin roles.
This presentation filter is not treated as an authorization boundary: protected
pages and APIs retain their existing server/session checks. Profile identifiers
are encoded into one path segment, and global shortcuts are ignored while focus
is in input, textarea, select, or editable content.

The frontend suite passes 20 tests, including diacritic-insensitive ranking,
public/privileged command separation, unsafe profile-ID encoding, and editable
target detection. The production build passes its static-page/PWA/bundle gate at
118,968 entry-JavaScript bytes, 73,296 stylesheet bytes, and 248,581 total
JavaScript bytes; `npm audit --audit-level=low` reports zero findings.

Immutable release `20261102T000539Z-f0703ee` is active. The direct-origin and
Cloudflare Tunnel copies of `index-DHHB3Qbv.js` both returned `200` and matched
the release SHA-256
`efc4f800f13a3cd3924dcc3f208345b2f0ed31bcf5d1105cbe00df4b5342bf35`.
All four services remained active, API restarts stayed at zero, and the full
service monitor passed seven HTTP and two certificate boundaries. Filesystem use
is now 80% with about 104 GB free, still inside the 85%/10 GiB alert gates. The
atomic rollback target is `20261101T140635Z-706ef08`; no backend, database,
Nginx, Tunnel, user data, or vendor configuration changed.

### Temporary post-draft release checkpoint

Commit `e9fe52c` adds explicit recovery for text typed into the post composer.
The draft is never sent to the server before publication and is stored only in
same-origin `sessionStorage`, namespaced by encoded account ID and browser tab.
Strict parsing accepts only schema version 1, nonblank text of at most 500
characters, a bounded 2 KiB serialized value, and a timestamp no older than 24
hours or more than five minutes in the future. Malformed, oversized, stale, and
over-limit values are rejected and removed when storage permits; storage access
errors fail safely without blocking normal publication.

Commit `5197550` closes a retention edge found during release review: each
successful autosave now schedules active expiry in a tab left open for 24 hours,
not only expiry on the next read/reload. The timer is renewed on edit and removed
on component teardown. It never erases text still visible in the editor; it
removes only the browser copy and tells the user to edit again to resave. Failed
deletion is reported rather than falsely claiming success. Publication, logout,
explicit deletion, blank content, and over-limit content all attempt immediate
removal; selected images are never persisted as drafts.

Commit `fdff937` adds a dedicated interactive privacy disclosure, and commit
`2f36735` aligns the crawlable pre-render, sitemap `lastmod`, and JSON-LD
`dateModified` at 2026-11-02. The distribution gate now fails if the static
disclosure disappears. The final build passes 24 tests and all SEO/PWA/bundle
checks at 123,657 entry-JavaScript bytes, 74,972 stylesheet bytes, and 254,220
total JavaScript bytes. `npm audit --audit-level=low` reports zero findings.

Immutable release `20261102T001238Z-2f36735` is active. Direct-origin and
Cloudflare Tunnel copies of `index-CLkuel5v.js` matched SHA-256
`d0c64c1fc6e8be17faecc7c485b42d47ee361882d6931add5abf5422fb084145`.
Both paths exposed the new crawlable disclosure and matching structured-data
date; the public sitemap matched. Four services, seven HTTP boundaries, and two
certificate boundaries passed with zero API restarts. Root filesystem use is
81%, inode use 13%, and free space about 99 GB, inside the existing alert gates.
No backend, database, Nginx, Tunnel, external processor, or server-side user data
changed. To fully disable browser drafts rather than merely roll back the latest
SEO artifact, use preserved release `20261102T000539Z-f0703ee`.

### Profile-completion release checkpoint

Frontend commit `3dccd58` adds a four-step checklist only to the authenticated
owner's profile. It derives completion from the existing avatar URL, trimmed bio,
post count, and following count; it creates no database field, browser storage,
cookie, analytics event, external request, or vendor dependency. Numeric inputs
are normalized to finite non-negative integers with a bounded loaded-post
fallback. The display is guidance only and is not an authorization, identity,
verification, or moderation signal.

Each incomplete item invokes an existing user-controlled path: avatar settings,
the profile bio editor, the post composer, or people search. Those destinations
retain their existing session, validation, upload, and API authorization checks.
The checklist exposes progressbar semantics, labeled ordered steps, completed
states, touch-sized actions, and one-column layouts below 759 px with an
additional 460 px compact treatment. Automated visual/browser/assistive-
technology regression is still unavailable on this host and remains open.

The frontend suite passes 27 tests, including empty/complete/malformed count
cases. The feature remains in the lazy profile chunk: production build gates pass
at 123,750 entry-JavaScript bytes, 77,966 stylesheet bytes, and 258,851 total
JavaScript bytes; the profile chunk is 47,041 bytes. The locked npm audit reports
zero findings.

Immutable release `20261102T001513Z-3dccd58` is active. Direct-origin and
Cloudflare Tunnel copies of `Profile-DbrhR6Wa.js` matched SHA-256
`330021042351f5822c34447a46942e99992e836fec56a6efaf5cfe8a6391290d`
and both contained the checklist marker. All four services, seven HTTP checks,
and two certificate checks passed with zero API restarts. Filesystem use remains
81% with about 99 GB free. The atomic rollback target is
`20261102T001238Z-2f36735`; no backend, database, Nginx, Tunnel, user record, or
processor configuration changed.

### Post-permalink and share-preview release checkpoint

Backend commit `3df53aa` adds a single-post JSON endpoint and a server-rendered
permalink shell. Both surfaces use one database query that enforces the author's
current private-account state, accepted follows, bidirectional blocks, and the
viewer's hidden-post state. Invalid UUIDs, missing posts, and unauthorized posts
all return the same 404. The HTML renderer context-escapes metadata/body content,
escapes `<`, `>`, and `&` inside JSON-LD, accepts an Open Graph image only from a
bounded same-origin managed-post path, and preserves the active immutable
frontend asset references.

Frontend commit `d9c3408` adds `/post/:id`, direct links from every post card,
native share with clipboard fallback, public comment reading, authenticated
interaction prompts, and safe post-login return routing that rejects external,
protocol-relative, backslash, control-character, and oversized destinations.
The lazy detail route provides explicit loading/error states, author-controlled
visibility guidance, keyboard-readable status updates, and responsive layouts
down to the compact mobile breakpoints. The static application-root markers are
now a release-gated contract between Vite output and the Rust renderer.

Security commit `2ea6619` leaves every permalink out of the sitemap and applies
UUID-v4 routing, ordinary API read limits, `Cache-Control: no-store`, and
`X-Robots-Tag: noindex, nofollow, noarchive` at Nginx. Search indexing is
deliberately blocked until Media has explicit user choice and completed
privacy/legal review. The interactive and crawlable privacy pages disclose
anonymous access for public-account posts, per-request authorization, external
preview caching, and Media's inability to erase copies created outside the
platform. The build gate retains both this disclosure and the earlier temporary-
draft disclosure.

The backend suite passes 61 application and five seed tests; RustSec scanned 265
locked dependencies with no finding. A disposable MariaDB/backend integration
canary proved public HTML/API `200`, private HTML/API `404`, active-asset
selection, `noindex`, and HTML/JSON-LD XSS escaping, then removed its database,
two scoped database principals, and transient service. No canary row entered the
production database, which remains at zero persistent users and posts. The
frontend passes 28 tests, the locked npm audit reports zero vulnerabilities, and
the final gate reports 125,852 entry-JavaScript bytes, 80,274 stylesheet bytes,
265,937 total JavaScript bytes, and 24 lazy route chunks, all within budget.

Backend and frontend release `20261102T133449Z-2ea6619` is active. The promoted
backend SHA-256 is
`2d01452f2ed9476373c174d312aa88fe7ace25c4fe59ed54c067347b5383950e`;
the prior binary is preserved at
`/var/backups/media-binary-pre-backend-20261102T133449Z-2ea6619`. The frontend
rollback target is `20261102T001513Z-3dccd58`. Installed and tracked Nginx
configuration matched SHA-256
`6909ac8c4cb1decf17987372ec976ce3f1e005008467b31fff74cbe04178e375`,
with its prior copy under
`/var/backups/media-nginx-pre-permalink-20261102T133449Z-2ea6619/`.

Direct-origin and Cloudflare requests for a nonexistent valid permalink returned
the same problem 404 with `no-store` and `noindex`; Cloudflare classified the
response `DYNAMIC`. The canonical trailing-slash redirect retained those
policies, and the public sitemap contained no post URL. Direct and public copies
of `index-BMFhNXdZ.js` matched SHA-256
`434a0ec34022b558b2a143abec418905237a186325e37ebaea7c37d88e188410`;
copies of `PostDetails-BgyZkXwf.js` matched
`14f49a3541ece1dfd83d4c510a9a66a5d9dbe1a6b2fdb8384b82dce55492bc6e`.
All four services remained active, API restarts stayed at zero, and the service
monitor passed seven HTTP and two certificate boundaries. Filesystem use remains
81%, inode use 13%, with about 96.4 GB free. No migration, production user row,
post row, upload, Tunnel setting, or new external processor was introduced.

### Public-profile preview release checkpoint

Backend commit `6800ead` extracts one profile-visibility query shared by the JSON
endpoint and a new server-rendered profile shell. The shell context-escapes HTML
and JSON-LD separately, accepts avatar paths only from the bounded same-origin
managed-avatar directory, and deliberately uses the generic Media image for Open
Graph and Twitter metadata. It renders base profile identity and aggregate
counts, but never embeds post bodies or connection membership. An account owner
who blocked an authenticated viewer remains indistinguishable from a missing
profile.

Frontend commit `b86904d` allows anonymous viewing of the existing responsive
profile route while keeping follow, mute, block, report, and connection-list
navigation behind authentication. Public profile posts can be read without an
account; private profile posts continue to show a login/access boundary. Author
links now open the public profile directly. The server-rendered summary and the
hydrated interface both collapse cleanly at the existing mobile breakpoints.

Security commit `7482d7f` routes only UUID-v4 profile URLs to the renderer, adds
the normal API rate limit, disables browser/edge storage, and emits
`noindex, nofollow, noarchive`. Profiles remain absent from the sitemap and
connection-list routes remain private SPA surfaces. The interactive and
crawlable privacy pages now state exactly which base profile fields remain
public for private accounts, the no-indexing policy, and the limits of external
preview services. Search indexing remains blocked pending explicit member
choice, legal/privacy approval, deletion expectations, enumeration monitoring,
and automated authorization-regression detection.

The backend suite passes 63 application and five seed tests. RustSec scanned all
265 locked dependencies without a finding. The frontend passes 28 tests and the
locked npm audit reports zero vulnerabilities. The final distribution gate
reports 125,823 entry-JavaScript bytes, 80,845 stylesheet bytes, 267,267 total
JavaScript bytes, and 24 lazy route chunks, all within budget. Nginx syntax tests
passed against both the tracked source and installed configuration.

A disposable MariaDB/backend integration canary proved public and private base
profile HTML/API `200`, public posts `200`, private posts `403`, HTML and JSON
escaping of a stored script payload, generic social metadata, managed avatar
rendering only in the page body, and absence of private post text from the
profile preview. The transient service and database were removed afterward.
Production remained at zero users and zero posts.

Backend and frontend release `20261102T135147Z-7482d7f` is active. The promoted
backend SHA-256 is
`75e6c99486801be501e6146e6e4a2b81e213891171ad29c75d3b136b482d3a05`;
the prior binary is preserved at
`/var/backups/media-binary-pre-backend-20261102T135147Z-7482d7f`. The frontend
rollback target is `20261102T133449Z-2ea6619`. Installed and tracked Nginx
configuration matched SHA-256
`74c30cb38eca64184aaef9ff0f1bc1f3459570e9d1344168a4a945ba65ab8b1b`,
with the prior configuration at
`/var/backups/media-nginx-pre-profile-20261102T135147Z-7482d7f/media.micutu.com`.

Direct-origin and Cloudflare requests for a missing valid profile returned the
same `404` with `no-store` and `noindex`; Cloudflare classified the response
`DYNAMIC`. Trailing-slash canonicalization returned `308` with the same policy,
an invalid identifier returned a real `404`, and the public sitemap contained no
profile URL. Direct and public copies of `index-CtW1j0Wh.js` matched SHA-256
`e67998d8f5edc2cae22ce1b0288530425a273d2d28c3628728600bf439ed8d8a`;
copies of `Profile-dLFH9ngA.js` matched
`b76a7f252279afffd97b7dc166c1c13c4f7faa1720ecbc0ef046039527addf9f`.
All four services remained active, API restarts stayed at zero, and the service
monitor passed seven HTTP and two certificate boundaries. Filesystem use is 82%,
inode use 13%, with about 95.1 GB free. No migration, upload, production data,
Tunnel setting, dependency, tracker, credential, or processor was introduced.

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
- **Current MTTD:** covered service/Tunnel outages are approximately six minutes
  or less; account abuse, authorization anomalies, data exfiltration and resource
  saturation remain unknown and potentially unbounded.
- **Required detections:** auth failure velocity, session anomalies, recovery
  bursts, follow/block/notification velocity, frequent notification-cap pruning,
  blocked-action denials, upload rejects, 4xx/5xx shifts, DB error/latency,
  process restarts, privilege changes, high egress, and integrity changes to
  release/config files.

### Response

- Incident response runbook: ✅ documented; technical restore drills passed
- Tested restore procedure: ✅ local and encrypted off-host drills passed
- Tabletop exercise: ❌ not documented
- Pre-written user/regulator communications: ❌ not found

### Regulatory and vendors

GDPR is presumed relevant because the system is operated in the EU and processes
personal data. A qualifying personal-data breach may require supervisory-authority
notification within 72 hours. Vendors/processors in observed scope include the
hosting provider, Cloudflare, Brevo SMTP, Google Drive, GitHub, and Let's Encrypt;
ownership, DPAs, retention, regions, and last security review are unknown. Rclone
is also in the backup supply chain and its private OAuth-client migration is P1.

## Reference baseline

- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
- [OWASP File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [systemd execution sandboxing](https://www.freedesktop.org/software/systemd/man/systemd.exec.html)
- [rclone Google Drive configuration](https://rclone.org/drive/#making-your-own-client-id)
- [Cloudflare purge API](https://developers.cloudflare.com/api/resources/cache/methods/purge/)
- [Cloudflare single-file purge](https://developers.cloudflare.com/cache/how-to/purge-cache/purge-by-single-file/)
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
