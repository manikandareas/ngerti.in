# Compact navigation rail — November 12, 2026

The owner narrowed the request to the persistent icon rail. Desktop width changes from 56px to 48px, controls from 40px to 36px, corners from 10px to 8px and spacing between bottom actions from 8px to 4px. Hugeicons remain 20px. Narrow/coarse/no-hover input retains the existing 40px targets, 10px corners and 8px spacing. Window titlebar, conversation header, frame insets and contextual sidebars retain their existing geometry.

Source: working-tree change to [index.css](../../../apps/web-client/src/index.css) on base `8cf5c61e0f75dbd3322481bcde796a2e50eb3d1a`. [Interface specification](../../product/interface.md#web-and-tauri-settings--2026-11-11) and [design geometry](../../../apps/web-client/DESIGN_SYSTEM.md#typography-and-geometry) describe the resulting behavior. No backend/API or milestone status change is required.

Validated CSS SHA-256: `6937b343293269e67f2023b62048c1310ffb36a382e5dc38f48e18aa08942727`.

## Validation

Setup: Bun 1.3.10, Vite 8.3.5 and Playwright 1.64.1. Existing browser suites run Chromium at 1440×1000 and touch-enabled 390×844 against disposable SQLite and the real application API. Marketplace catalog/connection data and harness availability are fixtures as declared by those suites.

| Check | Result |
| --- | --- |
| `bun run --cwd apps/web-client build` | Passed; existing large-chunk advisory remains. |
| `bun run --cwd apps/web-client lint` | Passed, 373 files. |
| `bunx playwright test --config playwright.settings.config.ts --grep 'navigation, theme'` | 2/2 passed: desktop/mobile navigation, themes, keyboard focus and retained draft. |
| `bunx playwright test --config playwright.marketplace.config.ts --grep 'sidebar matches'` | 2/2 passed: desktop/mobile Conversation, Settings and Marketplace consistency in both themes, overflow and installed-list focus behavior. |
| Impeccable detector on `apps/web-client/src/index.css` | Passed, zero findings. |
| `git diff --check` | Passed. |
| `bun run docs:check` | Fails on eight pre-existing imported GPUI skill links; none is in an edited document. |

The two Playwright commands run from `apps/web-client`. The live development gateway was also viewed in Brave after rebuilding and reloading; the narrower rail and centered icons were visible. This is browser presentation evidence, with no new native-window, provider, billing or installation claim.

Retained unmodified browser captures: [desktop light](screenshots/desktop-light.png), [desktop dark](screenshots/desktop-dark.png), [mobile light](screenshots/mobile-light.png), [mobile dark](screenshots/mobile-dark.png). They show the same rail on Marketplace; the Settings suite separately verifies return-to-conversation continuity. Desktop coarse-pointer behavior is covered by source media rules rather than a separate hardware journey.

## Follow-up: remove the conversation-sidebar app action

The owner subsequently requested removal of **Hubungkan aplikasi** from the conversation sidebar. [Conversation navigation](../../../apps/web-client/src/features/conversation/components/navigation.tsx) removes the button and footer container; its unused callback, icon import and CSS rule are removed as well. App discovery and connection management remain available through the Marketplace rail action. Existing app-access journeys now enter through Marketplace.

Build, lint, the design detector and whitespace checks passed. Six distinct browser cases passed across the following runs: the two app-access/auth-recovery journeys on desktop/mobile (initially 3/4 passed, with the desktop access case passing 1/1 in isolation), and sidebar consistency on desktop/mobile (2/2 passed in isolation). The initial parallel attempt also timed out on both sidebar cases while the conversation skeleton was still loading; these failures occurred before the changed navigation steps. No timeout or product behavior was changed to obtain the isolated passes. The eight existing imported GPUI documentation-link failures remain.

Commands: `bunx playwright test --config playwright.work.config.ts --grep 'application access is assigned|apps catalog searches live'`; rerun the access case with `--project desktop --grep 'application access is assigned'`; sidebar checks use the Marketplace command above. [Desktop sidebar](screenshots/sidebar-no-footer-desktop.png) and [mobile sidebar](screenshots/sidebar-no-footer-mobile.png) are unmodified captures from the passing isolated run, visually checked for removal of the footer and preservation of the compact rail.
