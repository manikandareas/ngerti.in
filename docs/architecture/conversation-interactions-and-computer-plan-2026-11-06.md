# Conversation interactions and Computer implementation plan

Date: 2026-11-06. Status: implementation plan based on the current conversation and repository inspection. The existing conversation redesign is the starting point. The new interaction, approval, failed-response retry and Computer changes below require their own backend, API and UI verification.

The delivery order is backend and harness integration, API verification, UI integration, then end-to-end acceptance. Ngertiin owns application lifecycle and user interaction records; Codex and Muse retain their model and tool loops. The web client remains the primary interface.

## Product decisions

| Area | Required behavior |
| --- | --- |
| Interaction ownership | Ngertiin provides the primary question and approval abstraction for DM and groups. A lack of native HITL support must not disable product interactions when the adapter supports product tools and continuation. |
| Ordinary text questions | Ask naturally in an assistant bubble. The next user message can answer, change direction or address another topic first. The agent interprets that intent through the normal conversation. There is no mandatory reply mode, separate answer form, keyword classifier or automatic assumption that any next message answers the pending question. |
| Questions with options | Use the shared compact inline card, explicit selection and explicit Continue or Submit. Preserve values across multiple questions and respect selection bounds. Free text remains available where the request permits it. |
| Approval | Use the same card shell with explicit Reject and Approve actions. Keep the left footer empty; omit the total, Alternatives and close action. A clearly intended user chat message can supply the same decision. Ambiguous messages require contextual clarification. |
| Approval authority | Store a structured decision tied to a request, action version and actual user input. Approval must be enforced at the affected operation. An agent can request approval but cannot grant it to itself. |
| New topics during approval | Follow the new conversation direction. A topic change alone does not approve, reject or cancel the pending action. |
| Reply feedback | After a confirmed response, retain the original inline card with its question only. Remove choices, details and actions; do not add a saved-answer card, green receipt or separate waiting bubble. Keep actionable information for uncertain delivery, errors and recovery. |
| Composer | While work is active, an empty composer shows Stop; dirty input shows the Send arrow. Typing does not stop or submit anything. Ordinary messages retain existing queue and contextual steering behavior. Multiple active runs require an explicit stop target. |
| Message actions | Copy is available for assistant and user messages. Retry appears only for a known failure, through the neutral hover action. The action remains reachable when the pointer travels from the bubble; keyboard and touch remain supported. |
| Retry semantics | Successful messages have no Retry. Retry of a selected responder failure retains that responder. Repeat routing only when responder selection itself failed. Preserve other agents' successful results. |
| Retry presentation | Once a retry is admitted, replace the related failed response in the visible conversation with agent activity. Keep durable attempt history and receipts. A failed admission must leave a usable failure/recovery state. |
| Editing | Edit only messages that have not been processed, including the existing queue flow. Corrections after processing use a new message. Editing does not undo an external action. |
| Files | Reuse neutral rounded chips with file-type SVG icons and existing preview/open behavior. Avoid purple file backgrounds. |
| Research | Show recorded source links as domain chips and a compact source count/list associated with the assistant answer. Preserve attribution to the correct run/attempt. |
| Computer preparation | Show one compact assistant-side Computer card while the machine/viewer is being prepared. Preparation does not mean provisioning another machine per run. |
| Computer active | The same activity becomes a card with a real live desktop preview. The Computer side panel also shows live preview directly. |
| Computer finished | Keep a compact Computer card with the same shell. Do not retain a historical screenshot, video thumbnail or live viewer in the completed activity. |
| Computer continuity | Keep preview lifecycle independent of transient cards and panels, renew access smoothly and recover automatically. Connection recovery does not restart the machine, repeat agent work or silently acquire input control. |
| Existing activity UX | Preserve agent attribution, loading state, shimmer, concise English activity copy, stable per-run variants and bounded streaming interpolation. Group assistant messages and cards always have an adjacent agent avatar; DM message rows omit it. Render interaction mentions through the shared inline-reference renderer. Keep normal handoff bars hidden while retaining journal evidence. |

The earlier remaining-feature list is narrowed by these decisions: general regeneration of successful responses and editing processed messages are outside this delivery. Automatic claim-level citation generation is a separate possible extension; source-chip and source-list fidelity remain in this delivery.

## Current baseline

