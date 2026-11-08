# NMA-069 contextual native workflows

Date: 2026-11-08. Result: **Done for the contextual-work milestone**. Detail/Library, in-place Settings, scoped configuration, Working files and Focus now use the current Tauri interface as their layout and interaction reference. The Computer media/control lifecycle remains NMA-070; complete desktop parity and host replacement remain NMA-071 and the existing product gates.

## Source, build and setup

The starting tree was clean at `bcb1d5726f76e53486e5b8ac3d32f19a170fb970`. [Reference hashes](reference-manifest.json) identify the exact current Tauri modules inspected. A native Tauri walkthrough confirmed the context-panel frame; current source supplies the later Working files amendment. Knowledge-graph tools were unavailable, so discovery used targeted source reads. This report does not claim an automated pixel-difference score.

The implementation remains Rust + GPUI. Detail/Library/Settings/provider/Composio forms, tree, Focus chrome/composer/menu, source/table/image/Markdown and PDF controls are native. Only sanitized static HTML document content uses the isolated browser adapter. Existing dependency pins and API contract **1.31.0** are unchanged. The complete **1,256** referenced Material Icon Theme 5.40.0 SVGs are retained locally with the existing manifest and license.

[Initial verification build](build-manifest.json) identifies the native build used for contextual admission, lost-acknowledgement/rejection and Goal controls. [Delivery build](delivery-build-manifest.json) identifies the final source/asset hashes and binary. Intermediate screenshots below identify their captured revision; not every intermediate build manifest was retained. The final local-PDF capture is tied to the delivery manifest. The final visual refinements include product PDF page/zoom/fit controls, Focus content/header spacing, composer height measurement, compact attachment chips without duplicate local-file context, group-scoped Skills access and standard tree arrow behavior. Development renderer optimizations remain development settings.

The native mutation journeys attached a separate `nma069-context-proof-v2` profile to a loopback **real server/store/API** fixture, with two agents, a DM, a group, private memory, an app-owned skill, Goal/Routine and five published output files. A synthetic settled run supplies those files; **no model executor or scheduler runs**. Accepted feedback is observed as durable queued admission, not completed model inference. Credentials/configuration stay in ignored `.dev` and the isolated profile; retained receipts contain synthetic data and no bearer token.

Two fixture modes are intentionally different:

- Default native mode registers all 99 contract routes with an unavailable machine driver. Working-file reads expose an actionable failure; a separately attempted share returns `409 STALE_DISPATCH`, with no false success.
- `--domain-only` mode omits machine registration and exercises retained artifact copying. The [five-case domain report](api-journeys.json) passed **5/5** on a fresh final fixture. It is not native machine or external-provider proof.

A separate read-only native journey attached the existing retained installation: the shared machine was ready, its real root tree loaded with Material icons, and `contoh-produk.csv` opened as a three-row/three-column native table. Back retained its originating tree. No retained conversation was submitted or changed.

## Executed native journeys

These are focused observed journeys, not an exhaustive cross-product state matrix. Screenshots contain only the disposable fixture. Final captures use the delivery build unless identified otherwise below.

| Journey | Observed result |
| --- | --- |
| Detail navigation and draft | A Unicode draft survived Detail, Goal detail, Escape and Library navigation. Goal Pause returned authoritative paused state and exposed Resume. [Initial-build capture](captures/native-goal-paused.png). |
| Group/member privacy | Group member detail is read-only, keeps the member identity and states that private DM history/memory/files remain private. Back returns to group Detail. Group Library contains no DM-private memory or saved results. [Member capture](native-group-member.png). Final-build group Skills shows its own empty catalog. |
| Settings and themes | General/Providers/About opens in the same workspace. Light/dark selection renders natively; closing returns to the same Library. Reopening retains Providers and selected Muse Code. [Light](native-settings-light.png), [dark](native-settings-dark.png) captures precede the final attachment refinement. |
| Account/model distinctions | ChatGPT displays authenticated login, successful catalog discovery, unattempted inference and selected/effective subscription billing separately. Empty Muse configuration exposes Add account/API key. Native model picker changed reasoning to `high` through expected revision 2; backend returned 200. |
| Library and rich files | Five scoped saved outputs opened: Markdown, CSV, 700-line TypeScript source, static HTML and two-page PDF. Source exposes find/wrap/line numbers/copy. [HTML body](captures/native-html.png) remains inside native surrounding chrome. |
| Nested table navigation | Maximize from Markdown opens a native table; Escape returns to the document first. Filtering to Alpha determines the submitted snapshot. |
| Saved-file feedback | Send returns to the same conversation with the authoritative artifact ID and file reference. The draft clears only after acknowledged admission. |
| Submit-time table copy and retry | Before Send there were five artifacts and no uploads. A proxy withheld one committed upload acknowledgement with 502. Retry used the identical upload identity; two attempts produced one additional artifact. Snapshot bytes are exactly `Name,Value\r\nAlpha,42`, with no trailing newline. |
| Context removal and rejection | Removing the CSV context chip produced ordinary feedback with `artifact_ids: []`. A forced 413 preserved editable text. Sending again admitted exactly one ordinary message. [Initial-build rejection](captures/native-rejected-feedback.png). |
| Original download | Native File actions opened the standard macOS Save dialog. The downloaded PDF is byte-identical: 1,426 bytes, SHA-256 `bd8ad044964a3c768841cbd774d9ef290ff9d844d99937902155401237f49c26`. [Hash receipt](native-download.json). |
| Native PDF product controls | Next changed page input to 2, zoom increased to 125%, Enter on page input returned to 1, and Fit restored width. Gallery cache diagnostics are absent from workspace mode. [Controls](captures/native-pdf-controls.png). |
| Compact context | Resizing through the native 768-point breakpoint replaces the side panel with a full-width native dialog. Library privacy remains visible; Working files exposes a retryable unavailable-folder state. [Library](native-compact-library.png), [folder error](native-compact-folder-error.png) captures precede the final attachment refinement. |
| Local attachment and multiline draft | A native file picker attached the local PDF without uploading it. Its native Focus preview retained the draft. The active local file appears once as its context chip; removing that context also removes its staged local attachment. Multiline composer height leaves the document reading viewport clear; Back retains exact text. [Focus draft](native-focus-multiline.png) precedes the final attachment refinement; [final local preview](native-local-pdf.png) shows compact attachment controls. |

