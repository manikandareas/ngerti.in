# Organizations, roles and Workgroups

[NMA-074](../backlog/NMA-074.md) adds organization administration on the account authentication boundary from [NMA-073](user-authentication.md). The [main plan](server-organizations-plan-2026-11-12.md) owns the product model. This guide describes contract `nma-074.1`; [verification](../verification/nma-074/README.md) records its actual evidence.

## Scope and authority

Better Auth **1.7.23** Organization maps directly to the product Organization, `member` to active membership, Teams to Workgroups, and `teamMember` to effective Workgroup membership. PostgreSQL is the authority. Ngertiin adds generation/tombstone, provisioning, invitation-delivery, audience, audit and command tables in the authentication schema. There is no second copy of organization identities in the legacy entity store.

Only the product routes below may mutate this model. Raw Better Auth Organization/Teams routes remain outside the allowlist, including server-only member insertion, role setters, deletion and active-organization setters. The plugin is configured with organization creation and deletion disabled; the product service enforces its separate creation policy. This intentionally uses the pinned provider's schema rather than composing independent provider API calls: membership, Workgroups, audit, receipt and provisioning intent must commit in one transaction.

Account authentication does not yet enable general multi-user application data. Organization administrators acquire no private chat, memory, file, connection or credential access. Existing entity/event/tool/Computer APIs retain the explicit bootstrap-owner gate. NMA-075 maps legacy data and consumes membership/audience/private-work scope throughout those surfaces; NMA-076 owns execution-domain isolation. New members can administer permitted organization metadata while their private Tobi/DM provisioning remains pending. These boundaries do not establish NMA-079 readiness.

## Schema and upgrades

The original NMA-073 `auth/schema.sql` and version-1 checksum are immutable. Migration version 2 combines [the generated provider addition](../../apps/server/src/organizations/provider-schema.sql) and [product constraints/tables](../../apps/server/src/organizations/schema.sql). Startup applies missing sequential migrations under the auth-schema advisory lock, verifies every historical checksum, and checks the resulting schema against the pinned provider. Existing accounts, passwords, sessions, tokens and Owner binding are retained. No organization is silently inferred from `owner_id`.

Active `(organization,user)` memberships are unique. Durable membership tombstones survive removal. Workgroup-membership composite foreign keys require both the Workgroup and active member to belong to the same organization. Audience references have organization-qualified foreign keys; deleting a Workgroup cascades its effective audience links. Invitation group snapshots deliberately retain deleted IDs so acceptance fails rather than silently accepting a broader or reduced assignment. `team.memberCount` and `teamMember.membershipKey` remain consistent with the pinned provider shape.

Authentication administration uses the dedicated auth pool. Application-table RLS and a restricted application database role remain NMA-075. Database migration/fixture privileges are not evidence of application RLS.

## Creation and administrative roles

Creation is an installation entitlement, independent of membership role. The verified bootstrap account defaults to a maximum of one created organization. Other accounts default to zero. An explicit operator grant overrides that default, including zero:

```sh
bun apps/server/src/auth/operator.ts grant-organizations person@example.com 3
```

The account must already exist and be verified. The limit is an integer from 0 to 100 and counts organizations created by that account, including organizations whose ownership was later transferred. Membership and private-data access are never granted by this command. Policy changes receive operator-attributed audit records without fabricating an application administrator. No HTTP endpoint can grant the entitlement. A user-scoped transaction advisory lock serializes quota and command identity checks.

| Operation | Owner | Admin | Member |
| --- | --- | --- | --- |
| Read own organization access context | Yes | Yes | Yes |
| Update organization metadata; manage Workgroups/audiences | Yes | Yes | No |
| List members, invitations and administrative audit | Yes | Yes | No |
| Invite ordinary Members | Yes | Yes | No |
| Invite Admin; change any membership role | Yes | No | No |
| Remove another ordinary Member | Yes | Yes | No |
| Remove another Admin/Owner | Yes, subject to last Owner | No | No |
| Leave own membership | Subject to last Owner | Yes | Yes |
| Export organizational administration metadata | Yes | No | No |
| Read another person's private context | No implicit permission | No implicit permission | No |
| Create another organization | Separate entitlement | Separate entitlement | Separate entitlement |

