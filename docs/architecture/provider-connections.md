# Personal and organization AI connections

Contract **1.34.0**, scoped provider contract **nma-077.1**. [NMA-077](../backlog/NMA-077.md) is Done for its verified provider-connection scope, including two distinct live ChatGPT accounts, one Free. [Verification](../verification/nma-077/README.md) distinguishes HTTP/PostgreSQL, protocol fixtures, native Codex and native Muse. NMA-078 implements [app/MCP/skill isolation](scoped-apps-skills.md) at contract 1.35.0; this guide retains the 1.34.0 provider boundary. NMA-079 verifies normal organization/user native admission and the [2.0.0 consumer contract](server-organizations-api.md). [Its report](../verification/nma-079/README.md) owns that integration proof; web/Tauri presentation remains NMA-080/081.

## Ownership and access

Connections are secret-free entities. Account-mode records have immutable `organization_id` and `actor_id`; personal records belong to the current user, organization records have a null actor and an explicit organization-local `audience_id`. Owner/Admin manage organization connections. Invocation separately requires current membership in that audience; management permission is not an invocation grant. Members manage their personal connections. An external account used in another organization requires another explicit connection.

PostgreSQL migration 4 extends RLS for audience-authorized organization connections and organization defaults. The authenticated context resolves allowed connection IDs from current Workgroup audiences. Private connection records remain inaccessible to other members and administrators. Existing migration checksums remain unchanged. Composite reference guards also validate nested selection/snapshot references, and a database trigger rejects mutation of an admitted run's provider snapshot.

`POST /v1/connections` accepts the existing harness/authentication fields plus `ownership: personal | organization` and `audience_id`. Defaults are personal/null. In account mode, native-login creation uses this route; submitted API keys use `/v1/connections/api-key`. A client cannot reference another stored key by supplying `credential_ref` to the general creation route. No provider key is placed in a domain entity, event or receipt.

## Private selection and admission

`POST /v1/ai/selections` is an idempotent command with these fields:

| Field | Meaning |
| --- | --- |
| `scope` | `conversation`, `user` or `organization` |
| `harness` | `codex` or `muse` |
| `thread_id`, `agent_id` | Required for conversation scope; null for the other scopes |
| `selection` | `{connection_id, model_id, reasoning}` or null to unset |

User and conversation preferences are private `ai_selection` entities. Owner/Admin publish organization defaults, which must reference an organization connection. Personal preferences cannot rewrite a Team agent's connection, model or shared instructions.

Resolution uses conversation choice, user preference, then an allowed organization default. Only an unset selection inherits. A revoked, inaccessible or incompatible explicit selection fails; it never advances to another account or billing lane. Catalog model/reasoning validation uses the selected connection. Account login, catalog discovery, effective billing and inference remain separate observations.

Connection inspection exposes optional nullable `account_plan`, the provider's observed plan string. It is server-derived metadata, not a creation input or a promise of model entitlement. The legacy `billing_source: subscription` value identifies the ChatGPT account lane, including Free; it does not prove a paid subscription. The live probe observed `free` and `prolite`, with separate catalogs and default models. Codex external-token delivery includes the observed `chatgptPlanType`; no API key or account fallback is used.

An admitted scoped run records `provider_selection`: connection ID and grant generation, observed account identity, harness, model, reasoning and selected billing source. Account identities are non-secret hashes. Preparation and dispatch recheck current authorization, generation, account and effective billing. An unconfigured run cannot acquire a provider from a later UI selection. Inspect/configure a connection before submitting work. A changed authorization/account snapshot requires explicit new work; retries cannot rewrite it.

Goals and Routine retain the creating run's selection, or resolve it explicitly at direct responsibility creation. Their later occurrences use that stored selection and the existing durable organization/user execution principal. Changing a UI preference cannot move a schedule to another connection. Membership removal retains the NMA-074/075 private-work suspension and rejoin fences.

## Native storage and credential delivery

Legacy single-owner paths retain compatibility. New scoped native homes are keyed by connection plus organization, actor, agent, conversation and connection generation. Their canonical private directories contain separate native transcripts, history and skill caches even when users select the same organization connection. Native bindings retain organization/actor, connection generation and observed account identity. Another account/generation cannot resume the binding.

Codex uses one managed account process per connection as the credential/refresh authority. Account inspection and refresh use that authority's private `CODEX_HOME`; lane processes never share that home. Concurrent refresh consumers share one in-flight refresh, each consumer reauthorizes before and after delivery, and native authority restart reads the retained selected context.

