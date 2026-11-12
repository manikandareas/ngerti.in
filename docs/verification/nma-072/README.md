# NMA-072 PostgreSQL verification

Status: **Done** for the single-owner PostgreSQL backend and disposable SQLite import/rollback scope. No live installation has been imported, reset or switched. Authentication, organization/user binding, RLS, private execution domains, live provider acceptance and deployment remain later milestones.

See [the persistence design and operator procedure](../../architecture/postgresql-persistence.md), [discovery inventory](inventory.md), [the milestone](../../backlog/NMA-072.md) and [the main organizations plan](../../architecture/server-organizations-plan-2026-11-12.md).

## Setup and provenance

- Source baseline: `1a024950c94bd54a2c1c911fc96b7557627c77d1` plus the uncommitted working tree identified by [222 source/config/test hashes](source-manifest.json). No commit or deployment is implied.
- Bun 1.3.10; `pg` 8.23.1; `@types/pg` 8.23.1; PostgreSQL 18.1.
- PostgreSQL image: `postgres:18.1-alpine@sha256:aa6eb304ddb6dd26df23d05db4e5cb05af8951cda3e0dc57731b771e0ef4ab29`.
- Regression partitions use separate, owned, loopback-only Docker databases with tmpfs data, allocated sequentially and removed by the test runner. The focused rerun, import rehearsal and latency probe use a named disposable database with a local Docker volume; each fixture removes its random schema and temporary state. The database restart probe creates and removes its own container and volume.
- Native Codex/MSP processes in the suite are protocol fixtures. No account login, paid inference, native Cua privacy, browser/Tauri product acceptance or installer result is inferred from them. The killed-authority subprocess receives only explicit test database/principal/path settings.

## Regression results

**424 unique tests across 47 files have passing latest results, with no remaining failed or skipped test.** These are combined results from the executions below, not one all-green invocation. [Machine-readable results](results.json) retain the denominator, repetition and source boundary.

| Execution | Pass | Fail | Files | Duration | Evidence |
| --- | --- | --- | --- | --- | --- |
| Partition A | 288 | 0 | 33 | 249.32 s | [log](regression-a.log) |
| Partition B plus repeated bootstrap | 136 | 1 | 15 | 203.54 s | [log](regression-b.log) |
| Group attachments after fixture synchronization | 9 | 0 | 1 | 14.63 s | [log](groups-attachments.log) |

Partition B repeats the bootstrap after the final machine-command admission change. The final nine-test rerun replaces the latest result for every group-attachment test, including B's one failure. There are 434 executions: 433 pass and one subsequently resolved failure; ten executions repeat an already counted unique test.

B failed because a descendant's marker existed after close. The unchanged fixture's fixed 500 ms timer allowed a write before its ready signal was observed under load, leaving the failure ambiguous. The isolated rerun passed; the fixture was then changed to wait for an explicit release file written only after process close. The final rerun proves that an owned surviving descendant cannot write after closure without relying on SQL or pre-ready scheduling latency. `harness/process.ts` is unchanged.

[Partition paths](partitions.json) identify the exact A/B arguments. Execute from the repository root with `bun scripts/verification/nma072/run-tests.ts <paths>`; B additionally passed `tests/bootstrap.test.ts`. The final focused command was `bun scripts/verification/nma072/run-tests.ts tests/groups/attachments.test.ts` with an explicit disposable `NGERTIIN_TEST_DATABASE_URL`. `bun run test:server` runs the complete current suite with an owned disposable database when that variable is absent. The runner's 45 s per-test deadline accommodates the multi-turn PostgreSQL protocol fixtures; separate semantic latency assertions remain in the tests.

The suite covers creation, FIFO/control/recovery, Goals/Routine, memory/skills, groups/HITL, artifacts, APIs, provider configuration/redaction and both native protocols. Eleven dedicated PostgreSQL tests cover nested rollback, concurrent duplicate/lost-ack commands, commit-order/snapshot races, session-lock loss and epoch fencing, receipt reauthorization, unresolved effects, bounded keysets, filtered cursor advancement, process SIGKILL/restart and import/restore/tamper refusal. A new machine test proves simultaneous exact retries share admission and dispatch once; takeover tests cover the persisted cleanup fence before human input is granted.

