# Server organizations consumer contract — NMA-079

Contract **2.0.0**, verified by NMA-079, is the breaking transition from the owner-only consumer model to authenticated organization/user scope. The installed `/v1/contracts` is authoritative for registered routes, request/response schemas, entity/command/event schemas, product tools, authentication and scope classes. The retained 1.x exports describe their captured versions; they are not edited or relabeled as multi-user acceptance. [Verification](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-079/README.md at 043f7c9") owns the actual gate outcome and limitations.

[NMA-083](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-083/README.md at 043f7c9") records integrated actor/web/Tauri acceptance against installed contract **2.2.0**, including an affected authentication/surface inventory, native provider/file/Computer workflows, deployed transport and bounded workload observations. Its internal materialization, preparation-receipt and Muse catalog corrections do not change the API schema. Full-product and installation gates remain NMA-063/NMA-064.

## Additive web-consumer delta — 2.1.0

NMA-080 adds `GET /v1/data/access` with an executable response schema. It returns `invocable_team_agent_ids` and `allowed_organization_connection_ids` for the current authenticated organization/user context. Management visibility does not grant invocation. Clients filter sidebar/model choices with this response while the server rechecks grants before dispatch. Web onboarding requires compatible major 2 and minor 1 or newer before applying pending writes. The [2.1.0 export](../contracts/2.1.0.json) and [NMA-080 evidence](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-080/README.md at 043f7c9") retain the delta separately from the historical NMA-079 gate.

## Native remote-client media delta — 2.2.0

NMA-081 adds the issuing-session authenticated WebSocket route `/v1/machine/viewer/:viewerId/media` on the application server. Account-mode `StreamService/OpenMedia` returns `media?ticket=...`, resolved against the opaque viewer API base; it must not be resolved against the installation root. The pinned viewer performs that resolution and uses the current origin's WS/WSS scheme. The outer account server owns the upgrade. Ticket, issuing native/browser device, membership, execution domain and control-generation checks remain live for the connection and frames. Native access tokens remain in the native gateway's headers and never become media query credentials.

The [2.2.0 export](../contracts/2.2.0.json), [Tauri transport contract](tauri-remote-client.md) and [NMA-081 evidence](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-081/README.md at 043f7c9") retain this delta independently from earlier API/browser/provider gates. NMA-082 implements a [pinned HTTPS/WSS deployment profile](server-deployment.md) with [bounded disposable Linux proof](../development/history.md#verification-archive--2026-11-17 "Archive: docs/verification/nma-082/README.md at 043f7c9"); selected-host and actual-client acceptance remain open.

## ACP consumer delta — 2.3.0

The [2.3.0 export](../contracts/2.3.0.json) adds Claude/OpenCode/Pi alongside Codex/Muse, an explicit `provider_id` for multi-provider connections/admitted selections, transport/runtime/process/instruction binding metadata, nullable native turn identity on durable steering controls, typed form elicitation and bounded native run progress. The authenticated backend delta cohort passes **17/17** tests: installed schemas, private encrypted key creation/rotation with preserved provider choice, anonymous/cross-user denial, response/replay contracts and organization revocation. These tests do not perform native inference. The [ACP migration](acp-harnesses.md) retains native/provider and UI acceptance separately.

Web/Tauri's shared UI requires API 2.3 or newer before writes. OpenCode/Pi require an explicit model provider; their key entry never chooses a subscription or another provider implicitly. Only advertised steering is enabled, including when `native_run_id` is null. A definite idle rejection returns queued input to FIFO; an ambiguous acknowledgement remains held. Typed form fields preserve native constraints and explicit decline/cancel semantics through the existing interaction journal. Run plans/context/compaction and bounded file-change previews are observed progress, not Goals, artifact publication or new grants. General command execution remains unavailable until its separate lifecycle path is verified.

The backend contract cohort precedes this consumer implementation. Build/typecheck do not establish rendered browser/Tauri acceptance. Native Claude remains unverified by the owner's explicit verification choice; exhausted project API quota does not certify OpenCode/Pi inference. Historical NMA-079/083 acceptance is not relabeled for this delta.

## Harness credential delta — 2.4.0

The [2.4.0 export](../contracts/2.4.0.json) adds `authentication.method: none` with `billing_source: free` for the public OpenCode provider and `authentication.method: harness_config` for existing Pi provider configuration. OpenCode Free uses ordinary `POST /v1/connections` without a credential. Pi uses `POST /v1/connections/native-configuration` with a provider ID and the selected provider's data. Provider IDs, API types and HTTP(S) endpoints come from that configuration, without an application registry for custom native providers. The server encrypts the configuration and returns a secret-free reference. Commands, environment references, non-HTTP(S) endpoints and extension fields are rejected. Retirement deletes the private credential reference; reimport creates a new explicit binding instead of silently switching existing selections.

The ACP native failure contract includes `PROVIDER_LIMIT` for a reported usage limit. It is a failed provider outcome, not logout, cancellation confirmation or permission to change billing. Clients show a quota-reset/connection choice message instead of automatic credential or billing substitution. OpenCode's pinned status hook supplies quota reasons omitted from its ACP projection; other profiles still use their verified native error paths.

The authenticated API cohort verifies unknown native provider IDs, encrypted storage, no key in responses, cross-user denial and retained explicit app-key routes. These are fixture/API results, not provider inference. DeepSeek/Sumopod is an owner-selected native Pi test input, not a product integration or default. Native Claude remains unverified by owner choice; each profile's inference and useful-tool evidence remains separately scoped.

The shared web/Tauri UI requires API 2.4 or newer before writes. Settings and onboarding discover Pi provider choices from the supplied existing native configuration; neither keeps a custom-provider registry. ACP negotiates authentication with the harness, while the application binds the selected credential configuration to its private execution environment. Provider identity, billing, grants and frozen active-run choices remain explicit; no global account, settings or extension inheritance is added.

## Authentication and resource selection

| Class | Authority and scope |
| --- | --- |
| Public | Liveness and native-login metadata only. |
| Authentication protocol | `/api/auth/*` is an explicit method/path allowlist; it is not unrestricted forwarding to the authentication provider. |
| Operator | Local CLI only. Organization Owner/Admin and an installation bearer cannot become an infrastructure operator through HTTP. |
| Bootstrap owner session | Guarded legacy binding and detailed installation readiness require the verified bootstrap account. An organization header cannot elevate a member. |
| User | Verified cookie/device session or native OAuth access token; current membership and resource grants determine access. |
| Run lease | Loopback MCP accepts only the server-issued live run/binding lease. Cookies, installation tokens and caller-supplied identities cannot substitute for it. |
| Ticket | Computer HTTP/media access requires the opaque viewer capability and its issuing user/device session, execution domain, generation and input-lease revision. |

Every account-mode route has `http[].access` and a corresponding `access_model.surfaces` entry. A schema export does not invoke a provider or establish useful inference. The generic entity endpoints remain in the inventory: their lists, individual reads, nested references and events use the same PostgreSQL scope policies as the domain APIs. The restricted statement role is neither a table owner, superuser nor `BYPASSRLS`; administrative readers are bounded internal operations and are not ordinary entity endpoints.

Account/data requests select their candidate organization with `X-Ngertiin-Organization`. The server derives the actor from the session and checks current membership. Administrative routes select the organization in their path. Invitations are email-bound. A requested organization, client role, `owner_id` or cached entity is never authorization.

Team-agent configuration and explicitly published knowledge/skills may be shared by audience. Conversations, messages, memory, private overlays, attachments, derived documents, artifacts, command receipts, provider choices, native bindings and responsibilities remain private to the acting user inside that organization. Organization administration grants no automatic private-data access. See [scoped data](scoped-agent-data.md), [provider connections](provider-connections.md), [app accounts/skills](scoped-apps-skills.md) and [execution domains](execution-domains.md).

## Onboarding sequence

1. Discover native-client metadata with `GET /v1/auth/native` when using Tauri. Browser login uses the selected HTTPS origin and secure HttpOnly cookies. Native login uses the [pinned public-client S256 PKCE flow](user-authentication.md); renewal credentials stay in the native transport/OS store.
2. Read `GET /v1/auth/session` and `GET /v1/contracts`. Reject an unsupported major contract version before writing or applying persisted optimistic commands.
3. Read `GET /v1/organizations`. An empty list means the account needs an invitation or a separately granted organization-creation entitlement; it does not authorize automatic creation or legacy-owner access.
4. Select a current organization. Read its authoritative membership/capabilities and permission-aware administration state.
5. Send `POST /v1/data/provision` with the organization header and a fresh UUID `Idempotency-Key`. Retry the same operation with the same key/body. This materializes one private default agent, DM and authored welcome without model inference.
6. Load scoped agents/conversation state. Show only allowed Team agents and personal/organization connections. Configure a supported explicit selection before admitting native work. Missing credentials/capabilities require an actionable configuration state.

The legacy import/binding is a guarded bootstrap operation, not a step for every new user. Its exact identity mapping is retained. No general old-data migration or production reset is authorized by this contract.

Native event, stop, credential-refresh and recovery callbacks restore their admitted resource principal. Commit subscribers do not inherit the writing request's actor, transaction, shared-publication permission or browser authorizer; durable workers resolve their own current scope. A browser logout closes that device's ingress without transferring or stopping the principal's authorized background responsibility.

## Commands and connection choice

Commands requiring `Idempotency-Key` use a UUID and retain the original receipt. The durable identity includes installation, organization, actor and operation as well as the normalized request fingerprint. A retry retains the original organization, method, path, body and key. Changed input conflicts; receiving a receipt does not mean it is the latest entity state. Reauthorization precedes receipt replay, including after membership removal/rejoin.

For example, an authenticated browser can provision its selected organization:

```ts
const operationId = crypto.randomUUID();
const response = await fetch(`${serverOrigin}/v1/data/provision`, {
  method: "POST",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "X-Ngertiin-Organization": organizationId,
    "Idempotency-Key": operationId,
  },
  body: JSON.stringify({}),
});
```

Retain that operation identity across a lost response. Do not generate a new UUID merely because a connection dropped. This example does not place a native OAuth token in renderer storage.

Connection precedence is an explicit conversation choice, then an unset-compatible personal preference, then an authorized organization default. An invalid explicit choice is an error, not permission to try another account/billing lane. Admission freezes the selected connection, generation, account, model and billing. A later preference affects future work. Native binding identity includes organization, actor, agent, thread and connection generation; shared credentials never imply shared transcripts or native control homes.

Key rotation returns an explicit replacement and requires a new selection. Disconnect fences the current grant and retires applicable local credentials/processes. It does not claim upstream provider revocation unless separately observed. App-account choice is independent of AI-provider choice; published skills never grant app credentials.

## Snapshots, streams and switching

Load a conversation snapshot and retain its atomic cursor. `GET /v1/events` and `/v1/events/stream` filter events for the same actor/organization and use commit-ordered cursors. Hidden events may advance a page watermark. Deduplicate by cursor and entity revision, not by the number of visible rows.

Keep `X-Ngertiin-Event-Context` from the authoritative response alongside the cursor. Nonzero `after`/history cursors require that signed context. For SSE, `Last-Event-ID` takes precedence over `after`; send the matching context header. Streams last at most 60 seconds and must reconnect with the last received cursor. A relevant membership/authorization generation change invalidates the context: take a fresh scoped snapshot instead of reusing a stale cursor.

Namespace query caches, drafts, pending commands, saved cursors, file trees, downloads and viewer handles by installation/user/organization/conversation. Two tabs may operate different organizations simultaneously. Switching presentation never changes the organization of a pending command or an admitted run. Close the old viewer/stream, load the new context and keep pending writes attached to their original context. A header-capable fetch stream is required; a bare browser EventSource cannot supply the organization/context headers.

Logging out or revoking a device invalidates its streams/viewer tickets and clears that client's authentication/caches. Closing a client does not stop server work. Durable background execution resolves its recorded principal and current grants independently of a browser cookie. Removing that principal suspends its responsibilities and fences queued dispatch. Active work receives stop intent; terminal confirmation and unknown outcomes remain distinct. Late native receipts may settle only their reserved dispatch under application authority, without publishing into revoked scope or granting a retry.

After an authority replacement, accepted scoped runs become unknown and retain the lane until native receipt reconciliation. Recovery observes receipts; it does not resubmit prompts. An unknown external effect similarly holds its stable operation/account identity until an authoritative result is known.

## Error handling and compatibility

| Result | Consumer behavior |
| --- | --- |
| `401 UNAUTHORIZED` | Renew or authenticate on the same selected server; re-read session state. |
| `403 SCOPE_DENIED` | Refresh membership/grants and discard stale scope/cursors. Do not switch identities automatically. |
| `404 NOT_FOUND` | Treat an inaccessible private resource as unavailable without disclosing another user's identity/data. |
| `409` conflict/stale dispatch | Read the code, receipt and current entity revisions before retrying. |
| `400/413/422` | Correct the request or size; a validation error is not evidence that an external action ran. |
| Harness error with `not_dispatched` | Offer the applicable credential/model/capability repair, preserving the original queued operation. |
| Unknown native/external outcome | Hold and reconcile; a new command ID must not blindly repeat the effect. |

The former browser controller is disabled for account-mode requests. Scoped browser, shell, files and Computer use the authorized Cua execution domain. A missing private domain/provider never falls back to the installation-wide desktop or host tools. Muse subscription remains unverified; the supported Muse API-key and Codex ChatGPT-account lanes retain separate evidence.

Web/Tauri UI implementation, deployed HTTPS/recovery, fresh-device installers and production capacity claims remain NMA-080–083/NMA-064 responsibilities. This consumer contract does not claim those outcomes.
