# Ngertiin native desktop foundation

An independent Cargo workspace for [NMA-066](../../docs/backlog/NMA-066.md) and [NMA-067](../../docs/backlog/NMA-067.md), both Done under the [2026-11-08 owner decision](../../docs/development/nma-066-067-closure-2026-11-08.md). The default entry point opens the API workspace implemented for [NMA-068](../../docs/backlog/NMA-068.md); the explicit gallery retains avatar/composer/message/rich-content/document components and optional read-only snapshot attachment. NMA-068 is Done; its focused native/API delivery evidence is retained. Remaining technical verification is non-blocking; [foundation evidence](../../docs/verification/nma-066/README.md) retains actual outcomes and limitations. Tauri remains the active product client; integrated desktop parity has its own later gate.

## Run and verify

On the reference macOS ARM64 host, with Rust/Cargo and Xcode Command Line Tools installed:

```sh
bun run dev:desktop-rs
bun run gallery:desktop-rs
bun run check:desktop-rs
bun --cwd apps/desktop-rs build
bun --cwd apps/desktop-rs bundle:dev
```

The app opens the workspace; the `gallery` example explicitly opens the component gallery. `NGERTIIN_RS_GALLERY=1` also selects the gallery. `Cmd+D` switches theme; `Cmd+Q` quits. The generated unsigned development bundle is `dist/Ngertiin Rust Development.app`. Native PDFKit integration currently targets macOS only. Other-platform builds, signing and fresh-device installation are separate work.

The default Cargo output is `.dev/desktop-rs-target` at the repository root. `NGERTIIN_RS_TARGET_DIR` may select an existing compilation cache; it changes neither runtime profiles nor backend state. During the recorded verification, `.dev/gpui-experiment-target` was reused to avoid rebuilding the same pinned native dependencies.

## Ownership

`desktop` composes `bootstrap`, `shell`, `features`, stateless `ui`, `host`, `platform` and `storage` modules. Feature Entities own input, selection, tasks and subscriptions. Controls accept explicit presentation inputs and return normal builders/callback surfaces, so the caller can apply a final style override. `client` and `avatar` have no GPUI or platform dependency. `scripts/check-boundaries.ts` verifies the entire transitive dependency direction and confines WebView construction to `platform/embedded.rs`.

`client` exposes version-checked API reads/commands, ordered event projections and bounded SSE wakeups. Workspace reads and writes use separate bounded workers with 16 MiB stacks; retiring a scope stops queued reads and the next dependent read after an active bounded request. The original gallery snapshot worker retains its 8 MiB stack and one queued slot. Neither client starts a backend or owns its model loop. This avoids recursive schema compilation on AppKit's small dispatch stacks. Snapshot bodies are bounded at 16 MiB; redirects/proxies are disabled and installation credentials stay in native transport state.

`avatar` ports the versioned recipes, original catalog/geometry/seeded material, expression/action/loading/motion and transparent exports. The desktop adapter shares one native clock and bounded cached compositor with independent eye layers. Exported web portraits are not runtime state assets. See the NMA-067 components below for the executed evidence and retained limitations.

## Read-only attachment

The isolated profile is `~/Library/Application Support/Ngertiin Rust Development`. It is distinct from the Tauri profile. No preferences, credentials, backend database or pending operations are imported. This foundation creates only its own generated probe textures/icons.

Set `NGERTIIN_RS_BACKEND_ORIGIN`, `NGERTIIN_RS_TOKEN_FILE` and `NGERTIIN_RS_THREAD_ID`, or create a private mode-0600 `attachment.json` in that isolated profile:

```json
{
  "origin": "http://127.0.0.1:8000",
  "token_file": "/absolute/path/to/private-installation-token",
  "thread_id": "an-existing-thread-uuid"
}
```

The token file contains the installation bearer, is a regular private file, and is never copied into the application bundle. Only literal loopback HTTP origins are accepted. The client checks contract **1.31.0** and its pinned conversation schema before decoding a snapshot. Environment configuration takes precedence; invalid configuration produces an actionable error instead of choosing another backend. Retry rereads configuration. Opening the gallery, reference or thread performs no admission and starts no backend.

