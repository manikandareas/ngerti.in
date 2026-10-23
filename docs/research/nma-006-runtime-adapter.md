# Isolated runtime adapter

Date: 2026-10-23. Scope: [NMA-006](https://app.notion.com/p/402abdd6187381d899d0c98b4bf081d7).
Authority: [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a),
[ADR-01](nma-004-engine-integration-adrs.md) and [ADR-03](nma-005-domain-contract.md).
The live NMA-005 dependency is Done. Existing NMA-003/004/005 working-tree changes were preserved.

## Implementation

[apps/engine](../../apps/engine/README.md) is a separately packaged service. It installs a small
`GatewayRunner` subclass before the pinned upstream bootstrap constructs the owner. The subclass
adds an authenticated private command socket to that same process and uses its existing session
authority. Native execution, admission, queued cancellation, generation-specific interrupt, epoch,
process reservation, worker and recovery ownership remain Hermes's. There is no separate model loop,
scheduler, legacy worker import or hidden fallback.

The internal adapter carries stable agent/thread IDs and decimal-string configuration/context
revisions. A server-provisioned, immutable binding produces a distinct native session for each
agent/thread/config/context identity. Model and toolsets are frozen in the native session policy.
A changed body under the same command ID conflicts; a repeated exact command returns its stored
receipt. A process restart reuses the native admission instead of executing again.

The service authenticates a short-lived HMAC envelope bound to owner, actor, audience, command body
and payload digest. Unknown schema/fields and foreign bindings fail closed. Wrong partition ownership
or unsupported migration checksum/version is rejected before starting the native runtime. Startup
verifies Python 3.14.9, source/lock hashes and SQLite FTS5/JSON support. The Unix socket is private;
no public product route or native gateway port is exposed by this task.

Migration 1 adds only `nma_partition`, `nma_schema_migrations`, `nma_commands`, `nma_runtime_outbox`,
`nma_events`, `nma_adapter_bindings` and `nma_adapter_runs`. The partition has a singleton constraint.
Writes run through Hermes's transaction writer, native epoch check, owner binding and foreign keys.
Admission intent/outbox precedes the native operation; its durable native receipt precedes the
extension completion event. These independent transactions are not described as distributed atomicity.
An unresolved outbox row retains its original identity for reconciliation; no background semantic
retry loop is introduced. The full domain entities are still introduced in their assigned slices.

The adapter maps native receipts and tool/message/error events, including exact run attribution and
string counters. Provider errors expose a stable error code rather than native exception details.
Native replay is bounded and volatile; after restart/gap the adapter requires a snapshot explicitly.
The durable partition SSE and complete crash/stop descendant reconciliation remain NMA-010.

## Completion status

**Review, not Done.** All four adapter acceptance items have implementation and contract evidence:
identity/revisions, native tools/events/error/cancel, legacy separation, and provenance/upgrade notes.
The task is not being closed while ADR-01's distribution-clearance gate remains open. The actual
macOS inventory has 89 distributions; Linux has 90. Both still lack packaged notices for `fetch-use`
and `firecrawl-anydoc`; `pillow-heif` retains the bundled codec license issue recorded in NMA-001.
These are observed packaging gaps, not a new product approval policy. The final Linux verification
target is a test artifact, not a cleared production release.

Current results: **10/10 passed on macOS arm64 and 10/10 passed on Linux aarch64**, using Python
3.14.9, SQLite 3.53.1 and WAL. The Linux tests run as UID 10001; one harmless pytest-cache permission
warning is retained. Ruff checks/format, lock verification, wheel/sdist build and documentation checks
pass. Final Linux evidence is exported from BuildKit without duplicating the full image on disk.

## Contract evidence

Tests launch the real pinned Hermes service in a separate OS process with real SQLite and native
agent/tool execution. A deterministic loopback OpenAI-compatible model supplies answers, a native
`tool_call` request to `todo_list`, a blocked response and an HTTP 401. This is real-runtime integration
with a simulated provider, **not** a paid/live-model, browser, or full product E2E claim.

The suite verifies:

1. Correct agent/thread/config attribution, exact retry, changed-payload conflict, settled kill/restart,
   monotonic native authority epoch and one model execution after replay.
2. Separate context for a second thread and configuration revision, backed by distinct native sessions.
3. Wrong owner/signature, expired envelope, unsupported wire version and unknown binding refusal.
4. Active and queued native cancellation, idempotent cancel and no execution of the queued text.
5. Real native tool dispatch plus mapped tool start/completion and message completion events; no
   events from another admission; sequence numbers remain strings.
6. Provider failure maps to failed state and a redacted stable error code.
7. Foreign-owner FK rejection, singleton partition constraint, transaction rollback and clean FK scan.
8. A second process cannot take over the active partition; a wrong owner cannot even advance its epoch.
9. Process death during an uncommitted extension write rolls back without corruption or acknowledgement.
10. Modified pinned source is rejected; the original pin and runtime pass verification.

Exact current results, base image identity, inventories, commands and limitations are recorded in
[evidence](evidence/nma-006/verification.json). The test logs retain platform/Python/SQLite/journal
facts. Review is author self-review; no independent review or UI acceptance is claimed.

## Provenance and operations

Hermes revision: `7489b22af47ce91b366dde81d5831ea422577498`, root MIT. The source archive SHA-256,
reviewed integration module hashes, Python version and upstream dependency-lock hashes are in the
[pin manifest](../../apps/engine/src/ngertiin_engine/runtime-pin.json). No upstream source is patched
or copied into the application. The runner subclass is an explicit Ngertiin adaptation, not an
upstream extension API stability promise. Imported test helpers retain the existing
[MIT notice](evidence/nma-001/HERMES-LICENSE.txt).

The verification Dockerfile pins its base manifest and builds Hermes through its own package manager
and reviewed locks. The hash-verified archive is cached outside Git; source extraction verifies it
again. Upstream dev/test groups are included only to verify the image. This is not a release image.
The exact installed distribution/notices inventories are retained per tested platform. Root MIT
does not clear dependency binaries: the prior pillow-heif codec and missing-notice findings must
remain visible in release packaging review. No runtime image was pushed or deployed.

The [service README](../../apps/engine/README.md) documents setup, commands, ownership, additive
migration, consistent backup, restore/rollback and upgrade checks. One owner-specific container/local
volume is the deployment unit; no network SQLite volume or active/active claim. Upgrade requires
reviewing pins/seams and rerunning these contracts plus native recovery suites before replacing a pin.
Rollback preserves the new partition and never sends its work to the old engine.

## Encountered failures and corrections

The initial macOS socket path exceeded the OS limit; the harness now uses short temporary paths and
the service reports an explicit path error. The first tool fixture addressed deferred `todo_list`
directly; inspecting the native result exposed the error, and the fixture now uses the pinned
`tool_call` dispatcher. The initial Docker test group did not include pytest; upstream's dev/test
groups are now both explicit. Repeated GitHub downloads hit HTTP 429; builds now consume the cached,
hash-verified archive. Image export then hit Docker storage exhaustion; only this task's image was
removed, and a BuildKit evidence target now runs the same runtime filesystem without duplicate
unpacking. No unrelated container or volume was deleted. Failed image-export evidence is retained.

## Remaining boundaries

This slice has no agent/soul/config CRUD or public HTTP wiring, no private-memory/group isolation
proof, no durable projection SSE, no goals or proactive trigger integration, no full capability
revocation, and no deployment failover proof across hosts. Those are explicit downstream acceptance
items, not inherited features of the unmodified upstream runtime. The temporary trusted binding
manifest is not the final domain configuration interface. `production_ready` remains false.

Dependency distribution clearance remains outstanding; this verification image must not be shipped
as cleared production packaging. Do not enable external production work before the full isolation,
revocation, recovery and release gates. No existing user data, PostgreSQL/Alembic migration, legacy
engine path, commit or push was changed by this task.
