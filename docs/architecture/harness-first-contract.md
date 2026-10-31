# Harness-first domain and API contract v1.6.0

NMA-052 adds the [agent/conversation API](agent-conversation-api.md). NMA-053 adds the [conversation control, streaming and recovery contract](conversation-control-api.md), which supersedes the foundation-only queue/streaming/recovery limits below. NMA-054 adds the [workspace/file/artifact API](workspace-artifact-api.md) and scoped native coding. The executable schemas describe the complete current version; NMA-060 remains pending.

Executable schemas live in [contracts.ts](../../apps/server/src/contracts.ts) and are exported by authenticated `GET /v1/contracts`. These are foundation contracts; NMA-060 remains the API readiness gate before UI adoption. JSON Schema describes field shapes. Runtime Zod refinements and the application service enforce the cross-field and relational invariants below.

## Identity, scope and persistence

All entities contain server-generated UUID `id`, server-owned `owner_id`, integer `revision`, and UTC ISO `created_at`/`updated_at`. The installation belongs to one human owner. Owner identity comes from private installation state and its authenticated server context, never a request-body owner field. Each thread references only agents in that installation. A DM has exactly one agent; a group has unique agent members and one implicit human owner. Authentication is a private loopback development token; full login/pairing is deferred.

| Entity | Responsibility and references |
| --- | --- |
| Connection | Selected harness/authentication/billing source, credential reference, observed account/login/catalog/inference and explicit capabilities. Secret values stay outside domain records. See the [broker contract](harness-broker-contract.md). |
| Agent | Persistent name/instructions, selected `codex`/`muse` harness, connection identity, model/reasoning selection, optional workspace identity and grant revision. The connection/workspace references reserve seams for their owning tickets; this foundation does not claim they are connected or granted. |
| Thread | DM/group identity and member agent IDs. Private transcript and group transcript remain separate. |
| Message | Thread, `user`/`agent`/`routine` author, optional agent/Routine/run reference, original text and partial/complete state. Scheduler input is explicitly authored by the Routine, not attributed to a new human message. |
| Run | Admitted input message, target agent/thread, optional goal/Routine, status/outcome, grant snapshot, dispatch token, authority epoch and native binding/run identity. |
| Goal | Agent/thread responsibility, generation, active/paused/stopped/completed state and artifact evidence IDs. The schema rejects completed goals without evidence; validating useful evidence and automatic completion belongs to NMA-057. |
| Routine | Agent/thread, optional goal, instruction, timezone, typed one-time/fixed-interval schedule, generation, state and persisted next due time. Full cron/calendar/DST semantics remain NMA-057. |
| Occurrence | Routine ID, generation, scheduled UTC time and admitted run ID. The tuple `(routine_id, routine_generation, scheduled_for)` is unique. |
| Workspace | Active owner/agent/thread file authority, managed or explicitly bound project root, root identity and revocation. |
| Artifact | Immutable verified bytes, scope, SHA-256, size, source path and native publication/sharing provenance. See the [workspace/artifact contract](workspace-artifact-api.md). |
| Memory | Stable scoped identity, optimistic revisions, current fact or empty permanent tombstone; historical events/receipts retained. |
| Skill / Skill revision | Application-owned package identity and immutable versioned description/instructions/assets with verified SHA-256. |
| Skill assignment | Per-agent scoped enablement of an explicit application package version; revisions fence concurrent changes. |
| Harness inventory | Binding-scoped native skill catalog and read-only inherited package snapshots, with separate native/folder availability. See the [memory/skills API](memory-skills-api.md). |
| Binding | Agent/thread/connection/harness to native-session identity, with a generation. A native session cannot be reused across DM/group threads for the same connection. Binding/rotation/resume behavior is completed by the broker/adapters. |

SQLite stores typed projections, immutable event envelopes and command receipts. A mutation and its events/receipt share one transaction; rolled-back changes produce no replayable event. Optimistic revision checks reject stale updates. A lifetime authority lock prevents simultaneous application writers for the same state directory. Schema/application/owner mismatches are startup errors rather than permission to reset data.

## Commands and queries

`GET /health/live` is public process liveness. Except the separately scoped MCP endpoint, all other routes require `Authorization: Bearer <installation token>`. Durable domain command POSTs require a UUID `Idempotency-Key`; native login/inspection/session/steer operations use the separate semantics described in the adapter guide. The MCP endpoint follows its separate JSON-RPC/run-lease contract. Repeating the same key, method, path and normalized body returns the original receipt even after restart. Different input under the same key returns `IDEMPOTENCY_CONFLICT` with HTTP 409. Unknown properties, including injected `owner_id`, are rejected. Validation errors do not echo request input or native exception details.