Ownership transfer is explicit: an existing Owner promotes another current member to Owner, then may demote or remove the previous Owner. All organization mutations take the organization row lock, so concurrent demotions/removals retain a last Owner. Organization deletion is unavailable, including to an Owner.

## Access and audience

Every request derives the user/device from authentication and takes its organization from the route. A session's `activeOrganizationId`/`activeTeamId` never authorizes or changes a command. A context contains membership ID/generation, organization authorization generation, current Workgroup IDs, role and capabilities. Administrative management is separate from invoking an agent or selecting a sensitive connection.

Audience policies are reusable organization-owned records for NMA-075 agent grants. `{"mode":"all_members"}` is an explicit grant to current members. `{"mode":"workgroups","workgroup_ids":[...]}` grants the union of current group memberships. An empty group list grants nobody, including Owner/Admin. Removing group membership or deleting the group removes effective access immediately. Audience access alone does not grant an agent, provider/app account or private context.

Role, membership, Workgroup and audience changes advance authorization generations. `Organizations.assertCurrent` re-resolves those generations before scoped work; stale contexts are rejected. Private scheduled execution additionally requires `assertCurrent(context, true)` and an unsuspended principal. NMA-075 must call this boundary throughout scoped lifecycle admission, dispatch and continuation; NMA-076/077/078 extend the check to their resources.

## Invitations and provisioning

Invitations are bound to a normalized email, organization, Member/Admin role, inviter membership/generation and Workgroup snapshot. They expire after 48 hours. Only the intended verified account can review or accept an invitation. An invite cannot self-select or elevate its role. Acceptance rechecks current inviter membership/generation/role, expiry, cancellation and every assigned Workgroup within the locked transaction.

One pending invitation per organization/email is allowed, with up to 100 unexpired pending invitations per organization. An expired row is canceled when a replacement is issued. Owner is never an invitation role. Removing an inviter cancels their pending invitations; demotion/generation change invalidates earlier grants at acceptance.

Acceptance atomically creates one active membership, its group links and one durable provisioning intent keyed by organization/user. Concurrent acceptance with the same or different command IDs returns the same membership and intent. Accepted-invitation retries do not reapply group assignments. A removed/rejoined membership cannot reuse its previous accepted invitation. Retries do not infer or call a model.

NMA-074 persists the provisioning intent; NMA-075 materializes private Tobi/DM identity idempotently. Missing AI connection/model setup, a disconnected client or a service reopen does not lose the accepted membership. Rejoin updates the same intent's membership generation and returns it to pending without duplicating its identity or automatically resuming suspended private work.

The Resend adapter sends a generic email containing the invitation review URL. Delivery occurs after database commit, outside database locks. A delivery failure preserves the invitation with `delivery=failed`; `POST .../send` explicitly retries pending/failed delivery using the same `invitation/<uuid>` provider idempotency key. A recorded sent delivery is not resent. A crash between commit and delivery leaves `pending`, visible to administrators for explicit retry. There is no automatic external-effect replay or delivery worker. A provider timeout may mean delivery occurred; the stable provider key limits duplicate delivery within the provider's window, without claiming indefinite exactly-once email. Controlled capture, not real Resend delivery, is verified.

## HTTP contract

