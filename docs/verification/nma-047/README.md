# NMA-047 verification

Selected ticket: [NMA-047](https://app.notion.com/p/409abdd6187381bab741d401c8031f67). Scope: harness-first development foundation, initial domain/API contracts, source/runtime decision and retirement of the old active bootstrap. No commit was requested or created.

## Results

| Check | Actual result | Evidence |
| --- | --- | --- |
| Backend contract/integration suite | **28/28 pass, 0 fail, 0 skip**; 15 lifecycle/storage, 7 background, 6 HTTP tests; 94 assertions | [server-tests.log](server-tests.log) |
| Backend lint | Pass, 15 files | [server-lint.log](server-lint.log) |
| Backend TypeScript | Pass | [server-types.log](server-types.log) |
| Real development process/HTTP probe | **8/8 pass, 0 fail, 0 skip** | [process-http.log](process-http.log) |
| Codex runtime seam | Native App Server initialize/initialized pass with `codex-cli 0.165.0`, temporary isolated home and no inherited API keys | [native-compatibility.json](native-compatibility.json) |
| Muse runtime seam | Official `@muse-code/sdk@1.4.12` import, owned child spawn, initialization, request round trip and close pass under Bun, using an MSP **fixture** | [native-compatibility.json](native-compatibility.json) |
| Repository-wide `bun run check` | **Fails** on 5 pre-existing import/format diagnostics in 4 retained web files; later stages in that chained command did not run | [checks.log](checks.log) |
| Retained web typecheck | Pass when run independently; `git diff --exit-code HEAD -- apps/web` confirms no web source changes | Recorded command below |
| Retained web build | Pass with bundle-size/module-directive warnings; no new UI acceptance | [web-build.log](web-build.log) |
| Frozen dependency installation | Pass, no dependency changes required | Recorded command below |
| Python retirement shims/guards | Syntax compilation pass; old engine/provisioner/API launch paths reject startup by construction | Recorded command below |
| Documentation and whitespace | Local documentation hash/link checks and scoped whitespace checks run after the final evidence index is written | See final validation summary |

The broader lint failure is retained, not suppressed. Diagnostics are in `app-connections.tsx` (import order and formatting), `connections-page.tsx` (import order), `service-icon.tsx` (formatting), and `settings-shell.tsx` (formatting). Those source files match baseline HEAD and remain outside the engine/backend ticket.

## What the evidence establishes

Contract tests cover atomic admission/message/event/receipt persistence, command retry and payload conflicts, rollback, installation owner/application validation, refusal of another authority, cross-thread membership, native DM/group binding separation, FIFO claims, stale grants, stop intent versus native stop confirmation, unknown-run reconciliation and restart, goal stop versus run stop, artifact metadata scope, event cursors and runtime schemas. HTTP tests cover authentication, malformed input redaction, injected identity rejection, command keys, replay and local cancellation. Background tests cover committed occurrence deduplication/restart, missed-interval collapse, overlap hold, stopped responsibilities, no implicit executor, native observations, exceptions becoming unknown and shutdown deadlines/late completion.

The process probe starts the actual `make dev` entry point and performs HTTP operations without a browser. It verifies bootstrap with zero provider executors, duplicate admission receipts, real background scheduling, cursor replay, second-authority rejection, SIGKILL/restart persistence, graceful process-group shutdown and an additional controlled fault: a child persists a native-accepted **fixture** run and is SIGKILLed; the production bootstrap recovers it as unknown and refuses another claim in that lane. All probe state lives in its own temporary directory and is removed afterward.

The expanded process probe initially failed because its test harness waited for `make` to exit but did not wait for Bun descendants to release the authority lock. [The initial failure](process-http-initial-failure.log) is retained. The probe now waits for the entire process group; the final 8/8 run passes. This was a probe cleanup race, not permission to bypass the application authority lock.

The initial MSP fixture omitted the required JSON-RPC envelope. It was corrected before recording the final compatibility result; fixture requests now have bounded deadlines. The successful fixture is labeled as a fixture and is not used as a product executor.

## Reproduce

Run from the repository root with Bun 1.3.10:

```sh
bun install --frozen-lockfile
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun run verify:foundation
bun run check
bun --filter @ngertiin/web typecheck
bun run build
python3 scripts/check_docs.py
```

The native compatibility probe uses a separate verification-only package, following the SDK version observed in the pinned Openbot source. It does not add the Muse SDK to the production foundation before the adapter ticket:

```sh
bun install --cwd scripts/verification/nma047 --frozen-lockfile
bun scripts/verification/nma047/native.ts
```

If Codex is absent, that native probe reports a visible skip instead of claiming a handshake. No provider login/inference is attempted. The Muse side always uses the explicit protocol fixture. The process probe uses temporary state and an ephemeral port; it does not reset the default installation or historical volumes.

Additional checks:

```sh
git diff --exit-code HEAD -- apps/web
python3 -m py_compile scripts/dev.py scripts/check.py scripts/dev_engine.py apps/backend/src/ngertiin/api/app.py apps/backend/src/ngertiin/agent_engine/provisioner.py apps/engine/src/ngertiin_engine/service.py
git diff --check
shasum -a 256 -c docs/verification/nma-047/SHA256SUMS
```

## Versions, provenance and limits

[provenance.json](provenance.json) records baseline Git revision, observed upstream module SHA-256 hashes and dependency/runtime versions. The [ADR](../../architecture/adr-0001-harness-first-foundation.md) describes the behavioral port and upgrade process; the [domain/API contract](../../architecture/harness-first-contract.md) records fields, transitions and ownership.

The foundation is complete independently of native-provider acceptance. Default startup registers **zero executors**; user and Routine runs remain queued. Broker capabilities/version gates, login, model discovery, completed inference, useful product-tool round trips, billing source, native resume/stop, full Routine/calendar/DST/quiet behavior, automatic conversational goals, workspace/artifact bytes, VNC and Composio remain the owning later tickets. NMA-060 API readiness, UI, installation and production readiness are not claimed.

Historical `.env`, state partitions, PostgreSQL/MinIO volumes, unrelated working-tree edits and evidence were preserved. The user-owned `AGENTS.md` change was already present before implementation and is excluded from this task's responsibility manifest. No commit, push or deployment was performed.
