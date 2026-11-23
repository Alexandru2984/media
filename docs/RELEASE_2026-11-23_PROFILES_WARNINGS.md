# Profile details and content warnings — 2026-11-23

Cloudflare edge and Tunnel remain in place. Brevo remains excluded. SEO expansion
and CI setup remain in the final phase. Release IDs use UTC.

## Delivered

Profiles support optional display names (50 Unicode scalars), pronouns (30),
location (80) and a public HTTPS website. These details are explicitly public even
for private accounts. The unique username remains the account identifier. Writes
save core/detail fields atomically under the account lock; omitted details from
older payloads are preserved. The malformed UPDATE construction is corrected,
and a duplicate username returns 409 without partial changes. Website validation
rejects credentials, local/IP hosts, custom ports, controls and overlong URLs;
links use safe attributes, and the server performs no remote fetch.

Posts accept optional 100-character content warnings. Native disclosures start
closed in the current interface and public HTML. Declared social/structured
previews omit warned body, image URL and image description. Client navigation
also clears stale image-alt metadata. Authors can edit/remove labels; omitted or
null update fields preserve them, while an empty string clears them. Warnings
do not change access permissions or conceal authorized API response content.

Draft schema v2 retains the warning with text, reads prior text-only drafts and
uses the same account/tab key and 24-hour expiry. Images/alt descriptions remain
excluded. Export is now v12. Optional profile metadata cascades on account
deletion; warnings are stored on their post and disappear with it.

The bookmark toggle now locks the saving account before its post/bookmark work,
resolving the observed assignment/unsave failure. The regression exercises twelve
concurrent rounds. The composer loads separately; navigation focus works after
delayed loading, restores a recoverable draft through the explicit Restore
button, and scrolls the editor back into view. It never chooses Delete as the
draft recovery target.

## Verification and scope

- Rust: 79 application, five seed and one migration-command tests pass (85 total),
  plus format, strict Clippy and the locked optimized build.
- Node: 46 tests pass, including Unicode/URL validation, warning draft persistence,
  legacy draft reads and invalid-label rejection.
- Disposable actual HTTP/MariaDB checks: 19 media, three publishing, 13 identity,
  37 image descriptions, 42 warnings, 57 profile details, 139 collections and
  67 pins pass (377 labeled checks). Cases cover ownership/origin rejection,
  controls/limits, atomic failures, all full-post DTOs, current private/follower/
  block/hide policies, escaping, export, legacy payloads, quota/delete/unsave races
  and account cleanup. No real SMTP is used.
- The complete migration runner passes on disposable databases, including
  backup/restore, expected database, manifest/checksum parity and sandboxed
  application. Older binaries start on additive schemas. Warning storage survives
  legacy edits, but old readers do not implement warning UX/metadata behavior.
- Chromium covers profile and warning workflows at 320/390/768/1440 px in light
  and dark themes, including failure/retry, limits, safe links, disclosures,
  keyboard use, draft restoration, previews and generic permalink metadata.
  Separate delayed-editor cases verify empty and recoverable drafts; Enter
  restores text/label, and compose navigation scrolls back from the feed.
  UI checks use API fixtures locally and on Cloudflare-delivered assets. Fixtures
  bootstrap through an existing route before client navigation to synthetic IDs;
  nonexistent real profiles continue returning 404. No production test accounts
  were created. No uncaught JS/CSP errors or horizontal overflow were observed.
- Real Cloudflare landing checks pass at 390/1440 px in both themes. Public help
  and privacy disclose the new features and draft behavior. Entry/profile/editor/
  warning/preview JS and CSS match built bytes through origin and Cloudflare.
  Five real missing-profile/auth/origin/cache checks pass on both direct API and
  Cloudflare. Direct responses use `private, no-store`; public responses prohibit
  storage, with no observed cache hit or `Age` header.
- Services and health/backup/restore timers remain active; unexpected API
  restarts remain zero. At verification: 27 tables, 17 successful migrations and
  zero users, posts, profile-detail rows or warned posts.

## Performance and dependency checks

Final build: 122,913 entry JS bytes, 84,833 main CSS bytes, 302,299 total JS bytes
and 30 chunks. Profile CSS loads with that route. Composer/warning author controls
load separately. Entry/CSS limits remain 130,000/85,000 bytes; the optional-module
total limit rises from 300,000 to 310,000 bytes for these features. The entry is
smaller than the preceding 129,050-byte profile build. Production removes handled
console/debugger diagnostics; development logging, UI error states and server
request logs remain. Source maps are not published.

Fresh npm audit reports zero vulnerabilities. Full RustSec audit still reports
the optional uncompiled SQLite finding `RUSTSEC-2026-0459` and Chrono maintenance
warning `RUSTSEC-2026-0543`. The locked active graph has no `libsqlite3-sys` path.
No dependency versions or audit suppression settings changed; this is not a
clean full-lockfile audit claim.

## Production artifacts

- `fd7a00f`: bookmark toggle/assignment serialization.
- `530dfae`: public profile details and atomic profile editing.
- `817bd7e`: deferred composer and navigation focus.
- `a733ff7`: content warnings, drafts and generic previews.
- `6d2a7b2`: browser fixture bootstrap correction.
- `3c0d421`: explicit safe draft restoration focus and scroll behavior.

Profile migration `20261123000000` adds `profile_details`. Its backup was restored
and verified across 26 existing tables:
`/var/backups/media-migration-20261122T232250Z-530dfae`.
The profile API release was `20261122T232250Z-530dfae`, SHA-256
`0ffc998fa998d5732868749b180feeeaf09df28c0eee65d3a9c04fd1d02715a3`.

Warning migration `20261123001000` adds nullable `posts.content_warning` and a
nonblank-length check. Its preceding backup was restored across 27 tables:
`/var/backups/media-migration-20261123T082337Z-a733ff7`.
Backup directories are root-only mode 0700; dump/checksum/metadata/log files are
mode 0600. Existing migration checksums were not changed; API startup applies no
DDL. Both migration and deployment dry runs/canaries passed.

- Active warning-aware API:
  `/var/lib/media/backend-candidates/social-media-backend-20261123T082337Z-a733ff7`.
  SHA-256: `7a002cdf58a2e342913c6164a009442fe63a1e45891fdd7071e4411b1c1c6798`.
- Pre-warning API backup:
  `/var/backups/media-binary-pre-backend-20261123T082337Z-a733ff7`.
  Its hash is the profile API hash above; see the compatibility limit below.
- Active frontend: `/var/lib/media/frontend-releases/20261123T133918Z-3c0d421`.
- Warning-aware frontend rollback:
  `/var/lib/media/frontend-releases/20261123T082337Z-a733ff7`.

Automatic rollback was not needed. Keep additive schemas during binary rollback;
do not automatically restore the live database. Once warned posts exist, use a
warning-aware API/frontend: the retained pre-warning binary is suitable only
while no warned posts exist. Storage compatibility alone does not preserve
disclosure and generic-preview behavior. The current warning-aware API and
frontend are the retained baseline for subsequent releases.

## Remaining work

Next: multiple images/derivatives, mentions/polls and notification quiet hours.
Existing runtime DB DDL grants, account-aware auth limits, MFA/passkeys,
edge/CSP coordination, privacy/operational ownership, moderation appeals and
exact-URL cache-purge follow-up remain open. This release is a verified increment,
not completion of every product or security item. SEO expansion and CI automation
remain last, as requested.
