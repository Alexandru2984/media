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

**Progress (2026-10-28):** the tracked Nginx/systemd configuration, direct-origin
enforcement, layered rate limits, strict CORS and mutation-origin checks, upload ownership, systemd sandbox,
secret-route logging policy, immutable static releases, security headers, and
rollback artifacts are deployed. Application-aware throttling, automated restore
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

Progress on 2026-10-28: the sanitized legacy history, backend and frontend
source, manifests, lockfiles, and recovered migrations are present. The backend
has a locked SQLx 0.9 build, zero known RustSec findings, strict linting, 23 unit
tests, a validated canary flow, and deployed rollback artifacts. The frontend has
a locked dependency graph with zero npm audit findings and builds from a source
directory into an ignored release output served outside the repository. Broader
integration/browser tests, CI, staging, versioned live migrations, provenance,
and release automation remain open.

1. Recover the original Git history or reconstruct the backend and frontend.
2. Restore Rust manifests and lockfile; use a supported Rust toolchain.
3. Restore the frontend manifest and lockfile with a documented framework.
4. Replace startup DDL with reviewed SQL migrations and a least-privilege
   migration role.
5. Add unit, integration, contract, browser, accessibility, and security tests.
6. Add CI gates: format, lint, test, migration check, dependency audit, secret
   scan, SAST, SBOM, license policy, and reproducible release build.
7. Produce signed/checksummed artifacts, separated debug symbols, provenance,
   and a rollback package.
8. Add a staging/canary environment with sanitized seed data.

## Phase 2 — Application security rebuild

### Identity and sessions

**Progress (2026-10-28):** new browser sessions use a hardened `__Host-`
HttpOnly cookie, legacy browser-readable tokens are migrated and cleared, auth
responses no longer expose credentials, unsafe methods enforce the exact
configured origin, password inputs are bounded, and new one-time tokens are
hashed and consumed atomically. Opaque server-side storage, revocation, device
management, and MFA remain open.

- Opaque server-side sessions in `__Host-` HttpOnly cookies.
- CSRF tokens, origin checks, session rotation, idle/absolute timeouts, and
  revocation on password or email change.
- Session/device dashboard with remote logout and security event history.
- Passkeys/WebAuthn, optional TOTP, hashed recovery codes, and login alerts.
- Strong password policy, breached-password screening, Argon2id migration, and
  reauthentication for high-risk changes.
- Generic login/recovery responses and layered IP/account/device throttling.
- Hashed one-time tokens with single use, short expiry, and audit events.

### Authorization and data protection

**Progress (2026-10-28):** user response DTOs exclude password hashes, content
and identity inputs have server-side limits, image paths are owner-bound,
like/comment counters are transactional and nonnegative, pagination is bounded,
and major N+1 query paths were replaced with indexed joins. Central policy and
end-to-end IDOR/concurrency tests remain open.

- Central authorization policy for every object and action.
- IDOR/BOLA tests for profiles, posts, comments, messages, uploads, and admin APIs.
- Roles and scopes for user, moderator, support, and administrator.
- Transactions for likes/comments/counters and idempotency keys for writes.
- Input schemas with Unicode normalization, length caps, safe rendering, and
  consistent RFC 9457-style errors.
- Field-level response DTOs so hashes, internal flags, and tokens cannot leak.
- Data export, account deletion, retention, legal hold, and privacy audit trails.

### Uploads and content

**Progress (2026-10-28):** JPEG/PNG/WebP signatures, MIME, extension, structure,
dimensions, byte limits, generated names, owner-bound paths, async writes, and
replacement/deletion cleanup are deployed. Re-encoding, metadata removal,
quotas, thumbnails, and scheduled cleanup for abandoned uploads remain open.

- JPEG/PNG/WebP allowlist; magic-byte and decoder validation; re-encoding.
- Byte, pixel, frame, compression-ratio, CPU, memory, and quota limits.
- EXIF/metadata removal, generated filenames, deduplication, and orphan cleanup.
- Thumbnail/responsive-image pipeline and separate cookieless media origin.
- Malware scanning where useful; quarantine and moderation workflow.
- Strict CSP without `unsafe-inline`, Trusted Types where supported, and no
  third-party scripts on sensitive routes.

## Phase 3 — Massive design and responsive rebuild

