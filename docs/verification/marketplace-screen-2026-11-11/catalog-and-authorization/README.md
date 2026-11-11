# Marketplace catalog and authorization hardening

Date: 2026-11-11. Scope: the owner's Marketplace corrections and subsequent skeleton/toast, category-section and provider-logo refinements. This report supersedes earlier presentation assertions only for this amendment; retained earlier screenshots remain historical.

## Result

- The English sidebar's Installed list contains only active local app/plugin connections, including while Skills is selected. Empty installed state says “No plugins installed.” Pending accounts and skills do not enter that list. Loading the list uses skeletons.
- The Plugins toolbar contains only search. Discovery is grouped into provider-category sections, with no category select, reload or Settings button. Search covers names, descriptions, slugs and all category names/slugs. Each row reports local installation status; the provider connected flag does not silently install or grant access.
- The catalog automatically drains provider cursors, deduplicates by slug, retains partial results for retry and fences aborted reads. Logo URLs, descriptions, category metadata, website, action/trigger counts and no-auth state are projected from Composio. Logos use only provider URLs, with a generic package glyph when absent/broken. The static vendor assets retained from the original design pass are not used at runtime.
- Data loading uses row/detail/account skeletons. Errors and incomplete observations use themed toasts with recovery actions. Authorization instructions and Open browser remain inline; the detail retains one primary rounded-sm Install plugin action. The redundant single-app summary is removed. The install spinner lasts through authorization and polling, stops on authoritative active state, and yields recovery on terminal failures/timeouts.
- Tauri's frozen main-frame bridge sends HTTPS authorization URLs to a bounded same-origin native handoff. The native host returns an OS-command acknowledgement or a sanitized error. The renderer never relies on a blank native popup. Browser reservations still preserve user activation and isolate window.opener. Refresh/reconnect reuse the local pending connection identity and preserve explicit grants.
- Contract 1.32.0 adds optional catalog metadata without changing conversation/command semantics. The 99-route/50-tool full export and native Rust client pin were updated together. Other native Rust work was preserved.

## Diagnoses and regressions

The native-like regression loaded the actual desktop bridge and denied blank popups, matching the host's on_new_window behavior. Before the fix, the test expected one native URL handoff and observed zero. After the fix, it verifies the provider URL reaches the native bridge, including a failed native-open acknowledgement followed by recovery without another connection. Host unit checks validate origin, method, JSON/body/URL constraints, successful acknowledgement and sanitized OS failures.

Live Composio discovery also reproduced HTTP 400 when an empty search was sent. Empty search is now omitted; session toolkit pages use the documented/live-verified maximum of 50. One bulk metadata call enriches each page; metadata failures preserve app discovery instead of hiding the catalog.

A fast mobile navigation regression exposed premature toast dismissal: clearing an id before its first toast could race deferred removal. The hook now only retires a toast it actually displayed. The existing real-API mobile journey reproduced the missing recovery control before the correction and passed after it. Temporary instrumentation was removed.

## Verification

| Check | Result / boundary |
| --- | --- |
| Web build, TypeScript and lint; server TypeScript and lint | Pass; existing bundle-size advisories remain |
| Marketplace Playwright | 24/24 desktop/mobile cases: browser/native-bridge install/recovery, spinner, lost acknowledgement, explicit grants and revocation, sidebar/theme parity, provider metadata, category search, partial pages, skeletons and static-logo exclusion |
| Real API application workflows | 4/4 cases, with disposable SQLite and fixture authorization; other-thread/group grants preserved and revoked access rejected |
| Affected Settings journeys | 6/6 cases, including former Apps URLs and retained conversation/draft |
| Server integration/contract/response tests | 20/20 |
| Native Rust client tests | 17/17 (4 unit, 12 read-only/contract, 1 worker) |
| Tauri host tests | 6/6; browser opener is injected in the host test, rather than launching a real browser during unit tests |
| Live Composio catalog | 35 pages, 1,724 items; all 1,724 have logo URLs, descriptions, categories and action counts; metadata complete and final cursor exhausted |
| Live metadata browser render | Separate 50-app sample, both themes at 1440x1000 and 390x844; 29 logos decoded within the captured/lazy-loaded area and no horizontal overflow |
| Documentation links | The same eight pre-existing GPUI skill-document links fail; this amendment adds no broken links |

Commands and source/screenshot hashes are retained in manifest.json. `live-catalog.json` contains only aggregate discovery counts; no API key, owner identifier, account identifier or authorization URL is retained. Screenshots from automated workflows use provider/authorization fixtures. Live screenshots use public catalog metadata and an isolated browser/API fixture with no installed accounts.

## Proof limits

The actual Composio catalog was read; no real account login, OAuth approval, MCP execution or model inference was performed. Native browser behavior is proved at the real JavaScript bridge and Rust handoff seam, with OS opening injected for host unit tests. A rebuilt Tauri application and live system-browser authorization journey were not exercised. The 50-app visual sample does not claim every remote logo was decoded. Provider availability remains dependent on its service and the configured project. Arbitrary public MCP servers/packages, publishing, native Rust Marketplace parity, installation/distribution and NMA-063/064 acceptance remain outside this amendment.
