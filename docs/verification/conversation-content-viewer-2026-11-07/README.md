# Conversation Focus content viewer

Date: 2026-11-07. Scope: the user's selected Focus composition, with a centered filename, integrated into the web-client conversation. The [interface decision](../../product/interface.md#conversation-content-viewer) supersedes the exploratory layout comparison; [the prototype](../../product/conversation-viewer-prototype-2026-11-07.md) remains a development-only simulation.

## Implementation

- Saved result actions, sent user attachment chips, local composer attachment clicks, Library results and Working files open directly inside the conversation area. The desktop sidebar remains available. File information and sharing remain accessible through the actions menu for saved files.
- Back restores the originating conversation/Library and its focus. Working-file directory/page state survives the mobile sheet closing for the viewer. Maximized Markdown tables use the same viewer and return to their parent document first; table query, sorting and wrapping stay with the mounted table. The existing conversation and composer remain mounted.
- The floating composer shows a removable context chip. Accepted ordinary feedback returns to chat. Saved artifacts use the same immutable artifact ID; working files and the current filtered/sorted table CSV use existing staged message attachments only on Send. The visible message carries the reference and authoritative `artifact_ids`. Rejected admissions restore editable attachment references without adding a second contextual copy. Pending-operation retries retain their original body and identity. Thread changes clear viewer state and abort outstanding context reads.
- HTML renders directly, without Preview/Source tabs or an HTML Document label. Preview parsing uses a DOM-free HTML tree, preserving document/body attributes and inline styles, followed by an iframe with an empty sandbox and restrictive CSP. Scripts, external resources and forms are blocked; ordinary external links are removed. Download retrieves the unchanged original bytes. This is a static document preview, not an interactive application runtime.
- Text previews remain bounded to 128 KB. Truncated CSV/TSV and HTML fail with a download route instead of rendering an incomplete document. Images/context copies are bounded to 16 MB. Unsupported types, inaccessible reads, malformed tables, loading and retry retain actionable states.

The viewer does not add a backend endpoint, an artifact mutation tool or an inline editor. Editing uses the agent's existing working-file/terminal tools and publishes a new saved artifact.

## Verification environment and commands

The tests use an isolated temporary API state directory and Chromium at 1440×1000 and 390×844 CSS pixels. HTTP admission, workspace/upload storage, snapshots and event services are real repository services; external harness/provider behavior is deterministic through the existing NMA-062 fixture adapter. Saved fixture uploads are projected as `native_output` to exercise the results list without a paid model run. The Working files case fixtures only the machine listing/read boundary; the resulting context attachment is admitted and read back through the real API.

```sh
cd apps/web-client
bun run test:viewer
```

The dedicated config uses ports 8333/4333 and its own temporary state, independently of the normal conversation/work suites. Bun 1.3.10, Node v25.8.0, TypeScript ~7.0.2, Vite 8.3.5 and the installed Playwright Chromium are captured with source/build fingerprints in [the manifest](source-manifest.json). The test was run against the mixed local checkout at the recorded HEAD, including concurrent conversation chronology work; the manifest and built-asset hashes define the captured version. There is no claim that unrelated dirty changes belong to this implementation.

## Results

**18/18 passed** (nine cases in each viewport; zero failures, retries or skips). The final production build and 19-file Biome check passed. Final results are recorded in [validation.log](validation.log) and [playwright-report.json](playwright-report.json). The production build includes TypeScript checking; scoped Biome is retained in [biome.log](biome.log), and `git diff --check` passed.

| Case | Desktop | Mobile |
| --- | --- | --- |
| Local file removal remains upload-free; chip hover metadata / direct mobile preview | Pass | Pass |
| Local image preview, removal, undo and paste | Pass | Pass |
| Long centered filename, same composer/draft, Back focus, real saved-file feedback and context removal | Pass | Pass |
| Filtered table CSV, rejected admission and one-attachment retry | Pass | Pass |
| Working-file folder restoration, failed-read retry and upload only on Send | Pass | Pass |
| Rich content, table search/sort/wrap/copy/download and Back focus, light | Pass | Pass |
| Same rich content regression, dark | Pass | Pass |
| Scoped Goals/Routine/file flow and original-file download | Pass | Pass |
| CSV/Markdown/nested tables, direct HTML, original source bytes, limits, blocked external transport and menu-only Escape | Pass | Pass |

HTML requests blocked by CSP may still appear in Chromium's request lifecycle as failed attempts. The external-transport assertion records requests reaching the route/network boundary; blocked attempts are not reported as successful external I/O. The fixture checks parent execution state, sandboxing, link removal, retained document language/body color and original download bytes. Browser automation itself can inspect a frame even when application JavaScript cannot.

## Parser dependency

The HTML preparation module uses `parse`/`serialize` and the default tree adapter from [parse5](https://github.com/inikulin/parse5), pinned to **8.1.0** in the web-client manifest and `bun.lock` (including package integrity). A DOM-free tree preserves full-document attributes without triggering image/resource loads while parsing. The dependency is lazy loaded only for HTML previews. There is no copied upstream application-flow implementation. Upgrades must rerun the HTML/body attribute, sandbox/CSP, external-link, original-download and preview-limit cases in this cohort.

## Captures

- [Focus HTML with contextual composer, desktop](focus-desktop.png)
- [Focus HTML with contextual composer, mobile](focus-mobile.png)
- [Expanded table, dark desktop](table-dark-desktop.png)
- [Expanded table, dark mobile](table-dark-mobile.png)
- [Direct HTML with retained inline body styling, mobile](html-attributes-mobile.png)

## Boundaries

This is focused browser/API integration evidence. It does not establish real model editing, provider/billing behavior, a live shared Linux filesystem, cross-thread cancellation under a physical network interruption, browser-history restoration, physical phone keyboard behavior, Tauri installation or product-wide NMA-063/NMA-064 acceptance. Group routing and native human-input contracts are retained rather than redefined; their broader suites were not rerun as part of this focused cohort. Existing bundle-size warnings remain warnings, not a production-readiness claim.

## Later PDF amendment

[PDF support and the expanded viewer regression cohort](pdf-support/README.md) cover direct paged rendering, selectable text, zoom and original bytes on desktop/mobile. The current header has no bottom divider following the user's refinement. Earlier captures and the 18-case manifest above retain their original captured scope.

## Later header styling refinement

[Conversation-style viewer header](header-style/README.md) records the themed pill surfaces, circular actions and shadows, with four focused desktop/mobile checks. Earlier screenshots retain their captured appearance.

## Floating header correction

[Transparent overlay verification](header-overlay/README.md) supersedes the earlier separate header row. It records content scrolling behind the header, pointer passthrough, HTML clearance and PDF toolbar alignment across six desktop/mobile journeys.
