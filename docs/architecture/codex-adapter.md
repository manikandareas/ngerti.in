# Native Codex adapter

NMA-079 amendment: the [2.0.0 server-organizations consumer contract](server-organizations-api.md) and [verification report](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-079/README.md at 043f7c9") own current account-mode authentication, scope, normal native dispatch and readiness. Earlier versioned examples and pending-gate statements below retain their captured scope. Web/Tauri UI and deployment remain later milestones.

NMA-077 implementation amendment: account-mode provider ownership, private selection, frozen run snapshots and server-side credential retirement are defined by the [1.34.0 provider contract](provider-connections.md). Its [verification report](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-077/README.md at 043f7c9") records native Codex/Muse proof and a completed two-account Codex probe including Free. The owner-only paths below retain their captured compatibility scope; production organization native admission and NMA-079 readiness remain closed.

Implemented for [NMA-049](../backlog/NMA-049.md). The development bootstrap explicitly registers Codex through `CodexAdapter`; The [Muse adapter](muse-adapter.md) is registered separately; its evidence and accepted API-key billing scope belong to NMA-050, while Muse subscription remains unverified. The application still owns admission, binding, queue, cancellation intent, transcript publication and recovery decisions. App Server owns inference and its inner tool loop. No ACP wrapper, second model loop or provider fallback is introduced.

Implementation lives in `apps/server/src/harness/codex/`: `adapter.ts` implements the broker entry point, `client.ts` maps native sessions/events/tools, `accounts.ts` owns account operations, and `rpc.ts` owns the JSONL process transport. Imports use the specific module; shared harness contracts and services remain in the parent directory.

## Versions and source adoption

Minimum and native tested CLI: **codex-cli 0.165.0**. No Codex SDK is used. The adapter uses stdio JSONL, `initialize` with `experimentalApi=true`, then `initialized`. Dynamic tools require that experimental opt-in. The installed CLI's generated protocol and the [official App Server documentation](https://learn.chatgpt.com/docs/app-server) were inspected. Versions above this floor still require compatible protocol behavior; version detection is not an inference guarantee.

Openbot revision `01e4b18e238e5de72a3570162c9f4275bb585786` supplies the primary implementation reference:

| Source | Local adoption |
| --- | --- |
| `src/backend/app-server-client.ts` | Port JSONL ID correlation, native notifications/server requests, bounded control requests, record buffering and owned process cleanup. Replace Node/Effect and shared-client machinery with a small Bun transport per connection/agent/thread. Native errors expose stable codes, never upstream exception text. Lost acknowledgements are not replayed. |
| `src/backend/provider-drivers.ts`, Codex driver | Adopt native App Server and account-owned `CODEX_HOME`, paginated model discovery and ChatGPT login. Locally strip ambient credentials/config and support an explicitly selected key connection, rather than copying Openbot's subscription-only account validator or inheriting parent environment. |

Hashes, local adaptations, protocol fields and upgrade procedure are in [provenance.json](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-049/provenance.json at 043f7c9"). On upgrade, compare these modules and the generated native protocol, especially dynamic tool specs, account modes, terminal status, native IDs and settings. Rerun contract/process checks and native subscription/tool/resume/control probes before changing tested versions. Additional upstream providers and capabilities do not enter scope automatically.

## API setup and authentication

All routes below require the private installation bearer. Domain creation, admission, revocation and cancellation retain their durable `Idempotency-Key` command receipts. NMA-053 adds durable steering receipts, queued-source reservation and exact retry behavior; see the [control/recovery contract](conversation-control-api.md). Login, inspect and sessions remain native operations outside receipt replay. Inspection is repeatable; concurrent session opens share one initialization and persisted bindings are resumed. Duplicate pending logins return `CONFLICT`. Unknown steering acknowledgement is never automatically resent.

1. `POST /v1/connections` with `{"harness":"codex","authentication":{"method":"native_login","billing_source":"subscription"}}`.
2. `POST /v1/connections/:id/login`. Open the returned `auth_url` and finish native ChatGPT login. The owned callback process expires after ten minutes; `/login/cancel` closes it explicitly. Native credentials persist only in that connection's private home using Codex's file credential store. Existing global credentials are not copied. Login alone never records successful inference.
3. `POST /v1/connections/:id/inspect`. Observe login and models separately. Choose an actual catalog model and supported reasoning effort. Account identity is an opaque hash of the native account/workspace ID, or email when that ID is unavailable; a missing identity fails closed.
4. Create an agent with that `connection_id`, `harness:"codex"`, `model_id`, `reasoning` and optional instructions. Create a DM/group containing the agent.
5. `POST /v1/threads/:id/sessions` with `{"agent_id":"<UUID>"}`. Persist a native binding before admitting work. Each thread/agent has its own process and workspace directory. A previous binding resumes by exact native ID; native response IDs and selected model/provider must match. No product transcript is injected into another native session.
6. `POST /v1/runs` with thread/agent/text. Poll run state and `/v1/events`, or subscribe to `/v1/events/stream`; native text incrementally updates one owned agent message. Completed output is marked complete, while interrupted/failed/unknown partial output remains partial. Cross-event secret prefixes are withheld before publication. UI adoption still depends on NMA-060.

For a key connection, use `authentication:{"method":"api_key","billing_source":"api_key","credential_ref":"<UUID>"}` and provision the private `0600` credential file described by the [broker contract](harness-broker-contract.md). Only that selection injects the key and calls native `account/login/start` with `type:"apiKey"`. The effective native mode must match the connection. Subscription failure never reads a key; key rejection never selects the authenticated subscription from another home.

## Product tools and controls

The persisted experimental dynamic function `ngertiin_product_tool` exposes the currently implemented read tool `ngertiin.read_run_context`. Its structured arguments contain a tool name and arguments, never owner/thread/grant credentials. Native `item/tool/call` must match the active thread and turn. Native acceptance is recorded before execution. The adapter calls the **actual Ngertiin MCP HTTP endpoint** with the server-issued run lease, negotiates initialization, and returns structured tool output. The bearer never enters the model-visible tool definition or result. The API bridge revalidates scope and grants; `product_tool.completed` logs IDs/name only. Later product-tool tickets extend the advertised catalog with their scoped handlers.

`POST /v1/runs/:id/steer` sends direct `text` or a reserved `queued_run_id` to `turn/steer` with an exact `expectedTurnId`; it cannot create or redirect a different run. `POST /v1/runs/:id/cancel` stores stop intent. Native `turn/interrupt` acknowledgement does **not** confirm cancellation: only matching `turn/completed` with `interrupted` confirms it. A racing success/failure retains the native result. Disconnects, mismatched IDs and lost acknowledgements remain unknown and block blind replay. NMA-053 adds exact-turn `thread/read` receipt reconciliation without prompting or resuming execution.

Capabilities exposed by this adapter:

| Capability | State and boundary |
| --- | --- |
| Resume, settings, product tools, steer, cancel | Supported; native HTTP evidence retained for Codex 0.165.0. Model/reasoning are per thread/turn, never parent-process settings. |
| Interactive permission requests | Unsupported. Unexpected escalation requests are declined/receive no added permissions. No approval UI is implemented. |
| Image/video input, compaction | Unsupported by this text adapter surface; upstream support alone does not advertise an application capability. |

The present adapter uses an isolated empty lane workspace, read-only policy and no native shell, unified exec, computer/browser or temporary multi-agent tools. Workspace/native coding and browser access are enabled by their owning tickets with their resource grants; this ticket does not give a native agent general host access. Raw native history is not returned by the API; application messages remain scoped to their stored thread.

## Evidence and boundaries

See [verification](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-049/README.md at 043f7c9"). Native subscription requests, useful HTTP tool calls, independent DM/group history across a real service/process restart, steer and cancellation were exercised with the user's explicit login. An explicitly selected invalid key was rejected by native inference with billing still `api_key`; successful inference using a valid key was not tested because none was supplied. Fixture tests separately exercise deterministic key success, permission denial, protocol mismatches, scope refusal, partial output and process loss. NMA-060, UI, Muse, installer and production acceptance are not claimed.
