# Media — delivery plan, updated 2026-11-23

This plan supplements ROADMAP.md with the next concrete releases. A feature is
finished only after its failure states, authorization boundaries, responsive
layout, checks, release and rollback are verified. Commits use the repository
owner's existing identity without generated-by or coauthor attribution.

**Architecture constraint:** Cloudflare edge and Cloudflare Tunnel are mandatory
and retained by explicit operator instruction. CSP work must remain compatible
with the deployed Cloudflare protections; replacing or bypassing Cloudflare is
not a remediation option.

**Retired provider:** the operator confirmed on 2026-11-22 that Brevo has not
been used for months and must be ignored. Remove it from active incidents,
vendor assumptions and release blockers. Do not rotate its credentials, send
test messages or plan restoration. The generic SMTP code is provider-independent;
a legacy hostname in local configuration is not evidence of an active provider.

## Delivered and verified in this session

- Direct media authorization, restricted upload namespaces and independent
  application cache policy are live.
- Seven vulnerable dependency reports are patched; one uncompiled SQLite
  lockfile finding and the Chrono maintenance warning remain visible.
- Credential changes revoke pending recovery/email-change links. Thirty-two
  isolated HTTP checks pass, including concurrent resets and media audiences.
- Follow-up verification adds three actual HTTP/storage checks for Unicode
  publishing boundaries, for 35 checks total. SMTP now runs in a bounded blocking
  pool with cancellation-safe capacity, explicit I/O timeout and redacted errors.
- Publishing gains a local preview, Ctrl/Cmd+Enter and matching Unicode counts.
  Profiles/posts have canonical-link sharing with manual-copy fallback; native
  report/moderation dialogs contain focus and retain safe pending states.
  The Node suite now has 38 passing tests and the Rust suite has 73.
- The editorial landing, four interactive conversation examples, hashtag links,
  search filters/topics, stale-request protection, correct feed offsets, image
  viewer and useful feed shortcuts are live.
- Browser checks cover 320/390/768/1440 px, both themes for the landing and image
  viewer, and real public Cloudflare rendering at 390/1440 px in both themes.
- Frontend/backend deployers now reject overlapping activations before mutation.
  SEO expansion and CI setup remain in the final planned phase.
- Image descriptions are delivered across publishing, viewing, public HTML and
  export v8, with previous-binary compatibility verified on the new schema.
  Offline migration application now has a compiled manifest, shared lock and
  restore-verified backup; API startup performs read-only schema validation.
- One owned post can now be pinned to a profile, including outside the first
  page, without duplication or reordering chronological feeds. The API enforces
  owner/audience/block/hide rules, atomic replacement and conditional unpin;
  database foreign keys enforce ownership and deletion cascades. Export is now
  v9 in that release. Its suite passed 79 Rust, 40 Node and 139 isolated HTTP checks, plus eight
  pin viewport/theme cases and a stale-route case. See the
  [verified pinned-post release](RELEASE_2026-11-22_PINS.md) for that snapshot.
- Private named bookmark collections are live as of 2026-11-23: up to 30 per
  account, 60-character names, CRUD, one optional collection per save, filing and
  filters. Deleting a collection preserves saves. Owner-only export v10 and FK
  cleanup cover both new tables. Stale viewer/filter responses and saved-feed
  pagination/removal are corrected. All 80 Rust, 42 Node and 254 isolated HTTP
  checks pass, plus eight viewport/theme collection workflows and a viewer race,
  checked locally and on Cloudflare-delivered assets with API fixtures.
- Backend canaries now default to free loopback port 18085, with a validated
  override and occupied-port checks in dry-run and activation. Nginx's existing
  18084 listener was preserved. No Cloudflare routing or policy was changed.
- Optional public profile details and advisory content warnings are live.
  Profiles add display names, pronouns, location and validated HTTPS links, with
  atomic edits and explicit public-data disclosure. Post warnings use native
  closed disclosures, generic declared previews and warning-preserving drafts.
  Export is now v12. The observed assignment/unsave race and profile UPDATE
  construction are fixed. Current checks pass 85 Rust, 46 Node and 377 actual
  HTTP checks, plus responsive profile/warning browser workflows. See the
  [current release record](RELEASE_2026-11-23_PROFILES_WARNINGS.md).

This is a verified release increment, not completion of every backlog item.
The [profile/warning release report](RELEASE_2026-11-23_PROFILES_WARNINGS.md) records the current
artifacts, validation scope, Cloudflare constraint and remaining work. Earlier
release reports are historical snapshots.

