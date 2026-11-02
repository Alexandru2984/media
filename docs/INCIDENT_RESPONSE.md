# Incident Response Runbook

This runbook covers security and availability incidents affecting Media, with a
specific playbook for hostile or privacy-sensitive image uploads. It contains no
credentials. The VPS/repository owner is the current incident commander until a
named on-call rotation and backup contact are recorded in a private system.

## Declare and classify

Declare an incident when any of these occurs:

- repeated `social-media.service` OOM kills, crashes, or unexpected restarts;
- a sustained rise in upload `5xx`, latency, memory, CPU, or rejected files;
- sustained notification writes, repeated cap pruning, or notifications visible
  between accounts after either account blocks the other;
- an unexpected moderator/admin grant, bulk moderation access, reporter identity
  exposure, self-moderation, or a report transition without its audit event;
- an uploaded file is served with an unexpected type or retains private metadata;
- evidence suggests unauthorized access, data export, secret exposure, or code
  execution in the API process.

Use `SEV-1` for suspected compromise or material personal-data exposure, `SEV-2`
for active abuse or user-visible outage without confirmed compromise, and
`SEV-3` for contained defects with no active impact. Record all times in UTC.

## First 15 minutes

1. Start an incident log with the UTC time, reporter, symptoms, affected URL,
   deployed Git SHA, current frontend release, and service restart counts.
2. Preserve evidence before changing state: relevant journal entries, Nginx
   access/error log slices, response request IDs, file names, hashes, database
   references, and active configuration checksums. Never place tokens, cookies,
   email addresses, or raw database credentials in the incident log.
3. If exploitation or data access may still be active, stop the API with
   `sudo systemctl stop social-media`. The static public pages can remain online.
   For upload-only abuse, prefer an exact temporary deny/rate-limit change to the
   two upload endpoints, backed up and validated with `nginx -t`, rather than
   weakening other security controls.
4. Do not delete or open a suspicious upload in a browser. Copy only the exact
   file into a root-only evidence directory, record its SHA-256, and preserve the
   original ownership, mode, and timestamps. Do not recursively copy the upload
   tree unless the scope has been verified.
5. Check whether database, SMTP, session, or Cloudflare credentials may have been
   reachable. If process compromise is plausible, assume every secret available
   to the API was exposed and begin scoped rotation after evidence capture.

An ordinary `systemctl stop` or restart sends `SIGTERM`; the API stops accepting
new connections and drains active requests. Systemd enforces a 15-second final
timeout and then kills a stuck process. During confirmed active exploitation,
do not extend that drain window merely to preserve untrusted requests.

Useful read-only checks:

```bash
git rev-parse HEAD
readlink -f /var/lib/media/frontend-current
sudo systemctl show social-media -p ActiveState -p SubState -p NRestarts -p MemoryCurrent -p MemoryPeak
sudo journalctl -u social-media --since "15 minutes ago" --no-pager
sudo journalctl -u nginx -u cloudflared --since "15 minutes ago" --priority=warning --no-pager
curl --fail --silent --show-error http://127.0.0.1:8083/api/health/ready
```

## Image-upload containment and rollback

The decoder accepts only JPEG, PNG, and WebP. New uploads are decoded and
re-encoded; the process is bounded by input/output size, dimensions, pixel count,
decoder memory, systemd memory ceilings, Nginx rate limits, and a two-job
application semaphore. New files are registered by owner and encoded byte size;
active storage is capped at 100 MiB per account and pending post images at five.
Pending images expire after 24 hours and interrupted writes after one hour.

If the new pipeline is suspected:

1. Stop new writes or the whole API as described above.
2. Save the live binary checksum and relevant logs.
3. Restore the exact pre-rollout binary from `/var/backups`, preserving the
   current binary as evidence, then restart the service and verify readiness.
4. Verify normal JPEG, PNG, and WebP uploads with an isolated canary account.
5. Do not bulk-convert or delete existing uploads during containment. Database
   references and files must remain consistent until scope is known.

Rollback changes code behavior only; it does not require a schema rollback and
does not mutate previously stored images. The additive `managed_uploads` table is
compatible with the prior binary. Do not drop it during an emergency rollback;
pending rows can be reconciled after service recovery.

## Notification abuse and privacy containment

Notification rows contain event metadata but no copied post/comment body. If
spam, unexpected growth, cross-account access, or block leakage is suspected:

1. Preserve request IDs, endpoint/status velocity, affected account IDs, counts
   by `kind`, oldest/newest timestamps, and the deployed binary/schema hashes.
   Do not export cookies, email addresses, event keys, or unrelated user rows.
2. Apply a temporary exact deny or stricter limit to `/api/notifications` and/or
   the source social write route, validate with `nginx -t`, then reload Nginx.
   Stop the API if authorization bypass remains credible.
3. Confirm no recipient exceeds 500 rows and query for notifications whose actor
   and recipient have a block edge. Treat any such result as a privacy defect;
   preserve evidence before scoped deletion.
4. Restore the pre-release binary if the defect is code-level. Leave the
   additive `notifications` table in place during ordinary binary rollback;
   the prior binary ignores it and account/post foreign keys still cascade.
5. Recovery requires recipient-only mutation checks, unlike/unfollow/comment
   cleanup, block cleanup in both directions, cap enforcement, and a zero-residue
   disposable-account canary through the public Tunnel path.

## Moderation privilege or privacy containment

Treat an unexplained role change, missing transition audit, reporter identity
leak, or unauthorized moderation action as at least SEV-2 and as SEV-1 when
personal-data exposure or active account takeover is credible.

1. Preserve the exact role/action event IDs, report references, request IDs,
   timestamps, release hashes, and relevant database actor. Do not copy report
   bodies, reporter identity, passwords, cookies, or unrelated account data into
   the incident log.
2. Revoke the affected role and active sessions using the emergency procedure in
   `MODERATION_OPERATIONS.md`. Reopen that account's assigned reports and append
   release events in the same transaction. Stop the API if role integrity or
   queue confidentiality cannot be trusted.
3. Compare `users.role`, `moderation_role_events`, `content_reports`, and
   `moderation_audit_events`. Every claim, release, resolution, or dismissal must
   have the corresponding state transition and event; every role update must
   have a trigger-produced role event.
4. If exposure occurred, determine whether reporter identity, evidence excerpts,
   internal notes, or role history were accessed. Start GDPR assessment
   immediately; the possible 72-hour supervisory-notification window runs from
   organizational awareness, not from completion of the investigation.
5. Recover with the least-privilege matrix: ordinary user `403`, moderator sees
   no reporter identity, wrong step-up secret `401`, assignment ownership holds,
   admin override is audited, reporter cannot see internal notes, and role audit
   is admin-only. Use disposable accounts and remove every canary row afterward.

Binary rollback alone does not reverse the additive schema or safely interpret
new terminal report states. After real moderation data exists, prefer a forward
fix. Restore the pre-release database only after an explicit data-loss decision,
preserved evidence, and incident-owner approval.

## Scope, recovery, and closure

