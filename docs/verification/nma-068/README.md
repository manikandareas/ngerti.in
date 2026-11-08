# NMA-068 native workspace delivery — 2026-11-08

The native workspace consumes the retained API and follows the Tauri workspace/conversation composition. The owner requested completion of NMA-066/067/068, visual/interaction parity with Tauri, and bounded verification. NMA-066/067 retain their accepted foundation/component scope. This pass implements the live workspace; full Settings/Focus/Library workflows, Computer hosting and integrated distribution retain NMA-069/070/071 ownership.

## Source and configuration

Base revision: `2d11861d3ecc133d7c32b8201ccaf14e5fdba48d`; the local delivery commit contains the implementation and scoped cleanup. Backend contract **1.31.0**, GPUI Kit **0.9.0**, GPUI Fast **0.1.13**, reqwest **0.12.28** and jsonschema **0.33.0** remain pinned. No backend route, model loop or billing authority changed. The [verification build manifest](verification-build-manifest.json) records the source/binary used for the native walkthrough. The [delivery build manifest](build-manifest.json) records the cleanup build separately. Knowledge-graph tools were unavailable; discovery used local source.

The product reference is the current web-client loaded by the Tauri bundle, including its workspace CSS, conversation list/identity, model picker and native-question components. `apps/gpui-experiment/src/app.rs` supplies the GPUI composition reference. The native app uses real projections, persisted avatar recipes and native controls rather than its fixture transcript. [Source adoption](../../development/source-adoption.md) records the provider artwork and adaptation.

## Delivered behavior

- Native frame, 280-unit conversation sidebar/search, agent/group identity and previews, loading skeletons, centered header pill, provider/model picker, compact composer, chronological bubbles, day/clocks, question/approval controls, contextual entry panels and in-place Settings. The CSS root scale is 16; geometry uses rem helpers.
- Separate bounded read/write workers with 16 MiB stacks; full contract equality and body-schema validation before writes; loopback-only credentials, no redirects/proxies, deadlines and 16 MiB limits. Bounded SSE wakeups coalesce at 40 ms; ordered log reads and atomic snapshots own applied cursors. Scope retirement and foreground reconciliation preserve authored input.
- An isolated private native profile retains selection, appearance, plain drafts, recipients, original staged bytes and exact pending operation bodies/keys. No projection cursor is persisted alone. Acknowledgement cleanup recovers after Quit. Non-replayable native answers require authoritative reconciliation.
- API admission/upload, creation/opener retry, queued edit/delete, native-turn-fenced steering, stop intent/confirmation, failed/unknown recovery and revision-bound interactions. Selected connection/model/billing are explicit. Reopening a conversation issues reads.
- Public publication parts own chronology. Group rows identify their agent, private handoffs stay hidden, historical/final text flushes immediately and current text uses an 80 ms fade. MessageScroller splices preserve logical anchors; composer-height changes remeasure the same list. Resolved questions collapse to their title and can be expanded.

## Focused executed evidence

| Case | Result and denominator |
| --- | --- |
| Pinned client state | **3/3** tests: every split UTF-8/CRLF boundary, event revision/overlap/delete/scope, and every exported HTTP schema compiling with native regex semantics. |
| Journal state | **2/2** tests: exact original body/key/bytes through restart and acknowledgement cleanup/profile lock; fresh upload identity after certain rejection. Same-owner ephemeral-port changes are accepted; another owner is rejected. |
| Native lost acknowledgement | Real API handlers/store on one disposable loopback owner, without a model executor. Two native admission attempts used one exact path/key/body and produced one message/run across store reopen and native Quit/relaunch. [Receipts](recovery-receipts.json). |
| Native creation | Two agent-creation attempts around a withheld committed acknowledgement retained one agent/conversation/opener. One group creation used the selected members. Opener retry retained the original input. [Receipts](recovery-receipts.json). |
| Queue/control | Native edit then delete produced the authoritative message revisions/tombstone; direct stop produced confirmed cancellation. Two confirmed cancellations and one same-input opener retry are retained. |
| Draft persistence | Native paste of `Draft NMA-068 😀 日本語 — unsent` survived full Quit/relaunch and retained selection. [Capture](captures/native-draft-relaunch.png). |
| Retained installation reopen | Before/after native DM/history reads: **3 agents, 170 runs, 346 messages**. No admission/inference was generated. [Counts](no-inference-reopen.json). |
| Actual inference/useful tool | One intentional native DM submission invoked `ngertiin.ask_user`; the native request received `Ready`, then the same agent replied. **1 answered request**, **2 succeeded runs** (initial plus continuation), **4 public messages**. The retained catalog contains one Codex connection and eight models; that discovery is distinct from this successful inference/tool journey. No Muse execution is counted. This proves the selected Codex subscription connection only. [Conversation](live-conversation.json). |
| Actual process/port recovery | Full Tauri Quit stopped its supervised Bun backend; relaunch used a different loopback port for the same retained owner. Native reconnect retained the unsent draft; **3 agents, 172 runs, 351 messages** remained unchanged, including private records. [Proof](process-reconnect.json), [offline](captures/native-backend-offline.png), [reconnected](captures/native-reconnected.png). |
| Native source checks | Formatting, strict affected-library Clippy and the development bundle build passed. |

The disposable [recovery server](../../../apps/desktop-rs/verification/nma-068/recovery-server.ts) uses the real server/store/API with a private loopback test proxy. A 502 replaces one successful committed response; it does not simulate packet corruption. Its store reopen and the separate full retained-backend process restart are distinct evidence. No fixture execution is counted as provider proof.

## Visual and verification limits

Retained captures compare actual native and Tauri data at the same host scale and window geometry. The same frame/sidebar/header/composer/bubble hierarchy is implemented; native text rasterization, motion frames and platform shadows are not a literal pixel-identity claim. The retained foundation/component evidence remains authoritative for its accepted gallery/content scope.

Verification stays bounded: there is no exhaustive native matrix for every approval variant, steering race, attachment fault, IME, reduced-motion/scroll combination or provider. Those bindings retain contract checks and unchanged backend authority; this report does not promote source checks to an exercised native journey. No new Muse inference, machine control, production SLO, fresh-device installation or active-host replacement is claimed.

Initial live iterations exposed and corrected a native-incompatible ECMAScript NUL regex escape, duplicate hover styles on compound buttons, missing SVG foregrounds, full resolved-question forms, and programmatic composer paste missing a draft-change event. Their fixes are in the delivered code; the native draft and live conversation cases above exercise the corrected paths.

Documentation validation reports only the same eight pre-existing broken relative links in the retained GPUI skill reference files. No changed product/backlog/evidence link error was reported; the unrelated imported reference files were preserved. `git diff --check` passed.

The final native group Detail AX tree exposed its tabs, but the capture/control service returned an unchanged image and rejected coordinate interactions for that attached window. `native-group-detail-capture-inconclusive.png` is excluded as visual Detail proof. Compact-window and the final neutral-tab visual rerun remain unexecuted in this bounded pass; existing foundation baselines and the implemented responsive/keyboard composition are retained.

## Pre-commit cleanup

Removed unused status-only state, gave command completion a named handler, retained subscriptions through an explicitly owned field, and retired avatar activity/cache entries with their views. The recovery helper and attachment/profile documentation were tidied. Request paths, durable identities, payloads and backend authority are unchanged. The five focused tests, strict library Clippy, formatting and the development bundle are checked again for the delivery commit; native/provider journeys retain the verification build above and are not relabeled as a new run.
