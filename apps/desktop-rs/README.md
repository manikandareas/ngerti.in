# Ngertiin native desktop foundation

An independent Cargo workspace for [NMA-066](../../docs/backlog/NMA-066.md). It currently opens a native component gallery and renderer probes, with optional read-only API attachment. The active product client remains Tauri. Required capability gaps and their native evidence are tracked in the [verification report](../../docs/verification/nma-066/README.md); this foundation is not accepted desktop parity.

## Run and verify

On the reference macOS ARM64 host, with Rust/Cargo and Xcode Command Line Tools installed:

```sh
bun run dev:desktop-rs
bun run gallery:desktop-rs
bun run check:desktop-rs
bun --cwd apps/desktop-rs build
bun --cwd apps/desktop-rs bundle:dev
```

The app and `gallery` example share the same composition entry point. `Cmd+D` switches theme; `Cmd+Q` quits. The generated unsigned development bundle is `dist/Ngertiin Rust Development.app`. Native PDFKit integration currently targets macOS only. Other-platform builds, signing and fresh-device installation are separate work.

The default Cargo output is `.dev/desktop-rs-target` at the repository root. `NGERTIIN_RS_TARGET_DIR` may select an existing compilation cache; it changes neither runtime profiles nor backend state. During the recorded verification, `.dev/gpui-experiment-target` was reused to avoid rebuilding the same pinned native dependencies.

## Ownership

`desktop` composes `bootstrap`, `shell`, `features`, stateless `ui`, `host`, `platform` and `storage` modules. Feature Entities own input, selection, tasks and subscriptions. Controls accept explicit presentation inputs and return normal builders/callback surfaces, so the caller can apply a final style override. `client` and `avatar` have no GPUI or platform dependency. `scripts/check-boundaries.ts` verifies the entire transitive dependency direction and confines WebView construction to `platform/embedded.rs`.

`client` exposes only contract and existing-thread snapshot reads. It has no mutation, inference, event checkpoint or backend-spawn interface. One OS worker with an 8 MiB stack serializes reads with one queued slot. Retired receivers cancel queued work; active reads finish within the transport bounds and discard retired replies. This avoids recursive schema compilation on AppKit's small dispatch stacks. Snapshot bodies are bounded at 16 MiB; redirects/proxies are disabled and installation credentials stay in native transport state.

`avatar` contains the matching JavaScript seed/hash primitives and a bounded material-transform proof. Rust generates the fur surface; GPUI draws eyes independently. The full recipe/geometry/expression/motion port remains NMA-067. Exported web portraits are not used by this client.

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

Selected pins are GPUI Kit/WebView **0.9.0**, GPUI Fast **0.1.13**, lb-wry **0.53.3**, resvg **0.46.0**, objc2-pdf-kit **0.3.2**, reqwest **0.12.28** and jsonschema **0.33.0**; `Cargo.lock` owns all checksums/transitive versions. `platform/pdf.rs` adapts GPUI WebView's native composition attachment/geometry/retirement pattern to PDFKit's NSView, without constructing a browser. `platform/embedded.rs` mounts only a fixed static HTML proof with CSP and blocked navigation. Arbitrary HTML sanitization and live Computer sessions remain later work.

Upgrades must repeat cold snapshot decoding from a small-stack caller, malformed/version/shape/HTTP/redirect cases, native input/token/clipboard/IME, focus and keyboard names, image resampling/independent eyes, PDF layout/selection/zoom, child-view geometry/retirement and native overlays. The [source-adoption guide](../../docs/development/source-adoption.md) and verification report distinguish selected candidates from fully proved capabilities.