- Determine the first and last affected request, accounts, files, database rows,
  sessions, secrets, and vendors. Separate confirmed facts from assumptions.
- Patch and test with hostile/malformed fixtures, then deploy from a reviewed,
  locked build. Verify readiness through backend, Nginx, and Cloudflare and watch
  restarts, memory, latency, upload status, and logs.
- Rotate only secrets in the confirmed or credible blast radius. Revoke active
  sessions if their confidentiality may have been affected.
- Close only after containment, recovery verification, evidence retention,
  owner approval, and a written follow-up with actions and deadlines.

## Privacy and communications

Media processes personal data and is operated in the EU, so GDPR breach analysis
is required when confidentiality, integrity, or availability of personal data may
have been compromised. Escalate immediately: where notification is required, the
supervisory-authority deadline can be 72 hours after awareness. Record the
awareness time, decision owner, affected categories and approximate number of
people/records, likely consequences, containment, and contact channel. Obtain
qualified legal guidance before external notification; do not delay technical
containment while that assessment is underway.

Cloudflare, the VPS provider, Brevo SMTP, MySQL hosting on the VPS, GitHub, and
Let's Encrypt may be relevant to evidence or notification. No new processor is
introduced by the image decoder; its Rust dependencies remain subject to the
locked dependency and RustSec review.

## CISO review record — image re-encoding rollout

**Date:** 2026-10-28

- Top threats: denial of service through expensive decoding (medium/high),
  information disclosure through retained metadata (medium/medium), and decoder
  compromise/tampering (low/high).
- Worst credible blast radius: an API-process compromise could expose the
  database and SMTP credentials available to that service and therefore all
  application data. User count and financial inputs are unavailable, so a
  defensible FAIR annualized-loss estimate cannot be produced.
- Detection target: 15 minutes for service instability or upload abuse. Current
  automated MTTD remains unknown because alerts are not yet deployed.
- Response: this runbook is documented; the scenario walkthrough confirmed the
  stop, binary rollback, readiness, evidence, and credential-rotation decisions.
  The first canary exercised and verified the automatic live binary rollback
  path before a second canary passed. A backup restore drill and multi-person
  tabletop remain open.
- Regulatory window: GDPR assessment starts immediately; the applicable
  supervisory-authority notification window may be 72 hours after awareness.
- Supply chain: no new vendor or processor; one locked pure-Rust image stack with
  only JPEG/PNG/WebP features, checked by tests, Clippy, and RustSec.

**Verdict:** mitigate then ship. The decoder limits, two-job budget, systemd
memory ceiling, strict output cap, metadata-removal tests, rollback binary, and
health checks are release gates. Automated alerts and a live restore exercise
remain mandatory follow-up work.

## CISO review record — upload quota and lifecycle rollout

**Date:** 2026-10-29

- Top threats: storage exhaustion through abandoned uploads, unauthorized reuse
  of another account's filename, and DB/filesystem divergence during failures.
- Controls: a 100 MiB account budget, five-pending-image limit, owner-bound
  registry, single-use transactional post claim, explicit `writing`, `pending`,
  `attached`, and retryable `deleting` states, plus bounded 15-minute cleanup.
- Rollback: root-only pre-rollout binary and database dumps are stored as
  `media-binary-pre-upload-quota-20261028T232650Z-545361c` and
  `media-db-pre-upload-quota-20261028T232650Z-545361c.sql` under `/var/backups`.
  The migration is additive and the previous binary remains runnable.
- Validation: production canaries verified cross-account rejection, single-use
  claim, transactional create/replace/delete, physical cleanup, avatar
  replacement, five-image pending enforcement, and cleanup of a 25-hour stale
  pending file. Canary accounts, rows, and files were removed afterward.
- Residual risk at this checkpoint: historical files are outside the registry,
  alerts remain manual, and account deletion still needs durable pre-cascade
  file queueing.

**Verdict:** ship with monitoring. Responsive derivatives, deduplication,
telemetry/alerts, and the then-pending account-deletion integration remain
tracked follow-ups. The following review records that later integration.

## CISO review record — account export and deletion rollout

**Date:** 2026-10-29

- Top threats: information disclosure through an over-broad export
  (medium/high), incomplete or cross-account media deletion (medium/high), and
  denial of service through large synchronous exports or cleanup work
  (medium/medium).
- Blast radius: ordinary endpoint compromise is scoped to the authenticated
  account and requires the current password; an API/database compromise could
  still expose all application data and service credentials. Production held no
  persistent users at the release checkpoint, and financial inputs remain
  unavailable, so a defensible FAIR ALE cannot be calculated.
- Detection: exports create a private security event, privacy endpoints retain
  request-ID/status/latency logs without bodies, and blocked cleanup paths emit
  errors. Automated mass-export, queue-age, and deletion-failure alerts do not
  yet exist, so current MTTD remains unknown.
- Response: the main runbook covers privacy incidents, evidence preservation,
  account/session scope, and GDPR escalation. The release canary exercised bad
  credentials, secret-free export, session invalidation, FK cascades, surviving
  post counters, file removal, and queue drain; a multi-person tabletop and
  backup restore drill remain open.
- Regulatory window: a suspected personal-data breach requires immediate GDPR
  assessment and may require supervisory-authority notification within 72 hours
  after awareness. Export/deletion functionality alone does not establish
  compliance or decide lawful retention and backup/legal-hold obligations.
- Vendors/supply chain: no new vendor or processor was added. Existing VPS,
  Cloudflare, SMTP, GitHub, and certificate-provider governance remains open.
- Rollback: root-only artifacts are
  `media-binary-pre-account-controls-20261029T020440Z-61eef8b`,
  `media-nginx-pre-account-controls-20261029T020440Z-61eef8b`, and
  `media-db-pre-account-controls-20261029T020440Z-61eef8b.sql` under
  `/var/backups`; the previous frontend release remains available.

**Verdict:** mitigate then ship. Release gates were password reauthentication,
exact destructive confirmation, strict origin/rate controls, explicit export
DTOs, a 10,000-record memory bound, transactional queueing/counter repair,
reference-checked retryable cleanup, clean dependency audits, rollback artifacts,
and a zero-residue production canary. Asynchronous large-account export,
retention/legal-hold policy, privacy documentation, queue alerts, and restore
testing remain mandatory follow-up work.

## CISO review record — private accounts and follow requests

**Date:** 2026-10-29

- Top threats: privacy bypass through secondary JSON or media routes
  (medium/high), follow-request spam and relationship growth (medium/medium), and
  request/block/privacy races that grant stale access (medium/high).
- Controls: transactional two-account locks, FK-backed pending requests, 5,000
  outgoing and 1,000 incoming-pending limits, stricter edge write throttling,
  one audience rule across content paths, and per-request Nginx authorization for
  non-cacheable post media. Blocking removes pending and accepted edges.