| Area | Observed state | Planned treatment |
| --- | --- | --- |
| Conversation presentation | Shared interaction card, hover actions, Stop/Send behavior, neutral file icons/chips, source chips/counts and successful-receipt suppression exist in the working tree. | Reuse and align with the later product decisions. |
| Text composer binding | `composer-requests.tsx` and `workspace-layout.tsx` currently make a pending text request own the composer and send to its reply endpoint. | Replace this mandatory binding with normal message intake and contextual interpretation. Preserve durable command recovery independently. |
| Product HITL | `group_ask_user` creates a durable `HumanRequest`, puts the group task into a waiting state and resumes through a later run. | Generalize the existing lifecycle to DM/group-neutral interactions. |
| Product approval | Requests contain purpose/question; responses contain revision/text. Approve and Reject currently send text. | Add structured decisions and protected-action enforcement. |
| Native HITL | Muse has native interaction mapping and a journal. The current Codex adapter advertises native permission requests as unsupported, while product tools are supported. | Make native interaction support an adapter concern, separate from product feature availability. The current adapter flag does not establish absence in the upstream protocol. |
| Retry | Preparation, rejected routing and opening recovery endpoints exist. No general failed-response retry interface is implemented. | Add a failure-only retry lifecycle with original-input lineage and effect reconciliation. |
| Edit | Server editing requires a queued run with pending delivery. | Preserve this restriction and expose actions only when allowed. |
| Machine | A retained shared local Cua desktop, viewer gateway, process/file access and explicit human takeover exist. | Reuse the current machine and control infrastructure. |
| Viewer | Each `MachineScreen` mount issues a ticket. Renewal clears the visible viewer; recovery is manually exposed. The panel opens a dialog rather than directly rendering a preview. | Introduce coordinated preview ownership, observable health and automatic recovery. |
| Computer activity | No durable per-message Computer lifecycle/card exists. | Add scoped activity facts and consume them in the conversation. |
| Research sources | Recorded run URLs are deduplicated; matching Markdown links become domain chips. Automatic claim-range attribution is absent. | Keep accurate recorded-link rendering and verify attempt ownership. |

The source contract is currently `1.30.0`; the server pins Cua SDK `0.10.1` and Muse SDK `1.4.14`. The shared-machine evidence records spacesd `0.8.0` for the pinned image. Recheck the exact tuple before implementation or a dependency upgrade.

The [5 November UI report](../verification/conversation-redesign-2026-11-05/README.md) records its own historical build, browser and fixture results. Those results do not prove the new backend and streaming behavior in this plan. NMA-060 is currently Done for its accepted scope; new contract changes require verification before UI consumption.

## Target module responsibilities

| Module | Small interface and owned behavior |
| --- | --- |
| Interaction module | Create, observe and resolve scoped requests; preserve lifecycle, revisions, user provenance, decisions, continuation ownership and public projections. |
| Product tool adapters | Expose Ngertiin interaction tools to Codex/Muse using their existing structured tool paths. |
| Native interaction adapters | Normalize native requests and deliver valid decisions back through the native protocol. Preserve native identities, offered choices, deadlines and acknowledgement states. |
| Protected operation execution | Validate approval requirements, exact action version, current scope and effect receipts before dispatch. |
| Failure retry module | Admit one allowed retry, retain the failed responder/input lineage and reconcile effects before subsequent execution. |
| Computer preview module | Coordinate viewer consumers, access renewal, connection health, recovery and cleanup independently of component mounts. |
| Computer activity projection | Publish attributed preparation/active/completed/failed facts anchored to the relevant conversation activity. |
| Web presentation | Render authoritative projections through shared conversation components and the Computer panel. |

One public interaction projection can include app-originated and native-originated requests. Native delivery acknowledgement and action execution outcome remain distinct from the user's decision. A recorded approval must not be displayed or treated as proof that the action completed.

## Delivery order

The numbered steps are work packages, not newly created milestone records. Execute them in order. Verification within each backend step is required before advancing; step 09 is the aggregate gate before new UI behavior consumes the contracts.

| Step | Deliverable | Prerequisite |
| --- | --- | --- |
| 00 | Scope, baseline and acceptance map | This plan |
| 01 | Shared interaction domain and persistence | 00 |
| 02 | DM/group product interaction tools | 01 |
| 03 | Natural message interpretation and continuation | 02 |
| 04 | Structured approval and operation enforcement | 03 |
| 05 | Harness integration and native compatibility | 04 |
| 06 | Failure-only retry and pre-processing edit rules | 05 |
| 07 | Computer preview transport and session lifecycle | 06 |
| 08 | Attributed Computer activity events | 07 |
| 09 | Contract publication and backend/API gate | 08 |
| 10 | Conversation UI integration | 09 |
| 11 | Live Computer card and panel | 10 |
| 12 | File, source and activity presentation alignment | 11 |
| 13 | Studio and integrated browser/native acceptance | 12 |
| 14 | Cutover, cleanup and delivery evidence | 13 |

