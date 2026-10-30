# Product, Security, Design, and SEO Roadmap

This roadmap is deliberately security-first. A polished interface on top of an
unpatchable or weakly isolated service only increases the blast radius.

## Delivery rules

- One focused fix or coherent feature per commit; no generated-by or co-author
  attribution.
- Build and test outside the live document root, then release atomically.
- Every production change needs a health check and an explicit rollback.
- Security controls require regression tests, not only configuration comments.
- Public content may be indexable; account, settings, message, recovery, and
  private-content routes must be `noindex` and `no-store`.
- Accessibility target: WCAG 2.2 AA; mobile target starts at 320 CSS px.

## Phase 0 — Contain production risk

**Progress (2026-10-29):** the tracked Nginx/systemd configuration, direct-origin
enforcement, layered rate limits, strict CORS and mutation-origin checks, upload ownership, systemd sandbox,
secret-route logging policy, immutable static releases, security headers, and
rollback artifacts are deployed. Uploads also have account-aware storage and
pending-count limits. Broader application-aware throttling, automated restore
drills, owned alert routing, and scripted release/rollback remain open.

1. Version the active Nginx vhost, rate-limit zones, and systemd unit.
2. Add Cloudflare-only origin enforcement while preserving ACME and loopback.
3. Add real-client-IP rate and connection limits:
   - tight auth/register/recovery limits;
   - separate upload/write/read budgets;
   - request body and timeout limits;
   - application/account-aware limits in the later source rebuild.
4. Remove wildcard CORS; default to same-origin.
5. Fix upload ownership and isolate the writable directory from releases.
6. Add systemd sandboxing and resource ceilings incrementally.
7. Stop logging secret-bearing query strings; disable analytics on recovery and
   verification routes.
8. Define HTML/API/upload cache policies and proxy timeouts.
9. Add smoke checks for homepage, API, auth rejection, static assets, upload
   serving, headers, direct-origin rejection, and service restart.
10. Document rollback, backup, restore, secret rotation, and incident contacts.

## Phase 1 — Recover a maintainable application

Progress on 2026-10-30: the sanitized legacy history, backend and frontend
source, manifests, lockfiles, and recovered migrations are present. The backend
has a locked SQLx 0.9 build, zero known RustSec findings, strict linting, 44 API
binary unit tests plus 5 seed-binary tests, embedded versioned MySQL migrations,
a validated canary flow, and deployed
rollback artifacts. The frontend has
a locked dependency graph with zero npm audit findings and builds from a source
directory into an ignored release output served outside the repository. Broader
integration/browser tests, CI, staging, a separate least-privilege migration job,
provenance, and release automation remain open.

1. Recover the original Git history or reconstruct the backend and frontend.
2. Restore Rust manifests and lockfile; use a supported Rust toolchain.
3. Restore the frontend manifest and lockfile with a documented framework.
4. Replace startup DDL with reviewed SQL migrations. ✅ Separate migration
   execution into a least-privilege role/job.
5. Add unit, integration, contract, browser, accessibility, and security tests.
6. Add CI gates: format, lint, test, migration check, dependency audit, secret
   scan, SAST, SBOM, license policy, and reproducible release build.
7. Produce signed/checksummed artifacts, separated debug symbols, provenance,
   and a rollback package.
8. Add a staging/canary environment with sanitized seed data.

## Phase 2 — Application security rebuild

### Identity and sessions

**Progress (2026-10-28):** browser sessions are random opaque values whose hashes
are stored server-side with absolute expiry, activity timestamps, and revocation.
They use a hardened `__Host-` HttpOnly cookie; JWT and browser-readable credential
support have been removed. Logout revokes the current session, while password
reset/change and verified email changes revoke every session. Unsafe methods
enforce the exact configured origin. Recovery links use non-transmitted URL
fragments, scrub browser history, and exchange through POST. An active-session
dashboard supports scoped remote logout without collecting IP or User-Agent data;
sessions have a 24-hour idle timeout, a seven-day absolute timeout, and a limit of
20 per account. A responsive private timeline now exposes data-minimized login,
logout, session, password, and email events; storage is capped at 100 records per
account and 90 days. MFA, login alerts, and explicit synchronizer CSRF tokens
remain open.

