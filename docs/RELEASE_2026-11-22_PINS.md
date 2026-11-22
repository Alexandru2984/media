# Pinned profile posts — 2026-11-22

Cloudflare edge and Tunnel remain in place. Brevo stays excluded from active
work. SEO expansion and CI setup remain in the final planned phase.

## Delivered

Members can pin one of their own posts at the top of their profile, replace it
or unpin that specific post. A separate read retrieves older pins outside the
first page. The profile shows one copy, while chronological feeds keep their
existing order. Owner controls expose pressed state, pending/error handling and
keyboard focus restoration. Long names and the three owner actions fit at
320 px. Help text explains the feature in both client and generated HTML.

The API requires authenticated ownership and same-origin writes. A per-account
lock serializes replacements. Conditional unpin leaves a newer selection intact;
repeating the same pin preserves its timestamp. UUID inputs are normalized.
Database constraints enforce one pin per profile, owned-post references and
post/account deletion cascades. The public read checks profile access before
looking up a pin and applies current post audience, blocks and personal hides
using the verified viewer. Pinning grants no additional access. Full-post DTOs
include pin state; owner export now uses format version 9 with pin ID/time.

## Verification

- Rust: 73 application, five seed and one migration-command tests pass; format,
  strict Clippy and the locked optimized build pass.
- Frontend: 40 Node tests and unchanged budgets pass: 128,869 entry JS bytes,
  84,627 CSS bytes, 284,277 total JS bytes, 28 chunks; no production source maps.
- Disposable HTTP/database suite: 19 media, three publishing, 13 identity,
  37 image-description and 67 pin checks pass (139 labeled checks). Pin coverage
  includes ownership/origin rejection, idempotence, every full-post DTO, private
  and follower audiences, block directions, hides, mutes on explicit profiles,
  older posts outside the first 50, concurrent choices, stale unpin, export v9,
  composite foreign keys and post/account deletion.
- The offline migration command passes application, idempotence and expected-DB
  mismatch checks. The full production runner passes against a disposable DB,
  including backup, isolated restore, manifest parity and sandboxed application.
  The preceding production API starts on the new schema, reads/updates images
  correctly and deletes a pinned post with automatic pin cleanup.
- Chromium pin workflows pass at 320/390/768/1440 px in both themes: older pin,
  deduplication, keyboard/focus, serialization across cards, failure/retry,
  visitor controls and private profiles. A slow response cannot restore a prior
  route's pin. An additional 320 px case covers a long unbroken name. Eight
  image-description workflow regressions also pass. These tests use API fixtures;
  the HTTP/database suite separately exercises actual handlers and storage.
- Live Cloudflare landing checks pass at 390/1440 px in both themes, with topic
  interaction, no observed JS/CSP errors or horizontal overflow. Public help
  renders the new instructions. Origin/public entry JS and CSS match the built
  bytes exactly. Four rejection/cache checks pass on both the direct API and
  Cloudflare: unknown profile, unauthenticated pin/unpin and foreign-origin write.
  Direct API responses use `private, no-store`; the public boundary uses
  `no-store`, with no observed cache hit or `Age` header.
- API, Nginx, Cloudflare Tunnel and MariaDB are active; service-health,
  backup-health, backup and restore-drill timers remain active. Unexpected API
  restarts remain zero. No production test accounts were created.

## Production artifacts and rollback

Feature commit: `4d631bc`. Release ID: `20261122T184030Z-4d631bc`.

Migration `20261122001000` adds `posts(id, user_id)` uniqueness and the
`profile_pins` table. Before application, the backup was restored and verified
across all 23 existing tables. Production now has 24 tables, 14 successful
migrations and zero users, posts or pins. Existing user content was not changed.

- Root-only database backup:
  `/var/backups/media-migration-20261122T184030Z-4d631bc`.
- API candidate:
  `/var/lib/media/backend-candidates/social-media-backend-20261122T184030Z-4d631bc`.
  SHA-256: `0609e8adba5ab8f3525ac7deadd92bf02721896d2ff4bb9fd7d16aef53a7fa1e`.
- Compatible API rollback:
  `/var/backups/media-binary-pre-backend-20261122T184030Z-4d631bc`.
  SHA-256: `37ad6aa777c9399af42e883c462b66d325ad36996843f629dc1416c2b24209bf`.
- Active frontend:
  `/var/lib/media/frontend-releases/20261122T184030Z-4d631bc`.
- Frontend rollback:
  `/var/lib/media/frontend-releases/20261122T181340Z-3c53a21`.

Both deployment scripts passed dry runs and their production canaries. Automatic
rollback was not needed. A binary rollback must retain the additive schema;
do not drop the pin table/index or automatically restore the live database.
The retained dump supports reviewed recovery, not an implicit destructive action.

## Remaining work

Next product increment: named private bookmark collections with owner-only
queries, pagination, export and deletion semantics, plus a separately reviewed
migration. Follow with richer profiles, multiple images, content warnings,
mentions/polls and notification quiet hours. Each needs its own audience and
abuse controls before release.

Runtime DB privileges still include legacy DDL grants; a separate migration
identity remains open. Existing edge/CSP coordination, account-aware auth limits,
MFA/passkeys, operational/privacy ownership and exact-URL cache-purge follow-up
remain on the delivery plan. The full Cargo lockfile audit still includes the
optional, uncompiled SQLite binding and Chrono maintenance warning; this release
changes no dependency versions and makes no new clean-audit claim.