### Step 00 Establish the baseline and acceptance map

Record the working-tree responsibility paths and preserve unrelated changes. Map the product decisions above to current behavior, required changes and test cases. Recheck the active local product scope, exact prerequisite status, current exported contract and the installed/tested harness and Cua versions.

Reuse the approved draft and existing production components as visual references. Keep the earlier verification report immutable as historical evidence. Capture baseline timings and connection behavior before changing the preview lifecycle.

For adopted logic, inspect the exact Openbot flow/revision referenced by the active source guidance before reuse. For harness/viewer adaptations, record upstream file/revision, pinned dependency, local change and upgrade procedure. Available upstream features do not automatically expand this delivery's scope.

**Output:** a bounded change inventory, dependency map, baseline versions and verification scenarios. Work on a scoped checkout/worktree if isolation is useful; do not reset unrelated development records or silently change connection billing.

**Completion:** every requested surface has an owner and an acceptance case; older suggestions for successful-response regeneration, processed-message editing and historical Computer images are excluded.

### Step 01 Introduce a shared interaction domain

Generalize `HumanRequest` into a DM/group-neutral interaction module, reusing persistence, transactions, event publication and source-run attribution. Separate request identity, user response/decision, protected action and dispatch outcome. Define the transition table for pending, resolved, cancelled and superseded requests, including how deferred questions remain contextual without blocking new topics.

Include request kind, presentation data, option IDs and selection bounds where applicable, thread/agent/run ownership, source message, revision and optional native correlation. Approval requests additionally bind to a specific action and version. Keep opaque protocol fields in adapter data and expose only safe presentation fields.

Define the small module interface before changing callers: creating a request, reading its projection, resolving it from an authorized user source and reconciling its lifecycle. Exact names and schema shapes are implementation choices to settle here; all new backend names and authored runtime text remain English.

**Main paths:** `apps/server/src/groups/{contracts,service}.ts`, a new scoped interaction module under `apps/server/src/`, domain contract exports and store/events integration.

**Completion:** domain tests cover DM and group scope, invalid transitions, stale revisions, cancellation, replay and restart. A user decision, native acknowledgement and completed action cannot be confused in the public contract.

### Step 02 Expose product interactions through both harnesses

Provide generic product tools such as `ngertiin.ask_user` and `ngertiin.request_approval` through the existing Codex dynamic-tool and Muse MCP paths. These names are proposed. Reuse the current catalog, authentication, per-run tool lease and idempotent command machinery.

Structured option requests create durable app records and return promptly. An application task can wait for a user without keeping a synchronous tool HTTP call open indefinitely. Preserve the existing separation between native turn completion and later application continuation. An ordinary text question can be published conversationally without taking ownership of the composer or introducing a mandatory blocking request.

A temporary question or wait does not itself require creating a Goal. Preserve the existing responsibility-capture policy.

Move group-only assumptions out of interaction creation. Preserve existing group task and handoff ownership. Replace or narrowly adapt `group_ask_user` during cutover rather than maintaining two independently evolving product implementations.

**Main paths:** `harness/product-tool-contracts.ts`, `harness/tools.ts`, `groups/tools.ts`, `harness/codex/client.ts`, `harness/muse/tools.ts`.

**Completion:** integration cases prove request creation from Codex and Muse tool bridges for both DM and groups, including a connection with native permission requests unavailable. Replayed tool calls do not create duplicate cards or continuations.

### Step 03 Preserve natural conversation and one continuation owner

Keep incoming user text on the ordinary message path. Supply relevant pending questions/approvals as scoped context to the existing agent/harness turn. The agent interprets whether the message answers, changes topic, defers a question, rejects a proposal or expresses approval. Do not add a deterministic word-matching rule or a separate classifier/model loop.

Define structured resolution commands that refer to the actual stored human message and the intended request. The backend validates author, ownership, chronology, request revision and applicability. Agent-authored text, quoted content or a fabricated human-message reference cannot become user authorization.

Settle the continuation transition table for two cases: a reply after the source native turn has yielded, and a user message already being handled by an active conversation turn. Reuse that turn where it owns the continuation; do not admit an additional duplicate response. Preserve ordinary group routing, queue and steering semantics without automatically attaching a new topic to an old Goal or pending task.

Examples to prove:

- Agent asks for a report format; the user answers with a format and the work continues.
- The user asks to inspect the underlying data first; the agent follows that direction without treating it as a format selection.
- The user starts another topic while an approval is pending; the pending action gains no approval or rejection from that fact alone.
- Two pending requests make a short answer ambiguous; the agent clarifies the intended request.