- Validation: isolated and Cloudflare Tunnel matrices exercised public, pending,
  accepted, revoked, blocked, search, saved, comment, interaction, connection,
  export-v3, file cleanup, and stale-media behavior. Canary data returned to zero
  application rows. This checkpoint recorded one separately verified 2025 orphan
  as permanently removed, but the 2026-11-01 audit found the same path present or
  restored; that deletion claim is superseded by the containment record below.
- Rollback: root-only artifacts are
  `media-binary-pre-private-20261029T131654Z-b7114c9`,
  `media-nginx-pre-private-20261029T131654Z-b7114c9/`, and
  `media-db-pre-private-20261029T131654Z-b7114c9.sql` under `/var/backups`. The
  previous frontend release remains available. A second binary backup,
  `media-binary-pre-media-auth-fix-20261029T131954Z-f5aaa9d`, protects the
  auth-subrequest status correction.
- Open incident: Brevo rejects SMTP authentication with permanent `535` errors.
  Verification and recovery delivery are unavailable until the credential is
  rotated and an end-to-end mailbox canary passes.

**Verdict:** mitigate then ship for private-account authorization. SMTP remains
an independent P1 incident; centralized policy tests, abuse alerts, granular
audiences, and a restore drill remain required.

## CISO review record — bounded in-app notifications

**Date:** 2026-10-29

- Top threats: notification spam/storage or query exhaustion (medium/high),
  cross-account IDOR or block leakage (medium/high), and duplicate/stale events
  created by interaction races (medium/medium).
- Blast radius: an endpoint authorization defect could expose actors and social
  event metadata for the authenticated victim; a full API/database compromise
  retains the broader all-application-data blast radius. Production returned to
  zero persistent users at the checkpoint. User/revenue inputs remain
  unavailable, so a defensible FAIR ALE cannot be calculated.
- Controls: FK cascades, check constraints, unique server-derived event keys,
  transactional source actions, recipient row locks, a hard 500-row cap, bounded
  pagination, edge write throttling, recipient-only mutations, defense-in-depth
  block filtering, and atomic two-direction cleanup on block.
- Detection: request-ID/status/latency logs exist and the target MTTD is 15
  minutes, but no alert currently detects notification velocity, repeated cap
  pruning, or blocked-pair anomalies; current automated MTTD is therefore
  unknown.
- Response: the runbook above covers route containment, evidence, scoped block
  checks, binary rollback, and recovery canaries. The scenario was exercised by
  isolated and production/Tunnel canaries; a multi-person tabletop and database
  restore drill remain open.
- Regulatory: notification metadata is personal data; a suspected breach needs
  immediate GDPR assessment and may require supervisory-authority notification
  within 72 hours after awareness.
- Vendors/supply chain: no dependency, secret, vendor, processor, email, or push
  service was added. Existing Cloudflare/VPS/MySQL governance remains in scope.
- Validation: 40 backend tests plus five seed tests, strict Clippy, release build,
  RustSec scan of 265 locked crates, npm build/audit, repeat migration starts,
  a 500-row production cap test, IDOR rejection, export v4, source cleanup,
  block cleanup, direct Nginx checks, and a Cloudflare Tunnel canary all passed.
  Application rows returned to zero and all services retained zero unexpected
  restarts.
- Rollback: root-only artifacts are
  `media-binary-pre-notifications-20261029T183232Z-9c43be6`,
  `media-nginx-pre-notifications-20261029T183232Z-9c43be6/`, and
  `media-db-pre-notifications-20261029T183232Z-9c43be6.sql` under
  `/var/backups`; the prior frontend release remains available. The deployed
  frontend is `20261029T183232Z-9c43be6` and the migration is additive.
- Open incident: Brevo still rejects SMTP authentication with `535`; in-app
  notifications reduce dependence on email for social activity but do not
  restore verification or password-recovery delivery.

**Verdict:** ship with monitoring. Granular notification preferences were added
in the subsequent 2026-10-30 release. Automated abuse/privacy alerts, quiet
hours/digests, a multi-person tabletop, and a tested restore remain follow-ups;
the independent SMTP P1 is not accepted by this verdict.

The preference rollout applied migration `20261030000000` and retained root-only
pre-release binary/database artifacts named with
`20261030T005331Z-94bb5a6`. Its Tunnel canary reached the edge mutation limit
after one of two account deletions; the remaining `.invalid` account was resolved
exactly and deleted transactionally, followed by zero-row checks across users,
sessions, tokens, security events, social relationships, notifications,
preferences, content, trust-and-safety, moderation, and upload lifecycle tables.

## CISO review record — least-privilege moderation

**Date:** 2026-10-30

- Top threats: unauthorized elevation through a role grant (high/high), reporter
  identity or internal-note disclosure (medium/high), and tampered or repudiated
  report transitions (medium/high).
- Blast radius: a compromised moderator can inspect the bounded report queue and
  evidence available to that role but cannot grant roles or trigger content/user
  enforcement. An administrator can override assignments and inspect role
  history. Full API/database compromise retains the broader all-application-data
  and credential blast radius. Production returned to zero persistent users at
  the checkpoint, so a defensible FAIR ALE still cannot be calculated.
- Controls: no HTTP role grant, offline exact-UUID grants, a database role-change
  trigger, current-role checks on every request, password step-up and row locks
  for mutations, assignment ownership, self-moderation prevention, reporter-safe
  DTOs, evidence snapshots, transactional action events, admin-only role audit,
  and no automatic enforcement on resolution.
- Detection: privacy-redacted request logs and both audit tables exist; target
  MTTD is 15 minutes for unexpected grants, bulk queue access, repeated failed
  step-up, or stuck reports. Automated alerts do not yet exist, so current MTTD
  remains unknown and manual review is required.
- Response: the moderation containment section and
  `MODERATION_OPERATIONS.md` cover emergency revocation, session invalidation,
  report release, evidence preservation, verification, and forward recovery. A
  multi-person tabletop and database restore drill remain open.
- Regulatory: reports, evidence excerpts, role events, and internal notes can be
  personal data. Suspected exposure requires immediate GDPR assessment and may
  require supervisory-authority notification within 72 hours after awareness.
  Retention/legal-hold policy and appeal/user-notice design are not yet approved.
- Vendors/supply chain: no dependency, vendor, processor, or externally hosted
  moderation service was added. Existing VPS, Cloudflare, MariaDB, GitHub,
  certificate-provider, and broken Brevo SMTP governance remains in scope.
- Validation: strict Clippy, 44 backend tests plus five seed tests, release build,
  a no-finding 265-crate RustSec scan, npm build/audit with zero findings, clean
  fresh migration, role-trigger checks, isolated authorization/privacy matrices,
  and a public Cloudflare Tunnel canary passed. The canary verified ordinary-user
  rejection, reporter pseudonymity, claim, admin override, reporter-safe state,
  action audit, and role audit; all canary rows returned to zero. The host has no
  browser, so a new visual-regression pass was not performed there.
- Rollback: root-only artifacts are
  `media-binary-pre-moderation-20261030T000952Z-b7bb7e7`,
  `media-nginx-pre-moderation-20261030T000952Z-b7bb7e7/`, and
  `media-db-pre-moderation-20261030T000952Z-b7bb7e7.sql`. Frontend release
  `20261030T000952Z-b7bb7e7` is active. Prefer a forward fix after real terminal
  report data exists.
