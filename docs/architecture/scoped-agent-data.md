# Private and Team-agent data

NMA-079 amendment: the [2.0.0 server-organizations consumer contract](server-organizations-api.md) and [verification report](../verification/nma-079/README.md) own current account-mode authentication, scope, normal native dispatch and readiness. Earlier versioned examples and pending-gate statements below retain their captured scope. Web/Tauri UI and deployment remain later milestones.

[NMA-075](../backlog/NMA-075.md) implements the application-data boundary following [organization administration](organization-access.md). Its account-mode contract is `nma-075.1`, exported as `scoped_data` by `/v1/contracts`. The historical local-development contract and native provider evidence retain their original boundaries. The broader API gate remains NMA-079.

## Identity and request context

Account-mode application requests select an organization with `X-Ngertiin-Organization`. The server derives the actor from the verified browser/native session and resolves current membership, membership generation, organization authorization generation and effective audiences. Request bodies cannot select an actor or override these grants. An active-organization session field is never used. Two tabs may select different organizations, and a retry must send its original organization header and idempotency key.

`owner_id` remains the retained installation identity. Persisted application rows additionally carry `organization_id` and `actor_id`; these columns must match their payload. Personal agents and private application entities have a non-null actor. Organization agents and explicitly published knowledge have a null actor and a managed audience. Administrative permission grants configuration management, without private transcript access or implicit invocation permission.

The Store binds context using AsyncLocalStorage before opening a transaction. Every query revalidates it. Private mutations and invocation additionally recheck the retained private-work principal. Application transactions hold a shared organization lock across their SQL work, preventing membership/audience administration from changing authorization underneath a commit. Context changes inside an existing transaction are rejected.

## Application role and database policies

The additive application migration is version 2; the NMA-072 version-1 schema and checksum are retained. A migration/authority connection initializes schema and the restricted `ngertiin_runtime` role. This role has no login, superuser, role-creation, database-creation or RLS-bypass attribute and owns no application tables. Each query/transaction uses `SET LOCAL ROLE` and transaction-local scope settings. Tenant and actor settings never survive pool reuse or rollback.

`NGERTIIN_DATABASE_URL` remains the migration/authority connection. Operators can supply a separate `NGERTIIN_APPLICATION_DATABASE_URL` whose login is a non-owner, non-superuser, non-BYPASSRLS member of `ngertiin_runtime`. The application pool then uses that login; it still selects the restricted role transaction-locally. Migration/authority and the narrowly bounded legacy-binding/Team-grant service pool retain separate privileged connections. Local development without the second URL uses the migration login as session identity and restricts ordinary statements with the same application role. Verification separately exercises a real restricted login.

RLS protects entities, events, command receipts, public conversation parts, routing diagnostics and private provisioning pointers. Private reads require both organization and actor. Team configuration/knowledge reads require effective invocation or management access. Shared writes require explicit publication and management permission. Receipt replay rechecks current entity and Team-agent invocation access, while an authorized published-configuration/knowledge operation retains its distinct management permission. Receipts also require the current membership generation; a removed/rejoined membership cannot read or replay an earlier receipt. Conflicting old command identities roll back before a second effect is committed.

Organization-qualified references, private provisioning references and uniqueness indexes reject mismatches. Deferred entity-reference checks support atomic circular message/run and task/run creation. Default DM/system-role/handle uniqueness includes organization and user; private DM identity is no longer installation-wide per Team agent.

## Provisioning and retained data

`POST /v1/data/provision` consumes the NMA-074 provisioning intent. It atomically retains one default agent, primary DM, authored welcome and provisioning pointer for the organization/user. The intent is then marked materialized with its membership generation; retry repairs an interrupted acknowledgement. No inference, provider login or machine provisioning occurs.

New default and quick-created agent names use the pinned `unique-names-generator` 4.7.1 name dictionary, filtered to a curated single-syllable subset. Unused names are exhausted before a numeric collision suffix is needed. Existing names and identities are preserved. The internal `tobi` system-role/receipt identifiers remain compatibility identifiers and do not require that display name.