**Main paths:** message admission/routing, `groups/service.ts`, lifecycle/task continuation, `harness/instructions.ts`, interaction module.

**Completion:** every interpretation is traceable to a real user message and one scoped request where needed. Restart, late messages and duplicate events produce at most one intended continuation; normal questions do not trap the composer.

### Step 04 Enforce structured approval on the protected action

Persist approval decisions with the request/action version and the originating button command or user message. For chat-based approval, use the interpretation from step 03 and retain its user provenance. The backend commits a decision only when its target and scope remain valid.

Bind approval to the reviewed content and target: for example, a specific email draft revision and recipient. Revalidate current grants/capabilities before final dispatch. A changed payload, different target or superseded request cannot reuse the old decision.

Enforce the requirement in the affected product operation, rather than relying on the agent's instruction to stop. A rejected request blocks that action while allowing unrelated work to continue. Add no blanket rule requiring approval for every product tool.

Use stable operation identities and receipts so a lost acknowledgement does not repeat an approved action. Reconcile unknown external outcomes before retry. Cancellation and restart preserve the distinction between a historical decision and current execution authority.

**Main paths:** interaction module, product-tool authorization/dispatch, `integrations/`, `machines/` and other operations that participate in a requested approval.

**Completion:** tests prove no protected dispatch while pending/rejected, valid button/chat approval, rejection of stale action versions and wrong-user/thread references, and one external effect under duplicate or lost acknowledgements. A decision is not evidence of action success.

### Step 05 Integrate the shared abstraction with native harness requests

Make app interaction availability depend on the verified product-tool/continuation contract, independently of native permission-request support. Keep unsupported and unknown capability states accurate. The current Codex adapter's native flag must not hide app questions or approvals.

Prefer Ngertiin tools for product questions and approvals in both harnesses. Adjust tool catalogs and instructions where they currently direct equivalent questions to native-only tools. Keep the harness in charge of its inner loop.

Normalize unavoidable native requests into the same public interaction projection. Adapter logic retains native request/turn/requirement IDs, exact offered choices, deadlines and native delivery state. Respond through the actual native protocol and reconcile changed/settled requests. Do not invent native permissions, auto-approve to obtain visual consistency, or carry an old native grant onto a new request after restart.

Correlate duplicate observations by stable identities and ownership rather than similar question text. Keep the native journal/receipt detail needed for recovery while retiring the separate user-facing interaction orchestration.

**Main paths:** `harness/{broker,interaction-contracts}.ts`, interaction journal, `harness/muse/{interactions,protocol,client}.ts`, `harness/codex/client.ts`.

**Completion:** product interactions work when native HITL is unsupported; supported native requests use the same presentation contract and receive valid protocol responses. Stale native choices, revoked scope and late acknowledgements remain fenced. Record protocol-fixture and native-provider results separately.

### Step 06 Add failure-only retry and preserve edit eligibility

Define retry as recovery of a known failure. Do not add regeneration for successful responses. Separate a user message that was not accepted from an accepted user message whose agent response failed.

For an unaccepted send, reuse the exact durable submission/idempotency identity. For a failed agent response, admit one retry attempt linked to the original input and failed responder/task. Preserve attachments, valid prior results and the selected responder. Retry routing only when selection itself failed. Do not republish the original user prompt as a second message.

Check grants, cancellation and action receipts before admission/dispatch. A retry must not repeat confirmed effects or blindly redispatch an unknown result. A network timeout alone does not establish a retryable failure; return an explicit status-check/reconciliation path.

Expose authoritative retry eligibility, target and attempt lineage to the UI. Preserve failed content/journal records internally so the visible response can be replaced without deleting history. Keep replaying the same retry command idempotent under lost acknowledgements and concurrent clicks.

Retain the current queued/pending-delivery editing restrictions. A processed user message must not acquire an Edit or Retry action merely because a related assistant response failed.

**Main paths:** `lifecycle.ts`, `run-controls.ts`, run/group contracts and routes, run preparation/recovery, scoped message submission.

**Completion:** send-failure replay produces one user message; response retry produces one linked attempt; other agents' results remain intact; successful and unknown-outcome cases cannot use failure retry. Queue edits still reject delivered/processed or stale messages.

### Step 07 Prove and implement the Computer preview session lifecycle

First inspect the pinned Cua HTML5 viewer/media source and reproduce the current connection lifecycle. Verify readiness/health signaling, ticket replacement, reconnect behavior, codec support and whether one decoded stream can feed both surfaces. Prefer upstream streaming/decoder behavior over a new low-level media implementation.

Implement the backend/session contract and use protocol or headless viewer consumers at this step. Wire the production app-level preview coordinator and visual surfaces in step 11, after the API gate.

