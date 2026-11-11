# Settings screen, preferences and persistent rail — 2026-11-11

Scope: `apps/web-client` and the shared React assets consumed by `apps/desktop`. The owner requested a full Settings screen, expanded its functional sections, then selected a permanent compact icon rail, contextual sidebars and borderless surfaces. Final corrections remove the conversation sidebar title and collapse actions, set rail icons to 20px, and match the Settings sidebar title to the 18px section heading. The native Rust client is outside this amendment.

## Implemented behavior

- One mounted rail selects Conversation or Settings: 56px desktop, 48px narrow screens, 40px controls, Hugeicons, accessible names, selected states and tooltips. The inner sidebar shows agents/groups or Settings sections. Mobile agents use an inline screen rather than a drawer covering the rail.
- Settings retains URL/history/provider compatibility and has nine working sections. Device preferences control startup destination, theme, reading size/width, send key, streaming interpolation, clocks, avatar animation/gaze, message actions and plain-text draft persistence. The existing backend owns provider/default configuration and scoped app grants.
- Screen switching retains composer identity, text and reading position. Hidden conversation layout observation pauses so a zero-height screen does not reset scroll intent. The selected Settings section/provider is retained during the workspace session.
- JSON export reads all public timeline pages, deduplicates messages, preserves journal order and excludes deleted messages, private runtime fields, credentials and attachment bytes. Reset affects interface preferences; theme, accounts, models and backend history are preserved.

## Verification

[Staged source manifest](source-manifest.json) records the exact final implementation/regression file hashes and baseline revision.

Versions: Bun 1.3.10, TypeScript 7.0.2, Vite 8.3.5, React 19.3.1, Playwright 1.64.1; Tauri core 2.12.5. No dependency or backend contract changes were required.

| Check | Result / retained record |
| --- | --- |
| Production build and web typecheck | Passed using `bun run build:web-client`. Existing large-chunk advisory remains. |
| Web lint | Passed using `bun run lint:web-client`. |
| Desktop TypeScript/Cargo check | Passed using `bun run typecheck:desktop`. |
| Focused unit checks | 16 passed, 0 failed, 47 assertions across preferences/export, chronology and preparation. |
| Settings/rail Chromium desktop/mobile journeys | 24 passed, 0 failed/skipped/flaky; [current results](settings-results.json). Includes 320/390/768/1024/1440px coverage, focus/history, drafts, public export, startup and reading-position restoration. |
| Sidebar/loading/preparation regressions | Workspace cohort: 15 passed, 1 mobile preparation timeout; [retained report](workspace-results.json). Corrected preparation cohort: 6 passed, 0 failed/skipped/flaky; [focused report](preparation-results.json). All 16 distinct scenarios have passing coverage across these cohorts. |
| Current WebKit screen journeys | [Seven passed checks](webkit-rail.json), zero runtime exceptions; current light/dark desktop and narrow captures below. |
| Earlier Tauri-gateway WebKit probe | [Six passed checks](webkit-tauri-gateway.json), before the rail refinement. This retains its original scope. |
| Design detector and independent visual review | No detector findings. The independent reviewer returned `ship` for all six supplied WebKit captures, with no material fixes. Native-host rendering remains unverified. |
| Documentation links | Eight existing broken links in imported GPUI skill reference files remain; this amendment adds no broken local links. |

The Chromium cohorts use the actual API and disposable SQLite. Harness availability/native login and the app catalog use explicit fixtures; the scroll test changes only public text length to exercise a long reading surface. Provider key storage, idempotency, configuration, revoke, public export and startup reads use real application routes. These checks do not claim completed native provider inference, billing acceptance or app authorization against a live external account.

[Before-rail results](settings-before-rail.json) and [before scroll-restoration repair](settings-before-scroll-fix.json) retain the earlier failed iterations. The repair pauses the scroll observer while the conversation screen is hidden and restores its reading/follow state on return. The earlier text-content assertion was corrected to use rendered text for a Lexical line break; navigation checks now scope section headings to Settings. The preparation timing fixtures now isolate their two-DM roster and settle portrait rendering before freezing browser time; their earlier mobile timeouts are retained in the workspace reports. The remaining mobile setup race was a test querying responsive controls before the lazy Settings screen mounted; the final fixture waits for that screen. [The intermediate preparation result](preparation-before-ready-wait.json) retains that failed iteration.

## Captures

- [Desktop Settings, dark](screenshots/rail-desktop-settings-dark.png) and [light](screenshots/rail-desktop-settings-light.png).
- [Desktop conversation](screenshots/rail-desktop-conversation-dark.png).
- [Mobile Settings](screenshots/rail-mobile-settings-dark.png), [agent list](screenshots/rail-mobile-agents-dark.png), and [conversation](screenshots/rail-mobile-conversation-dark.png).

These are browser WebKit captures. The separate native window automation attempts timed out and do not establish visual acceptance of a macOS window. The earlier isolated Tauri host reached backend/WebView readiness and its gateway passed the separately retained WebKit probe. Current native packaging, a fresh-device installation, NMA-063/NMA-064 and production readiness are not claimed.

## Reproduce

```sh
bun run build:web-client
bun run lint:web-client
bun run typecheck:desktop
bun test apps/web-client/verification/settings-preferences.test.ts \
  apps/web-client/verification/conversation-chronology.test.ts \
  apps/web-client/verification/conversation-preparation.test.ts
cd apps/web-client
bunx playwright test --config playwright.settings.config.ts
bunx playwright test preparation.spec.ts sidebar.spec.ts sidebar-loading.spec.ts --workers 1
```

For the bounded WebKit smoke, start an isolated local application origin, then run `bun apps/web-client/verification/settings-webkit-smoke.ts http://127.0.0.1:<port>` from the repository root. It writes the current WebKit report and captures without submitting agent work or authorizing an external app.

All UI code is authored locally from the existing Ngertiin theme, Hugeicons and component primitives. The supplied reference screenshots guide navigation structure. The additional menu grouping was informed by the official [ChatGPT desktop settings](https://learn.chatgpt.com/docs/app/settings), [Claude appearance controls](https://support.claude.com/en/articles/8887527-customizing-your-appearance-settings) and [Cursor privacy documentation](https://prod.cursor.com/help/security-and-privacy/privacy), while only controls supported by this implementation are exposed.