| Route | Behavior |
| --- | --- |
| `GET /health/ready` | Foundation status and registered executor count. `api_readiness_gate=pending`; not a completed-inference check. |
| `GET /v1/harnesses` | Backend-host executable/version policy detection for Codex and Muse. |
| `GET /v1/harness/contracts` | Broker schemas, explicit capability/error/terminal/tool-scope contracts. |
| `POST /v1/connections` | Persist an explicit connection/auth/billing choice without secret values. |
| `POST /v1/connections/:id/revoke` | Durably revoke the connection and invalidate its authorization generation. |
| `POST /v1/connections/:id/inspect` | Inspect Codex login and model catalog independently of inference. |
| `POST /v1/connections/:id/login` | Start connection-owned native ChatGPT login; return the browser authorization URL. |
| `POST /v1/connections/:id/login/cancel` | Cancel a pending native login. |
| `POST /v1/threads/:id/sessions` | Open/resume the member agent's binding, using body `agent_id`. |
| `POST /v1/runs/:id/steer` | Send `text` to the current native turn; does not create a second run. |
| `POST /v1/harness/tools` | Structured MCP bridge using a server-issued run bearer instead of installation authentication. See the broker contract for protocol/auth/GET behavior. |
| `GET /v1/contracts` | Contract version, entity/event/command JSON schemas and error codes. |
| `GET /v1/entities/:kind` | Read a typed collection in this installation. |
| `GET /v1/entities/:kind/:id` | Read an entity; foreign/missing IDs return 404. |
| `GET /v1/events?after=0&limit=100` | Read events after a cursor, ordered ascending; `limit` is 1–1000. Returns `events` and `next_cursor`. |
| `POST /v1/agents` | Create a foundation agent record. Does not authenticate a harness or provision Tobi. |
| `POST /v1/threads` | Create a member-validated DM/group record. Does not perform model-based group routing. |
| `POST /v1/goals` | Create a foundation responsibility record; automatic conversational capture is added by NMA-057. |
| `POST /v1/routines` | Create a basic schedule/instruction record. Background firing admits work through the common queue. |
| `POST /v1/artifacts` | Register scoped artifact metadata; does not claim bytes were uploaded. |
| `POST /v1/runs` | Persist input message and queued run atomically. No executor means the run stays queued. |
| `POST /v1/runs/:id/cancel` | Cancel undispatched work or persist native stop intent. Does not stop its goal. |
| `POST /v1/goals/:id/control` | Set active/paused/stopped responsibility. Pause/stop increments generation, stops its active routines and cancels its unfinished runs atomically. Returning a goal to active does not silently reactivate its routines. |

Example request body for `POST /v1/runs`:

```json
{"thread_id":"<thread UUID>","agent_id":"<member agent UUID>","text":"Please inspect this project."}
```

Replace placeholder IDs with stored UUIDs. A one-time Routine body uses `schedule: {"type":"once","at":"2026-10-31T01:00:00.000Z"}` and an IANA `timezone`; a fixed-interval body uses `schedule: {"type":"interval","anchor_at":"2026-10-31T01:00:00.000Z","every_ms":60000}`. Both include `thread_id`, `agent_id` and `instruction`. The timezone is validated/stored; interval calculation uses absolute UTC time and does not implement local calendar recurrence.

## Run transitions, cancellation and unknown outcomes

| Current state | Observation/command | Result |
| --- | --- | --- |
| queued | Dispatcher claim | dispatching with persisted token, current authority epoch and scoped binding. |
| dispatching | Native acceptance | running. |
| dispatching/running | Native terminal observation | succeeded/failed, or unknown if the outcome cannot be established. |
| queued | Cancel | cancelled, cancellation confirmed locally because nothing was dispatched. |
| dispatching/running | Cancel | cancel_requested; native execution may still be alive. |
| cancel_requested | Native stop receipt | cancelled with confirmed cancellation. |
| cancel_requested | Native completion races with stop | Preserve actual succeeded/failed outcome and the requested cancellation intent. |
| active state after process death | Startup recovery | unknown; retain binding/token/stop intent and block that execution lane. |
| unknown | Trusted adapter reconciliation | A terminal outcome from an identified native receipt; never automatic requeue. |

FIFO ordering is per `(thread_id, agent_id)`. A partial unique index and transactional claim allow one active or unknown run per lane. Other lanes can execute concurrently, bounded by dispatcher concurrency. The final dispatch gate rechecks membership, current grant revision, goal/Routine state and connection/harness binding before invoking native execution. The broker rechecks current connection/account/capability state and selected model at the native dispatch boundary. Native accepted observations persist `native_run_id` through the application lifecycle before product tools execute.

A shutdown abort signal expresses stop intent. If the executor cannot confirm its result before the deadline, the run becomes unknown; late completion cannot write to closed state. No generic retry route turns an unknown run into queued work. Internal native receipt reconciliation is not exposed as a caller-controlled HTTP success override.

## Events, scheduling and recovery

An event contains `schema_version=1`, monotonic integer `cursor`, owner ID, type, entity kind/ID, revision, timestamp and the committed entity snapshot. Clients persist the last handled cursor and request subsequent pages. Replay can deliver an event again; consumers deduplicate by cursor. Cursors are installation-wide, not native provider event IDs. This ticket provides durable HTTP polling/replay; full streaming is established later.

The background scheduler treats the database as the source of due state. A one-second wake loop re-reads current Routine/goal state, creates a unique occurrence and run, and advances the next due time in one transaction. Repeated ticks/restarts do not duplicate a committed occurrence. Missed fixed intervals collapse to the latest due slot; a Routine with any queued/active/unknown run does not create another overlapping run. A paused/stopped responsibility remains stopped across restart. Full misfire/timezone/conversational/quiet policies are outside this foundation.

Error codes: `INVALID_REQUEST`, `UNAUTHORIZED`, `NOT_FOUND`, `CONFLICT`, `IDEMPOTENCY_CONFLICT`, `SCOPE_DENIED`, `STALE_DISPATCH`, `RECONCILIATION_REQUIRED`, `INTERNAL_ERROR`. Auth errors use 401, scope errors 403, missing records 404, stale/conflicting work 409, invalid bodies 422, oversized declared bodies 413. Unexpected errors return a generic 500 without native details.

Version 1.1 adds connection entities and nullable per-agent model/reasoning and per-run native identity. Version 1.2 adds Codex native operations and explicit cancel/permission capabilities, with unknown defaults for older records. Native login/inspect/session/steer operations use the [adapter operation semantics](codex-adapter.md), outside durable domain command receipt replay. Defaults permit replay of earlier foundation records; the event JSON Schema uses input/default semantics so old event payloads remain valid without rewriting immutable events. The SQLite DDL version remains 1 because its tables/indexes are unchanged.
