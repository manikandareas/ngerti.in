# Scoped memory and skills API

NMA-078 amendment: [management-published Team skill revisions and private overlays](scoped-apps-skills.md#published-and-private-skills) extend this API at contract 1.35.0. Team publication uses its separate management endpoints; ordinary learning/chat edits remain private. Inherited inventories resolve the acting user's selected provider binding and generation. See [verification](../verification/nma-078/README.md) for separate native-catalog and package-read observations.

Planned November 12 amendment: [the server-organizations plan](server-organizations-plan-2026-11-12.md) and NMA-072–083 define PostgreSQL, authenticated organization/user scope, private Team-agent interactions and explicit connections. This guide retains its current/recorded implementation boundary until the new NMA-079 API gate verifies the changed contract; its owner-only examples do not establish multi-user authorization.

Application contract **1.6.0**. This is the backend boundary for [NMA-055](../backlog/NMA-055.md), after NMA-054. The [verification report](../verification/nma-055/README.md) distinguishes fixtures, native inference and recovery evidence. The API gate subsequently passed; later UI and distribution status remains separately recorded in [the local backlog](../backlog/README.md).

## Scope and ownership

Owner HTTP clients authenticate with the installation token. Every learning request selects a valid `{agent_id, thread_id}` context; a current thread member is required even for shared content. Product tools derive this context from the server-issued run lease. Model arguments cannot select a different owner, agent or conversation.

| Visibility | Recall and package access |
| --- | --- |
| `dm_private` | The originating agent's exact DM. Creation requires a DM. |
| `group` | Current members of the exact group. Creation requires a group. Memory belongs to the conversation; only the package's creator can publish its revisions. Each member's assignment is independent. |
| `shared` | Explicitly shared across one persistent agent's conversations. It does not grant another agent access or share its originating transcript. |

Visibility is immutable. Sharing means explicitly creating a shared record/package; updating a private record cannot turn it into shared content. The harness is instructed to require an explicit sharing request before promoting private content. There is no automatic transcript-to-global-memory copy or second model loop. Revoked membership and tool grants are checked at the server before each operation. Native sessions and workspace files remain conversation-scoped.

## Memory identity, revisions and deletion

`write_memory` takes a stable caller-generated UUID `memory_id`. `expected_revision: 0` creates that identity; a positive value corrects exactly that active revision. Conflicts return `CONFLICT`. Deletion requires the current revision, clears the projection text and advances it to a permanent tombstone. Neither create nor update can reuse a tombstoned identity. A new user-authorized fact uses a new identity.

Each mutation commits its projection, event and immutable command receipt in one SQLite transaction. Use a UUID `Idempotency-Key` for HTTP or `command_id` for a product tool. Reusing the same key and canonical input returns the original receipt; different input or a different tool context returns `IDEMPOTENCY_CONFLICT`. An old receipt is historical evidence, not the current memory or assignment projection. Replaying it cannot restore deleted content or roll back a correction. Mutations take effect when the tool receipt succeeds, even if the native run subsequently stops. There is no terminal-run staging buffer that could lose acknowledged changes.

Recall excludes tombstones by default and searches only visible active text. `include_deleted: true` exposes empty tombstones. Results contain `memories`, `has_more`, and `next_after`; use `after` for pagination. Maximum page size is 100 records and 32,000 serialized record bytes. A foreign cursor is denied; a cursor removed from the selected result set conflicts so a client can restart its read. The fresh bounded snapshot accompanying each native turn includes tombstones and an explicit instruction to disregard obsolete native-history facts; the agent can page through current state using tools.

Deletion removes a fact from current recall. Owner-authenticated historical events, native transcripts and immutable earlier command receipts remain retained evidence. It is not physical erasure of history or a semantic prohibition on a user explicitly supplying the fact again.

## Application packages and assignments

Application packages have a stable UUID, immutable visibility/name, and append-only versions. A revision stores its description, instructions, assets, canonical SHA-256 and originating run. Assets use relative names and either UTF-8 `text` or `content_base64`. No input accepts a destination on the host filesystem. Limits: 64,000 instruction characters, 32 assets, 64,000 text characters or 90,000 base64 characters per asset, and 200,000 serialized package bytes. Traversal, absolute paths, `SKILL.md` replacement, duplicate asset names and case-ambiguous names are rejected. SQLite stores package bytes atomically with metadata/receipts, outside native workspaces. Reading a version verifies its hash; the store refuses updates to a revision entity.

Assignments pin a particular version and require their own `expected_revision` (zero for a first assignment). Publishing version 2 leaves an assignment to version 1 unchanged. An explicit reassignment selects the new version; `enabled: false` disables an assignment while retaining its evidence. A private/group assignment stays in its conversation; a shared package assignment applies across that agent's conversations. A shared assignment cannot introduce a same-name conflict with an enabled private assignment in another conversation.

Profile `agent.skills` fields retained from the earlier configuration contract are references, not grants or scoped assignments. Inventory labels them `reference_only`. Use `assign_skill` to activate an application package. Per-turn context advertises enabled, pinned application assignments, and the agent reads their instructions/assets through `read_skill` when relevant. These bytes do not confer extra filesystem or tool permissions, and scripts are not executed automatically.

## Two harness skill observations

Inventory records two separate read-only observations:

- `native_catalog` / `native_state`: Codex App Server `skills/list` and Muse MSP `skill/list` report the skills the native harness knows. Native keys, source, enabled state and descriptions are retained per native binding. Bundled/plugin content continues to belong to the harness; the application does not mirror or edit those installations.
- `harness` / `harness_state`: bounded packages read from the isolated connection's skill directories and the current workspace's `.agents/skills`, including Codex `.system` packages when present. This follows Openbot's instruction/bridge approach for a harness that does not natively discover the common folder. `read_harness_skill` returns the confined snapshot and its hash. It never writes the source package. Absolute host HOME, foreign workspaces and credential directories are not discovery roots. Descriptor-relative reads reject symlinks/hardlinks and root substitution. Invalid, oversized or unsupported packages increment `rejected_packages`; partial discovery is `unknown`.

The native catalog is refreshed before dispatch; folder snapshots are refreshed with it. Known disabled native names are withheld from the folder bridge as well, so a copied snapshot cannot bypass native disablement. A failure to query the native catalog stays `unknown`, independently of successful folder discovery. It is not inferred from an installed CLI or a folder's presence.

Application keys are `application:<UUID>`; bridged harness keys include their source/name/content hash, and native keys include their harness/source/selector. Application/harness name collisions remain visible in `collisions`; qualified identities are required and no source silently overwrites another. A duplicate application name in the visible namespace conflicts. Application revision/assignment handlers accept application UUIDs only. There is no product tool to alter native activation, plugins or files.

Codex native ancestor `AGENTS.md` discovery is disabled for its confined sessions. Ngertiin reads only the authorized workspace's root `AGENTS.md`, through the same confined file reader, and supplies that guidance with the product profile. This avoids loading parent repository/host instructions outside the grant or failing startup on their denied reads. Nested project guidance remains readable inside the workspace when relevant. Muse pending interactions are reconciled using native `approval/listPending` before display/decision, so replayed old approval notifications cannot become a fresh grant. Native approvals still require explicit scoped choices; this change adds no automatic approval policy.

## Routes and product tools

All mutation routes require `Idempotency-Key`. Bodies contain `context` and the command's fields. `/v1/contracts` publishes the entity and command schemas; `describe_tools` publishes exact callable tool schemas.

| HTTP | Product tool |
| --- | --- |
| `GET /v1/learning/memories?agent_id=…&thread_id=…&query=…&after=…&limit=…&include_deleted=true` | `ngertiin.list_memories` |
| `POST /v1/learning/memories/write` | `ngertiin.write_memory` |
| `POST /v1/learning/memories/delete` | `ngertiin.delete_memory` |
| `GET /v1/learning/skills?agent_id=…&thread_id=…` | `ngertiin.list_skills` |
| `POST /v1/learning/skills/create` | `ngertiin.create_skill` |
| `POST /v1/learning/skills/revise` | `ngertiin.revise_skill` |
| `POST /v1/learning/skills/read` | `ngertiin.read_skill` |
| `POST /v1/learning/skills/assign` | `ngertiin.assign_skill` |
| Scoped harness snapshot from inventory | `ngertiin.read_harness_skill` |

Example HTTP memory correction (replace UUID placeholders with actual IDs):

```json
{
  "context": {"agent_id": "<agent UUID>", "thread_id": "<thread UUID>"},
  "memory_id": "<memory UUID>",
  "expected_revision": 1,
  "visibility": "dm_private",
  "text": "Prefer concise reports."
}
```

Example application package creation:

```json
{
  "context": {"agent_id": "<agent UUID>", "thread_id": "<thread UUID>"},
  "name": "concise-reports",
  "visibility": "dm_private",
  "package": {
    "description": "Produce a concise evidence-backed report.",
    "instructions": "Read references/checklist.txt and check every reported result.",
    "assets": [{"path": "references/checklist.txt", "text": "State the result and its evidence.\n"}]
  }
}
```

For product tools omit `context` and include a mutation's UUID `command_id`. The server derives scope from the authenticated lease. Both adapters retain their native model/tool loops; the application dispatches typed local operations without an additional inference loop.
