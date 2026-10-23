# Agent lifecycle and configuration — NMA-007

Date: 2026-10-23. Authority: [NMA-007](https://app.notion.com/p/402abdd61873818f8b8dcd3da097114d),
[Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a),
product document 02, acceptance document 07 and the accepted [ADR-03](nma-005-domain-contract.md).

## Outcome and status

Implemented persistent agent create/configure/disable/archive/restore, authenticated HTTP
forwarding and `/agents` configuration UI. Configuration and lifecycle remain authoritative
inside the single Hermes gateway partition. **Review, not Done:** dependency NMA-006 is still
Review because distribution clearance is open. No production deployment or cutover occurred.

The repository started clean. Changes are in the working tree; no implementation commit or push
was requested or created. Review is author self-review, not independent review.

## Implementation

- Migration 2 adds owner-bound agent identities, immutable-by-API configuration revisions and
  durable cancellation fences for unfinished adapter runs. Existing migration 1 stays unchanged.
  Handles are unique per owner including archived agents. Archive retains records and completed
  history; restore retains the UUID and creates a new config revision.
- Configuration commands validate exact fields, handles, lengths and server-catalog model IDs.
  Expected revisions serialize concurrent edits. Entity mutation, command receipt and event commit
  in one native writer transaction. Accepted and rejected retries are retained. Different payloads
  under a used command ID conflict. Cross-owner service envelopes and unknown IDs are refused.
- Persona composition is identity → soul → instructions. Private conversation content is not
  injected into reusable configuration. Model endpoint/workspace choices are server-resolved,
  frozen into the config revision and excluded from public JSON. New agents have no tool grants;
  tool/MCP/skill assignment belongs to NMA-008.
- Each scoped native binding keeps the same product agent UUID and immutable config/context
  revision. Existing admissions keep their snapshots; fresh stale-revision admissions fail.
  Exact accepted retries still return the original receipt after an edit or archive.
- Native `stage_local_session` receives the composed persona through its explicit frozen
  `skills_prompt` argument. `ignore_rules` disables profile-wide soul/memory/context loading.
  The gateway subclass suppresses profile-level prompt overrides for marked persona sessions.
  Tests inspect actual model requests, including absence of a distinct root-profile prompt.
- Disable/archive commits access generation and unfinished-run fences before native cancellation.
  Pending/active admissions are cancelled through the native owner. Fenced outputs are suppressed;
  completed history remains readable. Startup redelivers cancellation. Restore does not revive
  old fenced admissions.
- The backend authenticates with existing Clerk/account identity and signs the private service
  envelope. Public requests cannot choose owner, actor, path, endpoint or runtime-only command.
  The `/api/agent-engine/v1` namespace is separate from legacy execution. Missing partition or
  transport failure returns 503 without claiming admission or falling back to the old engine.
- The UI uses existing shadcn primitives/tokens, accessible labels, loading/error feedback,
  pagination, archive/restore and stable command IDs for uncertain save retries. Desktop and mobile
  navigation expose the page. No goal form or initiative policy was added.

## Verification

[Verification manifest](evidence/nma-007/verification.json) records commands and outcomes.

- 14 real-runtime tests passed on macOS arm64, Python 3.14.9, SQLite 3.53.1/WAL. Tests launch
  the pinned Hermes service in a separate process with a deterministic loopback provider.
  They cover the prior 10 adapter contracts plus additive predecessor migration, configuration
  revision/persona/restart behavior, active/queued archive cancellation, validation and pagination.
  Two thread bindings retain one agent UUID while revision 2 gets its new persona. The earlier
  completed run remains successful after archive; the old config row remains stored.
- Four HTTP boundary tests passed using ASGI plus a real private Unix socket. They verify signed
  authenticated ownership, forbidden owner/actor/runtime fields, error status/command identity and
  absence of cross-partition fallback. These tests inject account authentication; the browser
  walkthrough below separately used real development Clerk authentication.
- Browser at localhost:3007 → API :8007 → real engine → disposable owner partition: created
  Researcher QA and Writer QA with distinct soul/instructions/model IDs; edited Researcher;
  reloaded; restarted engine; checked unchanged UUIDs/revisions and Writer's distinct profile;
  archived and restored Researcher. Screenshots and accessibility snapshots cover 1440px desktop
  and 390px mobile. Browser API probes returned 409 for stale revision, 404 for unknown agent and
  422 for owner spoofing. No mocked HTTP endpoint, paid provider or full DM/group E2E is claimed.
- Web lint/typecheck/build, changed-file Python lint/format, backend mypy and `git diff --check`
  passed. The full `make check` stopped at a pre-existing I001 import-order error in
  `scripts/spikes/hermes_runtime/inventory.py`; that unrelated file was not changed. Build retains
  existing third-party `use client` bundler warnings.

## Provenance and operational notes

Hermes remains pinned to `7489b22af47ce91b366dde81d5831ea422577498`, root MIT. The pin manifest now
also hashes the newly reviewed prompt/execution/schema seams. No upstream source was modified or
copied. Upgrade checks must retest the explicit persona argument, active policy marker, native
admission status reads and cancellation/restart behavior.

Nakama `ac0643f8196fdf9133e66f5a13eef86103c45d0c`, root MIT, informed profile lifecycle and explicit
ordered prompt sections: [profile service](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/apps/server/src/services/profile-service.ts)
and [soul composition](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/packages/core/src/soul/compose.ts).
The implementation is original Ngertiin code; it does not copy their multi-human organization,
shared-profile, filesystem mutation or profile-wide memory behavior. No Nakama dependency is added.

[Engine operations](../../apps/engine/README.md#agent-lifecycle-and-configuration-nma-007) document
partition/model provisioning, migration, consistent backup, rollback and upgrade. No production
SQLite/PostgreSQL migration was applied. Browser test data resides only in a new disposable engine
partition; existing user/legacy execution data was not changed. PostgreSQL projections and durable
SSE remain in their replay/integration slices; current config reads go directly to the authority.

## Findings corrected and remaining boundaries

The first prompt attempt assigned `skills_prompt` on a policy, but native staging replaced it with
its explicit default argument. Passing the explicit staging argument fixed the actual request.
An attempted `ignore_user_config` session took the managed-worker path and failed worker adoption;
that path is not enabled or claimed. The selected path uses the already-tested native executor and
explicit profile-rule suppression. A browser check initially ran before Clerk hydration; repeating
only after the rendered authenticated state succeeded.

Full DM/group APIs and group membership are downstream work. This slice proves stable identity
across scoped bindings, not full group routing or private-memory isolation. Goal/wake entities do
not exist here; their unavailable-agent transitions belong to the corresponding goal slices.
The complete restart-before-claim/tool authorization and descendant fencing matrix remains
NMA-010/023. In particular, startup cancellation replay is not proof that a native queue cannot
briefly execute before the extension attaches. No exactly-once external effect guarantee is made.
Runtime packaging clearance, Linux verification of this slice and production rollout remain open.

## Subsequent verification review

The [NMA-006/007 review](nma-006-007-review.md) found two defects despite the positive suite: pending native admission reconciliation after a configuration edit (P1), and incompatible Unicode/pagination byte limits (P2). Run-revision acceptance is reopened; status remains Review. The same review verified 14/14 tests on Linux, superseding the earlier no-Linux-rerun limitation. No implementation fixes were made during that review.

## Subsequent review fixes

The P1 pending-receipt and P2 transport findings are fixed; see
[fix verification](nma-006-007-fixes.md). Run-revision acceptance is restored, with 17 runtime tests
passing on each platform, six HTTP tests and full `make check` passing. Earlier evidence above
remains historical. Review status still reflects the distribution and full DM/group gates.
