# Group edit dialog — November 12, 2026

The owner requested removal of the Members card and Manage members section, with a pencil button beside the hero avatars opening the creation-style dialog for editing. This slice affects the shared React web/Tauri presentation. [Interface behavior](../../product/interface.md#create-group) defines the resulting UI.

## Source and persistence

Base revision: `8cf5c61e0f75dbd3322481bcde796a2e50eb3d1a` plus this working-tree change. [ContextPanel](../../../apps/web-client/src/features/conversation/components/context-panel.tsx) owns the pencil action and member-avatar navigation; [GroupPanel](../../../apps/web-client/src/features/conversation/components/group-panel.tsx) retains only the scoped member-profile leaf. [GroupDialog](../../../apps/web-client/src/features/conversation/components/group-dialog.tsx) supplies the same presentation for Create and Edit. [EditGroup](../../../apps/web-client/src/features/conversation/components/edit-group.tsx) and its [save journal](../../../apps/web-client/src/features/conversation/lib/group-edit.ts) use the existing membership/configuration APIs.

Saving edits the current group, without creating a group, opener or inference. Membership and name are separate existing commands; this is not an atomic combined backend update. Each uses the last confirmed revision. The device-local edit journal retains the full desired form and exact command identities through a lost acknowledgement/reload; Check save resumes the pending step. A definitive stale revision requires explicit reload and never adopts a newer revision automatically. Already-confirmed steps remain saved if a later step fails. Cancel before saving sends no mutation; closing an uncertain edit retains its pending journal.

## Validation

Environment: Bun 1.3.10, Vite 8.3.5, Playwright 1.64.1, Chromium at 1440×1000 and touch-enabled 390×844. Existing NMA-062 fixtures provide harness/provider execution while the actual application API, SQLite, revisions and command receipts remain real and disposable. Commands run from `apps/web-client` unless otherwise indicated.

- `bun run build`: passed; existing large-chunk advisory remains.
- `bun run lint`: passed, 376 files.
- `bun run typecheck`: passed.
- `bunx playwright test --config playwright.work.config.ts --grep 'group editing|membership editing|group creation recovers'`: 10/10 passed. This covers retained Create recovery, private member-profile navigation, Edit prefill/cancel/focus return, nonempty membership validation, name/member persistence on the same group, no new opener, stale-revision conflict/reload, and exact-identity recovery after losing either command acknowledgement.
- Additional `--grep 'group editing reuses'` run with three initial members: 2/2 passed, including geometry assertions that the pencil stays inside the hero and does not overlap the last avatar. The first attempt at this additional fixture used GET setup data as bootstrap identities and failed before group creation; using the existing idempotent POST setup contract corrected that fixture. No application change was needed.
- Impeccable detector on all five changed UI components: zero findings.
- `git diff --check`: passed.
- Repository `bun run docs:check`: the eight pre-existing imported GPUI skill links remain outside this slice.

Visually inspected the [desktop edit dialog](screenshots/edit-desktop.png), [mobile panel](screenshots/panel-mobile.png) and [dark pending dialog](screenshots/pending-desktop.png). Additional retained captures: [desktop panel](screenshots/panel-desktop.png), [mobile edit dialog](screenshots/edit-mobile.png), [mobile pending dialog](screenshots/pending-mobile.png). These establish browser presentation and real-API persistence coverage; no new native-window, production, installation or live-provider claim is made. Backend/API contract 1.32.0 and milestone status remain unchanged.

The three-avatar layout was also visually inspected on [desktop](screenshots/three-members-desktop.png) and [mobile](screenshots/three-members-mobile.png). [Source and capture hashes](manifest.json) identify this captured working-tree slice before subsequent header and cleanup refinements.