- Open incident: Brevo again returned permanent SMTP `535` during this canary.
  Verification and recovery delivery remain unavailable.

**Verdict:** mitigate then ship for non-destructive moderation triage. Appeals,
transparent notices, dual-control grants, approved retention/legal holds,
automated alerting, separately authorized enforcement, a visual browser pass,
tabletop testing, and restore testing remain follow-ups. SMTP P1 remains outside
and unaccepted by this verdict.

## CISO review record — strict bounded pagination

**Date:** 2026-10-30

- Top threats: availability loss from deliberately deep database scans
  (medium/high), inconsistent coercion of malformed query values
  (medium/medium), and a future authorization bypass hidden by divergent list
  implementations (low/high).
- Blast radius: repeated expensive scans can degrade the database-backed API for
  every user. The release checkpoint has no persistent production users, but
  user-count, revenue, recovery-cost, and loss-frequency inputs are unavailable,
  so a defensible FAIR annualized-loss estimate cannot be calculated.
- Controls: one fail-closed parser now rejects malformed, fractional, negative,
  zero-limit, over-limit, and collection-over-budget values. The general offset
  ceiling falls from 1,000,000 to 10,000; smaller collections retain lower caps.
  Authentication and ownership checks still run before pagination on protected
  resources.
- Detection: privacy-redacted request logs retain route, status, latency, and
  request ID without query values. Target MTTD is five minutes for sustained
  `400` shifts or database latency, but no owned automatic alert exists, so
  current automated MTTD remains unknown.
- Response: the main runbook provides exact-route containment, evidence capture,
  binary rollback, readiness checks, and credential-independent public canaries.
  A multi-person tabletop and a database restore exercise remain open.
- Regulatory: an availability event alone does not automatically establish a
  reportable breach. Any incident affecting the confidentiality, integrity, or
  availability of personal data starts immediate GDPR assessment and may trigger
  the 72-hour supervisory-authority window after awareness.
- Vendors/supply chain: no dependency, secret, processor, vendor, or external
  service was added. Existing Cloudflare, VPS, MariaDB, and logging governance
  remains in scope.
- Validation: 55 backend tests plus five seed-binary tests, strict Clippy,
  release compilation, and an isolated production-database candidate passed.
  The candidate accepted exact boundaries, rejected seven malformed/over-budget
  cases with generic responses, omitted query strings from logs, and was stopped
  before deployment.

**Verdict:** mitigate then ship. The shared parser, collection-specific budgets,
generic errors, candidate matrix, health gates, root-only rollback binary, and
public Tunnel canary are release requirements. Cursor pagination, database
latency metrics, owned alerts, a tabletop, and restore testing remain follow-ups.

## CISO review record — graceful API shutdown

**Date:** 2026-11-01

- Top threats: interrupted writes or uploads during routine releases
  (medium/medium), deliberate slow requests exhausting the drain window
  (medium/medium), and a failed signal handler leaving a process unable to stop
  cleanly (low/high).
- Blast radius: normal release risk is limited to requests active at the stop
  boundary. A process that fails to terminate can delay the API replacement for
  every user until systemd's hard stop. Production has zero persistent users at
  this checkpoint, while revenue, incident cost, and loss-frequency inputs remain
  unavailable, so a defensible FAIR annualized-loss estimate cannot be produced.
- Controls: the API stops accepting new connections on `SIGTERM` or `SIGINT`,
  drains active work, records the transition, and remains bounded by systemd's
  15-second `TimeoutStopSec` plus forced termination. Signal-handler installation
  errors are logged instead of panicking the running service.
- Detection: the journal records shutdown receipt, request completion, unit result,
  stop timeouts, forced kills, and restarts. Target MTTD is five minutes for a
  failed or forced release, but no owned automatic alert exists, so automated MTTD
  remains unknown.
- Response: the shutdown section above preserves the hard bound during active
  exploitation. The broader runbook covers evidence capture, rollback, readiness,
  and Tunnel canaries. A multi-person tabletop and tested database restore remain
  open.
- Regulatory: availability loss involving personal data requires immediate GDPR
  assessment; if it constitutes a personal-data breach, the supervisory-authority
  notification window may be 72 hours after awareness.
- Vendors/supply chain: no dependency, processor, vendor, secret, or external
  service was added. Existing VPS, systemd, Cloudflare, MariaDB, GitHub, and broken
  Brevo SMTP governance remains in scope.
- Validation: strict Clippy, 55 backend tests plus five seed tests, release
  compilation, and an isolated production-database candidate passed. During the
  signal canary, new connections were refused immediately, an incomplete active
  request kept the process alive, and closing that request produced a clean
  systemd `success` result with no listener or process left behind.

**Verdict:** mitigate then ship. Graceful signal handling, a 15-second forced-stop
bound, candidate drain proof, a root-only rollback binary, readiness gates, and a
public Tunnel canary are release requirements. Automated alerting, a tabletop,
and restore testing remain follow-ups; the SMTP P1 is outside this verdict.

## CISO review record — mobile application icons

**Date:** 2026-11-01

- Top threats: a malformed release asset breaking the mobile shell
  (low/medium), an unsafe offline cache retaining private API data (medium/high),
  and vulnerable build tooling processing repository paths (medium/medium).
- Blast radius: incorrect static metadata can affect branding or installation for
  every visitor but cannot read or mutate account data. No service worker or
  offline cache is introduced. Production has zero persistent users at this
  checkpoint; financial and frequency inputs remain unavailable, so a defensible
  FAIR annualized-loss estimate cannot be calculated.
- Controls: icons are generated deterministically with Node built-ins, the
  maskable asset is opaque with the mark inside its safe zone, and the release
  gate validates manifest scope, display mode, colors, purpose, PNG signatures,
  and exact dimensions. The existing SVG remains a fallback.
- Detection and response: build failure blocks release; public manifest, asset
  MIME/cache headers, HTML links, and prior-release rollback are canary gates.
  Target MTTD is the release canary window, although no owned alert monitors PWA
  metadata between releases.
- Regulatory: this release changes static presentation only and adds no personal
  data collection, storage, sharing, processor, identifier, or tracking surface.
- Vendors/supply chain: no package or vendor is added. `npm audit` identified the
  transitive build-only `sucrase` 3.35.0 path through vulnerable `glob` and
  `minimatch`; the lockfile now selects `sucrase` 3.35.1, removes that dependency
  subtree, and returns zero known findings at the low threshold.

**Verdict:** mitigate then ship. A clean locked install, deterministic generation,
all frontend contracts, the asset/manifest release gate, zero-finding audit,
atomic frontend release, and public Tunnel canaries are required. Offline support
remains explicitly out of scope until private-data caching rules are designed and
tested.

## CISO review record — generated sitemap consistency

**Date:** 2026-11-01

