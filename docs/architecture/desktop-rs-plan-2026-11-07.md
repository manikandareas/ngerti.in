# Desktop Rust: observation and ordered parity plan

Date: 2026-11-07. Status: planning only. Target: `apps/desktop-rs`, a GPUI desktop client following the current Tauri application's product behavior and visual design as closely as possible. The user requested a small, ordered local backlog after observation. Six milestones, [NMA-066](../backlog/NMA-066.md) through [NMA-071](../backlog/NMA-071.md), define that work. No desktop-rs implementation or replacement of the active host is claimed.

The user subsequently confirmed that the main UI must be implemented natively in Rust + GPUI, rather than forwarding the existing web-client through a WebView. The rendering ownership contract below applies to all six milestones.

## Observation method and limits

The source baseline is Git revision `07bcfc74db8fccebfd630a8a0b7b6bbf0e9aedce`. Tracked files were clean at the start of this audit; an unrelated untracked download was preserved. The audit read manifests/lockfiles, product and API decisions, desktop host implementation, client feature/state modules, existing tests, and retained native/browser/GPUI evidence. Knowledge-graph tools were unavailable, so discovery used targeted source reads and `rg`.

Retained screenshots of the Working files tree, PDF Focus viewer and chronological interaction cards were visually inspected. Their evidence dates and fixture/native boundaries remain those of their original reports. The [GPUI experiment comparison](../verification/gpui-experiment-2026-11-07/comparison.html) and its source were reviewed as feasibility evidence, not a finished client.

A fresh native walkthrough could not run: the computer-use native connection failed to initialize. A loopback Vite server started successfully with no installation state, but the browser automation connection failed during tab navigation. That temporary server was stopped. No application backend, scheduler, harness inference, new viewer ticket or machine control was started by this audit. Fresh native baseline capture is therefore an explicit first-milestone deliverable, not an observation claimed here.

`bun run docs:check` passed before these planning changes: 199 Markdown files, 1,634 local links, 19 milestone records, 83 decisions, backend contract 1.31.0. Source/test inspection does not rerun those tests or establish current runtime acceptance.

## What the reference actually contains

