# Media follow-up release — 2026-11-22

Cloudflare edge and Cloudflare Tunnel are retained by explicit operator
instruction. Their configuration and the existing CSP have not been changed.

## Delivered

- SMTP transport preparation and delivery run outside async runtime threads,
  with two concurrent jobs, fail-fast saturation, cancellation-safe capacity and
  an explicit ten-second network I/O timeout. Provider response text is excluded
  from delivery errors and logs; safe status/timeout details remain available.
  This improves isolation but does not repair the provider credential or impose
  a total DNS/TLS/delivery deadline.
- The composer previews text, hashtags, a selected local image and account
  visibility before publication. Previewing makes no upload or publication
  request. Ctrl/Cmd+Enter publishes, with composition/repeat and duplicate-submit
  guards. Failed submissions preserve the draft; successful submissions clear
  it. Inputs remain stable during a pending request.
- Composer, editor and temporary drafts count Unicode scalars consistently with
  the API. Full 500-emoji posts round-trip correctly. Oversized content and
  forbidden controls are rejected.
- Profiles and posts share canonical links through native sharing, clipboard or
  an accessible manual-copy dialog. Native sharing receives only the title and
  link; cancellation does not write to the clipboard. Query strings, fragments,
  credentials and external share destinations are rejected.
- Native report, moderation and manual-copy dialogs contain and restore keyboard
  focus, lock background scrolling and guard dismissal while submitting.
  Moderation passwords clear after cancellation and every submitted attempt.
  Mobile dialog spacing, corners and 44 px button targets were visually checked.
- Profile/post responses cannot overwrite a later route or viewer state. The
  landing loads separately from the authenticated feed, retaining an accessible
  loading state and the existing global chunk-failure recovery.

## Verification

- Rust: 68 application + five seed tests, format, strict Clippy and locked
  optimized build pass. Three new SMTP tests cover stalled work, cancellation,
  capacity, failure and panic recovery.
- Frontend: 38 Node tests and the production build/artifact gate pass. Final
  sizes: 124,285 entry JS bytes, 84,278 CSS bytes, 278,684 total JS bytes; existing
  budgets are unchanged.
- Disposable MariaDB/HTTP: 19 audience/media, 13 credential/session and three
  publishing checks pass. A 500-emoji post was persisted and verified through
  MySQL character length; 501 emoji and hidden controls were rejected. No real
  email is sent by these fixtures. Temporary database/user/files are removed.
- Chromium fixtures cover landing, composer, sharing/reporting and moderation
  at 320/390/768/1440 px in both themes, plus explicit same-component route races.
  Native sharing/clipboard are mocked to exercise success, refusal and cancel;
  an actual mobile operating-system share sheet has not been exercised.
- Real public Cloudflare checks at 390/1440 px in both themes pass: rendering,
  topic interaction, no horizontal overflow, no uncaught JavaScript errors and
  no observed CSP violations on those pages. Public, direct-origin and built
  entry JS/CSS are byte-identical.
- API, Nginx and Tunnel remain active; unexpected API restarts remain zero.
  Production still has zero users and posts. No schema migration, production
  credential, edge setting, audience policy or real content was changed.

## Active artifacts and rollback

- API release: `20261122T131634Z-e5de48a`.
- API SHA-256:
  `11ed7717f1a0088694203c63a02a58acabe5d1939d2da164da71824033ca9987`.
- API rollback:
  `/var/backups/media-binary-pre-backend-20261122T131634Z-e5de48a`.
- Frontend release:
  `/var/lib/media/frontend-releases/20261122T133321Z-7eaa324`.
- Frontend rollback:
  `/var/lib/media/frontend-releases/20261122T132946Z-950ff69`.

All activations used the shared deployment lock and passed their origin and
Cloudflare canaries. No rollback was needed for this follow-up.

## Remaining work

Brevo credential rotation and actual delivery verification are still required.
The previous optional, uncompiled SQLite lockfile vulnerability and Chrono
maintenance warning remain; dependency inputs were unchanged in this follow-up.
Account-aware abuse controls, passkeys/MFA, durable delivery/retry, broader
authorization coverage and an edge-compatible strict CSP remain in the plan.
Product work continues with alt text, image derivatives/carousels, named saved
collections, pinned posts, richer replies and notification controls. SEO and CI
remain in the final planned phase.

See [the delivery plan](DELIVERY_PLAN.md), [roadmap](ROADMAP.md) and
[security audit](SECURITY_AUDIT.md). Dialog semantics were checked against the
[HTML standard](https://html.spec.whatwg.org/multipage/interactive-elements.html#the-dialog-element).