- Top threats: silently omitting a public route from discovery (low/medium),
  duplicate or malformed URL metadata confusing crawlers (low/medium), and stale
  modification claims diverging from page JSON-LD (low/low).
- Blast radius: all six editorial pages can lose search discoverability, but the
  change cannot access account data, secrets, the API, or authenticated routes.
  Revenue and search-conversion inputs are unavailable, so a defensible FAIR
  annualized-loss estimate cannot be calculated.
- Controls: one route registry now generates both pre-rendered metadata and the
  sitemap. The release gate rejects missing or duplicate URLs, malformed dates,
  unsupported change frequencies, non-indexable public pages, and sitemap/JSON-LD
  divergence.
- Detection and response: build failure blocks release; direct-origin and Tunnel
  canaries verify XML MIME, all canonical URLs, modification dates, public-page
  status, and prior-release rollback. Search Console monitoring remains open, so
  crawler-side MTTD is otherwise unknown.
- Regulatory and vendors: no personal-data processing, dependency, processor,
  vendor, or external submission is added.

**Verdict:** ship with the build gate and atomic rollback. A public sitemap
canary is mandatory; Search Console ownership and crawl/index alerting remain
follow-ups.

## CISO review record — frontend release automation

**Date:** 2026-11-01

- Top threats: release-ID/path injection reaching root-owned paths (high/high),
  partial or corrupted staging replacing the site (medium/high), and rollback to
  an unintended target after a failed canary (medium/high).
- Blast radius: a faulty activation can make the static frontend unavailable for
  every visitor. The API, database, secrets, uploads, Nginx configuration, and
  service processes are outside the deployer's mutation scope. Production has
  zero persistent users at this checkpoint, and financial inputs remain unknown.
- Controls: only a strict UTC timestamp plus lowercase Git SHA is accepted; all
  filesystem roots are fixed; source symlinks, escaped current targets, existing
  destinations, and non-root activation are rejected. Build/audit run unprivileged.
  Staging checks file count and critical SHA-256 values before an atomic symlink
  switch. Direct-origin and Tunnel canaries trigger exact-target rollback. No
  release is automatically deleted.
- Detection and response: failed staging, integrity, activation, or HTTP gates
  terminate nonzero with the rollback result and prior target. MTTD for release
  regressions is the canary window; between releases, owned external alerting is
  still absent.
- Regulatory: frontend availability can affect access to personal-data controls,
  so an incident still requires GDPR impact assessment, but this change adds no
  personal-data processing or disclosure path.
- Vendors/supply chain: no dependency, vendor, processor, secret, or external
  deployment platform is added.
- Validation: Bash syntax, ShellCheck, a positive dry-run, invalid-ID rejection,
  existing-target rejection, the frontend build gate, and zero-finding npm audit
  passed. A live activation/rollback-path exercise remains a release requirement.

**Verdict:** mitigate then ship. Exercise the committed script against production
with the current release retained, verify all services and public behavior, and
record the exact automatic rollback target before relying on it operationally.

## CISO review record — backend release automation

**Date:** 2026-11-01

- Top threats: path or binary tampering under root authority (high/high), an
  unexpected migration mutating production data (high/high), and a broken API
  promotion causing full application outage (medium/high).
- Blast radius: a malicious API binary can access all application data and the
  DB/SMTP credentials available to the service. A failed release can interrupt
  the API for every user. Production has zero persistent users at this checkpoint;
  revenue, incident-cost, and frequency inputs remain unavailable, so a
  defensible FAIR annualized-loss estimate cannot be calculated.
- Controls: the deployer accepts only a strict timestamp/SHA identifier and fixed
  paths; validates ELF artifacts and critical hashes; requires a root-only mode
  `0600` environment; and rejects failed, pending, extra, or reordered migrations.
  The isolated candidate runs as `www-data` on loopback with background upload
  maintenance disabled. Promotion is atomic, retains a root-only prior binary,
  and rolls back on direct-origin, Tunnel, public, service, hash, or restart gates.
- Detection and response: candidate and live health/auth/pagination boundaries,
  systemd state, restart count, migration log markers, and hashes fail the release
  within the canary window. The incident runbook covers containment and exact
  binary recovery, but owned external alerts, a multi-person tabletop, and a DB
  restore drill remain open.
- Regulatory: an outage or compromise affecting personal data starts immediate
  GDPR assessment and may trigger the 72-hour supervisory-authority window after
  awareness.
- Vendors/supply chain: no dependency, vendor, processor, secret, or external
  deployment service is added. Existing VPS, systemd, MariaDB, Cloudflare, GitHub,
  and broken Brevo SMTP governance remains in scope.
- Validation before live exercise: 58 backend tests plus five seed tests, strict
  Clippy, locked release build, zero-finding RustSec scan across 265 crates, Bash
  syntax, ShellCheck, valid dry-run, invalid-ID rejection, root-visible existing
  destination rejection, and a maintenance-isolated production-DB candidate
  passed. The candidate left users and both upload-lifecycle tables unchanged.

**Verdict:** mitigate then ship for releases with exact migration parity. The
committed deployer must pass a real activation plus exact rollback/restore drill
before operational reliance. Releases containing migrations remain blocked from
this path and require the dump-backed reviewed migration workflow.

The first live attempt stopped before backup or promotion because the root-owned
candidate directory did not grant `www-data` traverse permission. The live hash,
service, database, and port were unchanged. Commit `f52489d` narrowed candidate
access to `root:www-data` mode `0750`; the second attempt then passed every gate,
activated binary hash `221d34b40616045469b8177de4a893b60175f674c1f1bce2c65db3dcdd45cbd1`,
and retained the prior hash in a root-only backup. A controlled drill restored
that exact prior binary, verified readiness, reactivated the new candidate, and
verified direct and public readiness again. The verdict's live-exercise condition
is satisfied for code-only releases with exact migration parity.

## CISO review record — isolated database restore drill

**Date:** 2026-11-01

- Top threats: dropping or restoring over the live database (low/critical),
  leaving a plaintext personal-data dump behind (medium/high), and creating load
  or inconsistent backup data during the drill (low/high).
- Blast radius: a target-selection failure could destroy all application data;
  dump disclosure could expose every stored account and content record. Production
  has zero persistent users at this checkpoint, but the control is designed for
  nonzero future data. Financial impact and annual frequency remain unknown.
- Controls: the source name and generated target are allowlisted identifiers;
  the target must use a unique `_restore_drill_` prefix and cannot equal the
  source. The dump uses `--single-transaction`, mode `0600`, a root-only random
  directory, and no retained copy. Restore verification covers schema SHA-256,
  all base-table row counts, SQLx version/success/checksum history, and
  `mariadb-check`. Cleanup drops only the exact prefixed database and deletes only
  the exact temporary directory.
- Detection and response: any mismatch exits nonzero and the trap retries isolated
  cleanup. Source schema is hashed again before success. Database/server health,
  temporary-schema inventory, and filesystem inventory are post-drill gates.
  Automated external alerts and a timed RTO/RPO exercise remain open.