## Findings from the current re-audit

| Priority | Finding | Evidence / action |
| --- | --- | --- |
| P1 — fixed | Direct uploads needed independent audience checks | Application authorization now covers direct media, namespaces and forged headers; actual HTTP and loopback/public canaries pass. |
| P2 — fixed | Direct API success/failure responses needed cache protection | Application responses use private/no-store independently of Nginx; public responses also prohibit storage. |
| P1 — fixed | Outstanding credential links survived credential changes | Transactional revocation, account locks, expiry and concurrent-reset/session regressions are delivered. |
| Retired / excluded | Historical Brevo authentication failures | Superseded by operator clarification: unused for months, excluded from active incidents and release gates. Current email delivery is unverified. |
| P2 | CSP permits inline scripts for Cloudflare challenges | Current public header confirmed. Coordinate an edge nonce/hash-compatible policy before tightening; do not silently break the challenge. |
| P2 | Auth throttling depends heavily on shared infrastructure | Add durable account-aware budgets, passkeys/TOTP, breached-password checks and login alerts. |
| P2 — expanded; CI pending | Audience coverage still needs broader automation | The current disposable matrix has 377 HTTP checks across media, identity, posts, profiles and collections; broader moderation/operational CI remains in the final phase. |
| Supply chain — open | One optional SQLite lockfile finding and a Chrono maintenance warning remain | Seven earlier findings were patched. Fresh RustSec audit still reports the uncompiled SQLite binding and Chrono warning; npm audit reports zero. No full-lockfile clean-audit claim. |
| Product — delivered | Editorial landing replaced the earlier generic presentation | Interactive product examples and responsive light/dark layouts are live and browser-verified. |
| Correctness — fixed | Search and list continuation needed sequencing/offset fixes | Stale query/viewer responses are guarded; consumed-row offsets and saved-list refresh after removal are implemented. Cursor pagination remains future work. |

## Release sequence

1. **Application security boundary.** Guard direct uploads, reject unsupported
   paths/methods, override forged media-path headers, reuse current audience
   policy, enforce no-store and security headers, add regression checks and
   release canaries. No database migration.
2. **Editorial redesign.** Replace landing structure and decorative preview
   cards; retain the Media identity and all account flows. Make the presentation
   work at 320, 390, 768 and 1440 CSS pixels in both themes. Use actual product
   capabilities, readable copy, keyboard focus and reduced-motion support.
3. **Useful discovery.** Search filters for people/posts, topic entry points,
   safe hashtag navigation, clear result/empty/error states, stale-request
   protection, and correct feed continuation. No fabricated trends or members.
4. **Publishing and profiles.** Image descriptions, accessible viewing, pinned
   posts, named private bookmark collections, optional public profile details and
   content warnings are delivered. Next: multiple images with derivatives,
   mentions and notification quiet hours. Design each
   storage migration and its rollback separately.
5. **Interaction.** Polls, mentions, threaded replies, notification quiet hours,
   saved searches and transparent suggested follows. Build anti-spam quotas and
   block/private-account enforcement into each feature.
6. **Identity and operations.** Add passkeys/MFA and recovery codes,
   account-aware rate limits, least-privilege migration jobs, metrics and alert
   ownership. SMTP runtime isolation is delivered; Brevo restoration is excluded.
   Verify backup restore and the outstanding exact-URL cache purge.
7. **Product completion.** Accessible dialogs/toasts, real moderation notices
   and appeals, retention and export jobs, privacy contact/policy approval,
   installation flows and a safe offline shell.
8. **SEO and CI, last as requested.** Add browser/audience regression CI,
   migration validation, dependency/secret checks and release automation.
   Expand public indexing only with explicit account consent and privacy
   review; validate structured data, sitemap policy and Core Web Vitals.

## Verification and deployment

- Rust: format, strict Clippy, locked tests/build and current RustSec audit.
- Frontend: Node contract tests, production build, existing artifact budgets,
  locked npm audit and browser checks on representative sizes/themes.
- Production: use the existing isolated candidate and atomic release scripts;
  verify origin and Cloudflare boundaries, health, rejection paths and rollback
  artifacts. Keep runtime secrets, uploads, accounts and generated files out of
  Git. Avoid scanning or changing unrelated VPS applications.
- Report confirmed findings separately from historical incidents, architectural
  limitations and proposed features. No security audit proves absence of flaws.

References: [OWASP uploads](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
and [OWASP CSP](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html).
