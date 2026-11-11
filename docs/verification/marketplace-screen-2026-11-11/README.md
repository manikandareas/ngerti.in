# Marketplace screen verification — 2026-11-11

Scope: the owner-requested web-client/Tauri Marketplace presentation, following the four supplied catalog/detail/skills references. The existing native Rust client is outside this amendment. Product behavior is recorded in [the interface specification](../../product/interface.md#web-and-tauri-marketplace--2026-11-11) and [NMA-061](../../backlog/NMA-061.md#marketplace-screen-amendment--2026-11-11).

The original screen evidence below retains its captured source boundary. The later [direct installation and management amendment](plugin-management/README.md) supersedes the Settings handoff and detail-action behavior. Original screenshots/manifests are retained unchanged.

## Original implementation

- The lower persistent rail has a `Store02Icon` Marketplace action immediately above Settings, with selected state, accessible name and tooltip.
- Plugins and Skills use a contextual sidebar, search, category filtering, discovery/available tabs and URL-backed details. Desktop discovery has two columns; narrow screens have one column and inline section navigation.
- Twelve locally curated plugin entries use [retained Composio logo assets and hashes](../../../apps/web-client/public/marketplace/provenance.json). The catalog is discovery copy, not live provider availability. Only active app-connection projections establish connected state. Connection actions open the existing Settings Apps screen.
- Six skill recommendations are explicitly ideas. Available skill inventory uses a current conversation-member context, enabled application assignments and enabled native/bridged observations. Disabled native entries are omitted and duplicate native/bridged names are represented once.
- Examples append to the current draft, preserve existing text, return to the same mounted conversation and focus its composer. Browsing does not submit inference, connect an app or install a package.

## Verification

Environment: macOS ARM64, Bun 1.3.10, TypeScript 7.0.2, Vite 8.3.5, React 19.3.1 and Playwright 1.64.1. The browser tests use the existing disposable real API/SQLite fixture at loopback ports 8315/4315. App connections and inherited-skill inventory are deterministic fixtures; no external OAuth or native/provider inference is attempted.

| Check | Result | Boundary |
| --- | --- | --- |
| `bun run build:web-client` | Pass | Production client build; existing unrelated large-chunk notices remain. |
| `bun run typecheck:web-client` | Pass | TypeScript source check. |
| `bun run lint:web-client` | Pass | Entire web-client check, including local SVG accessibility titles. |
| `bunx playwright test --config playwright.marketplace.config.ts` | 6/6 pass | Three journeys each on desktop and mobile. |
| `bunx playwright test --config playwright.settings.config.ts` | 24/24 pass | Existing Settings, rail, draft, reading-position and provider-fixture regressions. |
| Impeccable mechanical detector | No findings | Run once over the new Marketplace feature and rail. |
| Independent visual finish review | Ship at verdict-pass scope | Full review accepted the composition and requested one inventory-error feedback fix; the final pass scored that finding resolved. |
| `bun run docs:check` | Existing baseline failure | Eight broken links in unchanged GPUI skill reference files; no new Marketplace link failure. |

Marketplace journeys verify rail placement and selected state, search/detail/reload/history, draft append and focus, input identity across destinations, connection handoff to Settings, scoped available skills and deduplication, empty/error states, both themes, and overflow at widths 320, 390, 768, 1024, 1440 and 2048 pixels.

The first test run passed 4/6 journeys; two failed because the test itself requested nonexistent `/v1/bootstrap` after all skill assertions had passed. Removing that unrelated endpoint assertion produced 6/6. The first full lint found imported SVGs missing descriptive titles; the local metadata adaptation resolved all twelve failures. The initial visual review requested recapture because route/style transitions were still visible; captures now explicitly await the destination and disable animations, with the mobile error state restored to 390×844. A subsequent full review requested clearer inventory failure feedback. Both tabs now report refresh failures and identify cached data, while initial-load failure has distinct wording. The final verdict pass inspected all six error-state captures and scored this single finding resolved; all six browser journeys passed again after the fix.

## Captured presentation

[The source/capture manifest](manifest.json) retains the parent Git revision and exact hashes. Nineteen screenshots under `screenshots/` cover desktop/mobile Plugins, Skills and GitHub detail in light/dark themes, initial-load and cached connection errors on both tabs, and wide desktop Skills at 2048×1174. They use fixture connection/skill status. Visual review is bounded to these states and sizes; it is not a claim of literal pixel parity with the supplied client.

Representative captures: [desktop Plugins](screenshots/desktop-plugins-dark.png), [desktop detail](screenshots/desktop-detail-dark.png), [desktop Skills](screenshots/desktop-skills-dark-wide.png), [mobile Plugins](screenshots/mobile-plugins-light.png), [mobile Skills](screenshots/mobile-skills-dark.png).

## Limits

Public package installation, publishing, payments, live OAuth/provider tool availability and native Rust parity are unimplemented or unverified in this slice. Tauri shares the changed client source, but no new native Tauri launch or fresh-device package was exercised. This amendment does not close NMA-063/NMA-064 or change milestone status/dependencies. Unrelated working-tree changes are preserved.
