# Native Muse Code adapter

Implemented for [NMA-050](../backlog/NMA-050.md), on the existing application lifecycle and broker. The development bootstrap registers Muse and Codex explicitly. Muse owns its model/tool loop; Ngertiin owns identity, admission, queue, transcript publication, grants, stop intent and recovery decisions. This guide records the backend/API adapter milestone. NMA-050 and NMA-060 are Done under the explicitly accepted API-key billing scope; product-wide UI acceptance and installation remain open in [the local backlog](../backlog/README.md).

## Versions and adoption

The server pins **`@muse-code/sdk@1.4.14`** and requires **Muse CLI 1.4.14 or later**. Native tests used the official macOS ARM64 binary **1.4.14-R7309.1**, verified against the official release manifest SHA-256. The exact SDK source revision linked by the ticket, `33110fe570f9e71da4869beab06b803cb3fa9242`, contains version **1.4.14**, superseding the earlier foundation probe's 1.4.12 package. Compatibility checks enforce MSP schema v1, its SDK fingerprint, durable sessions and the `sessionMcp` grant. Newer versions must still negotiate compatible capabilities.

Primary reference: Openbot `01e4b18e238e5de72a3570162c9f4275bb585786`, `muse-client.ts`, `agent/muse-login.ts`, `muse-protocol.ts` and the provider guide. Adopt its official SDK transport, device login, session MCP shape, exact native resume, terminal history reconciliation and native permission/question protocol. Replace its desktop/Effect orchestration, broad environment inheritance and unrestricted process launch with the existing broker and scoped HTTP services. Exact hashes and upgrade steps are in [provenance.json](../verification/nma-050/provenance.json).

Implementation boundaries:

- `transport.ts`: official SDK process, handshake, bounded requests, stable errors and one-attempt commands.
- `adapter.ts`, `client.ts`: one process per connection/agent/thread, session/model/turn identity, native events and controls.
- `accounts.ts`: short-lived account inspection and device-code login hosts.
- `tools.ts`: per-session local MCP endpoint; only active run leases can reach the application's MCP endpoint.
- `protocol.ts`, `interactions.ts`: native input validation, pending stage identity, allowed choices and question answers.
- Parent `harness/accounts.ts`: dispatch account operations to the connection's selected harness.

## Credentials and billing

Use the existing installation bearer and connection API. A subscription selection is `{"harness":"muse","authentication":{"method":"native_login","billing_source":"subscription"}}`. `POST /v1/connections/:id/login` starts native MSP `account/loginStart` with `type: deviceCode`, returning `auth_url`, `user_code` and a ten-minute expiry. `/login/cancel` cancels the owned host. Pending concurrent logins conflict. The connection has its own private HOME/XDG directories; global credentials are neither copied nor inherited. A completed browser flow does not establish inference or active plan entitlement.

For developer credits or another explicitly chosen API key, use `authentication:{"method":"api_key","billing_source":"api_key","credential_ref":"<UUID>"}` and the existing private `0600` credential file. Only that selection injects `META_API_KEY`. Ambient `META_API_KEY`, `MUSE_API_KEY`, endpoint overrides, auth paths and provider configuration are excluded. No subscription failure selects a key automatically.

`POST /v1/connections/:id/inspect` reads experimental native `account/read`, then performs model discovery separately. The observed lanes are `envKey`, `apiKey`, `accountLogin` and `loggedOut`. A key selection must use its injected `envKey`; a native-login selection must use `accountLogin`. A stored key shadowing login is rejected with `BILLING_MISMATCH`. `effective_billing_source` starts as `unknown`, records a verified credential lane, and returns to unknown after a detected mismatch. `authentication.billing_source` remains the user's selection. Neither field claims remaining credits, active entitlement or a completed provider request; `login`, `discovery` and `inference` remain separate observations.

## Sessions, settings and output

Create an agent with an inspected catalog model/reasoning effort, then `POST /v1/threads/:id/sessions` with its `agent_id` before admission. Native sessions are persisted through the application binding, separately for each DM/group lane. Restart resumes the exact stored ID. An active native turn at resume is uncertain and cannot start a replacement run. A missing or mismatched native identity fails closed; no transcript is copied between sessions.

