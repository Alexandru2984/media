# Incident Response Runbook

This runbook covers security and availability incidents affecting Media, with a
specific playbook for hostile or privacy-sensitive image uploads. It contains no
credentials. The VPS/repository owner is the current incident commander until a
named on-call rotation and backup contact are recorded in a private system.

## Declare and classify

Declare an incident when any of these occurs:

- repeated `social-media.service` OOM kills, crashes, or unexpected restarts;
- a sustained rise in upload `5xx`, latency, memory, CPU, or rejected files;
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
