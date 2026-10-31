# Harness broker contract v1.3.0

NMA-053 adds durable controls, incremental redacted snapshots, typed failure diagnostics and native receipt reads; see the [conversation control and recovery contract](conversation-control-api.md). Codex native steer is verified. Muse steer is now `unknown` after a live single-turn mapping failure; the broker preserves its ordinary queue. Earlier fixture observations below do not override that capability.

Implemented for [NMA-048](https://app.notion.com/p/409abdd618738145ae75fb44fdf47e83), on the [NMA-047 foundation](adr-0001-harness-first-foundation.md). NMA-049 adds the [native Codex adapter](codex-adapter.md), cancel/permission capabilities and optional native steer operation. The application contract is v1.2.0 and the bootstrap registers Codex and Muse executors. NMA-050 adds the [Muse SDK/MSP adapter](muse-adapter.md), per-run interaction query/answer operations and an explicit effective billing projection. The original NMA-048 results below describe broker/fixture evidence; Codex native acceptance is recorded separately and NMA-060 remains pending.

## Executable and capability policy

Authenticated `GET /v1/harnesses` probes executables on the **backend host**, using `PATH` and `--version`, without a shell or inherited provider credentials. Results distinguish `supported`, `too_old`, `missing`, `unknown` and `probe_failed`. A three-second deadline and a 4096-character output limit bound probes. Unreadable/prerelease versions fail closed. `supported` means the version floor passed; it does not imply login, model availability or a completed request.

| Harness | Minimum CLI | Native tested CLI | Protocol | SDK | Evidence |
| --- | --- | --- | --- | --- | --- |
| Codex/ChatGPT | 0.165.0 | 0.165.0 | App Server | None | Isolated native initialize/initialized only |
| Muse Code | 1.4.14 | 1.4.14-R7309.1 | MSP schema v1 | @muse-code/sdk 1.4.14 | Native API-key/dev-credit HTTP inference/tools/resume/question/stop; subscription unverified |

The Codex floor conservatively starts at the installed/handshake-tested version. The Muse floor follows the SDK's documented lockstep CLI/SDK release policy, not an inference from Openbot's older CLI fixtures. Boundary tests exercise both floors, including the previous patch release. Muse `-R` product release suffixes are accepted. Newer CLI versions still require adapter protocol/capability negotiation; native support beyond these observations is unverified.

Every capability is explicitly `supported`, `unsupported` or `unknown`: resume, steer, image input, video input, compaction, product tools and settings. Manifest defaults are all `unknown`. Native adapters must supply observations; optional fields never imply support. The broker refuses unknown/unsupported resume rather than silently replacing a session. Steer/media/compaction implementations belong to their owning tickets.

## Connections and billing

`authentication.billing_source` records the explicit selection. `effective_billing_source` starts as `unknown` and changes only after inspection verifies the credential actually used. A browser-login completion alone does not update it. A stored or environment key cannot masquerade as a Muse subscription; a mismatch rejects inspection/dispatch. It identifies the credential lane, not remaining quota or successful provider inference.


`POST /v1/connections` accepts exactly one of these selections, plus `harness: codex | muse`:

```json
{"authentication":{"method":"native_login","billing_source":"subscription"}}
```

```json
{"authentication":{"method":"api_key","billing_source":"api_key","credential_ref":"<UUID>"}}
```

Use a real UUID for the reference. Both commands require installation authentication and `Idempotency-Key`, using the common atomic receipt/event store. A connection is a secret-free `connection` entity, readable through `/v1/entities/connection`. `POST /v1/connections/:id/revoke` is durable, idempotent and increments its authorization generation. Connection auth selection is immutable. Changing it means selecting a different connection; there is no fallback chain.

Login (`unknown/authenticated/required/rejected`), discovery (`not_attempted/succeeded/failed`) and last inference (`not_attempted/succeeded/failed/cancelled/unknown`) are independent observations. A successful login does not mark discovery or inference successful. A catalog failure does not erase login. Connection `revision` records projection updates; `grant_revision` changes when account, login, capabilities, models or revocation change. Updating only inference/discovery evidence does not invalidate another agent's live tool lease.

The developer provisions a selected API key in the private file `<state>/credentials/<credential_ref>` with mode `0600`; secret values are never accepted in HTTP bodies or written into domain events/command receipts. Missing, symlinked, public or oversized credential files fail closed. Native login uses a fresh connection-owned home, without copying the user's global credentials. Full native login/provisioning commands are supplied by NMA-049/050; creating a connection alone does not log in.

`CredentialContexts` constructs a child environment from a small OS allowlist. Each connection has its own HOME/XDG paths and CODEX_HOME. Ambient provider keys, endpoints and provider config are excluded. Only a selected key connection reads its credential reference and adds `OPENAI_API_KEY` or `META_API_KEY`. An adapter's observed auth method/billing source must equal the explicit selection before any prompt. Reinspection immediately before dispatch must retain the same account/capabilities. Subscription failure cannot request a global key.

## Adapter and lifecycle boundary

`HarnessAdapter.connect` receives an executable, connection/agent/thread identity, isolated environment, redactor and lifetime abort signal. It returns one owned client/process per `(connection, agent, thread)`, even when two agents share an account. Native SDK-owned processes must obey the same environment, abort and bounded-close contract as `OwnedProcess`. Never mutate process-wide parent environment/model/account settings.

`HarnessClient` normalizes inspect, model discovery, start, resume, settings, prompt/events, native stop receipt and close. Inspect/discovery/session/settings operations have configurable 30-second request deadlines; close has a one-second broker deadline. There is no application-wide inference time limit. Native adapters own transport deadlines and must terminate their processes on lifetime abort, including a failed handshake. The optional process port escalates SIGTERM to SIGKILL. There is no generic ACP implementation or additional provider in this change.

The composition root registers adapters explicitly. Before a lane can be claimed, its owner calls `broker.openSession(thread_id, agent_id)` to initialize or resume its native binding. This returns only the public binding, never a launch environment. A persisted binding from another connection/harness is rejected **before** native resume. Concurrent opens share one lane initialization; connection observations are serialized during initialization, while prompt execution remains concurrent.

`broker.executors()` plugs into the existing Background dispatcher. Ngertiin continues to own admission, queue, run status, cancellation and recovery. The final gate rechecks agent membership, application dispatch token/epoch, agent grants, connection generation, binding revision and selected model/reasoning. Only native `accepted` records the native run ID and calls `started`; this identity is persisted before tools execute. Native terminal session/run identity must match. Malformed/mismatched receipts or a connection failure after dispatch become `unknown`, preserving the existing blocked lane/reconciliation policy. An explicit pre-acceptance rejection can be `failed` without claiming an unknown effect.

Abort means intent. Only a native stop receipt confirms native cancellation; racing completion retains its observed outcome. Late events/completion after broker shutdown are fenced, and all tool leases are revoked. Native resume and receipt reconciliation after a real process crash still need adapter-specific proof under NMA-049/050/053.

Public native errors contain stable English codes and dispatch certainty, never native exception messages/causes. Known credentials and tool tokens are redacted before diagnostics leave the process boundary. Diagnostics buffer full UTF-8 records, including fragmented secrets, and discard oversized records. Text observations buffer until the terminal receipt so secrets split across events can be redacted together; full UI streaming/transcript behavior is owned by later tickets.

## Structured product tools

`ProductTools` supplies the same scoped callable bridge to both adapters. A run lease contains owner, connection, agent, thread, run, binding and authorization generations. The bearer token is server-generated, memory-only, revoked on run completion/shutdown, and unusable after the run is terminal, stop intent, membership/grant changes or connection revocation. The installation token cannot call product tools.

Every call verifies the server's stored lease, claimed scope, current application dispatch authority, membership, connection/capability generation and binding. Registered handlers declare resource references, which the bridge checks against the authorized agent/thread. An asynchronous handler receives `authorize()` and must call it immediately before its effect; the bridge also checks access after it returns. Handler registration is trusted server code, not a caller-provided resource policy. Mutating/external handlers must use the application authority's durable command/effect receipts and reconcile unknown outcomes; this read-only bridge does not add a generic external-effect replay policy.

`POST /v1/harness/tools` exposes JSON-response MCP Streamable HTTP, negotiating protocol **2025-06-18**, with initialize/initialized, ping, tools/list and tools/call. It validates loopback host, Origin and supplied protocol headers. An initialized notification returns an empty 202; authenticated GET returns 405 because SSE is not offered. The bearer binds scope server-side; model arguments cannot choose owner/agent/thread. No prose parsing is used. The current useful read tool, `ngertiin.read_run_context`, returns only the current run's agent/thread/ID and input. Memory/goals/skills/artifacts/collaboration handlers remain with their owning tickets.

Protocol references: [MCP transport](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports), [tools](https://modelcontextprotocol.io/specification/2025-06-18/server/tools), [lifecycle/version negotiation](https://modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle). Both adapter fixture paths and the authenticated HTTP bridge are tested; this does not prove native harness MCP configuration or a provider tool round trip.

## Source adoption and upgrade

Openbot revision `01e4b18e238e5de72a3570162c9f4275bb585786` is the primary behavioral reference:

- `agent-client.ts`: explicit provider lifecycle/events/native request uncertainty; locally expose a small typed client rather than Openbot's general request/Effect API.
- `provider-drivers.ts`: provider-specific native protocols, account context and selected key injection; omit other providers, fallback keys and cloud/desktop configuration.
- `acp-configuration.ts`: process-wide model selection hazards; use one process/client per agent/thread and immutable per-agent selection, rather than importing generic ACP discovery/configuration.
- `acp-connection.ts`: owned processes, record-buffered diagnostics and cleanup; use Bun process primitives, bounded redaction and isolated environments instead of inheriting the entire server environment.
- `cli.ts`: executable/version detection and Muse release suffixes; use explicit conservative floors and distinguish version-policy acceptance from native capability evidence.
- Installed official `@muse-code/sdk@1.4.12/README.md`: exact SDK/CLI lockstep policy. NMA-050 subsequently pins the production server to 1.4.14, matching the SDK source at the ticket revision; see its provenance and native evidence.

Exact source paths/hashes and local adaptations are in [provenance.json](../verification/nma-048/provenance.json). On upgrade, compare these modules, the SDK's release/deprecation notes and the pinned MCP surface, update manifest evidence rather than inventing tested versions, then rerun boundary, isolation, lifecycle, tool and native probes. Do not adopt extra runtimes or permissions from upstream automatically.
