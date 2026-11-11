# API consumer contract

Current source export: **1.32.0**. The [full machine-mode schema snapshot](../contracts/1.32.0.json) was regenerated from authenticated in-process `/v1/contracts` using disposable application state on 2026-11-11: 99 routes and 50 product tools, with zero provider inference or machine connection. This additive delta enriches app-catalog metadata; the native Rust client pin and schema-validation fixtures move together to 1.32.0. [Marketplace verification](../verification/marketplace-screen-2026-11-11/catalog-and-authorization/README.md) records contract/native client checks and separate live catalog evidence. The [1.31.0 snapshot](../contracts/1.31.0.json) and [interaction evidence](../verification/conversation-implementation-2026-11-06/README.md) retain their original scope. Older bundles and examples below preserve the versions they tested.

Authenticated `GET /v1/contracts` exports the installed server's contract. The checked-in [1.16.0 bundle](../contracts/1.16.0.json) is an equivalent JSON Schema contract, not an OpenAPI document. [Consumer fixtures](../verification/nma-060/final-cohort/consumer-fixtures.json) are actual responses from an isolated HTTP test client. [Gate evidence](../verification/nma-060/final-cohort/README.md) records accepted engine/API readiness, including the explicit Muse API-key billing scope. UI, installation and production acceptance remain separate.

The [1.21.0 bundle](../contracts/1.21.0.json) adds private submit-time attachment uploads, admission reconciliation, derived document states, bounded attachment observations and scoped list/read/search tools. The earlier bundle and gate evidence above retain their original scope. See [attachment verification](../verification/attachments/README.md) and the [workspace contract](workspace-artifact-api.md).

## Surfaces and schemas

| Export | Consumer use |
| --- | --- |
| `entities` | Current typed entities from `/v1/entities/:kind[/:id]`; snapshots contain these same shapes. |
| `event` | Every committed entity kind, including browser profiles/sessions/actions and Composio connections/sessions/effects. Immutable older payloads may omit later defaulted fields. |
| `commands` | Domain command inputs, including defaulted/optional fields. Cross-field and relational rules still run on the server. |
| `http` | Actual registered method/path and request body/query/params JSON schemas; authentication, idempotency, response transport and reviewed operation response contracts. `null` request schema means no validator is installed, not a promise to reject a body. Encode query parameters as strings; coercion remains server-owned. |
| `projections` | Conversation snapshot, history page, event page, setup, admission/control response and HTTP error envelope. Operation projections additionally cover creation/opening, goals, learning, files, app connections/search, browser/VNC, login and native interactions. Every JSON operation has a response schema or an explicit document/projection reference; non-JSON routes declare framing/status. Unknown added GET routes fail export as well as unclassified POST routes. |
| `harness`, `harness_versions`, `browser` | Broker contract, exact minimum/tested versions, browser capabilities and structured browser action arguments. Installed executable discovery does not prove account/model/inference readiness. |
| `product_tools` | Structured MCP tool names and argument schemas; discovery does not grant a tool or resource. |
| `protocols` | Replay, command receipts, SSE, errors, stop/outcome/billing semantics and VNC transport. |
| `readiness` | API-wide gate is `ready`; it is distinct from process liveness, account/harness availability, UI, installation and production readiness. |

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

## Domain guides and current gate status

Use the exact operation result descriptions in [agents/DMs](agent-conversation-api.md), [control/recovery](conversation-control-api.md), [groups](group-collaboration-api.md), [goals/Routine](goals-routines-api.md), [memory/skills](memory-skills-api.md), [workspace/artifacts](workspace-artifact-api.md), [browser/VNC](browser-session-api.md), [apps/research/visual](apps-research-visual-api.md), [Codex](codex-adapter.md) and [Muse](muse-adapter.md). Entity/schema ownership and reproducible test/evidence references are in [coverage.json](../verification/nma-060/coverage.json).

NMA-050 and NMA-060 are Done under the accepted Codex subscription/Muse explicit API-key configuration. Muse subscription remains unverified. [The final API cohort](../verification/nma-060/final-cohort/README.md) and [Muse interaction repair](../verification/nma-050/interactions/README.md) supersede the older pending gate notes. Native unsupported/unknown capabilities remain explicit; current machine mode exposes scoped Cua file/process/desktop tools rather than assuming unrestricted host-native coding. NMA-063 product-wide acceptance, NMA-064 installation and production remain separate.

## Version 1.16.0 response review

Each `http.response.schema` is a JSON Schema for that operation's successful body. `reference` resolves a named projection, except `contract_document` (the self-describing complete export), `harness` and `browser` (their published contract documents), and `protocols.mcp` (JSON-RPC framing). Generic entity routes return the discriminated entity union; choose the requested `kind` for the exact shape. SSE carries the published `event` schema. Bytes and empty MCP responses must not be parsed as JSON. Errors continue to use the common error projection.

A workspace query with no bound workspace returns JSON `null`, rather than an empty successful body. This behavior is covered by an HTTP consumer regression. Native interaction answers return `{ "status": "submitted" }` after the adapter acknowledges the command. This is not permission resolution or tool completion: refresh pending interactions and observe authoritative run/events. Unsupported Codex interactive permissions remain capability errors; Muse approval choice IDs and stage guards remain native and must be returned unchanged.

The latest gate billing decision accepts Codex ChatGPT subscription plus explicitly selected Muse API-key billing. Muse subscription is not a blocker for this gate. Native permission acceptance was subsequently captured in [Muse interaction evidence](../verification/nma-050/interactions/README.md); the [final API cohort](../verification/nma-060/final-cohort/README.md) records gate closure. Earlier completion captures retain their original limits.

Native approval projections preserve the tool name, arguments and native choice labels/previews for display. Treat these strings as untrusted text; submit only a currently offered choice and stage. Submitted does not mean the action completed.


## NMA-068 native consumer — 2026-11-08

The [native workspace](../../apps/desktop-rs/README.md) consumes the 1.32.0 export (the app-catalog metadata amendment leaves conversation projections and command semantics unchanged). Native transport compares the pinned version, entities, event, projections and HTTP route definitions before enabling writes, then validates request/response bodies. The application uses a bounded owner-wide SSE wakeup stream with 40 ms coalescing, ordered event-log reads and atomic snapshot/timeline reconciliation. Coalesced notifications never advance the applied cursor; hidden windows pause stream work and foreground return reconciles a fresh snapshot. Read/write work uses separate native workers. Credentials stay in native transport state and private attachment configuration, or are read from the already configured Tauri installation. Rust never starts a second backend.

The native profile stores exact pending operation identities/path/body/upload bytes before dispatch. Native interaction replies receive no idempotent-command guarantee: an uncertain reply is inspected through authoritative history before another response becomes available. Drafts/preferences and journal recovery are native state, while the backend retains all admission, queue, billing, stop and external-effect authority. No cursor is persisted alone. [Implementation evidence](../verification/nma-068/README.md) records the focused checks and unexecuted real native/API acceptance; this is not a new backend gate or full native parity claim.