Muse's process startup model and session model must both match the selected model. A real probe found that an unpinned startup model could leave a `-contributor` model in the durable projection despite the session-start response. The adapter now passes the selected `--model`, an explicit `--contributor-mode`, and verifies native `session/read` after `session/setModel`. Contributor variants are selected only when the agent explicitly selects their catalog ID. Model settings never mutate another lane's process.

Native `turn/start` uses the SDK-minted command ID and `maxAttempts: 1`. NMA-053 persists that identity before submission and acceptance before product tools run. Streaming item/delta notifications update one redacted answer snapshot; final output is reconciled with durable `session/read` history, including authoritative empty text. Failed/cancelled output remains partial; process loss retains observed partial output. API SSE is available through the [control/recovery contract](conversation-control-api.md); UI adoption remains behind NMA-060. A delivery gap or uncertain acknowledgement becomes unknown and is never blindly replayed.

## Structured product tools

The native session receives a local MCP server with a random session token. That token cannot authenticate to the application's MCP endpoint. Initialization and catalog reads expose only the implemented `ngertiin.read_run_context` tool. On a tool call, the proxy selects the active run's server-issued lease and calls the **actual application MCP HTTP endpoint**, including protocol negotiation. The backend rechecks scope and current grants. Native transport metadata such as `_meta.progressToken` is stripped before forwarding the structured tool name and arguments. Model prose never dispatches product tools. A stopped, revoked, unaccepted or finished run cannot execute the call.

The CLI launches with `--disable-shell --disable-write` and an isolated empty lane workspace. This ticket does not enable general filesystem/coding/browser capabilities; their owning tickets supply resource grants. The upstream desktop integration's unrestricted process policy is not adopted.

## Native questions, permission and stop

The normalized broker contract v1.2.0 publishes `interaction_answer`. Authenticated `GET /v1/runs/:id/interactions` reads pending native approvals and user inputs for one running run. `POST` to the same path answers one request:

```json
{"type":"approval","request_id":"<native approval ID>","source_index":2,"choice_id":"<offered choice>"}
```

```json
{"type":"user_input","request_id":"<native input ID>","answers":[{"questionId":"database","selectedLabel":"SQLite"}]}
```

Approval responses must match the current native requirement stage and one offered choice. Question answers must cover each question once and match its mode/options/bounds. This path forwards native requests only; it creates no universal application approval gate. Scope, connection and grant revisions are rechecked before responding. A native admission acknowledgement is not proof the permission was granted or the question settled; native resolution events remove pending requests. These operations are not automatically retried after an uncertain result.

NMA-053 reports Muse steer as `unknown`: live R7309.1 behavior did not preserve the single-native-turn mapping, despite a successful admission acknowledgement. The broker refuses native steering and preserves the application queue. `/cancel` persists application stop intent; MSP `turn/interrupt` acknowledgement does not confirm a stopped turn. Only the matching `turn/completed` terminal `cancelled` confirms cancellation. Racing success/failure retains its native outcome. Lost connections, gaps, unknown terminal vocabularies and mismatched IDs remain unknown. See the [control/recovery contract](conversation-control-api.md) for durable streaming and bounded read-only receipt reconciliation added by NMA-053.

## Evidence and remaining acceptance

[Verification](../verification/nma-050/README.md) separates SDK fixtures from native HTTP checks. Completed key-backed inference, useful scoped tools, separate DM/group history, restart resume, native question/answer and confirmed cancellation have recorded proof. The subsequent [interaction repair](../verification/nma-050/interactions/README.md) verifies native allow-once/deny/stale decisions and the repaired question flow. NMA-050 is Done under the user-approved API-key billing exception; Muse subscription remains unavailable/unverified. Earlier fixture and failed native iterations keep their original boundaries. This does not establish installation or production readiness.

## Native interaction repair (2026-11-01)

Workspace conversations select `request_user_input` and `mcp__ngertiin__*` using `run.toolset`; routing selects no tools. Shell and filesystem writes remain disabled. The earlier empty preset withheld questions too. Native approval display fields survive projection and redaction. See [interaction verification](../verification/nma-050/interactions/README.md) for real question, allow-once, deny and stale-response results and the isolated Ask-me probe configuration.
