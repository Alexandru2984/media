# Private bookmark collections — 2026-11-23

Cloudflare edge and Tunnel remain mandatory. Brevo remains excluded. SEO
expansion and CI setup remain in the final phase. This date uses Europe/Bucharest;
the release ID below uses UTC on 2026-11-22.

## Delivered

Members can create, rename and delete up to 30 private collections with names of
1–60 Unicode characters. Each existing bookmark has one optional collection.
The saved page supports all/collection/unfiled views and moving bookmarks.
Deleting a collection preserves its saved posts; removing a save, hiding a post,
deleting a post or deleting an account clears its assignment. Names/assignments
are owner-only and included in export format version 10.

Requests use bound SQL, authenticated ownership, exact-origin write guards,
canonical UUIDs, bounded names and database-enforced uniqueness. Account locks
serialize the quota and metadata writes. Composite foreign keys enforce owned
collection and bookmark references. Filtered post reads reuse current audience,
block, mute and hide checks. Organizing an existing private bookmark reference
does not grant access to its post; public profile/post DTOs expose no collection
metadata. The export budget now counts both new tables.

The page rejects stale filter/viewer responses, advances paging by consumed rows
and refreshes the visible prefix after removals. Native select state survives
renames; dialogs contain focus, block pending dismissal and preserve failed
input for retry. Moving an item restores keyboard focus. The new styles load
with the saved route. Help and privacy text describe the feature and its data.

## Verification

- Rust: 74 application, five seed and one migration-command tests pass (80 total),
  plus format, strict Clippy and the locked optimized build.
- Frontend: 42 Node tests pass. Unchanged artifact budgets pass: 128,997 entry JS
  bytes, 84,627 main CSS bytes, 293,384 total JS bytes and 28 chunks. The saved
  route adds a 1,193-byte stylesheet; no production source maps are published.
- Disposable actual HTTP/MariaDB suite: 19 media, three publishing, 13 identity,
  37 image-description, 67 pin and 115 collection checks pass (254 labeled checks).
  Collection coverage includes foreign-owner/origin rejection, malformed inputs,
  Unicode/duplicate names, a single winning quota slot, assignment/unsave/delete
  races, per-owner filtering, stable tie ordering, private/follower revocation,
  mutes, hides, both block directions, FK rejection, export and account cleanup.
- Offline migration application passes manifest, expected-DB and idempotence
  checks. The full migration runner passes backup/restore, manifest parity and
  sandboxed application against a disposable database. The preceding production
  API starts on the new schema, reads saved posts and unsaves an assigned bookmark
  with automatic assignment cleanup; image and pin rollback cases also pass.
- Chromium passes collection CRUD, Unicode bounds, modal/pending/focus/retry,
  filing/unfiling, preserved saves, deduplicated paging offsets, delayed filter
  replies, deleted-folder recovery and quota UI at 320/390/768/1440 px in both
  themes. A separate logout/login race discards the prior account's names/posts.
  These checks passed locally and on production assets delivered through
  Cloudflare. Their APIs are fixtures: no production test accounts were created.
  Production UI cases observe no uncaught JS error, CSP violation or overflow.
- The real public landing passes 390/1440 px checks in both themes, including
  topic interaction and CSP/overflow. Live help/privacy show the new copy.
  Public/direct-origin entry JS/CSS and saved-route JS/CSS are byte-identical to
  the build. Seven real auth/origin/cache rejection checks pass on both the
  direct API and Cloudflare. Direct responses use `private, no-store`; public
  responses prohibit storage, with no observed cache hit or `Age` header.
- API, Nginx, Tunnel and MariaDB remain active; health, backup-health, backup
  and restore-drill timers remain active. Unexpected API restarts remain zero.

## Deployment correction

The initial backend activation safely refused occupied port 18084 before live
binary mutation; that listener belongs to Nginx. Commit `f0e54f1` changes the
isolated canary default to 18085 and adds `MEDIA_BACKEND_CANARY_PORT`. Ports must
be 1024–65535, excluding live API port 8083. Dry runs now check occupancy; actual
activation rechecks under the release lock. No listener is stopped or reconfigured.
Shell syntax, six invalid/protected-port cases and an occupied disposable
listener rejection passed; the explicit 18085 dry run and actual canary passed.
No Nginx configuration or Cloudflare routing/policy was changed.

## Production artifacts and rollback

Feature commit: `f48ee47`; deployment correction: `f0e54f1`.
Release ID: `20261122T225955Z-f48ee47` (UTC).

Migration `20261122002000` adds `saved_collections` and `saved_collection_posts`
without changing saved-post columns or existing migration checksums. The backup
was restored and verified across all 24 preceding tables. Production now has
26 tables, 15 successful migrations and zero users, posts, collections or
assignments. No existing production content was changed.

- Root-only backup: `/var/backups/media-migration-20261122T225955Z-f48ee47`;
  directory mode 0700; dump, checksum, metadata and migration log mode 0600.
- API: `/var/lib/media/backend-candidates/social-media-backend-20261122T225955Z-f48ee47`.
  SHA-256: `08ecf711bbcc297c9fd1560ce921549a4cba97f7487a8be2c9ed85a4d0636182`.
- Compatible API rollback:
  `/var/backups/media-binary-pre-backend-20261122T225955Z-f48ee47`.
  SHA-256: `0609e8adba5ab8f3525ac7deadd92bf02721896d2ff4bb9fd7d16aef53a7fa1e`.
- Frontend: `/var/lib/media/frontend-releases/20261122T225955Z-f48ee47`.
- Frontend rollback: `/var/lib/media/frontend-releases/20261122T184030Z-4d631bc`.

Application activation passed the isolated candidate, origin and Cloudflare
canaries; frontend activation passed its checks. Automatic rollback was not
needed. A binary rollback keeps this additive schema and its private metadata;
older interfaces simply do not expose collections. Do not drop the tables or
automatically restore the live database during rollback.

## Remaining work

Next product work: richer profiles, content warnings, multiple-image publishing,
mentions/polls and notification quiet hours. Each needs separate audience/abuse
controls and reviewed storage changes. Current collections deliberately support
one optional folder per bookmark; multi-collection tagging is not implemented.

Runtime DB grants still include legacy DDL privileges. Separate migration
credentials, account-aware auth limits, MFA/passkeys, edge/CSP coordination,
privacy/operational ownership and exact-URL cache-purge follow-up remain open.
The existing optional, uncompiled SQLite lockfile finding and Chrono maintenance
warning remain documented. This increment changes no dependency versions and
makes no new clean-audit claim.
