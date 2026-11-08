# NMA-066 native foundation verification

Date: 2026-11-07. Status: **In Progress**. The independent [desktop-rs workspace](../../../apps/desktop-rs/README.md) implements a native gallery, reusable controls, renderer proofs and read-only snapshot attachment. This report does not close foundation acceptance or authorize NMA-067 product components to rely on unresolved capabilities.

## Source, setup and ownership

The Tauri/web reference source is Git `2f03d44a5b33ff40c9d630d4c44046b565108542`. The [reference manifest](../../../apps/desktop-rs/verification/reference-v1/manifest.json) freezes 295 source/config/contract hashes, 27 surface/state families and 22 directly product-consumed shared controls. Reachability starts at the real workspace; catalog-only/transitive controls retain their own consumers instead of being promoted into product scope. Focus, PDF, Working files/source navigation, sidebar loading and chronology amendments are included. The [source manifest](source-manifest.json), [capture registry](captures.json) and [environment](environment.json) retain final source/assets/binary hashes and exact capture limits.

Tested host: Apple M1 MacBook Air, 8 GB, macOS 26.3 ARM64; Rust/Cargo 1.99.1 and Bun 1.3.10. The selected dependency checksums are retained in the independent Cargo lockfile: GPUI Kit/WebView 0.9.0, GPUI Fast 0.1.13, lb-wry 0.53.3, resvg 0.46.0, objc2/objc2-pdf-kit 0.6.4/0.3.2, reqwest 0.12.28 and jsonschema 0.33.0. Geist/Geist Mono Fontsource 5.3.0 TTF/WOFF2/OFL, 53 product-used Hugeicons 4.4.0 exports and eight original Material Icon Theme 5.40.0 examples/associations/licenses are local assets.

All new source lives under the independent Cargo workspace. `desktop → client/avatar` is the only application crate direction; the client/avatar transitive dependency graphs exclude GPUI, AppKit, WebView and the desktop crate. The main function only delegates composition. Feature Entities own state; reusable controls take explicit props and callbacks. The only browser constructor is `platform/embedded.rs`. Shell, gallery, composer, source/table, avatar proof and PDF are native. No React root, web-client dist bundle or browser PDF renderer is loaded by desktop-rs.

Both HTTP fixtures used disposable real API/SQLite state with zero executors and no scheduler/machine. The current web client was rebuilt with `bun run build:web-client`. The pre-existing Tauri binary's hash is retained; its source correspondence was not reverified by rebuilding Rust. Its reference launcher used a separate Tauri profile and an attach-only fixture runtime record, with `/usr/bin/false` as the backend fallback. Reference setup/fixture seeding happened before the initial cursor measurement. During reference viewing the cursor stayed **8 → 8**; during Rust snapshot probes it stayed **3 → 3**. [Tauri requests](tauri-reference-server.json), [read-only requests](read-only-server.json) and [fault requests](native-fault-requests.json) retain the method/path denominators. Real native/provider inference, billing and live Computer were not exercised.

## Executed checks

| Check | Executed denominator | Result / limit |
| --- | --- | --- |
| Cargo dependency/rendering ownership audit | 1 | Pass; transitive client/avatar separation and browser construction boundary enforced. |
| Rust format, strict Clippy and workspace tests | 1 check suite; 14 tests | Pass; [retained output](rust-check.log). Eleven client contract/HTTP cases, one cold small-stack worker case and two avatar seed/material cases. |
| Native app and gallery composition | 1 macOS host | Pass; final gallery launched from the generated development bundle. The example target uses the same composition and is compiled by all-target checks. |
| Current native Tauri references | 6 representative captures | Conversation dark/light, Detail, Library dark/light and Settings; fixture-only welcome/empty states, current clock. Broader state/dimension baseline remains open. |
| Shared controls | Representative native states | Buttons/variants/override, fields, checkbox/switch/radio/slider, tabs, menu, dialog/popover, scroll/resize, badges/bubbles, loading/empty/error and format icons displayed. Accessible names/selected states and error descriptions observed. Full per-control state/keyboard matrix remains open. |
| Native composer | 5 focused cases | Unicode multiline paste + token, undo, redo, memory draft restore with token count, and macOS dead-key `Option+E` then `E → é` passed. CJK candidate-window composition, token boundary selection and full clipboard-format semantics remain unexecuted. |
| Source | 1 focused case | Native read-only source resisted typing; Cmd+A/C copied the source and Cmd+V in composer reproduced it. Full find/wrap/large-source matrix remains open. |
| Virtual table | 10,000-row native proof | GPUI uniform-list path is implemented and displayed. Cross-cell/row selection, copy ranges, variable row heights and sustained workload are unresolved. |
| Rust avatar material | 2 angles; 4 display sizes | Seeded fur surface at 0°/22.5°, shown at 32/64/128/256 logical pixels with independent GPUI eyes. This is a material spike, not recipe/geometry/motion parity. Continuous transforms, filter quality and 1/10/30-avatar timing remain open. |
| Native PDF | 1 two-page fixture | Final single-page adapter displays page 1 correctly, selects `October sales`, retains that selection through zoom, and navigates next/previous through GPUI controls. GPUI dialog overlays and Escape also passed. Continuous layout, fit-width/anchor parity and page virtualization remain unresolved. |
| Static HTML child view | 1 fixed document | CSP kept the script from changing content; external-link navigation was blocked. Native GPUI dialog appeared above it and Escape dismissed it. Arbitrary untrusted HTML sanitization and Computer tickets are not implemented here. |
| Read-only startup/connection | 1 real API fixture + 4 native fault states | Snapshot decoded and displayed; version mismatch, malformed JSON, schema mismatch and backend unavailable produced actionable feedback. Only GET contract/snapshot requests were offered by the client. HTTP auth/redirect/body limits/wrong-thread cases also passed in Rust. |
| Window minimum/large request | 2 resize attempts | 720×500 content viewport captured at 2×. The requested 1440×1000 settled to 1440×897 on this display; theme-toggle pending/failed captures are retained as such. No complete size/theme matrix is claimed. |