The exact media-sharing mechanism is an engineering proof, not an assumed SDK capability. If one shared decoded stream is supported, render it through multiple consumers. Otherwise use coordinated, separately scoped viewer sessions for the same machine. Never share a ticket whose revocation by one component tears down another consumer.

Introduce application-owned preview coordination keyed to machine generation and viewing/control scope. Separate viewer consumers, valid access credentials, media health and input ownership. Renew bounded tickets before expiry; prepare a replacement and switch after readiness when the current scope remains valid. Do not extend expired or revoked authority merely to avoid a visual interruption.

Recover transient media/network failures automatically with bounded retry/backoff and respond to online/visibility changes. Monitor actual stream/decoder readiness and upstream health; an idle desktop that sends no changed frames is not automatically a failed connection. Preserve UI location across tab visibility changes and resume viewing automatically when appropriate.

Keep a preview session ready while the app is open and Computer is active. Reduce or pause unnecessary video processing when no preview is visible using verified upstream capabilities. Browser suspension may require recovery on return; it must not close the user's Computer UI or restart the machine/task.

Connection recovery remains separate from human takeover. Keep current input lease/revision checks and revoke stale interactive media. Do not silently reacquire control after another owner or an uncertain lease has taken over.

**Main paths:** `machines/{view,service,cua}.ts`, `api/machines.ts`, client machine types and a new preview coordination module. Keep `@trycua/cua`/image versions pinned unless an identified compatibility change is required and reverified.

**Completion:** machine identity survives viewer recovery; two consumers can coexist; removing either consumer leaves the other working; ticket rollover avoids the deliberate full-screen reset; network/visibility recovery does not repeat work or steal control. Record connection/first-frame/recovery latency and resource usage before and after; claims must match the measured cohort.

### Step 08 Publish attributed Computer activity

Add bounded structured activity facts for Computer preparation, active use, completion, cancellation and failure. Anchor them to the appropriate thread/message, agent, run and shared machine generation. Retain enough event identity for replay without storing historical screen images.

Derive activity from observed machine/browser/GUI work rather than prose or the mere fact that the machine is globally ready. Preserve the distinction between foreground ownership, waiting for control, background work and human control. The live card must not imply that the attributed agent controls another agent's or the human's foreground activity.

Preparation ensures the retained machine and viewer are ready; it does not create another desktop per conversation/run. Completing the activity ends that message's live consumer, while the shared machine and any other active panel/consumer remain available.

**Main paths:** `machines/` operation/ownership observations, `runs/activity.ts`, conversation-part contracts/materialization/events and client types.

**Completion:** replay/reload reconstructs preparing/active/completed bubbles; completed history creates no viewer session or screenshot. Two agents resolve to the same machine without claiming simultaneous foreground input. Existing task-owned-window cleanup and preserved files/profiles retain their established behavior.

### Step 09 Publish and verify the backend and API delta

Export the implemented schemas, errors, capability projections, activity facts and retry/interaction commands through the existing contract/OpenAPI machinery. Choose the next contract version from the actual repository state at implementation time; `1.30.0` is this plan's inspected baseline.

Use HTTP/event consumers and harness clients before new UI consumption. Verify request/decision/action distinctions, ordinary message intake, one continuation owner, retry eligibility, viewer health/recovery and replay under restart. Prove useful app interaction round trips through both required harnesses, including the native-HITL-unavailable product path. Preserve the configured authentication/billing source.

Record native Computer transport proof across credential renewal, connection loss, retained-machine restart and revoked control. The existing native/manual reconnect test is a starting point; it does not establish seamless automatic recovery.

**Main paths:** `contracts.ts`, `api-contract.ts`, `api.ts`, domain routes, `apps/server/tests/`, contract snapshots and focused verification scripts.

**Completion:** focused domain/protocol/HTTP/recovery checks pass, the changed API surfaces have examples, and unresolved native outcomes are explicitly bounded. Reverify any later API change before its UI consumer. Keep NMA-060's historical acceptance and the new delta evidence separately traceable.

### Step 10 Integrate the conversation UI

Make the web client consume the canonical interaction projection rather than separately owning product and native workflows. Reuse `InteractionCard` for options and approvals, along with the current agent identity and transcript anchoring.

Remove the mandatory composer-request ownership behavior for ordinary text questions. Keep one composer and normal message sending, with agent interpretation from step 03. Preserve local drafts, attachments and durable command replay without adding a reply/new-message mode or a native input limit to every product message.

