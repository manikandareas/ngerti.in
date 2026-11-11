# Marketplace sidebar consistency — 2026-11-11

The owner requested that Marketplace follow the existing Settings and agent sidebars. This presentation-only amendment keeps plugin installation, account/access management, skill scope and conversation ownership unchanged.

Shared `app-sidebar-*` classes in the main stylesheet now own Settings/Marketplace menu spacing, heading typography, row geometry, hover, selected and keyboard-focus treatment. Marketplace removes its separate tinted background. It inherits the same neutral surface as Settings and the agent list, with the existing 280px width and 12px inset. Its title follows Settings' 18px/500/28px style; navigation rows use 40px height and 8px corners. The agent list retains its larger portrait/message-preview rows.

All available entries remain in the sidebar instead of truncating at ten. The installed/available list scrolls independently of the heading and section navigation. Long names truncate and expose their full name in a title. Mobile keeps inline Plugins/Skills navigation, with two equal-width 44px controls beside the retained rail.

## Verification

- Production build/typecheck: pass.
- Full web-client lint: pass.
- Marketplace/sidebar browser cohort: **8/8 pass**, desktop/mobile. The new cross-screen test compares actual rendered Settings/Marketplace row and title styles, agent/sidebar surfaces and selected colors in both themes. Fourteen long-name fixtures establish overflow, complete inventory, keyboard scrolling and stable header position. Existing search/detail/history/draft/focus, skills and error-state journeys also pass.
- Focused Settings navigation regression: **4/4 pass**, desktop/mobile, covering theme/navigation/draft continuity and persistent rail/sidebar behavior.

[The manifest](manifest.json) retains seven source hashes and twelve screenshots comparing Agents, Settings and Marketplace in both themes on desktop and mobile. The cross-screen assertions compare rendered values rather than copying CSS declarations; the final focused rerun (2/2 pass) uses actual Tab key events to reach the final installed entry, verifies scroll/header behavior and checks that the focus ring fits within the scrolling viewport. Visual inspection confirmed the matching surfaces and selected rows.

The fixture uses disposable real application HTTP/SQLite and deterministic read-only app inventories. No external OAuth or inference is run. Native Tauri launch, other native clients and full product/distribution acceptance remain outside this slice. Earlier Marketplace manifests and captures retain their original revisions. The repository documentation check retains its eight known broken GPUI reference links with zero additional broken links.
