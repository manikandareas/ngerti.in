# Separate GPUI experiment — 2026-11-07

The user authorized a new experimental app to test recreation of the existing client with Rust GPUI. [The app](../../../apps/gpui-experiment/README.md) was built and opened on macOS ARM64. Native layout, text input, Markdown, source highlighting, cached avatars and embedded browser surfaces work in this fixture. **Complete 1:1 visual or behavioral parity is not established.**

Open [the visual comparison](comparison.html) for a matched-size web/native pair and the native scene gallery. The web reference imports the current client's CSS, Lexical composer, Markdown renderer and procedural avatar component into a small authored shell. It is not a screenshot of the full production client.

## Reproduce

```sh
bun --cwd apps/gpui-experiment build
open "apps/gpui-experiment/dist/Ngertiin GPUI Experiment.app"
```

The app's Experiments menu opens the six scenes. Conversation replies are deterministic fixture text. The standalone app includes a loopback static reference server and does not call a model provider. The built bundle is a roughly 107 MiB unsigned development app; signing, distribution and fresh-device installation are outside this run.

## Environment and source

- macOS 26.3 (25D125), ARM64; native screenshots captured at 2× scale.
- Rust/Cargo 1.99.1, Bun 1.3.10, Vite 8.3.5.
- GPUI Kit/WebView 0.9.0, GPUI Fast 0.1.13 and lb-wry 0.53.3. Both GPUI packages enable `gpui-fast`. Default upstream GPUI is not independently tested.
- Repository base `df25ed932b08b8819453f843f7bda5da24ede644`, with existing uncommitted client changes. [The source manifest](source-manifest.json) hashes the experiment, client reference inputs, generated reference bundle, executable and retained evidence at report finalization; it is not a clean-checkout claim.
- Exact Cargo versions and registry checksums live in [Cargo.lock](../../../apps/gpui-experiment/Cargo.lock). [Source adoption](../../development/source-adoption.md) records the upstream example revision, local adaptations and upgrade checks.

## Observations

Each row states its own proof boundary. There is no aggregate parity or performance score.

| Check | Observed result | Boundary |
| --- | --- | --- |
| Native startup and shell | Separate `.app` opens; sidebar, bubbles, header and composer render with Geist, Hugeicons and source-derived theme tokens. | Tested on this macOS machine only. |
| Light/dark and contextual panel | [Light rich answer](screenshots/native-rich-light.jpg) and [dark Detail](screenshots/native-detail-dark.jpg) visibly render. | Representative fixture panels; no live domain projections. |
| Native composer tokens | [Mention and file chips](screenshots/native-composer-tokens.jpg) render; accessibility text exposes their underlying references. | Fixture tokens only; no real attachment upload, production mention resolution or persistence. |
| Composer editing | Text entry, multiline/Unicode paste and local draft operations were exercised through native controls/accessibility. | Undo/redo, IME composition, clipboard round trips and draft restoration are not a complete repeatable acceptance suite. Drafts are memory-only. |
| Deterministic streaming | Send and completed fixture replies were observed. The code includes a Stop branch. | Mid-stream Stop was not reliably verified; no backend cancellation or provider inference was tested. |
| Markdown/table/code | Native selectable TextView renders [the shared rich fixture](screenshots/native-rich-content.png). | Table borders, header emphasis, code styling, actions and text metrics differ from the client. Selection/copy semantics are not comprehensively verified. |
| Source viewer | [Syntax-highlighted Rust source](screenshots/native-source-dark.jpg) is visible; the editor is configured `readonly(true)`. | Edit rejection, search and selection behavior need a dedicated follow-up check. |
| Avatar | [Three identities and expression controls](screenshots/native-avatar-thinking.jpg) render; native breathing motion and pause are implemented. | Cached images exported by the current client renderer; not a Rust port of procedural fur, gaze or blinking. The nested eye-shadow filter is omitted for librsvg compatibility. |
| HTML | [The report fixture](screenshots/native-html-preview.jpg) renders in a real embedded WebView. | Browser-rendered content inside a native shell. Not a native HTML/CSS layout implementation. |
| Computer | [The actual retained Linux desktop](screenshots/native-computer-live-readonly.jpg) is visibly connected through the read-only viewer. | Observation only. No input takeover, reconnect, renewal or other-platform proof. |
| Browser/native composition | [A native GPUI dialog](screenshots/native-computer-overlay.jpg) appears above the live browser and can be closed. | GPUI Fast on this macOS host; other renderer/platform combinations remain untested. |

## Read-only Computer probe

The optional [helper](../../../apps/gpui-experiment/scripts/live-computer.ts) reads the existing retained-machine configuration privately, creates an isolated temporary SQLite state, registers **zero executors**, and never starts the scheduler or machine. It requests `POST /v1/machine/view` with `interactive: false`. The successful probe receipt is in [the redacted operational log](logs/read-only-viewer.log); no ticket URL or credential is retained here.

The temporary helper was stopped after the observation. The native app was relaunched with its default disconnected Computer surface. A future live probe requires a fresh short-lived viewer; expired tickets are not shipped in the bundle.

## Static/build checks

- [Native bundle build](logs/package.log): passed with the pinned lockfile.
- [Cargo Clippy](logs/clippy.log): `--all-targets -- -D warnings`, passed.
- [Cargo format](logs/rust-format.log) and [experiment formatter](logs/web-format.log): passed.
- [Reference Vite build](logs/reference-build.log): passed; retained the chunk-size warning. The reference is a comparison fixture, not a production bundle optimization exercise.
- [Scoped links/whitespace](logs/scoped-checks.log): checked experiment/evidence links and Git whitespace. No product-wide acceptance or repository-wide documentation pass is claimed.

## Interpretation and remaining work

The experiment supports continuing a native recreation: the familiar shell and key components can be presented with GPUI, and browser content can coexist with native controls. The matched captures also expose concrete work before a 1:1 claim: custom table/code presentation, exact text metrics, composer behavior, native avatar rendering and animation, and production content interactions.

PDF preview, current Working files tree behavior, real uploads, citations, full Settings, backend event/state integration, durable drafts, keyboard/focus/accessibility acceptance, sustained performance, Windows/Linux builds, signing and installation remain unverified. This experiment does not replace the active Tauri host or change NMA-063/NMA-064 status.

## Capture processing

Original CUA window captures are JPEGs, retained with `.jpg` extensions. Only the matched comparison pair was cropped and resized: native `(left=0, top=66, width=2560, height=1640)` and browser `(left=10, top=162, width=2560, height=1640)`, then both resized to 1280×820 PNG. This removes window/browser chrome without changing UI content. Other scene captures keep their original window bounds. Captures were taken at different times; the comparison intentionally contains minor pointer/chrome differences and does not yield a pixel-equality percentage.