- Regulatory: temporary dumps remain personal data whenever production contains
  it. Unauthorized access triggers immediate GDPR assessment and may trigger the
  72-hour notification window; no dump may be retained as an undeclared backup.
- Vendors/supply chain: no dependency, vendor, processor, or off-host transfer is
  added; the drill uses the local MariaDB tools and root socket.
- Validation before live exercise: Bash syntax, ShellCheck, strict-name checks,
  root-only execution, source discovery, charset/collation discovery, and a
  read-only dry-run over 23 tables passed.

**Verdict:** mitigate then ship. Run only while the source service is healthy,
confirm zero unexpected application restarts, prove the isolated database and
temporary dump are gone, and record table/row/schema/migration results. This is
not a substitute for encrypted scheduled backups or an off-host disaster drill.

The first live drill passed in 6.7 seconds across all 23 base tables and 12 rows,
which were the SQLx migration history at this zero-user checkpoint. Schema
SHA-256 was `ff67072384a5277123cba20e1729114962f370b6d5e9c4b14b1a172ee1a6c0b4`;
the migration fingerprint was
`58776476252caba16714b592cbcbdee082d63ae5281442b10b1f9736ab4855f5`.
Post-drill inventory found no prefixed database or temporary directory. The live
schema, user count, latest migration, service states, API binary hash, restart
count, and direct/public readiness remained unchanged.

## CISO review record — encrypted off-site backup and recovery

**Date:** 2026-11-01

- Top threats: plaintext database or upload disclosure through the backup path
  (medium/critical), destructive or misdirected remote cleanup (low/critical),
  and an unreadable/corrupt backup falsely reported as successful (medium/high).
  Theft of the current full-scope Google OAuth token can affect more than this
  backup folder even though the dedicated rclone config is logically pinned.
- Blast radius: a backup disclosure can expose the entire application database
  and managed media at the captured point in time. `backend/.env`, DB credentials,
  and SMTP credentials are excluded. Production still has zero persistent users,
  but future bundles can contain all account/content PII. Financial impact,
  incident cost, and event frequency remain unknown, so a defensible FAIR ALE
  cannot be calculated. Token theft may expose the wider personal Drive until
  OAuth scope is reduced and reauthorized.
- Controls: rclone crypt encrypts content and names client-side; a dedicated
  `root:root 0600` config contains only Drive/crypt remotes and pins Drive to the
  encrypted folder ID. Root timers execute only `root:root 0755` copies under
  `/usr/local/libexec`. Bundle IDs and paths are strict, `sync` is never used,
  partial cleanup is limited to the new ID, retention begins only after successful
  redownload and SHA-256 verification, and pruning accepts only strict IDs older
  than 35 days. Plaintext staging is root-only and removed by an exact-path trap.
- Detection: every run records a root-only success marker and journald outcome;
  backup corruption is detected within the daily run and recoverability is
  exercised weekly. The schedule implies a nominal RPO below roughly one day,
  but realistic-volume RPO/RTO is unmeasured. Explicit job failures now trigger
  the existing Telegram/email operator notifier, and an hourly watchdog alerts
  after 30 hours without a verified backup or nine days without a passed drill.
  The shared Telegram delivery path is now exercised by the production service
  monitor record below. Backup-unit-specific failure injection, email fallback,
  and independent notifier monitoring remain open.
- Response: the local and off-host restore procedures have both passed. The
  off-host drill restores only to a generated `social_media_offsite_drill_*`
  database, validates schema, SQLx history and `mariadb-check`, extracts media,
  then removes the database and staging. Offline crypt-key recovery, a
  multi-person tabletop, and pre-written communications remain open.
- Regulatory: retained backups contain personal data once users exist. Google
  Drive is a processor/subprocessor dependency requiring DPA, region, retention,
  deletion, lawful-basis and incident-routing review. A qualifying breach starts
  immediate assessment and may trigger the GDPR 72-hour notification window.
- Vendors/supply chain: Google Drive and rclone are now recovery dependencies.
  Rclone's official guidance states its shared Drive client ID will stop working
  during 2026; the current remote demonstrably still uses it and has `drive`
  scope. A private client ID, least-privilege scope review, reauthorization, and
  repeat backup/restore drill are P1.

**Verdict:** mitigate then ship. The client-side encryption, fixed copy-only
prefix, verified download, strict retention, root-owned runtime, folder pinning,
isolated restore, and cleanup gates satisfy the immediate production condition.
Operational reliance remains conditional on creating private Google OAuth
credentials, storing crypt recovery material outside this VPS, and testing plus
independently monitoring the existing operator-alert delivery path.

The first backup `20261101T142349Z` passed upload and redownload verification.
The first scheduled restore failed closed when systemd 259's
`RestrictSUIDSGID` made GNU tar's safe `openat2` traversal return `ENOSYS`; no
temporary DB or staging remained. Commit `1fbf4d4` removed only that incompatible
control and added archive type/mode and extraction compensations. Commit
`77093d0` then moved runtime executables out of the user-owned checkout, emptied
capability sets, and pinned the dedicated Drive remote by folder ID.

The final end-to-end run created and redownloaded backup `20261101T143350Z`, then
restored it through the scheduled unit in seven seconds. It verified all 23
tables, 12 migration rows, schema SHA-256
`ff67072384a5277123cba20e1729114962f370b6d5e9c4b14b1a172ee1a6c0b4`, SQLx
fingerprint `58776476252caba16714b592cbcbdee082d63ae5281442b10b1f9736ab4855f5`,
and one 24,627-byte upload. No temporary database or local staging remained;
API, Nginx, Tunnel, and MySQL stayed active with zero API restarts and passing
direct/public readiness.

Commit `5ecceb4` wired backup, restore and freshness-check failures to the host's
existing `swift-vapor-alert@.service` Telegram/email notifier. The root-owned
hourly health executable passed against both live evidence files, all three
timers are enabled and active, and its systemd exposure score is 0.9 (`SAFE`).
No backup-unit failure was generated at this checkpoint. A later controlled
service-monitor failure exercised the same shared notifier and delivered to
Telegram; backup-unit-specific triggering and email fallback remain untested.

## CISO review record — production service health monitoring

**Date:** 2026-11-01

- Top threats: an API/Nginx/Tunnel/database outage remaining undetected
  (medium/high), a privileged monitor expanding compromise blast radius
  (low/high), and transient Internet failure producing alert noise (medium/low).
- Blast radius: the monitor receives no cookie, API key, DB credential, user data,
  or writable application path. A compromise can make outbound HTTP requests and
  query systemd state but has an empty capability set and cannot mutate services.
- Controls: commit `9f7e99f` adds two bounded attempts across four fixed service
  states and seven fixed HTTP boundaries: backend readiness, anonymous auth and
  pagination rejection, local Nginx/TLS, homepage delivery, and public Cloudflare
  Tunnel readiness. Commit `ddeafec` runs it as the dedicated non-login
  `social-media-monitor` account after systemd 259 proved incompatible with
  manager queries from `DynamicUser`. Commit `cc518f8` adds 14-day expiry gates
  for both the local origin and public edge certificates, plus root filesystem
  block/inode thresholds of 85% and a 10 GiB minimum-free floor. The unit
  exposure score is 1.5 (`OK`).
