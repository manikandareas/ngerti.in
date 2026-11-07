# PDF support in the Focus viewer

Date: 2026-11-07. Scope: direct PDF viewing in the existing conversation Focus panel, preserving the centered filename, borderless header, Back, actions menu and floating composer. This extends the [initial Focus viewer](../README.md) and [current interface decision](../../../product/interface.md#conversation-content-viewer).

## Behavior and implementation

- Files are detected by normalized `application/pdf` MIME or case-insensitive `.pdf` extension. Existing artifact, machine-file and local attachment URLs keep their current authorization and admission paths.
- The file reader remains bounded to **16 MiB**. PDF.js renders the supplied bytes in a worker; its module and worker are loaded only for PDF viewing. There is no browser-plugin or external CDN dependency.
- Page controls provide previous/next, direct page number, **50–200%** zoom and fit-to-width. Zoom retains the position within the page being read. Text PDFs have a selectable text layer; canvases render at device resolution up to **four million pixels per page**. Nearby pages retain canvas/text layers, while offscreen pages keep lightweight placeholders. Previews are limited to **500 pages**.
- Invalid PDFs, page-render failures, oversized sources and page-count limits offer clear feedback, retry where applicable and the original download through the existing actions menu. Password-protected PDFs have a download-only error path; password entry is outside this implementation.
- The PDF page renderer does not instantiate annotation actions, scripting, editable forms, XFA or an editor. Original PDF bytes are unchanged. Existing conversation feedback still attaches the file through atomic staged admission, deduplicating the composer attachment and viewer reference.

## Dependency and source adoption

The web-client pins **pdfjs-dist 6.5.438**, matching the version already used for backend attachment text extraction. Adopted modules: `build/pdf.mjs` (`getDocument`, page render, `TextLayer`), `build/pdf.worker.min.mjs`, and the `cmaps`, `standard_fonts`, `wasm` resource folders. [Mozilla PDF.js](https://github.com/mozilla/pdf.js) and its installed distribution/type declarations are the primary source. `bun.lock` retains the package integrity.

`pdf-page.tsx` and `pdf-content.tsx` provide the local React lifecycle, page visibility, canvas budget, scoped input and toolbar. The text-layer rules in `pdf-content.css` adapt the distribution's `web/pdf_viewer.css` TextLayer section under its retained Mozilla/Apache-2.0 attribution. `build/pdf-assets.ts` serves auxiliary resources on the application origin in development and emits them with their original names and bundled license files for builds. The worker URL is emitted by Vite. No upstream full viewer or app workflow is copied.

For upgrades, keep renderer/worker/resource versions aligned. Rerun page raster/text/selection checks, navigation/zoom anchoring, cleanup, malformed/limit states, original-byte downloads and PDF feedback admission. Verify both dev resource serving and built font/CMap/WASM assets. Additional upstream viewer features do not become scope automatically.

## Verification

```sh
cd apps/web-client
bun run test:viewer
```

The expanded cohort includes the original 18 viewer cases plus three PDF cases on desktop and mobile. Chromium runs at 1440×1000 and 390×844 CSS pixels. API admission, artifact bytes, staging, snapshots and event services are real isolated repository services; external harness execution uses the retained NMA-062 fixture adapter. Deterministic two-page PDF fixtures contain text/vector content and an inactive JavaScript OpenAction. Only artifact result provenance is projected to expose fixture uploads in the results list.

| PDF case | Desktop | Mobile |
| --- | --- | --- |
| Extension detection, real canvas pixels and selectable text, navigation, anchored zoom, fit, original download, Back and no PDF action dialog | Pass | Pass |
| MIME without an extension, malformed file/retry, 16 MiB and 500-page limits, menu-only Escape | Pass | Pass |
| Local preview without upload, retained composer/context, one staged PDF on Send and stored bytes equal to the original | Pass | Pass |

**All six PDF checks passed** (three cases per viewport). The expanded run had 23 passes and one failure: the desktop Goals/Routine regression timed out waiting five seconds for `Detail Tobi` during initial conversation loading, before reaching the viewer. That unchanged case passed in a targeted rerun (1/1). Across the captured cohort and rerun, all 24 unique scenarios have a passing result; the initial failure is retained in [the startup context](startup-timeout.md) and [trace](startup-timeout-trace.zip), with [rerun output](regression-rerun.log) and [rerun report](regression-rerun.json). The production build, ten-file Biome check and `git diff --check` passed. No application or assertion change was made for the startup rerun.

Development CMap/WASM requests and a built standard-font request returned HTTP 200 with the expected media types. The temporary development server was stopped after these read-only checks. The original viewer regression cohort is retained in the same final run. See [validation.log](validation.log), [playwright-report.json](playwright-report.json), [Biome output](biome.log) and [source/build manifest](source-manifest.json). This is a mixed local checkout; source fingerprints and built-asset hashes identify the captured version without attributing unrelated changes to PDF support.

Captures: [desktop PDF](pdf-desktop.png), [mobile PDF](pdf-mobile.png), [mobile contextual composer](pdf-context-mobile.png).

## Boundaries

This proves the web-client's PDF display and existing attachment transport, not an agent's useful interpretation of PDF content. Backend PDF extraction, model grounding, OCR, document editing, native installation and NMA-063/NMA-064 acceptance remain separate. The cohort does not verify real encrypted PDFs, CJK documents, every image codec/color profile, accessibility with physical assistive technology, physical phone keyboards, Safari/WebKit or native Tauri rendering. Scanned PDFs can display through the renderer, but text selection requires actual text in the source; no OCR is added. Existing build-size warnings remain warnings.
