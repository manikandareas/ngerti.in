# Contextual header tabs — November 12, 2026

The owner requested Agent info and Working files as icon tabs at the left of the side-panel header, with Close at the right and Agent info active by default. Working files shares this header and omits the former shared-machine description. Existing profile, Details/Library/Computer and nested content remain within Agent info. Refresh moves into the file content area. [Interface behavior](../../product/interface.md#working-files) and [design geometry](../../../apps/web-client/DESIGN_SYSTEM.md#typography-and-geometry) record this web/Tauri refinement; the separate native Rust UI and backend contract 1.32.0 are unchanged.

## Implementation and retained state

Base revision: `8cf5c61e0f75dbd3322481bcde796a2e50eb3d1a` plus this working-tree slice and the preceding owner-requested refinements. [ContextPanel](../../../apps/web-client/src/features/conversation/components/context-panel.tsx) uses existing Radix Tabs and Hugeicons `UserAccountIcon`/`Folder01Icon`, with labels, tooltips, selected styling and arrow-key navigation. The Agent info body remains mounted while files are active; nested Back/title controls use a content-level row. Computer previews retain their existing suspension while files are open. The conversation-scoped browser retains folder expansion, selected file, scroll and Focus-return focus.

[WorkingFiles](../../../apps/web-client/src/features/conversation/components/working-files.tsx) removes its former header and description. The [mobile sheet handler](../../../apps/web-client/src/app/workspace-layout.tsx) returns from files to Agent info on Escape through panel state, preserving nested-page Back behavior. Close and reopening the conversation panel select Agent info again. Resource authorization and shared-machine ownership are unchanged.

## Validation

Setup: Bun 1.3.10, Vite 8.3.5, Playwright 1.64.1 and Chromium at 1440×1000 desktop and touch-enabled 390×844 mobile. Disposable NMA-062 API/SQLite provide identity, messages, responsibilities and command receipts. Harness execution, machine directory listings and file bytes use explicit fixtures. These results do not establish physical-machine, native-host, live-provider, installation or production acceptance.

| Check | Result |
| --- | --- |
| Web build/typecheck | Passed; existing large-chunk advisory remains. |
| Web lint | Passed, 376 files; final sheet-handler change also passed scoped Biome. |
| Impeccable detector on changed panel/tree/CSS | Zero findings. |
| Whitespace checks | Passed. |
| Viewer cohort, adjusted assertions | 11/12 passed; mobile Escape remained open work. |
| Final Escape/folder-recovery cohort | 2/2 passed, desktop/mobile. |
| Group creation/privacy and Edit regression | 4/4 passed, desktop/mobile. |
| Repository docs check | Eight pre-existing imported GPUI skill links fail outside this slice. |

Commands run from `apps/web-client` with `bunx playwright test`:

```sh
--config playwright.viewer.config.ts --grep 'Working files|Focus working files|contextual goals'
--config playwright.viewer.config.ts --grep 'Working files retries'
--config playwright.work.config.ts --grep 'group creation recovers|group editing reuses'
```

Across the adjusted viewer run and final targeted rerun all 12 distinct viewer cases pass: both themes, header geometry/selection, keyboard tab switching, close/reopen default, pagination/icons/refresh, tree and Focus restoration, failed/empty folders, saved-file details, responsibilities and attachment-on-Send behavior. The additional four group cases verify scoped profile navigation and the preceding Edit dialog.

Earlier attempts remain distinct: the initial viewer run passed 5/12, with broad legacy tab selectors, animation-sensitive coordinates and Escape sent to a focused tooltip needing adjustment. The first mobile-sheet fix passed 1/2 because programmatic click did not activate a Radix tab; the final fix changes panel state directly. Failed runs are not relabeled as passes.

## Rendered captures

Unmodified captures cover [desktop info light](screenshots/info-desktop-light.png), [desktop files light](screenshots/files-desktop-light.png), [desktop info dark](screenshots/info-desktop-dark.png), [desktop files dark](screenshots/files-desktop-dark.png), [mobile info light](screenshots/info-mobile-light.png), [mobile files light](screenshots/files-mobile-light.png), [mobile info dark](screenshots/info-mobile-dark.png) and [mobile files dark](screenshots/files-mobile-dark.png). Representative desktop/mobile renders were visually inspected. Images precede the final nonvisual mobile Escape adjustment; visual component source was unchanged afterward. [Source and capture hashes](manifest.json) identify the captured slice before the subsequent automatic-sync and cleanup refinements.

## Subsequent cleanup

The [automatic-sync follow-up](../working-files-sync-2026-11-12/README.md) records the final cleanup checks and browser regressions. Earlier source hashes and captures above remain historical evidence; they are not hashes of the later final tree.
