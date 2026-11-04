# Desktop icon and interaction audit

Date: 2026-11-04. Local macOS ARM64, Electron 45.2.2. This follows the initial desktop lifecycle cohort; it is a development verification report.

## Changes retained

| Before | After | Why |
| --- | --- | --- |
| Opening/closing Detail reparsed 24 existing Markdown blocks per click. Composer focus/typing could trigger several full passes. | Stable timeline data and resource callbacks; memoized Markdown parsing follows text and the aliases/file/skill targets it actually uses. The instrumented Detail/composer repeat recorded zero historical Markdown renders. | Chrome state and inventory loading should not rebuild unchanged answers. Reference chips still receive current context. |
| Every small idle portrait continuously transformed its entire SVG body. | Compact idle bodies stay still while blinking and gaze continue. Loading, reactions and non-idle activity retain motion. | Reduce persistent SVG paint work across the roster. |
| Header/sidebar and Detail requested separate texture sizes; PNG encoding was synchronous. | Shared 256px minimum texture per identity, asynchronous bitmap preparation/PNG encoding, bitmap disposal and an image fallback for browsers without compatible bitmap decoding. | Avoid expensive repeated rasterization on the first Detail opening. |
| Avatars behind a dialog remained intersecting and kept animating under blur. | The shared clock pauses background portraits while a modal is open, keeps portraits inside the modal active, and resumes after close. | Stop invisible paint work. A failing clock regression test was reproduced before the fix. |
| A newly opened conversation animated a scroll through its old history. | History opens at its end immediately. Following new content remains smooth, and reduced motion uses instant resizing. | Repeated navigation should respond immediately. |
| Default Electron application artwork. | The supplied mascot is adapted to an off-white macOS rounded-square tile, with subtle depth, transparent margins and standard/Retina ICNS sizes. | Use the requested identity and match the user's macOS icon reference. The original image bytes are preserved in `apps/desktop/assets/app-icon.png`; generated artwork and the platform mask are separate assets. |

The menu bar retains its monochrome template icon for legibility. No renderer filesystem/shell permissions, backend API routes, installation data, provider authentication or lifecycle authority were changed by this audit.

The final icon refinement uses a 1024px canvas, an 824px centered tile and a deterministic platform mask. Its four corner alpha values are zero, and no nontransparent pixels remain outside the tile bounds. The generated source is preserved separately; only the compiled icon is used by the application. Native About was inspected after installing the updated icon.

## Measurement

Native Cua input drove the existing development installation. Temporary instrumentation counted Markdown renders and sampled `requestAnimationFrame` intervals for 800ms after each input, plus browser long tasks. It recorded counts/timing only. The render counter and experimental application code were removed before packaging.

The comparable cohort contains three Detail opens, three closes and composer focus/type/delete, before and after optimization. Raw selected records and final observations are in [ui-performance.json](ui-performance.json).

| Measurement | Before | Optimized local cohort |
| --- | --- | --- |
| Existing Markdown renders per Detail open/close | 24 | 0 |
| First Detail opening: maximum frame interval | 100.4ms | 17.6ms |
| Median p95 frame interval across three Detail opens | 33.6ms | 17.5ms |
| Long tasks across three Detail opens | 1 | 0 |
| Composer type/delete: maximum frame interval | about 34ms | about 18ms |

The final dialog observation recorded zero sidebar SVG transform writes while Settings remained open; writes resumed after closing it. This is a small local cohort, not a universal frame-rate guarantee. Some close/navigation samples still contained roughly 33ms frames. First opening of the content-heavy group still produced a 94ms task in the final non-counter cohort. Freezing avatars was an isolation probe; animation was restored. Layer promotion and batched avatar mounting did not improve consistently and were reverted.

## Observed flows and checks

Read-only native observations covered Detail open/close, Library, Computer view-only canvas, Settings General/Providers/About and Escape/focus return, model picker open/Escape, DM/group switching, local composer typing/deletion, and history scrolling. No chat messages were submitted, provider settings changed, or machine takeover requested.

- Web unit/render tests: **44 passed, 0 failed**, 8,868 assertions across 12 files. Includes the modal clock regression and real React Markdown rendering of GFM tables, aliases, raw file IDs and explicit file links.
- Desktop process/gateway tests: **6 passed, 0 failed**, 29 assertions.
- Web/desktop typechecks, lint, whitespace checks and the macOS package build passed. The web build retains its existing large-chunk warning.
- The copied installed ASAR matches the packaged ASAR. The bundled ICNS matches the generated icon; the repository source PNG matches the user-supplied image exactly.

The earlier lifecycle GUI suite is recorded separately in [README.md](README.md); those historical automated GUI counts are not a rerun against this UI update. The new installed build was launched and inspected natively. Current build hashes are recorded in [UI-SHA256SUMS](UI-SHA256SUMS).
