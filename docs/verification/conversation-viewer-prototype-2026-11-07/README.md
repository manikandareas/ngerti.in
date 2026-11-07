# Conversation viewer prototype verification

Date: 2026-11-07. Scope: local fixture-based prototype only. [Design and run instructions](../../product/conversation-viewer-prototype-2026-11-07.md).

## Archive after implementation

The exact prototype files and development entry-point wiring are retained on local branch `prototype/conversation-content-viewer-2026-11-07`, commit `2a182fe21b298deb041dcc421251e05589875c67`. The production checkout contains only the chosen Focus implementation; see [archive instructions](../../product/conversation-viewer-prototype-2026-11-07.md#revisit-the-archived-prototype) and [archive identities](archive.json). Existing build logs, manifests and captures below remain unchanged.

## Setup and boundaries

- Source: `apps/web-client/src/features/conversation/prototypes/viewer`, plus the development-only Assistant Studio entry and `variant` search parameter.
- Runtime: `bun run dev:web-client`, Vite 8.3.5 on `http://127.0.0.1:3001`; existing React 19.3.1 and Lexical 0.53.0.
- Browser: Brave on macOS, controlled through native accessibility and screenshots. Responsive rendering used a 390 × 844 CSS-pixel device viewport. This was not a physical phone or Tauri test.
- All messages, revisions and data are local fixtures. No provider inference, API mutations, terminal execution, artifact persistence or production acceptance was exercised.

## Observed interactions

Eight checks passed; one additional layout check is partial. Three capabilities were not exercised.

| Check | Result | Observation |
| --- | --- | --- |
| Focus viewer, light and dark | Pass | Header, document and contextual floating composer render in the conversation shell. |
| Contextual revision loop | Pass | Compose while reading, send into the same chat, retain a visible file reference and open the separate revised file; original sample remains available. The HTML revised file was also observed with the changed heading “Ringkasan Oktober”. |
| Table maximize | Pass | The inline channel table opens in the same viewer with its own title and context. |
| Expanded table filtering | Pass | Searching `Website` changes the count from four rows to one row. |
| Library and uploaded CSV | Pass | Opening the user sample shows 18 rows / seven columns; Back restores Library. |
| File actions / information | Pass | The menu exposes Download, Copy, Attach and File info; File info identifies the CSV as uploaded by the user. |
| Responsive focus / overlay | Pass | At 390 × 844, the roster collapses and viewer header/composer remain available. A native screenshot was captured from the device viewport. |
| HTML direct rendering | Pass | The HTML dashboard renders in the iframe. The final accessibility state contains the file heading and rendered HTML content, with no Preview/Source toggles or HTML Document label. Source download remains in the actions menu. |
| Split discussion | Partial | Desktop side-by-side rendering and the mobile Read file / Chat affordance were observed. A dedicated split post-send interaction was not independently verified; it remains a simulated code path. |
| Download bytes / clipboard | Not run | Actions are wired to sample data; their resulting files/clipboard were not checked. |
| Code preview / table-control retention | Not run | Code preview is present; table controls may reset when their mounted view closes. |
| Physical keyboard / history / resource scope | Not run | Physical phone keyboard, browser Back/refresh restoration and real authorization/persistence are outside this prototype. |

The browser API adapter failed for direct DOM/navigation methods, so the UI observations above used native accessibility and screenshots. Responsive DevTools initially retained an Offline preset; network failures while that preset was active are not evidence of application request behavior. No global browser-error-free claim is made.

## Static checks

- Scoped Biome check of the prototype, Assistant Studio and router: passed, no diagnostics after the final formatting pass.
- Initial workspace build: passed.
- A later build in the concurrently changing workspace failed on unrelated `created_at` route typing in `work-activity.tsx` and an entry-union type in `conversation-rows.ts`. Those files were not edited for this prototype.
- Isolated build: passed against committed baseline `6f20ae3`, with only the prototype directory, Assistant Studio and router copied into a detached temporary checkout. Existing dependency directories were reused by symlink. The production build emits no viewer-prototype chunk because the entry is development-only.
- `git diff --check`: passed for the inspected working tree.

Retained [isolated build output](isolated-build.log), [mixed-workspace failure](mixed-workspace-build.log) and [source identities](source-manifest.json) describe the verification boundary. No automated test suite was added to the throwaway prototype.

## Screenshots

- [Focus / light](screenshots/focus-light.png): final desktop composition.
- [Revision in conversation / dark](screenshots/revision-conversation-dark.png): local result returned to the original chat.
- [Split / dark](screenshots/split-dark.png): desktop comparison layout.
- [Overlay / mobile](screenshots/overlay-mobile.png): 390 × 844 CSS-pixel viewport at 2× capture scale.
- [HTML / direct render](screenshots/html-direct.png): the HTML case after removing its secondary toolbar.

The earlier comparison captures precede the final opaque composer backing adjustment; the Focus capture includes the final styling. These screenshots are prototype evidence, not real-API product acceptance or provider/tool-use proof.
