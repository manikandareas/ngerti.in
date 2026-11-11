# Direct plugin installation and management — 2026-11-11

This owner-requested amendment supersedes the original Marketplace-to-Settings handoff. The authorizing changes require one detail action, direct installation, management centered in Marketplace, no Settings Apps section, a square-cornered button labelled `Install plugin`, and centered application-summary logos.

## Implemented behavior

- Plugin detail has one square-cornered primary action. `Install plugin` calls the existing `/v1/apps/connect` endpoint directly and reserves a provider authorization window during the click. Pending accounts reuse `/connections/:id/reconnect` rather than creating duplicate connection identities. Busy, pending-login, blocked-window and expired-link states remain actionable in place. Installed state requires an authoritative active connection.
- Marketplace owns live toolkit discovery/search/pagination, status checks, installation continuation, per-agent/per-thread action grants, retained activity receipts and Uninstall via the existing refresh/search/assign/revoke API routes. Installation creates no implicit grants. Editing one context preserves other contexts/members. Revoked connection metadata remains retained while effective access is blocked.
- Settings no longer imports or renders application management. Legacy Apps URLs resolve to Marketplace, and the conversation's application entry opens Marketplace. The previous contextual management component is removed.
- The application-description selector targets its own text element, preserving the logo container's flex centering. The browser test measures both logo centers within one pixel and asserts the Install button radius is zero.

Backend API contracts and lifecycle authority are unchanged. Plugin installation here binds an application account through Composio; public archive/package installation, plugin publishing and paid services remain outside this slice.

## Verification setup

The Marketplace suite uses the existing `nma062/api-server.ts` fixture host with real application HTTP, SQLite, domain commands, expected revisions and grants. Only the external Composio account/catalog/tool host and OAuth destination are simulated. Read-only presentation tests explicitly stub app and inherited-skill inventories. Provider/native inference and live OAuth are not established by these fixtures.

Commands run from `apps/web-client` unless shown as root commands:

| Check | Result |
| --- | --- |
| `bun run build:web-client` | Pass, including TypeScript build/check |
| `bun run lint:web-client` | Pass, zero findings |
| `bunx playwright test --config playwright.marketplace.config.ts` | 14/14 pass, desktop/mobile |
| `bunx playwright test --config playwright.settings.config.ts` | All 24 distinct cases pass: 22 passed the full cohort, the two count assertions passed a focused rerun after correction from nine sections to eight |
| `bunx playwright test --config playwright.work.config.ts --grep 'application access is assigned\|apps catalog searches'` | 4/4 pass, desktop/mobile |
| Focused visual review | Ship for this scoped follow-up; no material UI fixes or recapture required |
| `bun run docs:check` | Existing eight broken links in unchanged GPUI skill reference files; zero additional broken links |

Marketplace coverage includes direct installation without Settings navigation, exactly one header action, its label/radius, OAuth popup isolation, blocked and expired authorization recovery, same-account reload/reconnect, lost acknowledgement reconciliation, grant preservation across conversations and group members, revoke/persisted state and denied access after Uninstall. Presentation coverage retains both themes, URL/history, draft/focus/input identity, inventory errors, responsive overflow and centered application-summary icons.

The initial amendment tests exposed outdated test assumptions: unqualified heading locators matched both the new account heading and page heading, and revoke retains historical grant metadata rather than erasing it. The checks now qualify the page heading and verify revoked state plus denied effective access. A later isolated GET encountered `ECONNRESET`; the read helper permits one transport retry for this safe GET only. No install/reconnect mutation receives an automatic transport retry. The Settings full run passed 22/24 before two remaining assertions were corrected for the intentionally removed Apps section; the focused rerun passed both device-preference journeys without application changes.

## Evidence boundary

[The manifest](manifest.json) retains source/capture hashes and ten screenshots: desktop/mobile [before Install](screenshots/desktop-plugin-before-install.png), [installed access management](screenshots/mobile-plugin-installed-access.png), [blocked OAuth](screenshots/desktop-plugin-install-blocked.png), and light/dark GitHub detail. The original parent report/manifest/screenshots keep their earlier source boundary. The entire documentation check retains eight known broken links in unchanged GPUI skill reference files, with no additional broken link from this amendment.

No native Tauri launch, live provider login/tool execution, installer, production or public package-marketplace acceptance is claimed. Milestone statuses/dependencies and unrelated native Rust changes are preserved.

The independent reviewer inspected the required desktop/mobile state captures, the wide Skills capture and the supplied defect screenshot. It confirmed exactly one square-cornered install/state action, direct installation, centralized management, Settings removal and centered logos. Its requested evidence cleanup (final results and the Settings-test source hash) is complete.

## Subsequent radius refinement

The owner subsequently selected `rounded-sm` for the installation action. Current CSS uses the existing `--radius-sm` token (4px), and the focused browser assertion verifies 4px. The production build, scoped Biome check and both desktop/mobile install/access/uninstall journeys pass (2/2). The earlier source manifest, square-cornered captures and review above retain their original verification boundary. Installation and management behavior are unchanged.