Keep cards compact, assistant-side and inline. Remove close actions and overlays. Options require explicit submission; approval actions are clear and right-aligned with an empty left footer. Native scope/choice meaning must remain accurate when labels differ. Confirmed submissions continue the conversation without saved-answer or green success receipts; uncertain outcomes retain status checking.

Preserve Stop/Send behavior in DM and group, including explicit selection for multiple active runs. Keep ordinary queue/steer behavior and distinguish requested Stop from confirmed Stop.

Wire neutral hover Retry only to authoritative known-failure eligibility. A successful user message has no Retry even if its assistant response failed. After retry admission, the failed assistant response is replaced in the visible projection by attributed agent activity; restore an actionable failure state if admission fails. Keep durable history, pointer reachability, focus access and touch behavior.

**Main paths:** `workspace-layout.tsx`, `human-reply.tsx`, `native-interactions.tsx`, `interaction-card.tsx`, `message-actions.tsx`, `composer-requests.tsx`, transcript and activity helpers.

**Completion:** actual browser tests exercise related answers, topic changes, button/chat approval, options, success/unknown states, failed-send versus failed-response retry, Stop/Send and reload. No completed-message retry or processed-message edit appears.

### Step 11 Add the live Computer card and side panel

Use the step 08 activity identity to preserve one attributed Computer card: preparation, active live preview, then compact completed card. Use the same lifecycle for failed/cancelled activity with appropriate status and allowed recovery. Completed activity has no image or mounted media viewer.

Render the current live desktop directly in the Computer side panel. Retain an optional larger viewer and explicit takeover/handback controls. Opening the panel from a live activity refers to the same retained machine and connection state.

Connect both surfaces through the preview coordinator. Closing a panel or completing a card releases only that consumer. Keep stable geometry while connecting/recovering, show Live only when the stream is healthy, and show a compact reconnecting state during an actual interruption. Preserve read-only viewing until explicit takeover.

**Main paths:** `machine-section.tsx`, `machine-viewer.tsx`, `context-panel.tsx`, a Computer activity renderer and app-level preview coordination.

**Completion:** active card and panel both display actual live activity, remain consistent across open/close and thread navigation, recover automatically, and end in a compact historical bubble. Desktop/mobile and reduced-motion behavior retain usable controls and layout.

### Step 12 Align files, sources and existing activity presentation

Reuse the current file-type SVG, attachment and file-action chips. Check user/assistant bubble contrast, long filenames, inline spacing, preview/open behavior, uploads, removals and recoverable failures. Keep file backgrounds neutral and file access scoped.

Keep known source links as domain chips and the compact source count/list with the relevant assistant answer. Check duplicates, invalid URLs, partial/streaming answers, pagination and the original-versus-retried attempt association. Do not invent inline citations for statements without a recorded source association.

Preserve concise attributed activity, avatar loading state, bounded text streaming and hidden normal handoff bars. Keep internal prompts, raw execution output and IDs out of ordinary activity copy.

**Main paths:** `attachment-chip.tsx`, `file-action-chip.tsx`, `file-type-icon.tsx`, `inline-references.tsx`, `research-sources.tsx`, `answer.tsx`, activity/streaming helpers.

**Completion:** file/source actions work through the real app routes; references remain accurate after retry/reload; no purple file styling, duplicated source footer or internal activity disclosure is introduced.

### Step 13 Synchronize Studio and prove integrated journeys

Update Assistant Studio to reuse the final production components and projections. Include app questions/options/approval, natural text/topic changes, failure-only Retry, Stop/Send, files, sources and the Computer preparation/active/completed/recovery states. Clearly label local simulation; the Studio itself does not dispatch real actions.

Run actual application journeys through the verified backend. Maintain one reference thread per required harness for a traceable sequence: ordinary message, natural question, related answer, topic change, option question, approval by button/chat, file/source output, known failure and Retry, active Computer preview, completed compact Computer bubble and reload.

Add focused cases for multiple pending requests, stale decisions, duplicate submissions, disconnect/restart, failed routing versus selected-agent failure, two preview consumers, takeover/handback and hidden-tab return. Keep safe bounded fixture operations separate from actual provider and machine evidence.

Use a fixture outbox for email examples and a dedicated local machine directory for actual native effect checks.

Capture before selection, selected-but-not-submitted, submitting, continued-without-receipt, failure-hover, retry-activity and completed states. Scroll each target into view before capture and inspect the screenshot itself. Record the actual setup, pinned versions, case denominator, pass/fail/skip, unknown outcomes and test-data cleanup.

**Main paths:** `features/assistant-studio/`, conversation/work/machine Playwright suites and focused native verification scripts.

**Completion:** browser interactions, backend records and native effects agree. Both required harnesses have appropriately scoped evidence. Build/static checks or Studio screenshots alone cannot close live Computer/provider acceptance.