New and changed passwords use an explicit Argon2id v19 profile. Legacy bcrypt
and outdated Argon2id credentials upgrade atomically after successful
authentication; password jobs are blocking-pool isolated, concurrency-bounded,
and protected against attacker-sized stored parameters.

- Opaque server-side sessions in `__Host-` HttpOnly cookies. ✅
- Origin checks, absolute timeout, password-change rotation, and revocation on
  password reset or verified email change. ✅
- Idle expiry and a session dashboard with scoped remote logout. ✅
- Data-minimized security event history with bounded retention. ✅ Add a
  tamper-evident operational audit sink and explicit synchronizer CSRF tokens.
- Passkeys/WebAuthn, optional TOTP, hashed recovery codes, and login alerts.
- Strong password policy and Argon2id migration. ✅ Add breached-password
  screening and stronger reauthentication for high-risk changes.
- Generic login/recovery responses and layered IP/account/device throttling.
- Hashed one-time tokens with single use, short expiry, and audit events.

### Authorization and data protection

**Progress (2026-10-29):** user response DTOs exclude password hashes, content
and identity inputs have server-side limits, image paths are owner-bound,
like/comment counters are transactional and nonnegative, pagination is bounded,
and major N+1 query paths were replaced with indexed joins. A password-confirmed
JSON export now covers profile data, content, interactions, messages, session
metadata, security events, pending-action metadata, and upload metadata without
credential or token material. Double-confirmed account deletion cascades private
records, reconciles engagement counters on surviving posts, and queues owned
media before the account FK cascade. Central policy, broad IDOR/concurrency
tests, asynchronous large-account exports, retention, and legal-hold policy
remain open.

Follow/unfollow and block/unblock now use transactional, FK-backed records with
self-relation checks, bounded lists, a per-account cap, and edge throttling.
Blocking removes follow edges in both directions and is applied server-side to
authenticated feeds, search, profiles/posts, comments, interactions, and message
reads/writes. Private accounts and bounded follow requests are also deployed.
Audience checks cover anonymous/authenticated feeds, profile posts, search,
saved results, connection lists, comments, likes, saves, and post media; removing
a follow revokes access immediately. Account exports include accepted and pending
relationship data. Central policy tests and more granular audiences remain open.

- Central authorization policy for every object and action.
- IDOR/BOLA tests for profiles, posts, comments, messages, uploads, and admin APIs.
- Offline-granted `user`, `moderator`, and `admin` roles, database-enforced role
  audit, per-request authorization, and password step-up for moderator writes. ✅
  Add support-specific scopes, dual-control grants, and periodic access review.
- Transactions for likes/comments/counters and idempotency keys for writes.
- Input schemas with Unicode normalization, length caps, safe rendering, and
  consistent RFC 9457-style errors.
- Field-level response DTOs so hashes, internal flags, and tokens cannot leak.
- Data export and account deletion. ✅ Add asynchronous large-account exports,
  retention enforcement, legal holds, consent/lawful-basis records, and a
  separately protected privacy audit trail.

### Uploads and content

**Progress (2026-10-29):** JPEG/PNG/WebP signatures, MIME, extension, structure,
dimensions, byte limits, generated names, owner-bound paths, async writes, and
replacement/deletion cleanup are deployed. New files are fully decoded and
re-encoded from pixels, which removes EXIF/comments/XMP/ICC data; EXIF orientation
is applied first. Decoder work runs outside the async executor with a two-job
limit, 16 MP/8192 px input ceilings, a 96 MiB per-job decode budget, strict
encoded-output caps, and the existing 512 MiB systemd ceiling. Avatars are reduced
to at most 1024 px. A database registry now gives every new file an owner, byte
size, purpose, and lifecycle state. Each account has a 100 MiB active-upload
budget and at most five unattached post images. Post-image claim/replacement and
post writes are transactional; stale pending files expire after 24 hours,
interrupted writes after one hour, and a bounded worker plus upload-time cleanup
retries deletions every 15 minutes. Historical files are deliberately not
bulk-deleted. Nginx now authorizes every post-media read against the author's
current audience and returns `private, no-store`; avatars remain public profile
metadata. Responsive post derivatives, deduplication, orphan reconciliation,
and a cookieless media origin remain open.