The pinned/tested Codex **0.169.0** protocol supports device-code login and experimental `chatgptAuthTokens` delivery. Scoped login uses `chatgptDeviceCode` and returns only the initiating user's verification URL/code. The provider owns password entry. Lane initialization supplies only a short-lived access token and account identity through private JSON-RPC; native refresh requests return to the same authority. Native lane credential storage is `ephemeral`, including explicitly selected API keys. API-key account-inspection processes also use ephemeral storage, so they cannot create a duplicate plaintext native auth file outside the encrypted vault; only the managed subscription authority retains native authentication files. No authenticated native home or refresh-token file is copied to a lane. Refresh cannot change the selected account. Scoped Muse native-login/subscription remains an explicit unknown capability; the API-key lane is supported.

The [official app-server authentication documentation](https://learn.chatgpt.com/docs/app-server#auth-endpoints) identifies external-token mode as experimental and distinguishes app-server authentication from Sign in with ChatGPT for commercial/hosted services. This technical owner-operated probe establishes neither a service entitlement nor subscription-sharing permission. Deployment must resolve applicable provider eligibility; commercial/hosted integration must use the provider-supported Sign in with ChatGPT path. No new provider or billing fallback is introduced.

## Operator storage configuration

| Setting | Required treatment |
| --- | --- |
| `NGERTIIN_PROVIDER_MASTER_KEY_FILE` | Private file containing exactly 32 binary bytes, mode `0600`; keep it outside ordinary state backups and provision its recovery separately |
| `NGERTIIN_PROVIDER_NATIVE_STORAGE=encrypted-volume` | Explicit operator attestation for the native authority volume and its backups; required before scoped Codex login/token delivery |
| `NGERTIIN_PROVIDER_REVOCATIONS_DIR` | Latest durable local revocation ledger; place outside a rollback/restore target and retain it across restore |

Scoped submitted API keys use AES-256-GCM envelopes with a fresh nonce and credential-reference authenticated data. Missing keys, wrong keys, public permissions, symlinks and tampered/relocated ciphertext fail closed. Legacy plaintext references remain readable only by the legacy lane; scoped native key reads require encrypted bytes. Child environments use the existing OS allowlist, isolated HOME/XDG paths and selected key only. Master-key paths, database credentials and ambient provider configuration are not inherited.

Directory modes are not encryption. The native authority still uses native-compatible file authentication on the attested encrypted volume. The retained workstation reported FileVault On; that observation does not attest another server or its backups. Whole-stack encrypted backup/restore and operational RPO/RTO remain NMA-082 evidence.

## Revoke, rotate and restore

Revoke durably changes connection state/generation, closes the account authority and affected lane processes, waits for initializing lanes to retire, then writes/fsyncs a revocation tombstone and removes connection-native files and the selected key reference. A failed cleanup is visible and the idempotent revoke can retry it. Other connections stay alive. Product conversation records remain in PostgreSQL; native transcript/cache files of the retired connection are removed with its homes. Local cleanup does not revoke credentials at the provider or undo an already completed external effect. Unknown runs/effects remain unresolved after native history deletion; retirement never authorizes replay, and external receipt reconciliation may still be required.

`POST /v1/connections/:id/rotate-key` accepts `{api_key}`. It atomically creates a replacement connection and revokes the old one, then performs the same process/storage retirement. Its secret-free result contains `retired`, `replacement` and `selection_action: explicitly_select_replacement`. Existing preferences and admitted work retain the retired ID until the user explicitly changes them. Lost acknowledgements replay the same replacement; they do not create more keys or silently select it.

Before launch, local tombstones fence restored old native homes even if their credential files reappear. Restoring an older revocation ledger is unsupported: preserve the latest ledger, overlay it onto a restored installation and reconcile database/credential generations before admission. The fixture verifies restored native files against a retained ledger; it does not claim a deployed whole-stack restore or provider-side revocation.

## Verification boundary

The first native Codex probe uses a new device login completed by the user, one selected ChatGPT account, one refresh authority and two actor-private native homes. Both consumers complete inference and actual application tool calls without receiving each other's marker. A subsequent [two-account probe](../verification/nma-077/free-account/README.md) uses real application HTTP/SQL principals and separate personal connections to the same Team agent. Both the Free and comparison accounts pass catalog, inference, actual scoped tool execution, refresh/restart and own-session resume; cross-account resume is rejected, and retiring Free leaves the other account usable. Native Muse uses the explicitly selected API key, an encrypted private reference and a separate home; login, catalog, inference and an actual application tool call pass. Native home files contain no submitted Muse key.

Those native consumers use controlled application fixtures and do not reopen production organization `claimNext`. The two-account probe synthesizes accepted dispatch state only in its disposable fixture; the real ProductTools gateway still checks current organization, actor, connection, binding and grants. HTTP/PostgreSQL fixtures separately prove private connection ownership, organization audiences, selection, frozen nested references, rotation, responsibilities and revocation. Muse subscription, real product browser/Tauri journeys, deployed transport, coordinated server restore and distribution remain separate.