For a disposable real-API fixture, run `bun apps/desktop-rs/scripts/fixture-server.ts` from the repository root. Its ignored `.dev/desktop-rs-fixture/connection.json` supplies the three attachment values. It registers zero executors and starts no scheduler or machine. Stop it after the probe. `reference-server.ts` builds an isolated launcher around the existing Tauri binary/current web build for reference captures; its backend fallback executable is `/usr/bin/false` so a lost fixture cannot start a production runtime. `fault-server.ts` supplies deterministic transport failures without domain storage.

## Reference and adoption

The [versioned reference manifest](verification/reference-v1/manifest.json) freezes source hashes, current surface/state owners, product-consumed controls and gallery-only controls. `scripts/freeze-reference.ts` explicitly refreshes this baseline; review its diff before accepting a new reference. `prepare-reference-assets.ts` imports original product Hugeicons and representative Material Icon Theme assets from the built current client. Fonts retain their original OFL files. The original icon SVGs, Material associations and licenses remain local; native probe rasters are generated from those originals.

Selected pins are GPUI Kit/WebView **0.9.0**, GPUI Fast **0.1.13**, lb-wry **0.53.3**, resvg **0.46.0**, objc2-pdf-kit **0.3.2**, reqwest **0.12.28** and jsonschema **0.33.0**; `Cargo.lock` owns all checksums/transitive versions. `platform/pdf.rs` now owns a continuous GPUI viewport with a Quartz raster worker and PDFKit text selection. Its original AppKit-view spike is retained in foundation evidence. `platform/embedded.rs` accepts only typed sanitized static HTML with restrictive CSP/disabled JavaScript and blocked navigation. Live Computer sessions remain NMA-070.

Upgrades must repeat cold snapshot decoding from a small-stack caller, malformed/version/shape/HTTP/redirect cases, native input/token/clipboard/IME, focus and keyboard names, image resampling/independent eyes, PDF layout/selection/zoom, child-view geometry/retirement and native overlays. The [source-adoption guide](../../docs/development/source-adoption.md) and verification report distinguish selected candidates from fully proved capabilities.

## NMA-067 components

The **Avatar** scene offers fixed frames and 1/10/30 continuous portraits using the independent Rust engine, one native visibility-aware clock, pointer gaze, independent eyes/blink, loading/actions and reduced motion. Material/texture preparation runs on a bounded worker; replaced GPU images are explicitly retired. The component benchmark records actual image deliveries alongside GPUI draw/work/missed-refresh metrics; redraw callbacks alone do not establish animation cadence.

**Composer** implements atomic agent/user/file/skill tokens, validated metadata clipboard, Unicode/grapheme edits, bounded undo/redo and suggestions. It emits typed submission/file intents without network policy. **Messages** supplies native DM/group/user/assistant attribution, file-only rows, safe activity, clocks/day markers and revision-bound question/approval/retry controls. NMA-068 binds these components to durable operations and the real API.

**Content** has a read-only virtual source editor with precomputed Syntect highlights in the original syntax palette, literal find/wrap/line numbers; a variable-height virtual table with stable sorting/filtering/range copy and an expanded native dialog; native selectable Markdown/GFM; and bounded native image decoding/fit/zoom/copy. Original download bytes are distinct from rendered/copy formats. Limits remain 128,000-byte text preview, 100,000 highlighted UTF-16 units, virtual source above 500 lines, PDF 16 MiB/500 pages and five bounded nearby PDF rasters. Unsupported/incomplete documents retain actionable download states.

**Native PDF** uses Quartz page rasters and PDFKit text with GPUI continuous pages, selection, paging, fit/50–200% zoom, reading anchors, error/retry and original downloads. **Static HTML** mounts only a sanitized document body in the isolated adapter; GPUI owns surrounding controls and overlays. Shell/composer/messages/Markdown/source/table/image/PDF never load React, Lexical, PDF.js or the TypeScript avatar runtime.

