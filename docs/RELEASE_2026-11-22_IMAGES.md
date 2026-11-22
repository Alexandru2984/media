# Image descriptions and migration isolation — 2026-11-22

Cloudflare and Tunnel remain in place. Brevo remains excluded from active work;
the public help/privacy/terms corrections were also verified after publication.

## Delivered

Post images accept optional descriptions up to 300 Unicode characters. The
composer and editor provide labels, help, live counts and validation. Preview,
thumbnail and image viewer use the description; published post HTML and social
metadata escape it correctly. Feed, following, profile-post, saved and
search DTOs include it only under their existing audience policy. Owner export
uses format version 8. Temporary drafts store neither image nor description.

Removing/replacing an image clears its prior description, including through the
preceding API binary after rollback. New explicit replacement descriptions are
kept even when their text matches the previous one. Older JSON clients that omit
the field preserve it only for the same image; an empty string clears it. File
read callbacks cannot restore a removed image or overwrite a newer selection.

API startup no longer applies schema changes: it verifies required migration
history/checksums and tolerates later successful additive versions for rollback.
Missing/changed/failed migrations and unexpected older entries fail validation.
The separate `migrate` binary verifies its expected database. Production
`apply-migrations.py` matches its manifest to source and installed history,
allows one pending migration, shares the deployment lock, verifies a root-only
backup by restoring it separately, and runs a sandboxed migration-only process.
Migration compatibility remains a review requirement; future versions are not
automatically proven additive by the history check. Runtime DB privileges have
not yet been separated into a narrower role.

## Verification

- Rust: 73 application, five seed and one migration-command tests pass, plus
  strict Clippy, format and the optimized locked build (79 tests total).
- Frontend: 40 tests and unchanged artifact budgets pass: 126,756 entry JS bytes,
  84,414 CSS bytes and 281,087 total JS bytes.
- Disposable HTTP/database suite: 35 existing checks plus 37 description checks
  pass, covering real PNG upload/re-encoding, limits, controls, ownership,
  anonymous/blocked/private access, feed/search/saved/following reads, escaping,
  replacement/removal, legacy payloads and export v8.
- The complete migration runner passed against a disposable database, including
  backup/restore, checksum parity and the sandboxed job. The preceding production
  API binary started on the new schema and successfully read, removed and
  replaced images with correct metadata cleanup.
- Chromium passed create/edit/preview/viewer/replacement/removal, full Unicode
  bounds, draft exclusion and stale-reader cases at 320/390/768/1440 px in both
  themes. These browser cases use API fixtures; HTTP/database cases separately
  exercise the real API. Production accounts were not created for testing.
- Live Cloudflare page checks pass at mobile/desktop sizes and both themes with
  no observed CSP violation, uncaught JS error or overflow. Public, direct-origin
  and built entry JS/CSS are byte-identical. Existing services/timers remain
  active and unexpected API restarts remain zero.
- Cargo source-package contents were checked in a sanitized copy, excluding
  runtime uploads and secrets. Packaging in the live checkout can fail on Cargo's
  Git-status traversal of protected uploads; permissions were preserved. Build
  tracking now includes newly added migrations.

## Production migration and rollback artifacts

The compatibility API was deployed first as `20261122T175536Z-30319b9`. Migration
`20261122000000` then added nullable `posts.image_alt` and its cleanup trigger.
Before application, the database backup was restored and verified across all
23 tables. Production still has zero users and posts, and 13 successful
migrations. No production image or user content was modified by the migration.

- Database backup: `/var/backups/media-migration-20261122T181137Z-3c53a21`, mode
  0700; compressed dump mode 0600, with checksum, metadata and protected job log.
- API: `20261122T181241Z-3c53a21`; SHA-256
  `37ad6aa777c9399af42e883c462b66d325ad36996843f629dc1416c2b24209bf`.
- Compatible API rollback:
  `/var/backups/media-binary-pre-backend-20261122T181241Z-3c53a21`.
- Frontend: `/var/lib/media/frontend-releases/20261122T181340Z-3c53a21`.
- Frontend rollback: `/var/lib/media/frontend-releases/20261122T135003Z-4bd389c`.

Roll back to the compatible API binary while retaining the additive schema; do
not drop the column/trigger or overwrite a live database as an automatic rollback.
All production canaries passed without rollback.

Next product work: image derivatives/carousels, pinned posts and named saved
collections. CI/SEO expansion stays in the final planned phase. The previously
documented optional SQLite lockfile finding and Chrono maintenance warning remain;
no dependency version changed in this release.