- JPEG/PNG/WebP allowlist; magic-byte and decoder validation; re-encoding. ✅
- Byte, pixel, frame, compression-ratio, CPU, memory, and account quota limits. ✅
- EXIF/metadata removal, generated filenames, and bounded abandoned-upload
  cleanup and retryable account-deletion integration. ✅ Add deduplication.
- Thumbnail/responsive-image pipeline and separate cookieless media origin.
- Malware scanning where useful; quarantine and moderation workflow.
- Strict CSP without `unsafe-inline`, Trusted Types where supported, and no
  third-party scripts on sensitive routes.

## Phase 3 — Massive design and responsive rebuild

**Progress (2026-10-29):** a light/dark token system, responsive public landing,
authenticated three-column feed, navigation, composer, post/comment cards,
profiles, account settings, recovery/verification flows, skeletons, empty/error
states, accessible SVG controls, reduced-motion handling, and mobile layouts are
deployed. The mobile bottom navigation, responsive search, expanded landing,
public about/community pages, footer, and branded 404 state are also live. The
landing now explains the real product flow and exposes session, security-history,
and upload controls without promising unimplemented relationship features. Its
light desktop, light mobile, dark mobile, and 320 px layouts were visually checked
in Chromium. Responsive feed tabs, profile relationship controls, and paginated
connection pages are now deployed and build-checked; this host no longer has a
headless browser, so automated visual regression for the new screens remains
open alongside toasts, dialogs, and accessibility CI.

### Design system

- Product name, logo, icon set, color/spacing/type/elevation tokens.
- Light, dark, and system themes with contrast-tested semantic colors.
- Reusable buttons, fields, cards, dialogs, menus, toasts, tabs, avatars,
  skeletons, empty states, errors, and loading states.
- Consistent motion with `prefers-reduced-motion` support.
- Clear Romanian copy, validation, recovery guidance, and destructive-action
  confirmations; prepare the content model for i18n.

### Responsive information architecture

- Mobile bottom navigation and compose action with safe-area support.
- Tablet two-column and desktop three-column layouts with a readable feed width.
- Sticky desktop navigation, contextual sidebars, and responsive drawers/sheets.
- Touch targets of at least 44×44 px, no horizontal overflow, robust zoom, and
  layouts tested at 320/375/768/1024/1440 px.
- Virtualized/incremental lists, preserved scroll position, and route transitions.

### Accessibility

- Semantic landmarks and headings, skip link, keyboard-visible focus, logical
  tab order, labeled controls, status announcements, and dialog focus trapping.
- Alt-text workflow, captions/transcripts for media, reduced motion, contrast,
  error summaries, and screen-reader regression tests.
- Replace decorative emoji controls with accessible SVG icons and text labels.

## Phase 4 — Core social product features

**Progress (2026-10-30):** private saved posts are deployed with an authenticated
paginated API, per-session `is_saved` state across feed/profile/search results,
transactional toggles, foreign-key cleanup, and a dedicated responsive page.
The collection is explicitly `noindex`, is not exposed to other accounts, and
was visually checked at 1440, 390, and 320 px. Follow/unfollow, bounded
followers/following lists, a chronological following feed, and bidirectional
blocking are also deployed with responsive controls and private-route `noindex`
headers. Private accounts, approval/cancellation flows, protected post media,
and a responsive request inbox are deployed. A private in-app notification
inbox is also implemented for follow requests/acceptances, new followers, likes,
and comments, with grouping, read state, a navbar badge, block cleanup, and
bounded retention. Private report intake for accounts, posts, and comments,
discreet account mute, personal post hide, and a responsive safety center are
also deployed. A responsive, non-indexable moderation workspace now provides
role-gated queues, evidence snapshots, assignment, release, resolution/dismissal,
internal notes, password step-up, reporter pseudonymity, action audit, and an
administrator-only role-change history. Role grants are offline-only and
resolving a report deliberately performs no automatic enforcement. Notification
preferences/digests, appeals, user notices, richer publishing, and multiple named
collections remain open.

