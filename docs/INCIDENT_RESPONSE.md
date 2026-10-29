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
  application rows; one separately verified 2025 orphan with no DB owner or
  reference was permanently removed.
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

**Verdict:** ship with monitoring. Automated abuse/privacy alerts, notification
preferences, a multi-person tabletop, and a tested restore remain follow-ups;
the independent SMTP P1 is not accepted by this verdict.
