# Conversation control and recovery API v1.12.0

Planned November 12 amendment: [the server-organizations plan](server-organizations-plan-2026-11-12.md) and NMA-072–083 define PostgreSQL, authenticated organization/user scope, private Team-agent interactions and explicit connections. This guide retains its current/recorded implementation boundary until the new NMA-079 API gate verifies the changed contract; its owner-only examples do not establish multi-user authorization.

NMA-053 uses the existing application authority, SQLite event/receipt store and native adapters. The [agent/conversation API](agent-conversation-api.md) remains the identity/history foundation. Application contract **1.12.0** replaces the original deterministic cancellation recognizer with agent-selected structured tools, following the user's decision on 2026-10-31. Broker contract remains **1.5.0**. The original milestone changed backend/API behavior. NMA-060 is now Done for its accepted scope; [the local backlog](../backlog/README.md) tracks later UI and distribution gates.

## Ordinary input, steering and cancellation

`POST /v1/runs` requires installation authentication plus a UUID `Idempotency-Key`. Every new user text, including cancellation wording, is persisted unchanged as a message and ordinary FIFO queued run with `control: null`. The server does not classify natural language or choose a cancellation target from text. Earlier command keys still return their original historical receipts, which can contain the former conversational control response; those receipts are not rewritten.

When the agent is working, use `POST /v1/runs/:id/steer` to send a correction to the active native turn. The native agent interprets the full conversation and steering context, then chooses a scoped product tool. Steering is delivery of input, not confirmed interpretation or cancellation. Processing can wait for native tool execution, and an unavailable steer capability is not silently bypassed. Ordinary messages keep their FIFO behavior; no second model classifier or mandatory approval is introduced.

| Structured tool | Input | Effect |
| --- | --- | --- |
| `ngertiin.cancel_run` | `command_id` UUID | Request stop of the calling run selected from its server-issued lease. There is no caller-supplied target ID. Goal and Routine remain active. |
| `ngertiin.control_goal` | `command_id`, `goal_id`, `expected_revision`, `state` | Existing scoped active/paused/stopped responsibility control; pause/stop invalidates linked continuation work. |
| `ngertiin.control_routine` | `command_id`, `routine_id`, `expected_revision`, `state` | Existing scoped schedule control. |

The cancellation tool returns the committed run receipt with `cancel_requested` and `cancellation: requested`. It does not fabricate native confirmation. The background lifecycle observes that intent and signals the native executor on its next wake; native completion and interrupt can race. A successful self-stop call may return its own committed receipt, but the lease cannot authorize subsequent tools or another self-stop attempt. The durable command key prevents a different operation from reusing the same identity. A lost response is inspected through owner entity/event state; stopped credentials do not gain general replay access.

Agent instructions distinguish stopping the current run from pausing/stopping a goal or schedule, preserve quotations/hypotheticals as context, and request clarification for an ambiguous responsibility. Language interpretation remains native-agent behavior; the backend enforces authorization, revisions, idempotency and terminal observations.

`POST /v1/runs/:id/cancel` with installation authentication and `Idempotency-Key` remains an explicit independent control operation for a stalled agent or unavailable steering. It does not wait for the agent's model loop or ordinary queue and notifies the executor immediately. There is no regex-triggered chat shortcut or mandatory new UI button. Run stop leaves the goal/Routine active; explicit goal/Routine control is required to stop future work.

## Editing and deleting waiting messages

| Route | Body | Result |
| --- | --- | --- |
| `POST /v1/messages/:id/edit` | `expected_revision`, `text` | Update the original waiting input and preserve its FIFO position. |
| `POST /v1/messages/:id/delete` | `expected_revision` | Cancel the undispatched delivery and publish a `deleted` message tombstone. |

Both are durable commands requiring `Idempotency-Key`. Only user messages whose run is still queued with `delivery: pending` can change. Claim, edit, delete and control reservations use synchronous SQLite transactions; a stale revision or a claim that already won returns `CONFLICT`. Deletion hides the tombstone from history and replacement-session context. Entity/event reads retain its identity for client reconciliation. Neither route changes completed work, interrupts a different run or undoes an external effect.

## Steering and delivery receipts

`POST /v1/runs/:id/steer` now requires `Idempotency-Key`. Choose exactly one source:

```json
{"text":"Use the corrected approach.","expected_native_run_id":"<current native turn>"}
```

```json
{"queued_run_id":"<waiting application run UUID>","expected_native_run_id":"<current native turn>"}
```

Omitting `expected_native_run_id` captures the current native turn atomically at receipt creation. Passing it also fences a stale client selection. A queued source must belong to the same agent/thread/goal and be ordinary user input. A control record binds the message, application run and exact native turn before dispatch. A queued source moves to `delivery: steering`, preventing concurrent claim/edit/delete.