### Profiles and relationships

- Unique handles, display names, pronouns, bio, links, avatar, cover, and badges.
- Follow/unfollow, followers/following lists, private accounts, and bounded
  follow-request approval/cancellation. ✅ Add close-friends/custom audiences.
- Account-level block across authenticated surfaces plus discreet mute, private
  report intake, and personal post hide. ✅ Add restrict, moderator-visible
  aggregates, and more granular audience controls.
- Profile completion, QR/share card, pinned posts, and profile search.

### Publishing

- Text posts with drafts, autosave, mentions, hashtags, link previews, and polls.
- Multi-image carousel, cropping, alt text, captions, and later short video.
- Edit history, delete/restore window, scheduling, audience, and content warnings.
- Private bookmarks and a saved feed. ✅ Add named collections, reposts, quote
  posts, richer reactions, and share links.
- Threaded comments, mentions, sorting, pagination, editing, and moderation.
- Optimistic updates with correct rollback and offline draft recovery.

### Feed and discovery

- Private saved and chronological following feeds. ✅ Add recommendations and
  user-selectable ranking controls.
- Cursor pagination, relevance signals, deduplication, and explainable suggestions.
- Search across people/posts/hashtags; trends and explore topics.
- User controls for recommendations, muted words, language, and sensitive media.

### Messaging and notifications

- Real-time one-to-one conversations, unread counts, typing/read state, and
  attachment safety; groups only after abuse controls are ready.
- In-app and optional email/push notifications with granular preferences,
  quiet hours, digests, grouping, and per-event unsubscribe. ✅ The bounded
  in-app foundation, grouping, read state, and responsive inbox are complete;
  preferences and external delivery remain open.

### Trust and safety

- Private report intake, an allowlisted reason taxonomy, duplicate prevention,
  rolling submission limits, owner-only withdrawal, account mute, and personal
  post hide. ✅
- Least-privilege moderation queues, evidence snapshots, assignment ownership,
  moderator notes, step-up authentication, durable action/role audit, and
  self-moderation prevention. ✅ Add appeals, repeat-abuse signals, transparent
  user notices, and separately authorized enforcement actions.
- Spam controls, link/domain reputation, new-account limits, and content quotas.
- Moderation workspace with least privilege, step-up authentication, and audit
  logs. ✅ Add operational metrics/alerts and a broader admin surface only after
  defining narrower scopes and dual-control high-risk actions.

## Phase 5 — SEO and shareability

**Progress (2026-10-28):** the public shell has Romanian language metadata,
canonical and social tags, route-appropriate JSON-LD, manifest, favicon, crawler
policy, and a valid XML sitemap. The production build emits distinct initial HTML
for the landing, about, and community-rules routes, including unique titles,
descriptions, canonical/hreflang URLs, Open Graph/Twitter cards, and a dedicated
1200×630 share image. Client-side navigation keeps that metadata synchronized.
Nginx serves the pre-rendered route documents, returns real `X-Robots-Tag:
noindex` headers for private and token-bearing routes, and keeps unknown paths at
HTTP 404. Public profile/post rendering, privacy/terms/help content, Search
Console, and real-user Core Web Vitals monitoring remain open.

A mobile Lighthouse snapshot against the Cloudflare-served production page
scored SEO 100, accessibility 100, performance 80, and best practices 77, with
2.0 s LCP and 0.005 CLS. Most measured blocking time and both deprecation notices
came from Cloudflare Challenge/RUM code injected at the edge; the remaining
console finding is the expected anonymous `401` from `/api/auth/me`. Review the
Cloudflare bot/challenge and analytics settings before treating those two scores
as application-bundle regressions.