[Native admission receipts](native-receipts.json) retain the lost-acknowledgement sequence; [final receipts](native-final-receipts.json) include ordinary feedback and reasoning configuration. Final synthetic counts are two agents, two threads, five messages, six artifacts and four runs (one synthetic settled preparation run and three queued feedback admissions). Local preview does not add an upload or artifact.

Native capture occasionally retained an older raster while accessibility had already advanced; the compact folder capture was refreshed after a native resize. Background-window captures also required foregrounding for the HTML body. Kept images show the observed final surface; this is not background-rendering or latency acceptance.

## Automated checks and reproduction

- `bun run check:desktop-rs`: dependency/rendering boundaries, formatting, strict all-target Clippy and **46/46 workspace tests passed** before the final context/attachment refinement. [Log](desktop-check.log). The final refinement passed strict all-target Clippy, a fresh bundle build and native local-preview/removal checks.
- `bun apps/desktop-rs/verification/nma-069/api-journeys.ts .dev/nma069-domain-final`: **5/5** real-domain cases passed: exact DM privacy, all five original hashes, explicit identical-byte sharing, skill publication/assignment/pin/rollback/disable and authoritative Goal/Routine controls.
- Biome checked the verification helpers and asset preparation script. `git diff --check` passed.
- Documentation validation retains the same **eight pre-existing broken links** in imported GPUI skill documentation; no new task-document link failure was introduced. [Log](docs-check.log).

For a new native fixture, run from the repository root:

```sh
bun apps/desktop-rs/verification/nma-069/journey-server.ts .dev/nma069-native
```

Use its private `attachment.json` in a separate desktop-rs profile. For the five domain cases, start another fixture with `--domain-only`, then pass the same directory to `api-journeys.ts`. Native fixtures include authenticated loopback-only `/_drop-next` and `/_reject-next` controls for the recorded transport/rejection cases. Do not attach a retained production profile to these disposable controls. Task-owned fixture servers and the isolated proof application were stopped after verification.

## Preserved limits

External ChatGPT/Muse login/callback/repair, new completed provider inference, real Composio authorization/account/grant execution and scheduled continuation were **not exercised**. Their native forms consume existing capability/revision/error states; no successful external outcome is inferred. The selected subscription never silently changes to API-key billing. Provider key entry remains masked and memory-only.

Lazy folder append/deduplication, refresh invalidation and icon precedence have state regression checks. The native ready-tree case is a small real directory, not a large-directory performance or full keyboard/accessibility matrix. Long source was opened; no latency budget is claimed. Full visual/interaction coverage in both themes, cross-platform distribution, fresh-device installation and production readiness retain their existing separate gates.

## Native tree presentation follow-up

The owner requested a Zed-inspired native tree refinement after this acceptance. [Its focused report](zed-tree/README.md) retains the exact upstream pin, native before/after captures, geometry measurements, per-folder pagination/retry and 600-entry virtual-list checks. The original evidence above retains its captured build and scope.

## Cleanup and local delivery — 2026-11-08

Command handlers in five contextual modules were expanded for readability. [Token comparison](cleanup-tokens.json) confirms unchanged token text/delimiter trees after normalizing optional trailing separators and punctuation whitespace; identifiers and literal values are unchanged. The prior native captures retain their own build hashes and were not relabeled as new native runs.

Fresh `bun run check:desktop-rs` passed rendering/dependency boundaries, formatting, strict all-target Clippy and **48/48 workspace tests**. [Full log](cleanup-check.log). Scoped [Biome](cleanup-biome.log), whitespace and staged-byte checks passed. The rebuilt development bundle matches its [cleanup delivery manifest](cleanup-build-manifest.json); [bundle log](cleanup-bundle.log).

[Cleanup inventory](cleanup-files.json) records 12 task-owned fixture/cache/proof-app/profile/download paths moved reversibly to a private macOS Trash directory. The default user profiles, development bundle, Cargo cache, unrelated Snapshot Proof app and retained evidence remain. This does not reclaim the Trash's allocated bytes or change installed-client/production acceptance. The [final documentation check](cleanup-docs.log) still reports only the eight imported GPUI skill links already recorded above.

The [evidence integrity manifest](evidence-integrity.json) freezes retained artifact hashes. Three captured Cargo logs keep their original trailing blank line; whitespace validation excludes only `blank-at-eof` for those hash-verified files and checks all other staged bytes normally.