| Area | Source observed | Consequence for the port |
| --- | --- | --- |
| Desktop host | [host.rs](../../apps/desktop/src-tauri/src/host.rs), [supervisor.rs](../../apps/desktop/src-tauri/src/supervisor.rs), [profile.rs](../../apps/desktop/src-tauri/src/profile.rs), [power.rs](../../apps/desktop/src-tauri/src/power.rs), [lib.rs](../../apps/desktop/src-tauri/src/lib.rs) | Port window/profile/menu/tray, backend attach-or-own supervision, downloads, visibility, reopen and shutdown behavior as well as pixels. |
| Main workspace | [workspace-layout.tsx](../../apps/web-client/src/app/workspace-layout.tsx), [navigation](../../apps/web-client/src/features/conversation/components/navigation.tsx), [context panel](../../apps/web-client/src/features/conversation/components/context-panel.tsx), [interface decision](../product/interface.md) | One conversation workspace; Detail/Library/Computer, contextual Settings and dedicated Working files. Preserve reading position and return focus. |
| Shared UI and identity | [theme.css](../../apps/web-client/src/styles/theme.css), [index.css](../../apps/web-client/src/index.css), [component catalog](../../apps/web-client/src/lib/component-catalog.ts), [identity.tsx](../../apps/web-client/src/features/conversation/components/identity.tsx) | Retain Geist/Geist Mono, Hugeicons, semantic tokens, agent colors and all used interaction states. Gallery-only controls do not automatically become product scope. |
| Composer and persistence | [composer-input](../../apps/web-client/src/features/conversation/components/composer-input.tsx), [draft hook](../../apps/web-client/src/features/conversation/lib/use-conversation-draft.ts), [message submission](../../apps/web-client/src/features/conversation/lib/message-submission.ts), [API client](../../apps/web-client/src/lib/api-client.ts) | Recreate editing/token/clipboard/IME behavior and per-thread plain drafts. Replace browser pending storage with durable native operation records preserving exact request identity, body and attachment bytes. |
| Event/state recovery | [workspace-sync](../../apps/web-client/src/hooks/workspace-sync.ts), [workspace-events](../../apps/web-client/src/hooks/workspace-events.ts), [consumer contract](api-consumer-contract.md) | Read atomic snapshot/cursor, apply ordered/revisioned events, reconcile reconnect/visibility, and avoid duplicate admissions. Projection storage and its cursor must form a consistent checkpoint or be discarded together. |
| Avatar | [recipe](../../packages/avatar/src/config.ts), [render](../../apps/web-client/src/features/avatar/engine/render.ts), [texture](../../apps/web-client/src/features/avatar/engine/texture.ts), [motion](../../apps/web-client/src/features/avatar/engine/motion.ts), [controller](../../apps/web-client/src/features/avatar/engine/controller.ts), [loading](../../apps/web-client/src/features/avatar/engine/loading.ts) | Port deterministic identity and seeded fur generation, independent eye/expression layers, gaze/blink/actions/loading and visibility-aware clocks to Rust. Full-portrait PNG switching is insufficient. |
| Rich content and Focus | [viewer](../../apps/web-client/src/features/conversation/components/conversation-content-viewer.tsx), [PDF](../../apps/web-client/src/features/conversation/components/pdf-content.tsx), [source](../../apps/web-client/src/features/conversation/components/source-code-viewer.tsx), [table viewport](../../apps/web-client/src/features/conversation/components/table-viewport.tsx), [HTML policy](../../apps/web-client/src/features/conversation/lib/html-preview.ts) | Preserve the floating header/composer, nested Back, selection, copy, sorting/filtering/wrapping, contextual attachment semantics, original downloads and bounded reads. |
| Working files | [tree](../../apps/web-client/src/features/conversation/components/working-files.tsx), [browser state](../../apps/web-client/src/features/conversation/lib/working-files-browser.ts), [icon resolver](../../apps/web-client/src/features/conversation/lib/file-icon-manifest.ts) | Lazy per-folder pages/retry/refresh, keyboard navigation, retained expansion/selection/scroll and current Material Icon Theme precedence. Shared files remain distinct from scoped saved results. |
| Computer | [viewer](../../apps/web-client/src/features/conversation/components/machine-viewer.tsx), [session owner](../../apps/web-client/src/features/conversation/lib/computer-view-session.ts), [machine contract](shared-machine-cua-plan-2026-11-04.md) | Actual decoded frames, host-owned ticket cleanup, revision-fenced takeover/handback, pause/resume/reconnect and compact/expanded surfaces must work together. |
| Settings and work panels | [Settings](../../apps/web-client/src/features/settings/components/settings-dialog.tsx), [provider detail](../../apps/web-client/src/features/settings/components/provider-detail.tsx), [responsibilities](../../apps/web-client/src/features/conversation/components/responsibilities.tsx), [library memory](../../apps/web-client/src/features/conversation/components/library-memory.tsx), [app connections](../../apps/web-client/src/features/conversation/components/app-connections.tsx) | Preserve in-place navigation, selected provider/defaults/billing, group scope, Goals/Routine controls, skills provenance and app authorization states. |

Additional reference behavior includes sidebar skeletons, day separators and retained clocks, agent-attributed transient activity, structured question/approval states, queued edits/deletes, exact-input retry, steering and confirmed versus requested cancellation. See [sidebar loading](../verification/sidebar-loading-2026-11-07/README.md), [chronology](../verification/conversation-chronology-2026-11-07/README.md), [conversation interactions](../verification/conversation-implementation-2026-11-06/README.md), and [later refinements](../verification/conversation-followup-2026-11-06/report.html).

## Dependency disposition

Installed manifests were inspected; usage was checked against actual imports, not inferred solely from dependencies. The client contains 27 Playwright spec files; this is a source inventory, not a test-run denominator.

| Current dependency or mechanism | Desktop-rs disposition |
| --- | --- |
| React 19, TanStack Router, component state/hooks | New GPUI views/entities and explicit workspace/navigation state. Preserve in-place Settings and context return behavior rather than browser URL syntax. |
| Tailwind 4, `cn`, CVA, Base UI/Radix/shadcn | Typed theme/style/variant modules plus reusable GPUI controls. Product-consumed variants come first; retain source token values and interaction semantics. |
| Lexical 0.53.0 | Native composer model with inline references. The experimental Textarea/token APIs are a candidate, pending IME/selection/history/clipboard proof. |
| localStorage/sessionStorage/IndexedDB | Native per-profile draft and exact-operation journal; no browser storage dependency or implicit import/reset of existing profiles. |
| react-markdown/GFM, PapaParse, Shiki | Native parsing/presentation adapters preserving output semantics and syntax palette. GPUI Kit defaults do not establish visual parity. |
| PDF.js 6.5.438, parse5/static HTML | Replace PDF.js with a native PDF adapter selected and proved in NMA-066; GPUI owns paging/zoom controls and selectable-text interaction. A native library binding is acceptable. Static HTML alone may use an isolated browser surface. PDF must not silently fall back to a web-client/PDF.js UI. |
| Headless Tree 1.8.0, TanStack Virtual, stick-to-bottom | Native tree/list/scroll models with the same loading, paging, focus and reading-position behavior. |
| Geist/Geist Mono, Hugeicons 4.4.0, Material Icon Theme 5.40.0 | Reuse original local font/icon assets and documented associations; keep navigation icons and format icons distinct. |
| Procedural avatar TypeScript | Renderer-independent Rust engine, exposed through a small GPUI avatar adapter. Preserve recipe version and seeded identity. |
| Tauri 2.12.5 and plugins | Adapt host responsibilities to GPUI/platform APIs. The existing Bun backend and its lifecycle authority remain unchanged. |