1. Render public profiles/posts on the server or pre-render them; keep private and
   application-only routes out of the index.
2. Use `lang="ro"`, route-specific title/description, canonical URL, robots,
   Open Graph, Twitter cards, and high-quality share images. ✅ for the landing,
   about, and community-rules pages.
3. Add appropriate JSON-LD for the site, breadcrumbs, people, and public posts;
   validate against current Google guidance rather than emitting unsupported data.
4. Keep sitemap timestamps and XML/content types valid; add deliberate `410`
   responses for permanently removed public content alongside the live 404 flow.
5. Add a valid web manifest, icons, favicon, theme colors, installability, and an
   offline shell that never caches private API data.
6. Create indexable landing/about/safety/privacy/terms/help pages with useful copy.
7. Add clean public URLs, redirect policy, lowercase/normalization rules, and
   `hreflang` only when real localized content exists.
8. Improve Core Web Vitals: route/code splitting, critical CSS, responsive images,
   lazy loading, font strategy, long-lived hashed assets, and bundle budgets.
9. Monitor Search Console, crawl/index coverage, rich-result validity, 404s,
   sitemap freshness, and real-user CWV.

The original urgent metadata, MIME-routing, public-route metadata, share-image,
and soft-404 defects are closed. The highest remaining SEO constraint is
architectural: user-generated profiles/posts still have no server-rendered public
pages, and the build-time route list is intentionally limited to stable editorial
content.

## Phase 6 — Reliability, observability, and operations

**Progress (2026-10-30):** public liveness and dependency-aware readiness routes
are deployed and used after each release. Privacy-redacted JSON request logs
carry request IDs, methods, paths, status codes, and latency; query strings and
bodies are excluded. Metrics, alerts, retention policy, restore drills, and
release automation remain open. SMTP authentication is currently rejected by
Brevo with `535`; rotating and verifying that credential is an immediate P1
operational task because verification and password-recovery delivery are down.

- `/health/live`, `/health/ready`, and dependency-specific readiness checks.
- Structured JSON logs with request IDs and privacy redaction; define and enforce
  retention limits.
- Metrics for traffic, latency, errors, saturation, auth, email, DB pool, uploads,
  moderation, queues, and product funnels.
- SLOs and burn-rate alerts; restart/crash, 5xx, abuse, egress, disk, certificate,
  backup, and queue alerts routed to an owned on-call path.
- Automated encrypted backups with restore drills and documented RPO/RTO.
- Atomic releases, canary/blue-green rollout, feature flags, migration guards,
  rollback automation, capacity/load testing, and chaos/tabletop exercises.
- Secrets manager or protected credentials, rotation schedule, and least-privilege
  service/database identities.

## Phase 7 — Growth and quality-of-life backlog

- Guided onboarding, interest selection, suggested follows, and profile checklist.
- PWA install prompt, push notifications, offline drafts, and share target.
- Keyboard shortcuts, command palette, saved searches, content filters, and
  accessibility preferences.
- Creator analytics, post insights, scheduled content calendar, and export tools.
- API keys/OAuth only after scopes, consent, quotas, revocation, audit, and public
  developer documentation are complete.
- Optional federation/import/export exploration after privacy and moderation
  requirements are defined.

## Definition of done for every feature

- Threat model and privacy impact reviewed.
- Authorization, validation, rate limits, abuse cases, and audit events covered.
- Unit/integration/browser tests pass; accessibility and responsive states tested.
- Loading, empty, error, offline, and retry behavior designed.
- Metrics, logs, alert implications, migration, rollback, and documentation exist.
- No unaccepted dependency or secret-scanning finding; release is reproducible.

## Suggested execution order

`P0 containment → source/build recovery → session/auth/upload security → design
system and responsive shell → core social features → public rendering/SEO →
messaging/notifications → trust & safety → growth features`

This order can run some design exploration in parallel, but production feature
rollout remains gated by the P0 exit criteria in the security audit.
