# NMA-067 independent avatar component verification

Date: 2026-11-07. Status: **In Progress**. This slice implements the Rust avatar engine and a fixed-time native display. It does not complete NMA-067 or waive its [NMA-066 dependency](../../backlog/NMA-066.md). Composer, messages/rich content, production PDF/static HTML and matched performance remain ordered work. Tauri remains the active product client.

## Source and implementation

Reference Git: `1d3feb2d5072248de02abd9051b0013d06b42eaf`. Exact original source hashes are in [the shared vectors](../../../apps/desktop-rs/verification/nma-067/avatar-reference.json); local source, dependency implementation and binary hashes are in [the source manifest](source-manifest.json). The original avatar catalog/config and render/motion/loading/controller/texture modules were read directly. Knowledge-graph tools were unavailable, so discovery used targeted source reads.

The [Rust avatar crate](../../../apps/desktop-rs/crates/avatar/src/lib.rs) implements version-1 parsing/creation, JavaScript UTF-16 seed length and Unicode scalar hashing, wrapping random arithmetic, all 8 shapes/20 valid colors/8 faces, deterministic face proportions and 8,500 curved fibers. New identities exclude the same six retired colors; stored recipes retain them. Original gradients, turbulence, fur mask, eye shapes, contact/inset-shadow filter, loading rings and veins are retained. Seed text never enters SVG markup. `MotionClock` owns smoothing/action/loading state and accepts explicit visibility/reduced-motion policy; it is not yet connected to a continuous native host clock.

The [GPUI adapter](../../../apps/desktop-rs/crates/desktop/src/ui/avatar.rs) generates textures and parses/rasterizes SVG on one 8 MiB OS worker with one queued slot. A material LRU and PNG texture LRU each retain at most 16 identities. Faces/state do not regenerate the seeded fur field; dynamic SVG contains the cached surface image and freshly generated eyes/ornaments. Retired receivers cancel queued work, active work checks retirement before compositing, and replaced/offscreen GPU images are explicitly dropped. A request already rasterizing may finish and be discarded. The worker remains idle without a frame timer between requests; this does not prove a continuous animation/hidden-window CPU budget.

The [Avatar gallery](../../../apps/desktop-rs/crates/desktop/src/features/avatar.rs) displays the same Rust-generated frame at 32/64/128/256 logical pixels and offers fixed-time shape/color/expression/state/action/loading/reduced-motion controls. The old NMA-066 material spike remains a separate tab. The [Rust exporter](../../../apps/desktop-rs/crates/avatar/examples/export.rs) accepts a new seed or stored recipe, writes the resulting recipe and transparent SVG/PNG, and bounds raster size to 32–2048 px. Runtime components/export do not invoke TypeScript, React or a browser; only the development oracle imports the reference renderer to freeze vectors.

## Executed checks

The reference host remains macOS ARM64 / Apple M1, with Rust/Cargo 1.99.1 and Bun 1.3.10. [Environment and capture metadata](environment.json) retain live versions and observed image dimensions. Dependencies remain pinned to GPUI Kit/WebView 0.9.0, GPUI Fast 0.1.13 and resvg 0.46.0; the adapter adds direct references to already-locked image 0.25.10, base64 0.22.1 and futures-channel 0.3.34. No existing dependency version changed.

| Check | Executed denominator | Result / limit |
| --- | --- | --- |
| Recipe/catalog/random/material equivalence | 44 recipes, all 8 shape paths/face positions, all 20 palettes, 16 random draws per recipe, 374,000 fibers | Pass. Every fiber's six two-decimal coordinates, light/dark choice, ten-decimal opacity and width contribute to a shared SHA-256 digest; boundary fibers also have direct numeric checks. Covers Unicode/combining/HTML-like seeds, maximum UTF-16 length, legacy colors and invalid version/seed/catalog cases. |
| Fixed-time motion and expression mapping | 196 state/reduced-motion pose samples, 36 action samples, 26 loading samples, 56 face/state mappings | Pass against the unmodified TypeScript functions, within 1e-10 numeric tolerance. Includes independent blink offsets, action bounds and negative/wrapped loading time. This is model evidence, not native frame scheduling. |
| Cache/clock/exports | Four responsibility-focused test cases, including the raster correction | Pass. Cache reuse/eviction/invalid hits; hidden/reduced-motion/retired-action behavior; SVG provenance, transparency and mismatched material/external texture rejection; corrected displacement geometry. |
| Original SVG versus Rust SVG through the same rasterizer | Tobi at 64/256/768 px | Pass, zero pixel difference including eye filters and transparent corners. Both sides use the same resvg implementation. This proves the ported SVG's rendering equivalence, not browser/native pixel parity. |
| Rust format, strict Clippy, workspace tests and ownership audit | One final check suite; 20 tests total | Pass. Eight avatar tests plus twelve retained client tests. [Output](rust-check.log). Client/avatar remain GPUI/platform independent, and browser construction remains confined to the existing adapter. |
| Standalone Rust executable | One stored Tobi recipe; one novel Unicode seed | Pass. [Tobi request](../../../apps/desktop-rs/verification/nma-067/export-request.json), [new-seed request](../../../apps/desktop-rs/verification/nma-067/new-seed-request.json), [execution](export.log), [SVG](rust-tobi.svg), [PNG](rust-tobi.png) and [resulting recipe](rust-tobi.recipe.json). The novel-seed output is under ignored `.dev/nma-067-exports`; its hashes are retained in the source manifest. |
| Native fixed-time component | One macOS host, four display sizes, selected shape/state/loading/reduced-motion interactions | Pass for the captured states. [Corrected Tobi](native-avatar-after-fix.jpg), [oval](native-avatar-oval-after-fix.jpg) and [reduced motion](native-avatar-reduced-motion.jpg). The final binary also retired and re-entered the Avatar scene successfully; GPU memory was not instrumented. Earlier light/loading captures show the pre-correction renderer and remain labeled as iterations. The full shape/face/state/action/theme/time matrix is not executed. |
| Browser/raster comparison | One Tobi recipe in Brave, before/after correction | Executed. [Before](renderer-comparison.jpg) exposed excessive silhouette displacement/halo; [after](renderer-comparison-after-fix.jpg) removes the large discrepancy. This is visual observation at one recipe/size, without a numerical cross-renderer threshold or full matrix. |
| Continuous animation, pointer gaze, hidden/occluded native clock and many-avatar workload | 0 complete native workloads | Unexecuted; core samples and fixed frames do not establish these criteria. |
| Composer/messages/content/PDF/HTML parity | 0 new completed component workflows | Not implemented in this slice. NMA-066's retained probes remain their captured scope. |