Representative final captures: [live snapshot](snapshot-live.jpg), [compatibility error](snapshot-version-mismatch.jpg), [compound controls](gallery-compounds-resize.jpg), [PDF selection](pdf-single-page-selection.jpg), [next PDF page](pdf-next-page.jpg), and [minimum window](gallery-720x500-light.jpg). Earlier captures are supplementary iterations and are identified in the registry. Screenshots are original CUA JPEGs; none is a numerical parity diff.

## Failures and corrections retained

The first attached native runs crashed while lazily compiling the recursive conversation JSON schema on an AppKit/GPUI dispatch worker. Ordinary Rust test threads did not reproduce it. The observed crash stack traversed `jsonschema` compilation/serde cloning on the dispatch worker. Moving the read/compile/decode work to one explicit 8 MiB OS worker with a bounded queue fixed native startup; a separate cold test process now calls it from a 256 KiB thread. Retired replies cancel queued work; transport timeouts bound active reads. No error payload or installation bearer is logged or embedded.

The first Tauri fixture runtime URL included a trailing slash; the existing gateway's target concatenation generated double-slash requests and the reference showed an error. Removing that slash in the fixture record restored the current native reference. This changed only fixture setup, not the existing Tauri gateway.

PDFKit continuous display opened near the bottom and geometry/deferred-first-page attempts did not establish a stable initial viewport. [The failed layout capture](pdf-layout-unresolved.jpg) is retained. The final gallery intentionally uses the proved single-page path with GPUI next/previous and zoom. Continuous presentation remains required by the reference and is not silently replaced by this spike. The native adapter is a candidate pending that proof.

Two immediate theme-toggle captures retained the prior rendered theme, and the oversized gallery request was constrained by the host display. The registry records observed pixels/dimensions rather than labeling those attempts as matched captures. No screen setting was changed to manufacture a 1× or oversized result.

## Required remaining conditions

- Finish the frozen native reference fixture/state matrix at the specified viewports/themes/available scales, including representative Focus/PDF/tree/chronology/interaction states and deterministic clocks. Existing native captures establish access and selected states only.
- Complete the 22 product-used control state/variant matrix, especially focused/pressed/disabled keyboard behavior, focus restoration and accessible descriptions. Gallery-only examples do not close this denominator.
- Prove CJK composition/candidate selection and token-boundary selection; cross-cell/table copy with virtualization; continuous avatar transform/filter behavior; and PDF continuous layout/fit-width/reading-position/page bounds. Record final renderer selection after these proofs.
- Run the matched Tauri baseline performance workloads and native comparison. [Workloads and numeric engineering budgets](../../../apps/desktop-rs/verification/performance-workloads.json) are defined; measurements are explicitly null and comparison is disabled. No frame-time, CPU/RSS improvement or hidden-window budget is claimed.
- Finish the T6 handoff only after every required capability is resolved. The later NMA-067 implementation request starts independent avatar work with [separate component evidence](../nma-067/README.md); it does not close this foundation handoff. NMA-068–071 remain Backlog. NMA-063 product acceptance, NMA-064 installation, active-host replacement and other-platform distribution retain their separate gates.

## Reproduction

From the repository root:

```sh
NGERTIIN_RS_TARGET_DIR="$PWD/.dev/gpui-experiment-target" bun run check:desktop-rs
bunx biome check apps/desktop-rs/scripts apps/desktop-rs/package.json
bun run docs:check
bun apps/desktop-rs/scripts/fixture-server.ts
```

Use the fixture's ignored connection record with the private read-only attachment configuration described in the app guide. For reference capture, build the current web client and existing Tauri binary, then run `reference-server.ts`. Use CUA for native interaction/capture and retain exact observed dimensions/themes. Stop fixture servers and native apps after verification. The temporary Rust attachment configuration created by this run was removed; existing Tauri profiles, credentials, databases and the unrelated download were preserved.