All routes require a current verified browser session or native OAuth access token. Cookie mutations require the configured Origin. Organization administration is unavailable in the local-development bearer profile. Responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`; errors never echo database details, invitation input or provider diagnostics.

Every successful state-changing POST except invitation `send` requires a UUID `Idempotency-Key`. The receipt key is bound to the authenticated user; its fingerprint includes method, exact path and validated body. Replay rechecks current permissions and membership generation. The command, state, audit and provisioning commit together. Reusing a key for another operation/body returns `409 IDEMPOTENCY_CONFLICT`. A removed/rejoined actor cannot replay prior membership receipts.

| Method / path | Behavior |
| --- | --- |
| `GET /v1/organizations` | Own organizations, creation limit and created count |
| `POST /v1/organizations` | Create organization, Owner membership and provisioning intent |
| `GET /v1/organizations/:organizationId` | Current access context |
| `POST /v1/organizations/:organizationId` | Update name/slug |
| `DELETE /v1/organizations/:organizationId` | Always denied; organization deletion disabled |
| `GET .../members` | Current members and safe identity/role metadata |
| `POST .../members/:membershipId/role` | Owner-only role change |
| `POST .../members/:membershipId/remove` | Authorized removal or self-leave |
| `GET .../provisioning` | Own membership provisioning intent |
| `POST .../private-work/resume` | Explicitly clear own private-work suspension |
| `GET/POST .../workgroups` | List/create Workgroups |
| `POST .../workgroups/:workgroupId` | Rename Workgroup |
| `POST .../workgroups/:workgroupId/delete` | Delete Workgroup and revoke its effective access |
| `POST .../workgroups/:workgroupId/members` | Set `membership_id` and `present` |
| `GET/POST .../audiences` | List/create an explicit audience |
| `POST .../audiences/:audienceId` | Replace audience policy |
| `GET .../audiences/:audienceId/access` | Check only the caller's current effective access |
| `GET/POST .../invitations` | Latest 100 invitations / create and attempt delivery |
| `POST .../invitations/:invitationId/cancel` | Cancel a pending invitation |
| `POST .../invitations/:invitationId/send` | Explicit delivery retry; stable provider delivery identity |
| `GET /v1/invitations/:invitationId` | Intended recipient reviews organization/invitation |
| `POST /v1/invitations/:invitationId/accept` | Intended recipient joins assigned organization |
| `GET .../audit?after=0` | Ordered administrative audit, up to 500 rows per page |
| `GET .../export` | Owner-only administrative metadata export |

Here `...` means `/v1/organizations/:organizationId`. The installed account-mode `/v1/contracts` includes the versioned `organizations` section and the exact router-derived requests, responses, auth class and idempotency semantics. The retained local-client application contract stays 1.32.0; NMA-079 owns its later breaking transition.

## Offboarding, retention and reassignment

Removal deletes the active Better Auth member and effective Workgroup memberships, retains the account and membership tombstone, increments generations, suspends the private-work principal and provisioning intent, and cancels the departing inviter's pending invitations in the same transaction. Rejoin advances the generation again. Old contexts, invitations and receipts cannot restore access. Rejoin alone does not resume Goals/Routine: only that user can explicitly clear their suspension in their new membership.

NMA-074 owns this durable execution-principal fence. Existing single-owner Goals/Routine and Team-agent ownership are mapped to it by NMA-075; this milestone does not relabel those unscoped legacy rows or claim an already running multi-user scheduler. Later API/native cohorts must verify queued/in-flight work, stream/viewer teardown and native stop/unknown-effect behavior with their scoped resources.

Organization administration, membership tombstones, command receipts and attributable audit are retained until an explicit operator purge procedure is authorized. There is no automatic account or private-data purge on member removal. Export includes organization metadata, current member identities/roles, Workgroups and audience definitions; it excludes private transcripts, memory, artifacts and credentials. Audit is separately paged. Private-data deletion/export remains scoped to its owner and later data APIs; this administrative export cannot substitute for it.

Team agents remain organization-owned when their creator leaves. Creator attribution does not transfer ownership or private history to an administrator. Private responsibilities remain suspended; organization responsibilities require an explicit execution principal/takeover policy in NMA-075. No administrative role, removal or rejoin silently reassigns work.

Web Settings/onboarding/organization switching is NMA-080; actual Tauri transport/storage is NMA-081. No desktop-rs, live account-mode activation, deployment or distribution change is included.