## Restart, import and latency

| Probe | Result | Retained evidence |
| --- | --- | --- |
| Actual PostgreSQL container restart with a disk volume | 7/7 checks | [restart report](database-restart.json) |
| Dry-run/import/backup/restore and active legacy-authority refusal | 9/9 checks | [import report](import-rehearsal.json) |

The restart probe verifies a changed postmaster start time with `fsync=on` and `synchronous_commit=on`, stable receipt identity/event prefix/artifact bytes, advanced epoch, and unknown native work retaining its lane fence. This is a database restart, not power-loss or production restore proof. Reproduce with `bun scripts/verification/nma072/database-restart.ts`.

The import rehearsal exports synthetic domain history into the legacy SQLite schema and compares all six imported tables: 8 entities, 8 events, 2 receipts, 1 routing trace, 1 public part and 1 projection checkpoint. IDs and complete rows compare equal; the report retains artifact hashes, native binding treatment and the unbound owner mapping. It verifies byte-identical restored SQLite, immutable artifact hashes, explicit private-state fixture restore, and refusal while the legacy authority lock is held. No real credentials are used. Reproduce with `bun scripts/verification/nma072/import-rehearsal.ts` and an explicit disposable test database.

[Latency measurements](latency.json) use one authority, five warmup transactions, 30 samples per operation, 30 admissions and 60 emitted events, without providers or concurrent suites. Reproduce with `bun scripts/verification/nma072/latency.ts` and an explicit disposable test database.

| Operation | p50 | p95 | Maximum |
| --- | --- | --- | --- |
| Empty fenced transaction | 9.76 ms | 26.90 ms | 48.25 ms |
| Admission | 45.53 ms | 127.42 ms | 210.11 ms |
| Event replay, 60 events | 2.30 ms | 5.52 ms | 6.36 ms |
| Command start through commit notification | 45.53 ms | 127.41 ms | 210.11 ms |

Notification timing includes the complete command; it is not isolated COMMIT wire latency. These are local fixture timings, not a production SLO, load test or evidence that SQLite was overloaded.

## Static checks and failed iterations

Server/web lint and typecheck pass; [desktop Rust/tooling typecheck](checks/desktop-typecheck.log) passes. [Verification tooling](checks/verification-tools.log) also typechecks, including the six active web-server helpers and the four NMA-072 scripts. [Check results](results.json) and retained [lint](checks/lint.log)/[typecheck](checks/typecheck.log) logs identify the commands.

`bun run docs:check` still reports eight pre-existing broken links in the untouched GPUI skill reference files. Its [complete output](checks/docs-check.log) contains no changed documentation, backlog consistency or contract-check errors. The milestone/index/status records agree. No unrelated skill documentation is changed.

Earlier failures remain available: [initial 418-pass/5-fail regression](iterations/initial-regression.log), [aborted concurrent A run](iterations/parallel-a-aborted.log), and [concurrent B run with the human-takeover race](iterations/parallel-b-takeover.log). Fixes included awaited browser authorization, explicitly verified file-reservation reconciliation, ordered handoff settlement, atomic lease updates, authority-loss readiness/abort, and waiting for persisted cleanup before granting human input. The parallel A run was terminated after timing failures under contention and a 15 s native-fixture timeout; it is not acceptance evidence. Final partitions run sequentially. Source changes and focused reruns are identified in `results.json`.

## Limits

The query pool supports concurrent requests, while one clock-row fence and one lifecycle authority deliberately serialize current domain mutations. Legacy aggregate HTTP responses can still be large. Organization/actor policy and RLS are NMA-075; the changed multi-user API gate is NMA-079. NMA-082 owns final live cutover, PostgreSQL backup/restore, coordinated provider refresh-state restore, RPO/RTO and deployment rehearsal. Current proof does not establish provider, browser/Tauri, cross-user privacy or distribution acceptance.
