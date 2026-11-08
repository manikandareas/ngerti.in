# Native Working files — Zed presentation refinement

Date: 2026-11-08. Result: implemented and verified for the owner's NMA-069 follow-up. The native tree adopts Zed's flat row/slot/indent/focus composition while retaining Ngertiin's contextual navigation, shared-machine scope, Material icons, lazy reads and Focus workflow.

## Reference and delivery

[Primary-source research](../../../research/zed-file-tree-2026-11-08.md) pins Zed to `b5cd310b3b54dfc659fcc06453e6358843dfe216`. The source modules, defaults and deliberate differences are recorded there and in [source adoption](../../../development/source-adoption.md#nma-069-native-working-files-presentation--zed-reference-2026-11-08).

[Before](before.png) and [after in light theme](after-light.png) use the same isolated fixture and expanded `src/components` branch. [Dark theme](after-dark.png) shows the final row composition with the same native implementation. [Before manifest](before-build-manifest.json) and [delivery manifest](build-manifest.json) retain exact source/asset/binary hashes. This is a local macOS ARM64 development build, not active-host replacement or cross-platform/distribution acceptance.

The implementation uses native unstyled Base Button behavior for tree rows, with one 26-unit outer row, a 24-unit content lane, regular 14-unit filenames, 16-unit icons/disclosures, 20-unit indentation and fixed leading slots. One retained `uniform_list` owns scrolling and renders the visible range. Structural updates rebuild a cached path-based row projection. Folder status appears after its descendants, fixing the previous Load more placement before children. Keyboard selection scrolls minimally into view; selected fill and keyboard focus outline remain separate from hover.

The former double panel inset and textual arrow glyphs are removed. The shared-machine explanation moves to a quiet footer. Narrow-panel names truncate and expose their full path through a tooltip. Grouping is folders first with case-insensitive lexical names; Zed's natural numeric ordering and editor-only project/Git/diagnostic/mutation features are outside this presentation adaptation. No dependency pin changed.

## Native verification and limits

Native UI verification used the separate `nma069-zed-tree` profile and `Ngertiin Rust Tree Proof.app`, attached to the existing real-domain journey server with `--tree-proof`. The [scripted machine file responder](../../../../apps/desktop-rs/verification/nma-069/tree-proof.ts) supplies controlled root/deep/long/empty/error/paginated data. It is **UI proof with scripted machine responses**, not a new real Cua filesystem/permission acceptance. The actual machine path was not changed.

| Case | Observed result |
| --- | --- |
| Light/dark row geometry | Both themes rendered native rows, icons, selection and branch guides. Focus outline outer height measures **52 physical pixels / 26 points** at 2× display scale. |
| Alignment and hierarchy | Root `src`, child `api`/`components`, and grandchild `Avatar.tsx` filename glyph origins measured 2001, 2041 and 2081 physical pixels in the light capture: 20-point depth increments. Siblings share the same layout lane; glyph side bearings may differ. |
| Per-folder append | `src/components` loaded six files, then appended six more. Load more followed the six descendants and disappeared after the final page; unrelated `src` files remained after that branch. |
| Arrow navigation | Right entered a loaded expanded folder; Down selected the next file. Left selected its parent, then collapsed it; Right expanded it again without losing loaded children. |
| Keyboard file opening | Enter opened the selected TypeScript file in the existing native source Focus viewer. Back restored the expanded tree and file selection. |
| Folder error/retry | One scripted 503 appeared only inside `unavailable-folder`. Retry loaded `recovered.md`; other expanded branches remained. [Failure capture](folder-retry.png). |
| Empty folder | `empty-folder` exposed a disabled, indented Empty folder row without shifting sibling icon/name lanes. |
| Large list | `projects` loaded **600 entries in three 200-entry pages**. Only viewport rows were present in the native tree; [retained AX state](virtualized-600.txt) shows the tail, including `project-600.md`, with no remaining pagination row. No latency or memory budget is claimed. |
| Home/End and scroll | End selected root `README.md` beyond the initially rendered range and brought it into view. Home returned to `.ngertiin`. [200-entry tail](virtualized-end.png), [600-entry tail](virtualized-600.png). |
| Focus return at the tail | Enter on README opened Focus. Back restored the same tail beginning at `project-593.md`, with README selected, rather than returning to the top. |
| Refresh and Settings return | Refresh retained selected `projects` and the expanded `src/components` branch. Switching to dark theme in in-place Settings returned to that tree. |
| Compact window | Native resize below the 768-point breakpoint displayed the tree in the full-width context dialog, retaining selection, guides, its scroll owner and the footer. This was observed live; no compact capture is retained here. |

[Geometry measurements](geometry.json) come from the retained PNGs, not source constants. Outline bands identify the selected row edges; filename measurements inspect dark glyph pixels in the corresponding text bands. This is a focused alignment check at one display scale, not a pixel-diff comparison against a running Zed application or an exhaustive accessibility/zoom matrix.

Native element-index actions were occasionally rejected by the automation surface after the virtual tree changed. Fresh state and a visual-coordinate click completed those actions; keyboard, pointer expansion and pagination results were then observed normally. Full-path tooltip presence is source-verified; a native tooltip-hover matrix was not exercised.

[Read receipts](requests.json) record **29 machine-file GETs: 28 successful responses and one deliberate 503** across before/after/refresh cases. The receipt schema records route paths rather than query strings. The fixture retained two messages, five artifacts and one synthetic settled preparation run throughout; native browsing created no additional message/upload/admission. There was no executor, scheduler, external provider login or real machine mutation.

## Checks and reproduction

- Focused Rust tests: **4/4 passed** for folder page deduplication/refresh invalidation, descendant/status ordering, keyboard navigation and icon precedence. [Log](tests.log).
- Strict workspace/all-target Clippy with `-D warnings`: passed. [Log](clippy.log).
- Development bundle: passed; source/asset hashes match the retained delivery binary. [Log](bundle.log).
- Dependency/rendering ownership, Rust formatting, scoped Biome and `git diff --check`: passed.
- Documentation validation retains the same eight pre-existing imported GPUI skill links. Task documents introduce no additional broken local link. [Log](docs-check.log).

From the repository root, start a fresh disposable UI fixture:

```sh
bun apps/desktop-rs/verification/nma-069/journey-server.ts .dev/nma069-zed-tree --tree-proof
```

Use its private attachment configuration in a separate native profile. The task-owned fixture server and proof application were stopped after verification; no retained user profile or default Tauri/native application was changed by these UI journeys. Earlier NMA-069 evidence keeps its original scope and build hashes; this refinement does not rewrite those results.
