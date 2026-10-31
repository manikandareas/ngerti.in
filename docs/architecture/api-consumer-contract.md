# API consumer contract 1.12.0

Authenticated `GET /v1/contracts` exports the installed server's contract. The checked-in [1.12.0 bundle](../contracts/1.12.0.json) is an equivalent JSON Schema contract, not an OpenAPI document. [Consumer fixtures](../verification/nma-060/cancellation/consumer-fixtures.json) are actual responses from an isolated HTTP test client. Exporting or consuming these artifacts does not establish NMA-060 readiness. [Gate evidence](../verification/nma-060/README.md) records the open prerequisites.

## Surfaces and schemas

| Export | Consumer use |
| --- | --- |
| `entities` | Current typed entities from `/v1/entities/:kind[/:id]`; snapshots contain these same shapes. |
| `event` | Every committed entity kind, including browser profiles/sessions/actions and Composio connections/sessions/effects. Immutable older payloads may omit later defaulted fields. |
| `commands` | Domain command inputs, including defaulted/optional fields. Cross-field and relational rules still run on the server. |
| `http` | Actual registered method/path and request body/query/params JSON schemas; authentication, idempotency and response transport. `null` request schema means no validator is installed, not a promise to reject a body. Encode query parameters as strings; coercion remains server-owned. |
| `projections` | Conversation snapshot, history page, event page, setup, admission/control response and HTTP error envelope. These do not claim schemas for every provider-specific observation response. |
| `harness`, `harness_versions`, `browser` | Broker contract, exact minimum/tested versions, browser capabilities and structured browser action arguments. Installed executable discovery does not prove account/model/inference readiness. |
| `product_tools` | Structured MCP tool names and argument schemas; discovery does not grant a tool or resource. |
| `protocols` | Replay, command receipts, SSE, errors, stop/outcome/billing semantics and VNC transport. |
| `readiness` | API-wide gate remains `pending`; it is distinct from process liveness and foundation readiness. |

The HTTP table is derived from Elysia 1.4.30's installed route records and their Zod validators. POST command/operation policies are explicit; export fails if a new POST lacks a policy. This avoids invoking provider operations to discover schemas. Dependency versions remain pinned in the existing lockfile. No OpenAPI dependency, alternate scheduler or model loop is added.

## Authentication and command receipts

Only `GET /health/live` is public. Other normal HTTP routes use the private installation bearer. Owner identity comes from server state; request bodies cannot inject it. `POST /v1/harness/tools` uses a server-issued, scoped run lease, never the installation token. Its JSON-RPC errors are protocol envelopes, not the ordinary HTTP error schema. GET requires that same lease and returns 405. Notifications return 202. VNC uses a separate short-lived, single-use scoped ticket issued by the authenticated browser view operation; it is binary RFB over WebSocket and view-only.

Use a UUID `Idempotency-Key` on operations whose `http.idempotency` is `required_uuid`. Retain that key before submitting a command. Exact key/method/path/normalized-body retries return the original receipt, including after restart. Changed input returns `IDEMPOTENCY_CONFLICT`. A run may now be cancelled while its original admission receipt still says queued; query current entities/events for current state. Native account/session operations, app authorization/refresh/search, browser open/view/control and interaction replies do not gain replay guarantees from an ignored header. Do not automatically retry them as durable commands.

Representative admission input:

```json
{"thread_id":"<stored thread UUID>","agent_id":"<member agent UUID>","text":"Please inspect this project."}
```

The response contains `message`, nullable `run`, and nullable `control`. New admission always returns `control: null`; the native agent interprets cancellation and uses `ngertiin.cancel_run` or goal/Routine controls. Historical receipt retries can retain the earlier control shape. Use returned identities. The concrete UUIDs in the isolated fixture file are examples from that fixture installation, not IDs to submit to another installation.

## Snapshot, replay and streaming

1. Read `GET /v1/threads/:id/snapshot`. Its `cursor` and current projection are read atomically. History is bounded; follow `next_before` for earlier messages. A history page is a separate read and does not advance the event cursor.
2. Start polling `GET /v1/events?after=<cursor>&limit=1000` or authenticated fetch streaming at `/v1/events/stream?after=<cursor>`. The event log is owner-wide; filter entities into the appropriate thread/resource projection. A browser run lease is not an owner-wide transcript credential.
3. For polling, follow `next_cursor` until a short page. For SSE, use an incremental UTF-8 decoder and buffer complete blank-line-delimited frames. Ignore retry/comment frames. Each domain frame has event `domain`, ID equal to the durable cursor, and a JSON envelope. `Last-Event-ID` takes precedence over the query cursor. Reconnect after the 60-second stream lifetime using the last fully applied cursor.
4. Apply in cursor order. Deduplicate repeated cursors, upsert by entity kind/ID and increasing revision, then persist the applied cursor. Replace message text snapshots; appending them duplicates streamed text. A `message.state=deleted` update hides a message while preserving its identity for replay.
5. Treat the projection and cursor as one checkpoint. Recover a missing checkpoint from a new snapshot. Opening a snapshot/stream/history does not submit inference or resume a session.

Version 1.11.0 corrects a published-event union that previously omitted six browser/Composio entity kinds, while the store already emitted them. The entity registry now also supplies event kinds, so a schema extension cannot silently omit its replay variant. Event envelope `schema_version` remains 1; historical events are not rewritten.

Version 1.12.0 adds scoped `ngertiin.cancel_run` and removes regex-based conversational cancellation. See the [updated cancellation contract](conversation-control-api.md) and [verification](../verification/nma-060/cancellation/README.md). The original [1.11.0 capture](../contracts/1.11.0.json) is retained unchanged.

## State and errors

Read run `status`, `outcome`, `cancellation`, `delivery`, `activity`, diagnostics and current receipts. HTTP 200, tool output text and agent assertions do not establish an external action's success. `cancel_requested` means stop intent. `cancelled` with confirmed cancellation requires an undispatched local cancellation or matching native confirmation. A native completion racing with stop retains its actual outcome. Unknown runs, steering receipts, browser actions and app effects stay held until authoritative reconciliation; a new command key does not authorize blind replay.

Ordinary errors use `{"error":{"code":"...","message":"..."}}`; harness errors also carry `outcome: not_dispatched | unknown`. Validation uses 422, declared oversized input 413, MCP protocol mismatch 400, authentication 401, scope 403, missing resources 404, domain conflicts and harness errors 409, and unexpected errors a generic 500. Do not parse agent prose or raw provider messages to infer reconnect, retry or success. Preserve safe diagnostic codes and unavailable usage as unknown. Authentication method, selected billing and effective billing are separate fields.

## Domain guides and remaining gate work

Use the exact operation result descriptions in [agents/DMs](agent-conversation-api.md), [control/recovery](conversation-control-api.md), [groups](group-collaboration-api.md), [goals/Routine](goals-routines-api.md), [memory/skills](memory-skills-api.md), [workspace/artifacts](workspace-artifact-api.md), [browser/VNC](browser-session-api.md), [apps/research/visual](apps-research-visual-api.md), [Codex](codex-adapter.md) and [Muse](muse-adapter.md). Entity/schema ownership and reproducible test/evidence references are in [coverage.json](../verification/nma-060/coverage.json).

NMA-050 remains In Progress for Muse subscription-backed inference/product-tool use and a live native permission-decision cycle. The gate also retains an open final response-surface review, complete obsolete-source cleanup and a final native integration/fault acceptance pass on the selected revision. Unsupported Muse steer/native coding/visual input and native video are explicit capability boundaries, not implicit fallback work. UI, installer and production acceptance are later phases.
