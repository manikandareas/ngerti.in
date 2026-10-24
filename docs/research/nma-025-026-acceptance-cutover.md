# Multi-agent acceptance and single-path cutover

Authority: [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a), [acceptance document 07](https://app.notion.com/p/402abdd61873812a97a9f41032dd854f), [NMA-025](https://app.notion.com/p/402abdd618738149a019d35901a29e4b), and [NMA-026](https://app.notion.com/p/402abdd61873815186afe9c8bf2299bf), fetched on 2026-10-24. Dependencies NMA-003/019/021/022/023/024 were read and Done. The user explicitly required the current implementation to be the **only** mode, with obsolete code removed. This overrides the optional dual-mode rollout proposal in document 06.

Implementation baseline: `4166645`. Changes are local; no production deployment, user-data migration, commit or push is claimed. Evidence is in [evidence/nma-025-026](evidence/nma-025-026). Historical evidence and migration DDL remain intact.

## ADR-06: one current executor, archived historical data, versioned rollback

**Problem.** The new engine already implemented the accepted DM/goals/group slices, but `/` still mounted the old workspace and `make dev` launched the old worker. Keeping selectable execution modes would contradict the explicit user decision and leave ambiguous admission/recovery ownership.

**Decision.** The current application exposes only persistent agents, DMs and groups. `/` redirects to `/agents`. The backend mounts only the current agent API/stream, account/health and retained financial API. The old chat/task/worker/memory/persona/proactivity/schedule/computer product lifecycle, V1 UI and their operational probes are deleted. No `PRODUCT_MODE`, `VITE_PRODUCT_MODE`, dual executor, scheduler wrapper or legacy fallback is introduced. Hermes remains the sole execution/session/recovery owner.

The remaining low-level E2B actuator, browser-harness assets and pinned installation recipe are reused by the current engine. They do not import the deleted task store, queue or lifecycle. Their dynamic file-loading dependencies were checked explicitly before retirement. Account authentication, billing/financial records, database access, UI tokens/primitives and native migration history remain relevant and are retained.

**Alternatives rejected.** A selectable legacy/pivot flag conflicts with the user's clarification. Wrapping Hermes in the old worker would create competing ownership. Dropping historical tables or forcing a SQLite downgrade would destroy data/receipts. Reinterpreting LangGraph checkpoints as Hermes sessions would risk duplicate effects.

**Sources/provenance.** ADR-01/03 and the NMA-003 reuse matrix remain the architecture/data basis. Native lock exclusion follows pinned Hermes `gateway/status.py` (`gateway.lock` with POSIX flock); no upstream source was copied or patched. The existing E2B/browser assets retain their notices and source provenance. The backup implementation uses Python standard-library filesystem/SQLite interfaces. No new external runtime dependency is introduced.

## Explicit data mapping

| Source | Current destination and behavior |
| --- | --- |
| Account/Clerk identity | Same PostgreSQL account UUID; private engine partition and signer registry are keyed by that authenticated UUID. |
| Current approved persona | `ngertiin.agent_engine.migration plan` freezes name/soul/model plus source revision into a saved plan; `apply` creates one persistent default agent. A UUIDv5 command ID derived from the account provides durable retry identity. The engine receipt supplies the actual new agent ID. Changed input under the same migration identity conflicts instead of creating another agent. Rejected proposals are not imported. |
| Old threads/messages/events | Preserved as an offline historical PostgreSQL archive, with original IDs, order, roles and provenance. They are not fabricated into Hermes sessions or mixed with new replay cursors. The current UI does not expose an old conversation editor. Operator-authorized archive retrieval remains necessary for historical material. |
| Old goals/proposals/evidence | Preserve revisions, status and evidence in the archive. Paused/completed/archived work and pending/rejected proposals are not activated. Fresh conversation governs any new responsibility. |
| Old schedules/occurrence receipts | Preserve definitions, timezone and receipts; the retired worker must be stopped. No old schedule is dispatched by the new engine. Recreate desired work explicitly through the current conversation contract. |
| Old memory | Preserve source exclusions, tombstones and provenance. Do not bulk-copy owner-wide memory into private agents or groups. |
| Old artifacts/objects | Preserve immutable object bytes, keys/hashes, manifests and producing history in the archive and object backup. No synthetic legacy task or destructive FK rewrite. Current artifacts use the owner partition's immutable scoped publisher. |
| Old active jobs/checkpoints/approvals/browser sessions | Stop old processes before installing the new version. Preserve records/resources for reconciliation; do not translate checkpoints, re-admit jobs, or retry unknown external actions. Existing browser sessions are not shared with the new owner/thread resource mapping. |
| New messages/goals/artifacts/effects | Back up and retain the entire new owner partition on rollback. Never merge its run IDs into the old engine. Preserve data read-only until an explicit forward reconciliation/migration is verified. |
| Billing/accounts | Preserve ledgers, invoices, provider receipts and account mapping. Financial reconciliation remains an operator/API concern; this change introduces no agent pricing or budget cap. |

The migration plan is an operator tool, not a required goal-activation form. It does not execute old work. Commands:

```sh
uv run --project apps/backend python -m ngertiin.agent_engine.migration plan --owner ACCOUNT_UUID --model CATALOG_ID --output /private/account-plan.json
uv run --project apps/backend python -m ngertiin.agent_engine.migration apply /private/account-plan.json --receipt /private/account-receipt.json
```

Keep the plan unchanged across uncertain retries. Store plans/receipts privately. Back up source data before applying. This session applied plans only to disposable fixtures; no real account was migrated.

## Cutover and rollback rehearsal procedure

1. Close application ingress and stop all old API/worker processes. Inventory active jobs, pending triggers, unknown effects, provider resources and financial reconciliation. Drain only under the owning prior version or quarantine; never give the new engine old pending jobs.
2. Take a consistent full PostgreSQL dump and object backup. Preserve the prior Git revision, deployment configuration and private secret references. Verify restore into disposable databases/buckets and owner-level data equality.
3. Provision the pinned gateway with one exclusive local state volume per account. Freeze the default-agent mapping plan. Back up any existing destination partition before mutation. Apply only the saved configuration command and retain its receipt.
4. Install the current application and route ingress to it. There is one code path; unprovisioned accounts fail explicitly. `make dev` runs web/API only; owner gateways are separately provisioned processes.
5. Before any rollback, stop ingress and the gateway. Save the complete post-cutover partition and external resource/effect receipts. The old app must not run against that new partition.
6. Restore the old application/data to an isolated environment from its prior revision and pre-cutover backup. Reconcile old active work, schedules, credentials and external receipts before opening ingress. Retain all new-engine data separately for read-only access and later reconciliation. Restoring old code alone does not establish that old jobs may safely execute.

`python -m ngertiin_engine.backup backup SOURCE NEW_SNAPSHOT` holds the native partition/profile locks, copies every regular file, rejects symlinks/special files, normalizes the copied SQLite WAL stores, checks integrity/FKs and records hashes/table counts. It refuses a live gateway. Secret files and external workspaces outside the partition are a separate backup obligation.

`restore SNAPSHOT NEW_HOME --owner UUID` verifies inventory/hash/owner and creates a private destination. It writes the quarantine marker **before** copying executable state. Service startup refuses `RESTORE_QUARANTINED` until operator reconciliation and explicit marker removal. Existing account-database restore holds are also honored by the current API without importing the retired executor. No backup is restored over an existing directory; corruption or wrong-owner restore fails.

The Compose project identifier stays unchanged only to preserve existing volume names. It does not select an execution mode. Database migration files remain byte-stable; their historical table definitions are data-upgrade history, not active product behavior.

## Acceptance coverage

| Document 07 requirement | Evidence and observation |
| --- | --- |
| Persistent agents/configuration | Real gateway lifecycle/configuration tests; production agent create UI in desktop browser; configuration restart tests. |
| DM streaming/reconnect/cancel | Public HTTP/SSE tests, stable message IDs and decimal cursors; browser cancel, failure state, reload with the same six message/activity rows. |
| Automatic goals | Real-provider 16-case conversational dataset, including hypothetical/quoted/negated requests, correction, repetition, stop and fresh session; real lifecycle-to-completion test. |
| Group collaboration | Real-provider three-agent goal/handoff/verification; production group creation and multi-mention author states; native policy/cancel/fault tests. |
| Privacy/revocation | Wrong-owner and private DM/memory/artifact denial; source-bound transfer, queued/active credential/tool/member revocation; retained negative tests. |
| Offline proactivity | Real Chromium close/reopen for schedule, event and peer triggers; waiting/dedup/restart tests. The real-provider ordinary-language schedule case also passed after a gateway restart with no requests until the due time. |
| Crash/recovery/unknown effects | Native admission/claim/publish and group handoff fault injection; external receipt versus indeterminate recovery; stale authority/generation cannot publish. |
| Stop/pause persistence | Goal lifecycle tests plus restored stopped-goal state; browser run cancel; stale schedule/webhook fences. |
| Artifacts | Authenticated hash-checked real download from production component; private-file boundary tests; SQLite restore includes an immutable artifact and its producing history. |
| Observability | Three-agent live diagnostics and provider token receipts; correlated goal/run/handoff/trigger/transcript IDs; secret scan. No missing provider cost is invented. |
| Migration/rollback | Disposable full PostgreSQL restore preserves exact rows/counts and paused goal; other owner has no private thread. Local MinIO restores exact 2,048 bytes/hash. Complete native SQLite restore/reopen preserves transcript/configuration/stopped goal/artifact; new post-cutover writes are retained in a separate backup. |

The initial live capture evaluation reported a false failure because the old NMA-013 oracle counted *all revision changes* as capture/update. Since NMA-014, progress/wait/evidence legitimately increment revisions without changing responsibility identity/content. Receipt inspection showed correct goal identity and stop behavior. The evaluator now scores creation, title/objective correction and transition to stopped; separate lifecycle tests still verify progress/status revisions. Initial failure logs/data are retained, and a fresh real-provider rerun passes all 16 cases. No product autonomy policy was added to satisfy the test.

## Browser evidence and limits

The reproducible harness is `apps/engine/tests/browser/`. It imports the production components and uses the real FastAPI command/SSE routes and native gateway. Authentication is a fixed test-account override; it does not prove live Clerk login, production network/deployment or cross-container hardening. Desktop viewport is 1440×1100 and mobile is 390×844. Both have equal viewport/document widths. Evidence covers agent creation, three-agent group creation/mentions, attribution, bounded discussion outcome, file disclosure/download, cancellation, provider error and reload.

The controlled group provider intentionally echoes its input, so long nested replies exercise rendering and the native discussion bound; these are not real research results. Actual model collaboration is proved by the separate live group test. Initial small-viewport automation clicked outside the scrolled dialog; the desktop interaction was repeated with the save control visible, and the saved agents were verified from the UI. No screenshot alone is treated as successful execution.

## Retirement and review

[retired-files.json](evidence/nma-025-026/retired-files.json) records every deleted tracked path and its recoverable base revision. Dependency traversal covered static Python imports, function-local imports, frontend imports/routes and the actuator's dynamic Python/JS assets. Static checks, product build, API route absence tests and native gateway behavior verify the remaining composition. Old dependencies, config examples, worker scripts, unused image/CSS assets and obsolete operational probes were removed. Historical research/spike evidence, migration DDL and user data were preserved.

Review is author self-review of scope, dependency closure, recovery boundaries, evidence and actual failures; no independent review is claimed. `production_ready: false` remains an honest release-readiness declaration. NMA-027 still owns deployment/operator readiness. No production cutover, production authentication walkthrough, exhaustive penetration test or exactly-once external-effect guarantee is claimed.

## Final verification

- Full engine suite with Chromium enabled: **113 passed, 5 skipped** (493.25 s). The five environment-gated live cases were exercised separately.
- Final backup, migration-command retry/restart, and real E2B collaboration run: **3 passed** (53.50 s).
- Real-provider group and goal lifecycle: **2 passed**; corrected goal-capture evaluator: **16 cases passed** in one test (153.43 s); real-provider scheduled wake across restart: **1 passed** (103.89 s). The initial evaluator failure remains recorded above.
- Backend: **11 tests passed**. `make check`, frontend production build, engine Ruff/format, package source equality and `make docs-check` passed. Migration DDL is byte-identical to the base revision; `git diff --check` passed.
- **361 tracked obsolete files removed**. All are recoverable from the recorded base Git revision. The evidence scan found no configured secret values.

Source and evidence SHA-256 inventories, commands, limitations and outputs are recorded in [verification.json](evidence/nma-025-026/verification.json). No deployment, real-account migration, commit or push was performed.
