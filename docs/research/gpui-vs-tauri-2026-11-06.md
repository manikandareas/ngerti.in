# GPUI and Tauri: desktop architecture and web-client reuse

Date: 2026-11-06. Scope: primary-source research into GPUI architecture, platform support and reuse of an existing web interface. This note is research, not an implementation decision, benchmark or desktop acceptance result.

**Assessment:** retain Tauri for the current React web-client. A native GPUI client is technically possible but requires a new presentation implementation. GPUI Kit's experimental WebView can potentially retain React, while adding host integration work and keeping browser rendering. The existing backend API can serve either client. Repository evidence and the recommendation are detailed below.

## Source versions and method

- Official GPUI website and examples were checked on 2026-11-06. Source inspection pins Zed revision **`e231594b6b8818ea8d668ee2eb73e1fb09300654`**, committed at `2026-11-06T14:35:38Z`. Its GPUI manifest declares `0.2.2`; this is the source-tree version, not proof that crates.io's latest publication contains every inspected change. [GPUI manifest](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui/Cargo.toml).
- Longbridge GPUI Kit inspection pins **`1458fe285beba30c8035e46f19f76f1631b29f4f`**, committed at `2026-11-06T14:56:05Z`. The former `longbridge/gpui-component` repository now redirects to `longbridge/gpui-kit`; its `gpui-webview` source manifest declares `0.9.0` and depends on package `lb-wry` `0.53.3`. Website prose and examples can lag manifest versions. [GPUI Kit repository](https://github.com/longbridge/gpui-kit/tree/1458fe285beba30c8035e46f19f76f1631b29f4f), [WebView manifest](https://github.com/longbridge/gpui-kit/blob/1458fe285beba30c8035e46f19f76f1631b29f4f/crates/webview/Cargo.toml).
- Context7's GPUI documentation index was consulted for API orientation; dated conclusions were checked against the owning website or pinned upstream source. No GPUI application was compiled or executed.

## How GPUI works

**Verified:** GPUI is a Rust UI framework with hybrid immediate/retained behavior and GPU rendering. It supplies its own controls and drawing pipeline rather than converting controls to platform-native widgets. It is the UI foundation used by Zed and Delta. [Official GPUI introduction](https://gpui.rs/), [official examples](https://gpui.rs/examples/).

The application/state/rendering sequence is:

1. An `Application` selects platform services, starts the event loop and opens a window.
2. Persistent application state lives in GPUI-managed `Entity` values. A renderable entity implements `Render` and acts as a view.
3. A view's `render` method returns an element tree. Rust method calls express layout, styling and event handlers; low-level custom elements can control layout and painting.
4. Handlers change state and request updates, for example through `cx.notify()`. GPUI produces the displayed pixels. Persistent entities and rebuilt render descriptions explain the hybrid model; the label does not mean React or browser compatibility. [Pinned GPUI architecture](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui/README.md), [counter example](https://gpui.rs/examples/).

Its style API intentionally resembles Tailwind: `div().flex().flex_col().gap_3()` is Rust code building GPUI elements. The current official guide explicitly distinguishes this API from full CSS compatibility and says GPUI does not supply a browser DOM. Taffy is a layout dependency, with flexbox/grid and other layout features enabled in the inspected manifest. [Layout explanation](https://gpui.rs/examples/), [layout dependency](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui/Cargo.toml).

**Inference for web reuse:** familiarity with React views and Tailwind helps a developer understand GPUI, but JSX, DOM components, CSS stylesheets and browser APIs are not a directly executable GPUI interface. Native GPUI adoption means implementing the presentation layer against GPUI's element/state APIs.

## Desktop platform support

**Verified:** current official documentation and platform dispatch include macOS, Windows and Linux. Older claims that Windows support is only planned are stale. Zed itself currently distributes across all three; that demonstrates a deployed application on GPUI, not acceptance of a new application's platform integration. [Official platform overview](https://gpui.rs/examples/), [pinned platform selection](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui_platform/src/gpui_platform.rs), [Zed installation](https://zed.dev/docs/installation).

| Target | GPUI rendering/windowing evidence | Boundary |
| --- | --- | --- |
| macOS | Metal; platform crate supplies macOS window services | Standalone text rasterization needs the documented `font-kit` feature. |
| Windows | DirectX 11; Win32 windows and DirectWrite text | Requires suitable GPU/driver support; Windows integration still needs application-specific verification. |
| Linux | wgpu rendering; X11 and/or Wayland windowing | Appropriate backend features and system dependencies are required. |

Sources: [official renderer descriptions](https://gpui.rs/examples/), [platform setup requirements](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui/README.md), [Direct3D11 dependency](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui_windows/Cargo.toml).

**Verified maturity limitation:** the current GPUI README still describes GPUI as pre-1.0, warns of frequent breaking changes and asks for the latest stable Rust. Zed's own product version or stability must not be substituted for a stable GPUI library API. [Pinned GPUI getting started](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui/README.md).

## Browser/WASM support is a different direction of reuse

**Verified source capability:** the inspected upstream now contains `gpui_web`, a browser platform implementation. Its graphics initialization tries WebGPU and can fall back to WebGL2, rendering through an HTML canvas. It currently limits an application to one top-level browser window and explicitly rejects reopening that window after closure. [Pinned web platform](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui_web/src/platform.rs).

**Inference:** this enables compiling a GPUI interface toward browser execution; it does not make an existing React DOM interface a GPUI native interface. It also does not prove the whole Zed application runs in the browser: Zed's installation guide separately lists its web application as unsupported. [Platform constructor](https://github.com/zed-industries/zed/blob/e231594b6b8818ea8d668ee2eb73e1fb09300654/crates/gpui_platform/src/gpui_platform.rs), [Zed application platform scope](https://zed.dev/docs/installation).

## GPUI Kit, JavaScript and HTML caveats

GPUI core is distinct from Longbridge's **GPUI Kit** ecosystem. Kit supplies a styled component layer, an unstyled behavior/state foundation and an optional `gpui-shell` JavaScript extension host. These packages can reduce the amount of input, list, table, layout and rich-content work needed when authoring a GPUI application. They are not the existing React/shadcn components running unchanged. [Pinned GPUI Kit overview](https://github.com/longbridge/gpui-kit/blob/1458fe285beba30c8035e46f19f76f1631b29f4f/README.md).

The inspected `gpui-shell` README describes scripts composing GPUI interfaces while Rust owns rendering and input. It explicitly excludes a browser DOM, HTML/CSS and Node.js from that application interface. It calls its extension interface an M0 feasibility baseline. The existence of JavaScript scripting therefore does not establish React DOM compatibility. [Pinned shell architecture](https://github.com/longbridge/gpui-kit/blob/1458fe285beba30c8035e46f19f76f1631b29f4f/crates/shell/README.md).

Likewise, the Kit's native HTML document renderer is not a general browser. The WebView guide explicitly distinguishes its `TextView` HTML support from browser behavior. [WebView versus document HTML](https://gpui-kit.com/docs/webview/).

## An actual WebView path exists, with narrower support

**Verified:** saying “GPUI can never display React/web pages” would be too broad. GPUI Kit provides a separate **experimental `gpui-webview` integration**, previously named `gpui-wry`. It embeds a native Wry child WebView; the builder can select a URL or HTML content and configure page-loading, navigation and IPC callbacks. This is an additional browser integration, not GPUI's native element renderer. [Pinned WebView guide](https://github.com/longbridge/gpui-kit/blob/1458fe285beba30c8035e46f19f76f1631b29f4f/website/docs/webview.md), [pinned wrapper implementation](https://github.com/longbridge/gpui-kit/blob/1458fe285beba30c8035e46f19f76f1631b29f4f/crates/webview/src/lib.rs).

| WebView target | Engine | Documented limitation |
| --- | --- | --- |
| macOS | WKWebView | GPUI overlays above the page require the optional `gpui-fast` composition path. |
| Windows | WebView2 | The child browser covers overlapping GPUI content; the example disables GPUI DirectComposition. |
| Linux X11/XWayland | WebKitGTK | Requires X11 for the whole application; optional `gpui-fast` supports overlay composition. |
| Linux native Wayland | None | This integration does not support it; XWayland is the documented alternative. |

Sources: [pinned WebView support matrix](https://github.com/longbridge/gpui-kit/blob/1458fe285beba30c8035e46f19f76f1631b29f4f/crates/webview/README.md), [WebView platform details](https://gpui-kit.com/docs/webview/).

**Inference for Ngertiin:** serving the existing built web-client in that WebView is technically plausible. It preserves browser rendering and requires a replacement host integration for startup, origins, authentication, persistence, lifecycle, navigation and downloads. It cannot be presented as obtaining GPUI-native rendering or a demonstrated memory improvement for the existing web UI. A GPUI/WebView hybrid has a reason to exist when a substantial native GPUI interface surrounds isolated web content; displaying the entire existing web application supplies less reason for that extra framework.

## Comparison with Tauri

Tauri combines a Rust host with HTML/CSS/JavaScript running in an OS WebView. Its tooling covers bundling and native application integration, including optional plugins and update delivery. On desktop, Windows uses WebView2, macOS uses WKWebView and Linux uses WebKitGTK. Its frontend can therefore use existing web development techniques. [Tauri architecture](https://v2.tauri.app/concept/architecture/), [process model](https://v2.tauri.app/concept/process-model/), [WebView engines](https://v2.tauri.app/reference/webview-versions/).

| Question | Tauri | Native GPUI |
| --- | --- | --- |
| What describes the UI? | Web frontend: HTML, CSS and JavaScript, including React | Rust views, entities and elements |
| Who renders the interface? | OS WebView | GPUI's GPU rendering pipeline |
| Can the current React components run? | Yes, in the WebView | Presentation must be reimplemented |
| What resembles our current styling? | Existing Tailwind/CSS can remain | Similar method names, with GPUI-defined behavior |
| What is the framework's role? | Desktop/mobile host toolkit around a web frontend | UI framework, with application architecture supplied separately |

The comparison describes framework capabilities. It does not establish Windows/Linux readiness for Ngertiin or a performance advantage for either implementation. GPUI Kit plus its WebView is a separate hybrid option with the limitations recorded above.

## Current Ngertiin repository assessment

Inspected checkout: **`59320d7db9213dcb5302188e2cc9a0030b9f9034`**. The working tree was clean before the research documentation was added. Knowledge-graph tools were unavailable in this session; the audit used direct file reads and targeted source searches.

- The active client is React/React DOM with Vite, Tailwind, shadcn/Base UI/Radix, Lexical, React Markdown, Shiki and TanStack components. These are web presentation dependencies, rather than GPUI components. [Client manifest](../../apps/web-client/package.json).
- The current desktop host pins Tauri core **2.12.5** and CLI **2.12.4**. It starts a Rust gateway/supervisor and loads that gateway's origin using `WebviewWindowBuilder`. Packaging copies the existing `apps/web-client/dist` output into the desktop resources. React reuse is already the implemented approach. [Rust dependencies](../../apps/desktop/src-tauri/Cargo.toml), [CLI dependency](../../apps/desktop/package.json), [host setup](../../apps/desktop/src-tauri/src/host.rs), [asset staging](../../apps/desktop/scripts/prepare-runtime.ts).
- HTTP commands and fetch-based SSE already separate presentation from the application lifecycle. The current consumer contract is **1.31.0**. A different client could consume the same authenticated API while preserving idempotency keys, event ordering/reconciliation and server-owned authorization. TypeScript UI/state code does not automatically become Rust code. [API client](../../apps/web-client/src/lib/api-client.ts), [consumer contract](../architecture/api-consumer-contract.md), [ownership](../architecture/overview.md).
- The Computer screen embeds a browser viewer through an `iframe`, receives `postMessage` health reports and participates in native visibility/control-release behavior. A native GPUI client would need a compatible browser surface or a separately implemented viewer with the same protocol and control semantics. The backend Cua machine can remain unchanged. [Machine viewer](../../apps/web-client/src/features/conversation/components/machine-viewer.tsx), [desktop bridge](../../apps/web-client/src/types/desktop.d.ts), [viewer transport](computer-preview-transport-2026-11-06.md).
- Current retained desktop scope is **macOS ARM64 development**, with Windows/Linux builds, signing/notarization, update delivery and fresh-device installation still unverified. Framework platform support does not close these application gates. [Current host and limitations](../architecture/tauri-development.md), [product scope](../../PRODUCT.md).

| Area | Native GPUI client | GPUI Kit with full-page WebView |
| --- | --- | --- |
| Bun backend, domain persistence, harnesses and Goals/Routine | Retain existing ownership and APIs | Retain existing ownership and APIs |
| React layouts, Settings, forms, chat and composer | Reimplement presentation and state integration | Retain web implementation; verify engine behavior |
| Markdown, code highlighting, avatars and charts | Port or select native equivalents; adapt assets | Retain browser components |
| Draft and pending-operation persistence | Implement native persistence with the same retry semantics | Preserve stable origin/storage and verify persistence |
| Computer viewer | Embed a compatible WebView or implement native media/input presentation | Existing iframe is a candidate; native media/input still needs verification |
| Gateway, supervision, navigation, downloads and visibility | Adapt/reuse framework-independent Rust logic; replace Tauri-bound integration | Adapt/reuse framework-independent Rust logic; replace Tauri-bound integration |
| Existing browser UI tests | Retain for web client; native GPUI needs its own UI proof | Retain web logic coverage; add GPUI/WebView native journeys |

These migration estimates are architectural inferences from the inspected dependencies and boundaries, not a completed port or measured engineering estimate.

## Recommendation and decision boundary

**For packaging our existing web-client across desktop operating systems, continue with Tauri.** The repository already has the required frontend reuse and a host integration with explicit lifecycle, credential and viewer boundaries. Cross-platform work should verify those existing paths on each selected OS, including backend/harness and shared-machine setup. Replacing the renderer does not remove those obligations.

Consider a native GPUI client only if a Rust-native interface becomes an explicit product decision, supported by a concrete requirement that warrants replacing the web presentation and maintaining the browser interface separately if it remains required. A future feasibility experiment could reuse the existing API for one real chat/stream/composer/Computer flow and compare that same workload against Tauri. No such experiment or scope change was authorized or implemented by this research.

The GPUI Kit WebView option can be useful for a larger native interface that embeds selected browser surfaces. Using it solely to host our entire current React application keeps the WebView and replaces an already implemented host with an experimental integration. This research establishes no corresponding Ngertiin performance benefit.

## Evidence limits

- Research verified official descriptions, manifests and source capabilities, including the newer WebView and WASM paths. It did not verify a GPUI build, local smoke test, application packaging, accessibility behavior or platform distribution.
- No comparative Ngertiin RAM, startup, latency, frame-time or battery benchmark was run. GPU rendering is an architectural property, not evidence that a rewrite improves the application workload.
- Native GPUI controls, a GPUI canvas application in a browser and a browser page embedded in GPUI are three different execution paths. Their capabilities and platform limitations must be evaluated separately.
- Backend API reuse and React implementation reuse were assessed separately against the current repository; neither a native GPUI port nor a GPUI/WebView host was built.