- Detection: the monotonic timer runs roughly every five minutes with at most 30
  seconds of jitter; normal execution completed in under one second. A sustained
  covered outage should therefore alert in approximately six minutes or less,
  excluding notifier/network failure. The live capacity checkpoint is 79% blocks,
  13% inodes and roughly 110 GB free; both certificates extend into January 2027.
  Abuse, latency, process-level saturation and business SLO detection remain
  outside this monitor.
- Response: all failures use `swift-vapor-alert@%n.service`. The initial
  `DynamicUser` incompatibility failed closed and triggered a real alert; the
  notifier reported successful Telegram delivery. The application services
  stayed active throughout. Email fallback, alert throttling under a storm,
  independent notifier health, and a multi-person tabletop remain open.
- Regulatory: the monitor processes no personal data. A detected outage or
  security incident still starts the normal GDPR impact assessment; availability
  loss involving personal data may be reportable depending on risk.
- Vendors/supply chain: no new vendor or dependency was added. Detection still
  depends on systemd, Nginx, Cloudflare Tunnel, Telegram and the existing email
  fallback, whose ownership/DPA/incident-routing review remains required.

**Verdict:** ship. The monitor is least-privilege, live-tested and alert-delivery
verified for Telegram. Do not treat it as application security analytics or as
independent monitoring of its own notifier.

## CISO review record — orphan upload and CDN cache containment

**Date:** 2026-11-01

- Top threats: an unowned legacy image remained anonymously accessible
  (confirmed/high), a CDN copy survived origin removal because it was marked
  public and immutable for 30 days (confirmed/high), and automatic orphan cleanup
  could destroy evidence or legitimate data (low/high).
- Blast radius: the confirmed object is one 24,627-byte JPEG at
  `/uploads/avatars/672da927-79fd-4aad-8332-a5a3a347cf0c_c6d9cdf1-6469-4147-bdc2-da6bba370f0b.jpg`.
  It has no reference in users, posts, `managed_uploads`, or the deletion queue;
  production currently has zero users. Its content and provenance have not been
  classified, so personal-data impact cannot be assumed absent. The first two
  encrypted off-site bundles retain the historical object until normal 35-day
  retention, and a protected pre-P0 local backup also contains a copy.
- Controls and evidence: the live file was moved, not deleted, to root-only
  quarantine ID `20261101T144016Z`; its SHA-256 is
  `0fc5a98b12e580b29e1c8d3917c4176d5bbf10be5a20c280e33496ab8340e02b`.
  The quarantine chain is `root:root 0700` and the evidence file is mode `0600`.
  Commit `25c0c8e` adds an hourly read-only DB/filesystem reconciliation that
  alerts on orphaned, missing, special, symlinked, or structurally unexpected
  entries and never deletes automatically. Its production result is 0 physical,
  0 expected, 0 orphaned, and 0 missing files; sandbox exposure is 0.9 (`SAFE`).
- Cache containment: commit `cf02df6` makes managed avatar responses
  `private, no-store` and rejects every upload subtree other than managed avatars
  and access-controlled posts. Direct origin and new Tunnel cache keys return
  `404`; Cloudflare reports `BYPASS`. The exact pre-existing URL still returns
  `200` with `CF-Cache-Status: HIT`. The available analytics token is active but
  lacks zone `Cache Purge` authority (`10000 Authentication error`), so CDN
  containment is not complete. Purge that single URL with an appropriately
  scoped credential and prove repeated public `404` responses before closure.
- Recovery validation: after quarantine, backup `20261101T185747Z` passed remote
  redownload verification with 23 tables and zero uploads. The scheduled restore
  drill restored that exact bundle, verified 23 tables and 12 migration rows,
  found zero uploads, and removed its generated database and local staging.
  Commit `3d89f4b` also prevents OAuth refresh from rewriting the user-owned rclone
  config by installing from a verified root-only snapshot.
- Detection and response: preserve the quarantine and access logs, identify the
  image/provenance and any affected person, bound the period of public and cached
  access, complete the exact Cloudflare purge, and record the deletion or legal
  hold decision. Retained Nginx logs cover 2026-10-28 00:53 through 2026-11-01
  21:04 local time. They contain 10 origin requests for the exact path from two
  client addresses: five `200`, five `404`, all with curl user agents and no
  referrer. This is consistent with operational testing but is not proof of
  attribution; it excludes earlier activity and every Cloudflare cache HIT that
  never reached origin. Obtain edge logs if available. Do not bulk-delete
  historical backups or quarantine evidence.
- Regulatory: treat this as a potential personal-data incident until content and
  access evidence show otherwise. Record awareness time, scope, likelihood and
  severity; assess GDPR supervisory-authority notification within 72 hours of
  awareness and data-subject communication if high risk is likely. Balance
  evidence preservation with storage limitation and the documented retention
  decision.
- Vendors/supply chain: Cloudflare edge caching extended the exposure after
  origin containment. Establish a least-privilege emergency purge credential,
  owner, rotation schedule and tested per-URL purge playbook; do not reuse the
  analytics token by silently broadening its role.

**Verdict:** do not close. Origin containment, future-cache prevention, evidence
preservation, drift detection, and clean recovery are verified. Exact edge-cache
purge plus documented content/access/GDPR assessment remain P1 exit conditions.

## CISO review record — exact Cloudflare purge utility

**Date:** 2026-11-01

- Top threats: a broad or attacker-controlled purge causing avoidable origin load
  (low/medium), token disclosure granting cache-control authority across the zone
  (low/high), and a successful API response being mistaken for verified removal
  (medium/high).
- Blast radius: a dedicated token with `Cache Purge` can evict cached content in
  the production zone, but cannot read application data. The local tool further
  restricts operation to one allowlisted managed image and exposes no hostname,
  prefix, tag, or whole-zone selector.
- Controls: commit `a85e5e1` accepts only a strict avatar/post image path, reads a
  fixed `root:root 0600` JSON credential, validates its exact schema, and sends
  the bearer token to curl over stdin rather than arguments or environment. It
  refuses to purge until local TLS origin returns `404` plus `no-store`, then
  requires a public `404` with a non-HIT Cloudflare state. Environment proxies,
  redirects, query strings, traversal and arbitrary hosts are excluded.
- Detection and response: API HTTP/result errors are sanitized to code/message;
  post-purge polling fails closed. The installed root-owned executable matches
  the repository hash. Invalid traversal and missing-credential tests return 65
  and 66 respectively. No successful production purge is claimed because the
  dedicated credential is deliberately absent.
- Regulatory: exact purge supports erasure and incident containment, but does not
  replace the retention/legal-hold decision or GDPR incident assessment. Record
  operator, target, time, API result and public verification without copying the
  image or token into logs.