### Step 14 Complete cutover and retain delivery evidence

Remove superseded product/native UI orchestration, composer ownership logic and redundant interaction paths once all callers use the shared abstraction. Retain protocol receipts needed for recovery. Update catalog copy, API examples, architecture notes and verification documentation around the final implementation.

Keep the standalone HTML draft and earlier reports clearly historical. Preserve unrelated working-tree changes. Classify each responsibility slice explicitly if a later commit is requested; this plan does not request a commit, push, deployment, installer or data reset.

**Completion:** one product interaction implementation serves DM/group; native protocol differences stay in adapters; one coordinated Computer viewing lifecycle serves its consumers; every in-scope decision has passing evidence or an explicitly open acceptance condition.

## Acceptance scenarios

| ID | Scenario | Required result | First proof |
| --- | --- | --- | --- |
| A01 | Product question with native HITL unavailable | Product feature remains available through the supported tool path. | Backend/adapters |
| A02 | Structured choices in DM and group | Same contract and selection rules; one persisted response/continuation. | Backend then browser |
| A03 | Related reply to an ordinary question | Agent follows context through the normal composer. | Harness then browser |
| A04 | New topic instead of an answer | New topic is handled; old request gets no automatic decision. | Harness then browser |
| A05 | Explicit approval by button or clear chat | Same validated request/action decision with real user provenance. | Backend then harness/browser |
| A06 | Ambiguous approval or multiple pending requests | Clarification; no unrelated action receives authorization. | Backend/harness |
| A07 | Rejection, changed draft or changed recipient | Rejected/stale approval cannot dispatch the affected action. | Backend |
| A08 | Lost approval acknowledgement and restart | Reconciliation/dedup; no duplicate external effect. | Backend/native |
| A09 | Native request changes or is resolved elsewhere | Stale choice is rejected; public state reconciles. | Protocol/native |
| A10 | User send was not accepted | Exact submission retry; one visible accepted user message. | HTTP/browser |
| A11 | Accepted prompt but agent response failed | Retry only on the failed response/activity; same responder/input lineage. | HTTP/harness/browser |
| A12 | Routing failed before selecting a responder | Retry routing on the original message; no duplicate admission. | HTTP/browser |
| A13 | Successful, cancelled or uncertain outcome | Retry only for an explicitly retryable failure; uncertainty uses status checking. | Domain/browser |
| A14 | Queued versus processed edit | Only eligible pre-processing edits succeed; no implied undo. | HTTP/browser |
| A15 | Active run and empty/dirty composer | Stop and Send switch correctly without typing causing a mutation. | Browser |
| A16 | Pointer leaves bubble for actions | Neutral actions remain reachable; keyboard/touch work. | Browser |
| A17 | Computer preparing, active, completed and reload | Consistent Computer cards for connecting, active live video and completed history, with no historical viewer/image. | Events/native/browser |
| A18 | Card and side panel both viewing | Same machine/current desktop; independent consumer cleanup. | Native/browser |
| A19 | Viewer credential rollover during a long session | No deliberate blank reset or lost control-state validation. | Native/browser |
| A20 | Network loss and restoration | Automatic honest reconnect; no machine/task restart or effect replay. | Native/browser |
| A21 | Hidden tab, panel close, thread switch and return | UI location and shared session policy recover coherently; no leaked viewers. | Browser/native |
| A22 | Human takeover and control revision changes | Explicit ownership; old interactive streams cannot keep injecting input. | Native/HTTP/browser |
| A23 | Idle screen without changed frames | Healthy idle stream is not falsely classified as disconnected. | Native/browser |
| A24 | File/source output after retry and pagination | Correct artifact/source ownership, neutral chips and working open actions. | HTTP/browser |
| A25 | Confirmed reply and successful handoff | No saved-answer receipt or permanent normal handoff bar; evidence persists. | HTTP/browser |
| A26 | Same-thread reference journey on both harnesses | Traceable backend/UI results with separate fixture/native proof boundaries. | Harness/browser |

## Verification commands and evidence

Use focused tests during each step. At the API gate and final integration gate, run the relevant wider checks; repeat them only for subsequent changes or unresolved failures.

```sh
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun run lint:web-client
bun run build:web-client
```

Run the appropriate suites from `apps/web-client` after their fixtures/assertions have been updated for the new contracts:

```sh
bunx playwright test --config playwright.conversation.config.ts
bunx playwright test --config playwright.work.config.ts
bunx playwright test --config playwright.machine.config.ts
```