The final native gallery remains open on the Avatar scene for inspection; the temporary comparison server was stopped. The native gallery ran with no backend attachment configured. No API/provider/billing/Computer/product acceptance workflow was exercised. No active Tauri profile, backend database, credentials, unrelated download, or retained prior evidence was reset.

## Failure and correction: pinned displacement

The first PNG/native comparison had a conspicuous upper-left halo and overly displaced fur. Pixel equality between the original SVG and Rust SVG through resvg had passed; a direct browser comparison was necessary to reveal the renderer problem. The [pre-correction PNG](rust-tobi-before-displacement-fix.png) and screenshots are retained.

Inspection of the pinned resvg 0.46.0 implementation found `filter/mod.rs::apply_displacement_map` passing `fe.scale() × transform_scale` into `filter/displacement_map.rs::apply`, which multiplies by `fe.scale()` again. The authored five-unit displacement therefore became twenty-five units. `svg_for_resvg_0_46` supplies sqrt(5) only to that exact authored filter at the raster seam. Original downloadable SVG retains its five-unit filter. A constant white-map regression proves the square moves by the intended 2.5 units per axis instead of 12.5. Native material generation and standalone PNG export both use this adaptation.

This workaround is tied to the exact pin and source hashes. Reinspect/remove it when upgrading resvg. Selected browser/native frames now agree much more closely, but remaining anti-aliasing/filter/resampling differences and all-recipe numerical parity are not accepted by this report.

An immediate theme-toggle attempt also landed on the snapshot scene instead of yielding the intended dark/loading capture; subsequent inspection showed another expression state. That attempt is not counted as a matched dark/reduced-motion result. The original light/loading state and later corrected light/oval states are the reliable captured denominators. Full theme/focus/state restoration still belongs to the open native matrix.

## Remaining conditions and ordered handoff

1. Close NMA-066's required baseline/control/IME/token/clipboard/table/PDF renderer proofs and matched baseline budgets. The independent engine work does not advance its acceptance.
2. Complete T2: continuous native motion and pointer/head/eye updates, host reduced-motion/visibility/occlusion integration, all shapes/expressions/states/actions at fixed timestamps, exports across the recipe matrix, and resolved browser/native filter quality.
3. Implement and exercise T3's composer model/view and metadata-preserving clipboard/selection/undo/IME contracts. Then T4's message/activity/interaction and native Markdown/table/source/image components, followed by T5's PDF and isolated arbitrary static HTML document components.
4. Finish T6's bounded content caches/virtualization and same-workload measurements against NMA-066 budgets before real API screen composition. Defined budgets and null baseline measurements remain unchanged.

## Reproduction

From the repository root:

```sh
bun apps/desktop-rs/scripts/avatar-reference.ts
NGERTIIN_RS_TARGET_DIR="$PWD/.dev/gpui-experiment-target" bun run check:desktop-rs
bunx biome check apps/desktop-rs/scripts apps/desktop-rs/package.json
bun run docs:check
mkdir -p .dev/nma-067-exports
NGERTIIN_RS_TARGET_DIR="$PWD/.dev/gpui-experiment-target" bun apps/desktop-rs/scripts/cargo.ts run -p ngertiin-avatar --example export -- verification/nma-067/new-seed-request.json ../../.dev/nma-067-exports/new-seed
NGERTIIN_RS_TARGET_DIR="$PWD/.dev/gpui-experiment-target" bun --cwd apps/desktop-rs bundle:dev
```

For the two-artifact local browser comparison, run `bun apps/desktop-rs/scripts/avatar-comparison.ts`, inspect `http://127.0.0.1:41167/`, then stop the server. It has no backend attachment.

Refreshing vectors is an explicit development step; review their source hash/revision diff. Normal Rust checks consume frozen vectors and never invoke TypeScript. Open the development bundle's Avatar tab for fixed-time checks; source read-only/snapshot/PDF/HTML tabs remain foundation probes. No completed live product workflow or installation is inferred from the development bundle.