- Vendors/supply chain: Cloudflare documents `Cache Purge` as the accepted token
  permission and warns that API success only accepts the request; the URL must be
  fetched again to verify cache state. Scope a new token only to the production
  zone, rotate it, and keep analytics/Telegram credentials separate.

**Verdict:** ship the inert tool; block live use until the dedicated credential
exists. After provisioning, purge the legacy URL and require repeated public
`404`/non-HIT evidence before closing the cache-containment P1.

## CISO review record — accessible command palette

**Date:** 2026-11-02

- Top threats: a global shortcut intercepting text or password entry
  (medium/medium), privileged navigation being advertised to anonymous or
  ordinary accounts (low/low because backend authorization remains decisive),
  and attacker-controlled profile identifiers changing the destination path
  (low/medium).
- Blast radius: the change is a static frontend navigation layer used by every
  browser session. It has no credential, API, database, upload, local-content
  storage, background execution, or destructive action. A defective release
  could impede navigation, but cannot grant backend privileges. Production had
  zero persistent users at this checkpoint.
- Controls: commands are a fixed local catalog rather than server- or
  user-supplied HTML. Anonymous, member, and moderator/admin entries are derived
  from the existing session state; profile paths reuse the shared segment
  encoder. `Ctrl`/`Cmd`+`K` is ignored in input, textarea, select, and
  `contenteditable` targets. The modal implements initial focus, cyclic Tab
  containment, Escape/backdrop dismissal, focus restoration, ARIA dialog and
  combobox relationships, selected-option announcements, reduced-motion
  inheritance, and a 320 px mobile sheet layout.
- Detection and response: 20 frontend tests, production build gates, dependency
  audit, atomic direct/Tunnel canaries, exact live-asset checksum comparison,
  and the existing five-minute service monitor all passed. Those checks detect
  release/availability failure but not palette-specific interaction errors;
  automated browser and screen-reader regression remain open. Roll back the
  frontend pointer to `20261101T140635Z-706ef08` if navigation or accessibility
  regresses; no schema or data reversal is required.
- Regulatory: the palette stores and transmits no search terms or other personal
  data, creates no profiling, and adds no retention. Existing session state is
  used only in memory to choose locally defined commands.
- Vendors/supply chain: no new dependency, processor, external request, or
  browser storage was added. The locked dependency audit has zero findings; the
  normal Cloudflare delivery path and its existing availability/privacy review
  remain unchanged.

**Verdict:** ship. The feature is bounded, role-aware, keyboard-safe, reversible,
and does not expand data or vendor scope. Add automated browser and assistive-
technology regression before treating accessibility as continuously verified.

## CISO review record — temporary post drafts

**Date:** 2026-11-02

- Top threats: plaintext draft text being read by malicious same-origin script or
  someone with access to an unlocked browser tab (low/high), one account seeing
  another account's draft on a shared device (low/medium), retention exceeding
  the stated limit in a long-lived/restored tab (medium/medium), and failed
  storage deletion being presented as success (medium/low).
- Blast radius: at most one 500-character text draft per account per top-level
  browser tab under this versioned key. No selected image, cookie, credential,
  server record, cross-device copy, or third-party request is included. The text
  may still contain sensitive personal data chosen by the author and is readable
  by JavaScript running on the Media origin; existing XSS prevention therefore
  remains a prerequisite.
- Controls: `sessionStorage` provides tab/session scoping; the key is isolated by
  encoded account ID. Reads enforce version, type, nonblank content, 500-character
  size, 2 KiB serialization, 24-hour age, and bounded future-clock skew. Invalid
  values are removed. Recovery is explicit and the composer is disabled until
  restore/delete is chosen, preventing silent overwrite. Publication, logout,
  explicit deletion, blank/over-limit text, read-time expiry, and an active
  24-hour timer remove the copy when browser storage permits. Images are excluded
  and blocked until the recovery choice is resolved. Storage/removal failures are
  visible and never block server publication.
- Detection and response: 24 frontend tests cover account isolation, limits,
  malformed/oversized/expired cleanup, explicit removal, and denied storage. The
  build gate checks the crawlable privacy disclosure and sitemap/JSON-LD date;
  direct and Tunnel production content matched. Draft text is deliberately absent
  from application telemetry, so support cannot inspect or remotely delete it.
  A user can delete it in the composer, publish, logout, or end the browser
  session. To disable the feature, activate preserved pre-draft release
  `20261102T000539Z-f0703ee`; note that a server-side rollback cannot purge keys
  in already open browser tabs.
- Regulatory: a draft may be personal data, but processing stays on the user's
  device until publication. Purpose, scope, 24-hour limit, exclusions, controls,
  and storage-failure behavior are disclosed on the interactive and crawlable
  privacy page. A broader legal-basis/retention assessment remains part of the
  unfinished formal privacy program.
- Vendors/supply chain: no dependency, processor, API, cookie, or external
  storage was added. Browser implementation/session-restore behavior is the only
  new platform dependency; the application revalidates age whenever it can read
  the stored value instead of trusting browser lifecycle semantics alone.

**Verdict:** mitigate then ship, with the mitigations implemented. The bounded,
visible, short-lived recovery benefit is proportionate to the residual local/XSS
risk. Do not expand to durable, cross-tab, image, server, or cross-device drafts
without a new privacy model, explicit user control, quotas, deletion semantics,
and a separate security review.

## CISO review record — profile completion checklist

**Date:** 2026-11-02

- Top threats: malformed server counters creating misleading progress
  (low/low), a checklist action navigating outside its intended route
  (low/medium), and users interpreting UI completion as identity verification or
  a security score (medium/low).
- Blast radius: the feature renders only on the signed-in owner's profile and
  reads four fields already returned by the profile endpoint. It adds no write,
  privilege, credential, storage, tracking, processor, or background activity.
  Clicking a CTA enters an existing flow whose normal server-side controls remain
  authoritative.
- Controls: counts are normalized to finite, non-negative integers and profile
  text is reduced to a length check, never injected as checklist markup. Actions
  are fixed functions for avatar settings, bio editing, home composer, and people
  search. The UI calls itself progress/profile guidance, not verification,
  reputation, trust, moderation, or security. It is hidden from non-owners and
  removed at 100%.
- Detection and response: 27 frontend tests and all bundle/static/dependency gates
  passed. Direct and Tunnel copies of the lazy profile chunk matched the release
  checksum and service monitoring remained healthy. Interaction/layout defects
  are not covered by a real-browser suite on this host; roll back the frontend
  pointer to `20261102T001238Z-2f36735` if the profile route regresses. No data
  rollback is needed.
- Regulatory: no new personal data is collected or inferred beyond a transient
  presentation of existing profile fields and counts. No automated decision,
  ranking, profiling record, or telemetry is created.
- Vendors/supply chain: no dependency or external service was added. The existing
  SolidJS/profile API delivery chain is unchanged and the locked npm audit has
  zero findings.

**Verdict:** ship. The feature is presentation-only, reversible, non-authoritative
and data-minimizing. Do not evolve the percentage into ranking, recommendations,
eligibility, or verification without a separate fairness/privacy/security review.