If retained owner-wide entities exist, scoped application access stays closed until the verified bootstrap account explicitly binds them to an organization it currently owns using `POST /v1/data/legacy-binding` with `organization_id` and the exact `legacy_owner_id`. The operation backfills private entities, events, public parts and routing diagnostics, maps private receipts, retains IDs/bytes/native binding metadata and records one immutable mapping. Repeating the same mapping is safe; another mapping is denied. Active or unknown legacy native work must be settled/reconciled before mapping. Old owner-wide application routes are closed after binding. This task does not activate account mode or map live development data automatically.

## Team configuration and private personalization

| Operation | Authorization and result |
| --- | --- |
| `POST /v1/data/team-agents` | Owner/Admin creates organization-owned configuration with an existing same-organization `audience_id`; private provider connections are excluded. |
| `POST /v1/data/team-agents/:id/configuration` | Owner/Admin updates published name/instructions/soul with an expected revision. |
| `POST /v1/organizations/:organizationId/agent-access/:id` | Owner/Admin replaces the audience, increments authorization generation and retains an administrative command/audit receipt. |
| `POST /v1/data/agents/:id/preferences` | Authorized invoker stores their private instructions/soul overlay. Shared configuration stays unchanged. |
| `POST /v1/data/agents/:id/knowledge` | Owner/Admin explicitly publishes text for the agent's authorized audience. No private memory or chat is copied implicitly. |

The effective execution profile combines published configuration/knowledge and that user's preferences before a future admission snapshot. An existing active snapshot remains frozen. Team agents survive their creator's removal; creator attribution never grants access to private interactions.

## Events, history and derived data

Snapshots, history, generic entity reads, retrieval, private file metadata/downloads, parser projections, Goals/Routine and journal reads use the same scoped Store and policies. Immutable downloads recheck workspace/artifact ownership before reading bytes. Parser cache paths include immutable artifact identity/hash/version, and cached or coalesced results require an authorized scoped source read. Native interaction journals first require access to the owning run. Private working files are never inferred from a shared Team-agent identity.

Scoped staged attachments materialize into their authorized private execution domain before native dispatch verifies the working copy. Account scope does not skip that projection; a legacy host-only workspace is still denied. Immutable bytes, derived-document authorization and working-copy readiness remain separate evidence. [NMA-083 verification](../verification/nma-083/README.md) records the normal-dispatch regression and actual native file-read/publication results.

Responses include `X-Ngertiin-Event-Context`, an HMAC-authenticated organization/user/membership/authorization-generation context. Event replay with a nonzero `after`/`Last-Event-ID` and paginated conversation history/timeline must return this header. A cursor from another user/organization or a prior permission generation is rejected. SSE captures its data context for later stream pulls, rechecks before delivery and closes after revocation, including while idle. Filtered event pages advance over invisible events without revealing their payload.

Background responsibility admission resolves durable organization/user principals independently of browser sessions. Removal suspends private work; rejoin alone does not resume it. Queued work retains its initiating context through retries. Organization-owned responsibility takeover has no automatic path: the current implementation creates private responsibilities, and administrators cannot assume them.

## Resource and delivery boundaries

Scoped users cannot prepare or execute native harness work against the historical shared machine/provider homes. Their logical responsibilities may schedule durable queued work. NMA-076 adds [private execution domains](execution-domains.md) for scoped machine/Computer and working-file access; NMA-077 verifies private provider routing, and NMA-078 implements [app/MCP/skill isolation](scoped-apps-skills.md). Production native claims and dispatch remain closed for the complete NMA-079 API/isolation readiness gate. Private uploads, immutable downloads and parser data retain their backend scope. The [NMA-076 evidence](../verification/nma-076/README.md) separately establishes its tested native OS boundary. Existing local single-owner execution remains covered by its retained regression/native evidence.

NMA-079 verifies the expanded API before NMA-080/NMA-081 implement web/Tauri onboarding, organization switching and cache namespacing. This backend work does not claim browser/Tauri acceptance, provider inference, isolated Cua execution, deployment, distribution or production readiness.
