# Durable run, replay, stop and recovery

Date: 2026-10-24. Authority: [NMA-010](https://app.notion.com/p/402abdd618738198bf32d60df304ab97),
[engine contract](https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f),
[ADR-03/domain contract](nma-005-domain-contract.md). The live dependency
[NMA-006](https://app.notion.com/p/402abdd6187381d899d0c98b4bf081d7) was verified Done.

## Implementation

The existing Hermes gateway still owns reservation, claim, execution, generation,
turn leases, cancellation and native recovery. Ngertiin adds durability at its native
publication and external-tool boundaries; it adds no scheduler or independent executor.
The existing engine and user data are not cut over.

Migration 5 adds `nma_run_stops`, `nma_stream`, `nma_run_events`,
`nma_run_terminals` and `nma_effects`. Earlier migration checksums remain unchanged.
The same native epoch-fenced transaction writer owns all extension writes.

- Command identity/digest and native request identity deduplicate concurrent admission.
  Pending outbox work is reconciled at startup. Existing native receipts win over mutable
  config checks; genuinely new work must satisfy current authorization. Semantic refusal
  is durable; transient/unclassified failure preserves pending work and refuses startup.
- Event publication persists the mapped frame before delivery, under the native stream
  lock. Offline clients therefore do not lose emitted deltas. A stable stream incarnation
  and decimal partition sequence survive process restart. Final native receipts reconcile
  once into completion events without replaying the model.
- `runtime.events` returns run-filtered pages of at most 256 events. Gaps caused by other
  runs/domain commands are legal. A foreign incarnation requires reset; a future sequence
  is rejected. No event pruning/expiry is enabled. `runtime.snapshot` reads status, text,
  identity and its watermark together; replay starts strictly after that watermark.
- `run.cancel` atomically persists its fence and pending delivery intent before interrupt.
  The fence blocks tool dispatch, event publication and transcript reconciliation even
  after restart. An unfinished interrupt is redelivered; a completed result is retained.
- External dispatch records a stable operation/intent before invoking the native tool,
  then records its redacted return receipt. Exact reentry uses that receipt or refuses an
  uncertain operation. A crash before/after the actual request remains indeterminate if
  its receipt is absent. Native unknown claims are not automatically executed again.
  Final output is suppressed when an unresolved external dispatch remains.

## Acceptance evidence

The tests launch the actual pinned Hermes gateway as a separate OS process, use actual
SQLite/WAL, a deterministic loopback model, and a real local MCP HTTP server. They are not
live-provider, browser, production failover or product E2E claims.

| Criterion | Evidence |
| --- | --- |
| Admission deduplication | Twelve concurrent identical signed requests produce one receipt/run; changed payload conflicts; retries after SIGKILL preserve identity. Simple fault cases assert exactly one model turn. |
| Stable event order/replay | Events exist while no client is connected; sequences and event IDs replay unchanged after restart; replay after the watermark returns no duplicates. Snapshot/reset/future-cursor tests include sequences above JavaScript's safe integer range. |
| Lease/fencing | Existing second-owner reservation test; real Store stale-authority rejection after restart; stale claim generation refuses publication and tool invocation; committed stop refuses publication. Pinned upstream turn-lease suites additionally cover serialization, renewal/reclamation and stale release/write behavior. |
| Durable stop | SIGKILL immediately after the stop transaction, before native interrupt; restart returns the same cancellation receipt, cancelled status and no stale output or new model invocation. Existing active/queued, agent and context revocation regressions remain covered. |
| No blind external retry | MCP tests cover confirmed receipt, kill before request dispatch and kill after the external server acted but before receipt persistence. Observed action counts are respectively one, zero and one; uncertain cases remain indeterminate through repeated reads/retries. |

Test-only `fault_launcher.py` injects SIGKILL before/after admission, after the native
admission receipt, after claim, before/after final publication, after stop commit and
before/after external effect invocation. It is not imported or packaged by the service.
Existing database tests also cover death during an uncommitted transaction, constraints,
foreign-owner refusal, preserved native history and additive predecessor upgrades.

Final results: **43 Linux runtime tests passed** (one pytest-cache permission warning),
**13 final macOS reliability tests passed**, **52 native lease tests passed**, and the
connector-recovery regression passed. The earlier macOS full suite passed 42 tests
before the final snapshot test was added. Ruff, wheel/sdist, documentation links and
`git diff --check` passed.

Exact commands, platform facts, logs and hashes are in
[verification.json](evidence/nma-010/verification.json). Author self-review inspected
transaction boundaries, stale-generation checks, redaction, native receipt reconciliation,
startup ordering and preservation of unrelated files; no independent review is claimed.

## Provenance

Hermes remains pinned to `7489b22af47ce91b366dde81d5831ea422577498` (MIT).
The existing runtime pin already hash-checks `gateway/session_events.py`,
`gateway/session_authority.py`, `gateway/session_results.py`, `hermes_state_runtime.py`,
`hermes_state_terminal.py`, `model_tools.py` and the runner seams used here. No upstream
file was patched or copied. The new wrappers and SQLite extensions are Ngertiin-authored.
Native leases remain upstream's implementation, not a second custom lease lifecycle.

Rakazo `packages/adapters/src/job-reconciler.ts` at
`f6a1ef2229a81319a91758aa65fac97575215691` (root Apache-2.0) was read as the ticket's
reconciliation comparator. Its single leadership, stable work identity and reconciliation
boundaries inform the review; its PostgreSQL advisory leader, timers and Graphile execution
are not imported into Hermes. The downloaded source hash is recorded in verification.

## Operations and limitations

Follow the [engine operations notes](../../apps/engine/README.md#durable-execution-boundaries-nma-010):
stop ingress/owner, back up the complete volume consistently, upgrade exclusively, verify
SQLite integrity/foreign keys, and preserve new work during rollback. Older binaries refuse
schema 5; restore a complete isolated predecessor backup instead of dropping extension
state. No production volume, PostgreSQL schema, deployment, commit or push was changed.

The private adapter exposes durable replay/snapshot primitives. Public DM HTTP/SSE and its
projection consumer are NMA-011, not delivered by this internal foundation ticket. Goals,
trigger generations, handoff descendants and group transcript integration remain their
ordered downstream tasks; they must inherit committed run fences. No causal child tables
exist in this slice, so it does not claim cancellation of future, unimplemented descendants.

Events/receipts/tombstones are retained without compaction. Pre-upgrade volatile deltas
cannot be reconstructed; finalized native results can. Recovery does not fabricate
provider reconciliation APIs or exactly-once effects. A provider return is a dispatch
receipt, not proof that an arbitrary remote business action succeeded. No user/model claim
resolves indeterminate work; no automatic retry/resolution endpoint is introduced.
Native internal agent-loop tools (for example `todo_list`) are not external-tool receipts.
The existing account-volume deployment and trusted connector assumptions remain in force;
OS/tenant isolation, distributed failover and release readiness are separate gates.

Initial verification corrections: the old replay test expected restart to invalidate the
volatile cursor and was updated for durable replay; predecessor reconstruction fixtures
were extended for migration 5. The external-effect test initially guessed an MCP tool
alias and correctly received a native unknown-tool error; it now reads the session's
actual discovered schema. Native internal todo handling does not cross external dispatch,
so external side-effect evidence uses MCP. These were observed test-fixture corrections,
not unreported product failures or live-provider evidence.

The first Linux pass exposed a recovery regression: an old rejected MCP discovery intent
was retried during startup and a connector refusal blocked readiness (42 other tests
passed). Session preparation now persists a rejected command before returning the known
connector/access refusal; startup also settles such pending refusals. Repairing the
connector cannot turn the same rejected command into new work. The explicit macOS
regression passes, and the initial failure log is retained alongside final Linux evidence.
