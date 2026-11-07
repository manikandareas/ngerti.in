# Sidebar loading verification — 2026-11-07

Scope: initial sidebar presentation for agent DMs and groups. Base source is `59320d7` plus the working-tree files in [source-manifest.json](source-manifest.json). No new dependencies, API contracts or native harness execution are involved.

## Behavior and implementation

- `use-workspace.ts` loads sidebar projections in parallel and reports their initial readiness independently of the selected conversation, opening and connection reads. Later refreshes retain this readiness.
- `conversation-list.tsx` prepares mounted rows behind matching skeletons. The first reveal waits for the portraits in the navigation viewport, including both displayed group members. Hidden rows are inert and excluded from accessibility navigation until ready.
- The avatar controller decodes the PNG texture before reporting readiness. Decode/rasterization failure reports a usable shaded fallback instead. Stale/disposed controller completions are ignored.
- Deferred avatars mount on first intersection; their shared animation clock still suspends offscreen work. Revisiting a prepared row retains its portrait. New/offscreen rows retain a row skeleton until ready.

## Setup and evidence boundary

Bun 1.3.10; repository-locked React 19.3.1, Vite 8.3.5, TypeScript 7.0.2 and Playwright 1.64.1. Chromium headless at 1440×1000 and 390×844. The existing `playwright.config.ts` starts the real API with disposable owner-bound SQLite and no native executors, plus the production client preview. Synthetic test delays/failures affect only test-page image decoding and intercepted real API responses.

An isolated detached checkout at `59320d7` received exactly the nine source/test files in the manifest and reused installed dependencies. This excluded concurrent viewer-prototype work. Its production build and focused tests passed. Full working-tree build attempts during that parallel work encountered a missing `viewer-prototype` module, then a missing `viewer-prototype.css`; those unrelated files were preserved. Once the concurrent assets were present, the final full working-tree typecheck and production build also passed. The temporary checkout and audit servers were removed after verification.

## Results

| Check | Planned / executed | Result |
| --- | --- | --- |
| Regression before fix: hold avatar texture decoding after sidebar data arrives | 1 / 1 desktop | Failed as expected: `Memuat percakapan` disappeared while portraits were pending. |
| Delayed data and textures; atomic DM/group reveal; live rename | 2 / 2 desktop/mobile | Pass; zero sampled visible rows with unready portraits. |
| Failed texture decode with reduced motion | 2 / 2 desktop/mobile | Pass; shaded fallback shown and skeleton cleared. |
| Long roster; first viewport independent of deferred offscreen rows | 2 / 2 desktop/mobile | Pass. |
| Scroll away and return to a prepared portrait | 2 / 2 desktop/mobile | Pass in the targeted rerun. |
| Existing sidebar preview/activity checks, light and dark | 4 / 4 desktop/mobile | Pass. |
| Existing avatar activity/DM/group separation checks | 2 / 2 desktop/mobile | Pass. |
| Avatar engine, shared clock and workspace synchronization unit checks | 17 / 17 | Pass; 8,661 assertions. |
| Isolated production build, including TypeScript | 1 / 1 | Pass; existing large-chunk advisory remains. |
| Final full working-tree typecheck and production build | 2 / 2 | Pass after the concurrent viewer assets were present. |
| Biome on the nine source/test files | 1 / 1 | Pass. |
| Documentation links and backlog consistency | 1 / 1 | Pass; 184 Markdown files and 1,434 local links checked. |

The earlier audit reproduced empty portrait slots in 5/5 initial opens (approximately 85–232 ms between list text and SVG availability). The repeated probe against the validated production client found **zero partial-avatar frames in 5/5 opens**; see [initial-open-probe.json](initial-open-probe.json). The disposable roster grew between captures, so these runs are presentation checks, not a total startup-latency benchmark. Visible rows were selected by computed visibility in the post-fix probe, since staging rows intentionally remain mounted and hidden.

Representative captures: [desktop skeleton](desktop-skeleton.png), [desktop ready](desktop-ready.png), [mobile skeleton](mobile-skeleton.png), [mobile ready](mobile-ready.png). The skeleton captures deliberately hold texture decoding; they show the in-progress presentation, not a fixed user-facing delay.

## Reproduction

Run from `apps/web-client` on the scoped source:

```sh
bun run build
bunx playwright test tests/sidebar-loading.spec.ts
bunx playwright test tests/sidebar.spec.ts tests/agent-avatar.spec.ts --grep 'unified sidebar|avatar activity follows'
```

Run from the repository root:

```sh
bun test apps/web-client/verification/avatar-engine.test.ts apps/web-client/verification/avatar-clock.test.ts apps/web-client/verification/workspace-sync.test.ts
```

This verifies browser presentation and existing API/event behavior. Native Tauri/WKWebView cold launch, native/provider inference, installation and product-wide NMA-063 acceptance were not executed by this follow-up. NMA-063/NMA-064 remain Backlog.
