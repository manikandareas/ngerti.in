# Working files tree and read-only source viewer

Date: 2026-11-07. Scope: the accepted dedicated contextual Working files page, inline file tree, shared file icon resolver and Focus source viewer under [NMA-061](../../backlog/NMA-061.md) and [NMA-062](../../backlog/NMA-062.md). See the [current interface decision](../../product/interface.md#working-files).

## Delivered behavior

- The contextual panel's folder action opens Working files from Details, Library or Computer. Back restores the prior panel/detail; Close closes the panel. Library retains saved results, information/sharing and contextual memory/skills. Hidden saved-file detail headers do not compete with the Working files header, and the Computer preview detaches while Working files occupies the panel.
- Headless Tree supplies tree/selection/keyboard behavior. The conversation-owned browser store loads folder children on expansion, appends additional pages within the folder, retries failures and refreshes the loaded prefix. Empty/loading/error states, expansion, selection, scroll and focus survive Focus Back, including the mobile sheet unmounting. Scope changes abort retired directory reads. A refresh clears references to removed files.
- One local Material Icon Theme resolver serves the tree, Library, attachments and viewer-context chips. Exact filenames, parent-qualified associations, compound extensions, language IDs, folder states and light-theme overrides retain their precedence. Navigation controls remain Hugeicons. The package generator runs only during development/build; the browser loads static local JSON/SVGs and has a generic fallback.
- Source files render inside Focus with syntax colors, original indentation, line numbers, literal case-insensitive find/next/previous, copy and wrapping. Browser cases cover JavaScript, TypeScript, Go, Dockerfile, JSON, TOML and unknown UTF-8 text. Original downloads remain byte-identical. The existing overlay header, contextual composer and submit-time attachment flow are preserved.
- Source viewing and grammars load on demand. The existing Shiki JavaScript engine and bounded cache are shared with conversation snippets. More than 500 source lines use the existing TanStack virtualizer. Text previews retain the 128,000-byte limit; highlighting above 100,000 characters falls back to readable source. PDF/CSV/Markdown/static HTML retain their existing renderers, limits and sandbox behavior.

## Environment and provenance

The browser cohort uses isolated temporary API/SQLite state with the real repository command, upload, artifact, snapshot and event services. Only provider inference and the machine listing/read boundary are deterministic fixtures. Desktop uses 1440 × 1000 CSS pixels; mobile uses 390 × 844 with touch/mobile emulation. These are Chromium journeys, not a physical phone or native WebView run.

Bun 1.3.10, Node 25.9.0, Vite 8.3.5, TypeScript 7.0.2, Playwright 1.64.1 and installed Chrome for Testing 156.0.8078.4 were observed on macOS ARM64. Exact source hashes and dependency pins are retained in [source-manifest.json](source-manifest.json). Package modules and upgrade checks are recorded in [source adoption](../../development/source-adoption.md#working-files-tree-and-file-icons--2026-11-07).

| Integration | Pin | Delivery |
| --- | --- | --- |
| Headless Tree core/React | 1.8.0 / 1.8.0 | Lazy Working files chunk; only required features |
| Material Icon Theme | 5.40.0 | Build-only generator; local manifest, SVGs and original LICENSE |
| Shiki | 4.5.0, existing | Shared singleton, JavaScript regex engine and on-demand grammars |
| TanStack React Virtual | Existing dependency | Bounded source-line DOM for long files |

## Verification

The final browser cohort exercises both viewports, light/dark tree rendering, source theme switching, keyboard/Enter/Escape, root and child retries, empty folders, page append, refresh, original panel/header restoration, file focus/scroll, source language detection, search across syntax tokens, wrapping, unchanged copy/download, bounded large-file rendering and retained contextual feedback. It also reruns the existing PDF, static HTML, CSV/table, rich reply and scoped Goal/Routine/file journeys.

| Check | Result | Evidence |
| --- | --- | --- |
| Production build, including application/config/test TypeScript | Pass | [build.log](build.log) |
| Explicit typecheck | Pass | [typecheck.log](typecheck.log) |
| Scoped Biome, 27 application/build/test files | Pass | [lint.log](lint.log) |
| Unit/SSR/preview regression cases | 12/12 pass | [unit.log](unit.log) |
| Desktop/mobile browser cases | 36/36 pass; no failures, retries or skips | [browser.log](browser.log), [JSON report](browser-report.json) |
| Existing Cua machine list/read transport | Root and child listing plus existing fixture read pass | [native-read.json](native-read.json), [read-only probe](native-read.ts) |
| Documentation consistency/local links | Pass | [docs.log](docs.log) |
| Authored-change whitespace | Pass; raw capture exceptions retained below | [diff-check.log](diff-check.log) |

Reproduction commands from the repository root:

```sh
bun run build:web-client
bun run typecheck:web-client
cd apps/web-client
bun test verification/working-files.test.ts verification/file-preview.test.ts verification/markdown-render.test.tsx
bunx playwright test --config playwright.viewer.config.ts
cd ../..
bun docs/verification/working-files-tree-2026-11-07/native-read.ts
bun run docs:check
git diff --check
```

The native probe performs only stat/list/read operations through the retained Cua configuration. It reads the pre-existing `projects/desktop-check.txt` fixture (29 bytes) and records its hash; it creates no files, obtains no input lease and changes no machine state. This proves the existing file transport separately from the browser's deterministic machine-boundary fixtures.

The initial focused browser cohort passed 8/10 and exposed mobile scroll restoration before tree rows mounted; the implementation now restores after the rows exist and ignores hidden-container scroll resets. A later regression cohort passed 32/34: its two failures were the old Go preview test looking for a `pre` element after the dedicated source renderer replaced it. Both iterations are retained in [initial-browser.log](initial-browser.log) and [initial-viewer-regression.log](initial-viewer-regression.log); the final cohort uses the current source/scroll selectors. SSR coverage also found and corrected the missing server snapshot for the shared icon store.

The [evidence manifest](evidence-manifest.json) fingerprints retained artifacts. `build.log`, `initial-browser.log` and `initial-viewer-regression.log` retain whitespace produced by the original tools; their exact affected lines and SHA-256 hashes are recorded. Commit/range whitespace checks exclude only those three byte-verified captures. Authored code, tests and documentation use the normal whitespace check.

## Bundle and rendering observations

The baseline production build ran before source changes at the captured HEAD. [baseline-bundle.json](baseline-bundle.json) and [bundle.json](bundle.json) compare the sum of emitted `.js` chunks, including async grammars and excluding the unchanged `.mjs` PDF worker; this is not an initial-page transfer metric. The tree and source viewer remain separate lazy chunks. The local icon pack adds packaged static assets rather than browser generator code; only requested assets are transferred.

[Source rendering observations](source-render.json) retain the number of mounted rows for an 8,001-line local fixture and the time reported by the browser test. That timer includes local attachment selection, viewer opening and finding line 6,000; it is not an isolated highlighting benchmark or production SLO. The preview limit remains active for this large fixture. Existing build warnings about unrelated chunks over 500 kB are retained in the build log.

## Captures

- [Tree, light desktop](screenshots/tree-light-desktop.png), [dark desktop](screenshots/tree-dark-desktop.png), [light mobile](screenshots/tree-light-mobile.png), [dark mobile](screenshots/tree-dark-mobile.png).
- [Source, light desktop](screenshots/source-light-desktop.png), [dark desktop](screenshots/source-dark-desktop.png), [light mobile](screenshots/source-light-mobile.png), [dark mobile](screenshots/source-dark-mobile.png).
- [Find/wrap, desktop](screenshots/source-find-wrap-desktop.png), [mobile](screenshots/source-find-wrap-mobile.png).

## Boundaries

This is a scoped frontend amendment with real API browser verification and a separate read-only native file-transport smoke. It adds no backend route, editor, language server or file mutation. The broader native desktop/control suite's file-navigation selectors were maintained, but its takeover/handback journeys were not rerun for this change. Physical mobile keyboard behavior, native Tauri WebView/installation, provider/billing and product-wide NMA-063/NMA-064 acceptance remain separate. Unrelated research work in the checkout is preserved.