**Progress (2026-10-28):** a light/dark token system, responsive public landing,
authenticated three-column feed, navigation, composer, post/comment cards,
profiles, account settings, recovery/verification flows, skeletons, empty/error
states, accessible SVG controls, reduced-motion handling, and mobile layouts are
deployed. Browser-based visual regression, a mobile bottom navigation, toasts,
dialogs, accessibility automation, and the remaining product pages are open.

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

### Profiles and relationships

- Unique handles, display names, pronouns, bio, links, avatar, cover, and badges.
- Follow/unfollow, private accounts, follow requests, followers/following lists.
- Block, mute, restrict, report, hide counts, and audience controls.
- Profile completion, QR/share card, pinned posts, and profile search.

### Publishing

- Text posts with drafts, autosave, mentions, hashtags, link previews, and polls.
- Multi-image carousel, cropping, alt text, captions, and later short video.
- Edit history, delete/restore window, scheduling, audience, and content warnings.
- Reposts, quote posts, bookmarks/collections, richer reactions, and share links.
- Threaded comments, mentions, sorting, pagination, editing, and moderation.
- Optimistic updates with correct rollback and offline draft recovery.

### Feed and discovery

- Following, chronological, recommended, and saved feeds.
- Cursor pagination, relevance signals, deduplication, and explainable suggestions.
- Search across people/posts/hashtags; trends and explore topics.
- User controls for recommendations, muted words, language, and sensitive media.

### Messaging and notifications

- Real-time one-to-one conversations, unread counts, typing/read state, and
  attachment safety; groups only after abuse controls are ready.
- In-app and optional email/push notifications with granular preferences,
  quiet hours, digests, grouping, and per-event unsubscribe.

### Trust and safety

- Report queues, reason taxonomy, evidence snapshots, moderator notes/actions,
  appeals, repeat-abuse signals, and transparent user notices.
- Spam controls, link/domain reputation, new-account limits, and content quotas.
- Admin dashboard with least privilege, step-up authentication, and audit logs.

## Phase 5 — SEO and shareability

**Progress (2026-10-28):** the public shell has Romanian language metadata,
canonical and social tags, WebSite JSON-LD, manifest, favicon, crawler policy,
and a valid XML sitemap. Route-aware titles, descriptions, canonical URLs, and
client-side robots directives are implemented; Nginx also returns real
`X-Robots-Tag: noindex` headers for private and token-bearing routes. Public SSR
or prerendering, share images, public profile/post URLs, real 404 responses,
landing/legal content, Search Console, and Core Web Vitals monitoring remain open.

1. Render public profiles/posts on the server or pre-render them; keep private and
   application-only routes out of the index.
2. Use `lang="ro"`, route-specific title/description, canonical URL, robots,
   Open Graph, Twitter cards, and high-quality share images.
3. Add appropriate JSON-LD for the site, breadcrumbs, people, and public posts;
   validate against current Google guidance rather than emitting unsupported data.
4. Generate real sitemap indexes with updated timestamps and return real
   XML/content types. Return true 404/410 responses instead of SPA soft-404 pages.
5. Add a valid web manifest, icons, favicon, theme colors, installability, and an
   offline shell that never caches private API data.
6. Create indexable landing/about/safety/privacy/terms/help pages with useful copy.
7. Add clean public URLs, redirect policy, lowercase/normalization rules, and
   `hreflang` only when real localized content exists.
8. Improve Core Web Vitals: route/code splitting, critical CSS, responsive images,
   lazy loading, font strategy, long-lived hashed assets, and bundle budgets.
9. Monitor Search Console, crawl/index coverage, rich-result validity, 404s,
   sitemap freshness, and real-user CWV.

The original urgent metadata and MIME-routing defects are closed. The highest
remaining SEO constraint is architectural: public content is still a client-side
SPA behind authenticated routes, so crawlers have only the public landing page
to index and unknown paths can still become soft 404s.

## Phase 6 — Reliability, observability, and operations

**Progress (2026-10-28):** public liveness and dependency-aware readiness routes
are deployed and used after each release. Structured logs, metrics, alerts,
restore drills, and release automation remain open.

- `/health/live`, `/health/ready`, and dependency-specific readiness checks.
- Structured JSON logs with request IDs, privacy redaction, and retention limits.
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