The HTTP response is the durable `control` entity, with `state: requested | accepted | rejected | unknown` and a safe `error_code`. HTTP success means a receipt is available; clients must read its state. Concurrent retries share one native operation. An accepted queued steer finishes that queue entry as `status/outcome: steered` without a second model run. A certain refusal restores its original FIFO position. Lost acknowledgement, timeout or process death holds it as `delivery: unknown`; it is never automatically sent again. That held head also prevents later ordinary messages from overtaking it. Explicit cancellation can remove waiting work, but does not claim to undo a possibly delivered steer.

Codex 0.165.0 has native single-turn steer evidence. **Muse 1.4.14-R7309.1 reports steer `unknown`**: an observed admitted steer continued into another native turn, and a following application dispatch lost its acknowledgement. Until that mapping is proven, the broker returns a rejected control with `CAPABILITY_UNKNOWN` and leaves the message queued. No native steer is sent. Fixture-only success from earlier work is not promoted to native support. This capability-specific behavior satisfies the supported-native-mapping boundary; it does not promise equal harness capabilities.

Conversation snapshots now include `controls`. Entity/event queries can also read them independently.

## Streaming and replay

Authenticated `GET /v1/events/stream?after=0` emits committed SSE envelopes:

```text
id: 42
event: domain
data: {"cursor":42,"type":"message.updated", ...}

```

`Last-Event-ID` takes precedence over `after` and must be a nonnegative integer. The stream uses the same durable cursor/event log as `GET /v1/events`; reconnect never starts a model request. Consumers persist the cursor, ignore already handled cursors, and upsert by `(entity_kind, entity_id, revision)`. Message updates replace text snapshots; they are not deltas to append. Page polling until fewer than `limit` events remain, rather than assuming the first 1000 events include a terminal transition.

Each run has at most one agent-answer message, enforced by a unique index. Native chunks update that message while the run is active; full authoritative Muse history repairs ephemeral text before final publication. Active snapshots are coalesced to at most one every 100 ms, and final/error output flushes the retained text. A hard crash can lose the latest coalescing window; retained partial output and native history reconciliation remain distinct evidence. Known-secret prefixes and open bearer/key fragments are withheld across chunks before redaction/publication. No raw native exception is persisted.

The SSE implementation pulls one event at a time, emits keep-alives and closes after 60 seconds so clients reconnect with their last cursor. Slow clients have bounded buffering. API streaming is independent of provider execution and browser-tab lifetime. Run `activity` reports idle/generating/tool-running/stopping/unknown observations; it never stands in for a native terminal outcome.

## Stop, recovery and diagnostics

`cancel_requested` / `cancellation: requested` means intent. Only a matching native cancelled/interrupted terminal or an explicit native stop receipt confirms cancellation. Native success/failure racing with a stop keeps its actual result. A stop without confirmation within the broker request deadline (30 seconds by default) becomes `unknown`; process loss and late events cannot overwrite it.

Startup turns orphaned active runs into unknown, preserving native identities and partial text. It also marks unfinished steering receipts unknown. The broker performs bounded, sequential, read-only receipt checks at startup. Authenticated `POST /v1/runs/:id/reconcile` with an empty body requests the same check explicitly. This operation accepts no caller-provided outcome or receipt. Repeated reads never submit a prompt, reopen a session for execution, or replay a tool.

Codex reads the exact native turn through `thread/read`. Muse reads `session/read` without subscribing/resuming and uses the exact matching `lastTurn`. Missing/older/unrecognized receipts remain unknown. Muse synthesized host-death failures without a typed native error do not establish that an external effect failed. A persisted Muse dispatch identity can locate a turn even when its start acknowledgement was lost. Missing Codex native identity remains unknown. Revocation/membership/account/billing changes are rechecked before recovered output and settlement commit atomically. Existing message identity and command receipts prevent duplicate publication/effects.

`run.diagnostic` contains a safe code, category (`temporary`, `authentication`, `configuration`, `provider`, `unknown`) and operation outcome (`not_dispatched`, `failed`, `unknown`). Queued preparation errors are recorded separately from inference. A typed Muse auth-required terminal updates login-required state; a retryable model failure does not invalidate login or switch billing. Unknown refresh/dispatch is not reported as terminal auth rejection. Generic Codex failed terminals retain a provider rejection code when no more specific typed classification has been proven. No blind retry or subscription-to-key fallback is introduced.

See [verification and limitations](../verification/nma-053/README.md). These contracts do not declare NMA-060, UI, installer, Muse subscription acceptance or production readiness complete.