[Component verification](../../docs/verification/nma-067/README.md) records actual native interactions, eight original-download hash checks, source vectors and failures/corrections. The owner accepts the implemented components with remaining CJK, exhaustive visual/control and performance checks non-blocking under the recorded decision. NMA-066/NMA-067 are Done; NMA-068 is Done; NMA-069 is Done for contextual workflows; NMA-070–071 remain Backlog.

A Rust executable generates transparent SVG/PNG from either a new seed or a stored recipe, without TypeScript or a browser:

```sh
# Run from the repository root; exporter arguments are relative to apps/desktop-rs.
bun apps/desktop-rs/scripts/cargo.ts run -p ngertiin-avatar --example export -- verification/nma-067/new-seed-request.json ../../.dev/avatar-export
```

The output prefix's parent directory must exist. Exports include the resulting recipe JSON; requested PNG sizes are bounded to 32–2048 pixels. PNG rasterization applies the pinned resvg 0.46.0 displacement workaround; standalone SVG retains the original filter. `scripts/avatar-reference.ts` refreshes development-only source vectors explicitly; ordinary checks consume the frozen vectors and never invoke the TypeScript renderer. NMA-067 is Done for the accepted component scope; unexecuted native checks keep their actual status in the evidence report.

## NMA-069 contextual work

Detail, scoped group/member profiles, Goals/Routine, saved results, memory, inherited/app-owned skills, provider configuration and Composio connection/grant forms use native GPUI controls. Settings retains General/Providers/About and selected provider in place; System/Light/Dark is stored independently from the effective appearance. Provider login, catalog discovery, inference and effective billing remain separate backend observations.

Working files uses lazy per-folder reads, append pagination, retry/refresh, retained tree/scroll/focus state and the complete pinned Material Icon Theme assets. Its [Zed-inspired native refinement](../../docs/verification/nma-069/zed-tree/README.md) adds flat aligned rows, branch guides, folder-first grouping and a retained virtual list. Focus composes the existing native Markdown/source/table/image/PDF adapters, native header/menu/download/context chip/composer and isolated static HTML body. Working files and table snapshots become uploads only on Send; a durable retry retains the same copy identity. Local/sent attachment previews use the same viewer.

[NMA-069 evidence](../../docs/verification/nma-069/README.md) records native journeys, exact builds, the five-case real-domain API probe and external outcomes not exercised. No provider inference or live Composio authorization is inferred from the fixture. NMA-070/NMA-071 retain Computer/host and full integrated parity acceptance.

## NMA-068 workspace attachment and recovery

Use the same explicit loopback origin and private installation-token file as the read-only attachment. `NGERTIIN_RS_THREAD_ID` or `attachment.json`'s `thread_id` is optional for the workspace: persisted selection or the existing Tobi DM is used when it is absent. No backend is spawned. The full contract must equal the pinned 1.31.0 definitions before writes are enabled.

Native state lives under `~/Library/Application Support/Ngertiin Rust Development/workspace`, separate from Tauri and gallery evidence. It contains private preferences/plain drafts, staged original bytes and the exact pending-operation journal; an exclusive profile lock prevents simultaneous writers. Once bound, a profile accepts a changed loopback port for the same owner and refuses another owner. Selection and recipient/model/billing state do not silently switch on retry. A lost acknowledgement is recovered by retrying the retained operation; native answer replies instead require authoritative status reconciliation. Projection checkpoints are memory-only, so reopening reads a new atomic snapshot and does not submit inference.

The focused state checks and remaining native/API acceptance are recorded in [NMA-068 evidence](../../docs/verification/nma-068/README.md). Contextual Settings/Library/Focus is implemented in NMA-069; live Computer/native lifecycle remains NMA-070.

The workspace automatically attaches to the backend already supervised by the configured Tauri installation. Start Tauri first, then open `dist/Ngertiin Rust Development.app`; Rust does not spawn a second backend. Explicit private `attachment.json` configuration takes precedence. `NGERTIIN_RS_PROFILE=<name>` selects an isolated native profile under `profiles/` using a validated name, useful for disposable recovery work. Reconnect rediscovers the retained installation after a changed backend port.
