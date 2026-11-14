# Scoped application accounts, MCP catalogs and Team skills

NMA-079 amendment: the [2.0.0 server-organizations consumer contract](server-organizations-api.md) and [verification report](../verification/nma-079/README.md) own current account-mode authentication, scope, normal native dispatch and readiness. Earlier versioned examples and pending-gate statements below retain their captured scope. Web/Tauri UI and deployment remain later milestones.

NMA-078 extends the NMA-077 provider boundary. Model-provider selection and app-account selection are independent. This backend contract targets the server and later web/Tauri consumers; desktop-rs remains paused. The complete multi-user API gate remains NMA-079.

## Identity and authorization

An application connection has `ownership: personal | organization`, an explicit `audience_id` for organization ownership, a backend-derived `integration_identity`, and `initiated_by`. Composio identities are deterministic hashes of organization, ownership and, for personal ownership, user identity. The installation's historical owner identity is used only by the retained unscoped baseline. A personal connection in another organization requires a separate explicit authorization.

`POST /v1/apps/connect` accepts `{toolkit, ownership?, audience_id?}`. Personal is the default. Only Owner/Admin can connect an organization account and select its existing audience. Reconnect retains ownership/audience, binds its new OAuth link to the initiating principal and increments generation. The backend revalidates the principal after asynchronous authorization and refuses stale updates. Connect Links remain confined to the authenticated management response and are never product-tool output.

Organization members with an applicable audience and agent grant use the designated integration identity without connecting a personal account. Other users cannot read, select, reconnect, or manage a personal account. Management status does not itself grant invocation of an account outside its audience. Revocation is local and does not claim upstream OAuth-token revocation.

## Grants and supported resource constraints

An assignment replaces `grants` with optimistic `expected_revision`. Each grant contains:

```json
{
  "agent_id": "<agent UUID>",
  "thread_id": null,
  "tools": ["<discovered tool slug>"],
  "resources": {"repository.owner": ["approved-team"]}
}
```

For an organization connection, grants target a Team agent and use `thread_id: null`; they do not embed another human's private thread ID. The connection's audience supplies Workgroup access. A personal grant can target a specific owned conversation or a Team agent across that user's conversations. No account alone grants execution.

Resource constraints are exact allowed scalar values at declared dot-separated argument paths. Every declared path must exist and match one allowed value before dispatch. They are explicit provider-tool argument restrictions, not semantic analysis of arbitrary queries or a claim about every resource reachable by an upstream OAuth token. Grant only tools whose required resource restrictions can be expressed and reviewed with this mechanism; unrestricted tools require an explicit unrestricted grant.

Search/schema discovery, session reuse and execution recheck ownership, membership, audience, generation and tool grants. The SDK session pins one connected account, toolkit and enabled tool set. Remote session user/account drift is rejected. Missing or revoked connected accounts never fall back to another account. The Composio SDK remains pinned to 0.27.0 using REST v3.1; sandbox, in-chat connection management, Instant routing and automatic local uploads/downloads remain disabled for execution.

## Supported catalog paths

| Path | Enforcement |
| --- | --- |
| Composio toolkit catalog | Public metadata projected by the backend; connection state is scoped separately |
| Composio search and schemas | Backend-derived identity, exact account pin, current connection/tool grants |
| Composio execution | Scoped product tool, account preflight, resource constraints, durable effect reservation |
| Codex product tools | Per-run structured dynamic bridge and application MCP lease |
| Muse product tools | Session-local `ngertiin` MCP server, per-run lease and application authorization |
| Browser/Computer product tools | Existing execution-domain and viewer/foreground-lease enforcement |
| Native/global MCP and plugin configuration | Rejected before scoped process launch; Codex native apps/plugins and skill dependency installation disabled |
| Arbitrary custom MCP registration | Unavailable; no raw endpoint/token forwarding is exposed |

Scoped native homes and project/ancestor configuration cannot silently install a second privileged catalog. `assertScopedCatalog` rejects unsupported configuration files, including links, before either adapter launches. This conservative compatibility boundary can reject a harmless native configuration file as well; remove it from the isolated execution tree rather than treating it as authorized application configuration. The runtime still uses actor/binding-private homes and the existing confined filesystem/environment policy. API-wide native admission remains a separate NMA-079 verification boundary.

## Published and private skills

Only management routes publish an organization-owned application package:

- `POST /v1/data/team-agents/:id/skills/publish`: `{skill_id?, expected_revision, name, package, enabled?}`. A new skill uses revision 0; an update supplies its existing ID and revision. Atomically creates an immutable package revision and pins the Team assignment to it.
- `POST /v1/data/team-agents/:id/skills/assign`: `{skill_id, version, expected_revision, enabled}`. Explicitly selects or disables an existing immutable revision.

Published skills, revisions and assignments carry the Team agent identity with `actor_id: null`; they contain no private conversation or source-run reference. PostgreSQL RLS exposes them only through accessible Team agents. Revision updates are rejected by both the store and a database trigger. Shared and personal names have separate uniqueness scopes; qualified identities expose collisions without cross-source overwrite.

Ordinary chat tools and `/v1/learning/skills/*` create/revise/assign only the acting user's application packages. A private package or preference does not overwrite a published Team package. Publishing a private draft requires an explicit management-authorized copy through the publication API. A skill grants no application credentials or resource permissions.

Harness inventories remain read-only, private to the selected actor/conversation/provider binding and current connection generation. Changing the provider selection does not change app routing or reveal the former account's private skill cache. Native discovery and bounded package reads are separate observations: the tested Muse runtime does not natively enumerate the test packages, while the application bridge reads them from its private home without editing source bytes.

## External effects and revocation

Before sending an operation, persist the actor/organization/run/account, command fingerprint and connection generation together with a unique durable account hold. `app_account_holds` serializes a connected-account ID across different application users and survives reconnect/restart. An unknown/dispatched effect keeps the hold; a new command ID cannot bypass it. Known succeeded/failed outcomes release only their matching hold. Unknown outcomes require investigation; there is no speculative replay or automatic reconciliation endpoint.

The narrow server-authority `settleAppEffect` operation may update only a previously reserved matching effect. This preserves a real late outcome after membership is revoked, with its original private attribution. Current authorization is checked before returning the result, so a revoked actor cannot receive it. Startup retains unacknowledged operations as unknown. No provider tokens, raw arguments or SDK exception bodies enter these receipts.

See [NMA-078](../backlog/NMA-078.md), [verification](../verification/nma-078/README.md), [application APIs](apps-research-visual-api.md), and [memory/skills APIs](memory-skills-api.md).