The machine suite and native harness checks require their documented local services and configured accounts. Use the existing verification setup; do not substitute fixture success for unavailable native evidence or silently change billing. Preserve exact failure/skip/unknown records.

Store new evidence under a dated directory following `docs/verification/`. Include case/results manifests, source/config versions, relevant API/receipt observations, screenshots and hashes. Keep test credentials, personal desktops and private conversations out of shared artifacts.

## Deferred work and engineering proofs

- Automatic claim-level citation attribution needs a source-to-claim contract if it is later selected; this delivery keeps recorded source-link rendering accurate.
- Editing processed messages, successful-response regeneration, conversation branching, historical Computer media and recording are outside this delivery.
- Additional harnesses, remote/VPS enrollment, multiple machines, installer changes and native-client expansion retain their existing scope decisions.
- The exact mechanism for sharing decoded Cua media, credential replacement and stream health signaling must be closed in step 07 against the pinned implementation. Product behavior is settled; upstream compatibility is an engineering proof.
- The exact continuation ownership transitions for natural replies versus new topics must be closed in steps 01–03 and tested at the API gate. Do not solve them by reviving a mandatory composer mode or a deterministic intent classifier.

## References

### Current product and readiness documents

- [Ngertiin Multi Agent](../README.md)
- [Product scope](../../PRODUCT.md)
- [Runtime architecture](overview.md)
- [Feature decisions](../product/feature-decisions.md)
- [NMA-060 API readiness gate](../backlog/NMA-060.md)
- [Frontend map](../product/interface.md)
- [Acceptance](../development/acceptance.md)

### Repository implementation and evidence

- [Conversation redesign and screenshots](../verification/conversation-redesign-2026-11-05/README.md)
- [Shared-machine architecture](shared-machine-cua-plan-2026-11-04.md)
- [Shared-machine verification](../verification/shared-machine/README.md)
- [Group request contracts](../../apps/server/src/groups/contracts.ts)
- [Group request and continuation lifecycle](../../apps/server/src/groups/service.ts)
- [Product tool catalog](../../apps/server/src/harness/product-tool-contracts.ts)
- [Shared ACP adapter](../../apps/server/src/harness/acp/adapter.ts)
- [Muse native interaction mapping](../../apps/server/src/harness/muse/interactions.ts)
- [Current message edit eligibility](../../apps/server/src/run-controls.ts)
- [Machine viewer gateway](../../apps/server/src/machines/view.ts)
- [Current viewer component](../../apps/web-client/src/features/conversation/components/machine-viewer.tsx)
- [Current Computer panel](../../apps/web-client/src/features/conversation/components/machine-section.tsx)
- [Current composer request binding](../../apps/web-client/src/features/conversation/lib/composer-requests.tsx)
- [Current conversation composition](../../apps/web-client/src/app/workspace-layout.tsx)
- [Current source presentation](../../apps/web-client/src/features/conversation/components/research-sources.tsx)

### Native protocol and streaming references

- [Codex App Server approvals](https://learn.chatgpt.com/docs/app-server#approvals)
- [Muse approval protocol](https://meta-models.github.io/muse-code-sdk/next/guides/msp-concepts/approvals/)
- [Cua desktop streaming](https://cua.ai/docs/spaces/guides/stream-a-desktop)

Latest user decisions in the current conversation govern the interaction and UI changes above. Older documents and verification captures retain the scope/date under which they were written.

## Working-tree implementation — 2026-11-06

The shared product-interaction service, typed protected-action decisions, failure-only response retry, natural composer flow, attributed live Computer activity, stable viewer renewal and the updated UI are implemented under contract 1.31.0. See the [implementation report, screenshots, test results and remaining proof boundaries](../verification/conversation-implementation-2026-11-06/README.md). This is a local working-tree delivery; no additional milestone or production/package acceptance is implied. Separate viewer grants were selected for simultaneous surfaces, with in-place gateway credential renewal; no shared decoder capability is assumed.


## Studio and Computer presentation refinement

The latest user direction replaces Computer preparation/completed bubbles with the same card shell, removes the preview mode/status footer and manual reconnect button, and hides upstream controls on compact previews. Studio presents application-owned questions and decisions without separate native-question/approval/history categories. Native permission delivery remains an adapter responsibility. [Updated screenshots and verification](../verification/conversation-implementation-2026-11-06/ui-refinement/README.md).

The next presentation update removes Open Computer from connecting/completed cards, models custom answers as selectable editable options, and exposes approval details directly in a bounded scroll area with edge shadows. It preserves contract 1.31.0 and native/application decision semantics. [Follow-up evidence](../verification/conversation-implementation-2026-11-06/interaction-ui-refinement/README.md).