The experiment pins GPUI Kit/WebView 0.9.0, GPUI Fast 0.1.13 and lb-wry 0.53.3. These are a candidate baseline for NMA-066, not an upgrade mandate. Its working cached avatar, fixture composer and read-only Computer do not satisfy production data integration, a full avatar port, PDF, IME or takeover/recovery.

The [official WebView guide](https://gpui-kit.com/docs/webview/) labels the integration experimental and platform-dependent: macOS overlays use GPUI Fast; Windows composition differs; Linux requires X11/XWayland. The chosen pins, feature flags and composition behavior must be reverified before adoption. [RenderOnce](https://gpui-kit.com/docs/render-once/) documents reusable presentation inputs versus retained Entity state; [Task](https://gpui-kit.com/docs/task/) documents task ownership and cancellation. These are framework capabilities, not Ngertiin acceptance evidence.

## Target ownership and structure

Use an independent Cargo workspace at `apps/desktop-rs` with three initial crates:

```text
apps/desktop-rs/
  Cargo.toml / Cargo.lock
  crates/
    desktop/
      src/
        main.rs / lib.rs / bootstrap.rs
        shell/
        features/             # Conversation, panels, settings, files, Computer
        ui/                   # Theme, variants, shared controls, avatar adapter
        host/                 # Profile, backend attachment/ownership, shutdown
        platform/             # Window, menus, dialogs, WebView, OS callbacks
        storage/              # Drafts, preferences, pending operations
      examples/gallery.rs
      tests/
    client/
      src/                    # Contracts, HTTP/events, projections, receipts
      tests/
    avatar/
      src/                    # Recipe, geometry, texture generation, motion
      tests/
  assets/                     # Original fonts and icons
  packaging/
  verification/
```

`desktop` depends on `client` and `avatar`; neither of those crates depends on GPUI or on the desktop crate. Shared controls receive props/callbacks; feature-owned Entities retain state/subscriptions/tasks. Network work, texture preparation, parsing and file reads do not block the UI thread. Use bounded channels/work queues and explicit cancellation when a view/scope retires. Any persisted event cursor is coupled to its projection checkpoint; a fresh snapshot is valid when no durable projection exists.

The backend remains the only domain scheduler/admission/recovery authority. Native storage owns drafts and retry records, not a second authoritative conversation database. Native Rust transport keeps installation credentials outside untrusted preview/viewer content. Embedded surfaces receive only their scoped content or short-lived viewer tickets; no generic shell/filesystem/credential bridge is added.

Profiles and application identifiers are separate from Tauri. Both clients may attach only through compatible existing backend discovery/ownership rules; neither starts a duplicate backend for the same locked state directory. Host reuse is an adaptation of responsibilities, not a blind copy of Tauri-specific types. Source provenance and upgrade checks are required during implementation.

## Rendering ownership contract

| Surface | Required implementation | Browser allowance |
| --- | --- | --- |
| Workspace, navigation, headers, sidebar, panels and Settings | Rust views/entities and GPUI elements, including layout, theme, focus and interactions | None |
| Composer, suggestions, references, message bubbles, activity, questions and approvals | Native editing/state and GPUI presentation; no DOM, Lexical runtime or HTML message shell | None |
| Markdown, code, tables, source, images, Working files tree and file controls | Rust parsing/models and GPUI drawing/selection/virtualization | None |
| PDF | Native PDF rendering adapter with GPUI controls, text-selection interaction, page virtualization and zoom | None under this plan |
| Avatar | Rust-generated recipe/geometry/material/motion, presented through the GPUI adapter | None; earlier TypeScript-exported portraits are reference fixtures only |
| Static HTML document body | Isolated WebView holding only the selected document; host navigation, file actions, context chip and composer remain GPUI | Allowed for document content, with scripts/forms/external resources/navigation blocked |
| Computer pixels and viewer protocol | Isolated existing Cua viewer; GPUI owns its surrounding native workspace/panel/actions, while the existing viewer may retain its protocol-owned controls | Allowed for the ticket-scoped viewer only; its existing JavaScript is isolated from application credentials and generic native operations |
| OS menus/tray, file dialogs, clipboard and window lifecycle | Native platform APIs behind desktop-owned adapters | None |

Keep browser instances at a narrow platform adapter and mount them only for HTML documents or Computer. Switching away, hiding or closing retires the corresponding surface/session correctly. A dialog, picker or composer outside those browser contents must remain native and pass focus/overlay tests.

The production client must not load or bundle `apps/web-client/dist`, start a React root, or require the TypeScript avatar renderer to draw its UI. Existing client code, previews, assets and fixtures remain source/reference material; original font/icon assets may be reused. Source/bundle inspection and native interaction checks verify these rules alongside screenshots. If a required native renderer cannot meet the reference, record the capability gap in NMA-066; a full-page WebView or PDF.js UI is not an implicit workaround.

## Six ordered milestones

| Step | Milestone | Exit result |
| --- | --- | --- |
| 1 | [NMA-066 · Foundation, reference baseline and reusable components](../backlog/NMA-066.md) | Modular app/gallery, baseline/state manifest, native controls and proven renderer choices for high-risk primitives. |
| 2 | [NMA-067 · Rust avatar, composer and rich-content components](../backlog/NMA-067.md) | Full Rust-generated avatar and behaviorally tested editing/content building blocks. |
| 3 | [NMA-068 · API-backed workspace and conversation parity](../backlog/NMA-068.md) | Real API conversations with durable drafts/operations, streaming, queue/control, creation and interaction recovery. |
| 4 | [NMA-069 · Context panels, Settings and Focus workflows](../backlog/NMA-069.md) | Complete contextual work/configuration/files/viewer flows with matching scope and return behavior. |
| 5 | [NMA-070 · Computer, native host and lifecycle parity](../backlog/NMA-070.md) | Live Computer/control and host behavior, including process ownership and visibility cleanup. |
| 6 | [NMA-071 · Desktop parity acceptance and development bundle](../backlog/NMA-071.md) | Integrated native evidence, resolved material differences and a verified local development bundle. |

All six are **Backlog**, not started or Done. Orders 16.1–16.6 place this separate `Desktop Rust` plan after the current NMA-061/062 reference. Existing NMA-063/064 dependencies and statuses are unchanged. Each milestone contains internal work units and its own verification; the last milestone consolidates evidence rather than discovering basic feasibility for the first time.

Each milestone also contains ordered subtasks with a concrete deliverable and evidence requirement. These are internal work items, not additional backlog milestones. Complete the listed dependencies and acceptance before advancing; an unchecked task or an unexecuted capability probe remains visible.

## Parity contract

NMA-066 freezes a versioned surface/state manifest, selected fixtures, dimensions, fonts, zoom, device scale, locale/time zone and source revisions. Later reference changes enter a reviewed baseline delta, not an unannounced moving target.

For each surface, record default, hover, pressed, focus, disabled, loading, empty, failure/retry, overflow/scroll, long text and applicable light/dark states. Use 1280×900 and 1440×1000 logical desktop viewports plus the reference's 720×500 minimum, with 1×/2× scale where available. If the reference adapts to the minimum width with compact sheets, retain that desktop-window behavior; phone/mobile-client delivery is not introduced here.

Record visual, behavior and native/API evidence separately. Compare geometry, font metrics, icons, colors, shadows and motion at deterministic timestamps. Numeric screenshot diffs supplement side-by-side review; they do not replace selection, clipboard/IME, focus, byte-integrity or recovery assertions. Track rendering antialiasing differences independently from substantive layout/behavior gaps. Every remaining material difference stays open or receives an explicit scoped decision; a silently simplified feature does not count as parity.

Performance evidence uses the same machine, refresh rate, viewport, workload and visibility state as the baseline: first visible conversation, streaming while following/reading history, large history/tree/source/PDF, and 1/10/30 visible avatars. Record frame times, missed frames, time to visible content, CPU/memory and hidden-window work. Agree on measurable budgets in the baseline manifest before declaring a regression acceptable; GPU rendering alone establishes no speed or memory advantage.

## Delivery boundaries

The initial native reference and required run gate are macOS ARM64, matching `apps/desktop`. Keep OS-specific code isolated. Windows/Linux build/runtime, WebView composition, installation and signing require separately recorded target decisions and actual machines; untested platforms remain explicitly unverified. WebView native Wayland support must not be implied.

NMA-071 covers native development parity and a local bundle only. It does not close product-wide NMA-063, fresh-device NMA-064, signing/notarization/update delivery, mobile native clients, or production release. The current Tauri host and independent GPUI fixture experiment remain available during this plan. Replacing/removing the active host is a later explicit decision after parity evidence.
