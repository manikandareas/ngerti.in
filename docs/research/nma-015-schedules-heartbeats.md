# NMA-015: scheduled and idle heartbeat wakes

Date: 2026-10-24. Authority: [task](https://app.notion.com/p/402abdd61873812882a0f458c14ae605),
[Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a),
ADR-05 on NMA-004 and ADR-03 on NMA-005. NMA-014 was read live and Done before work.

## Behavior and explicit scheduling policy

The ordinary `responsibility` tool gains `schedule`, with `goal_id`, the current
`expected_revision`, and a `wake` object. No form, activation gate or second owner
is introduced. One replaceable wake definition belongs to each goal. Replacing a
watch increments its revision and the goal generation, fences prior unfinished
units and pending occurrences, and atomically records a waiting goal and receipt.
Snapshots and goal-change events expose the watch configuration and next instant.

Supported configurations always include `timezone` (validated IANA name) and
`missed_policy: "coalesce"`:

- `kind: "once"`, `at`: a future RFC3339 instant with an explicit offset. The offset
  determines the instant; timezone is retained as display/provenance metadata.
- `kind: "interval"`, `interval_seconds`: an integer from 60 to 31,536,000.
- `kind: "heartbeat"`, `interval_seconds`: the same range, with native Hermes idle
  heartbeat due checking and its instruction to avoid inventing work.

Intervals are elapsed seconds, including across daylight-saving transitions.
They do not mean a recurring wall-clock appointment. Calendar cron expressions,
multiple watches per goal and wall-clock DST gap/fold policy are not implemented.
Ambiguous or invalid configurations fail explicitly instead of assuming server time.
A past one-shot is rejected at definition creation; an already accepted one-shot
that becomes overdue during an outage is recovered once.

A due definition creates one durable pending occurrence window. Identity comprises
kind, definition ID, definition revision and original intended UTC instant. For
missed periodic ticks, the persisted original instant, coalesced-through instant
and immutable source configuration encode the covered range; no per-tick model
calls or unbounded catch-up inserts occur. These are synthesized clock ticks, not
accepted external deliveries: no contributing webhook inputs are discarded.
Only this definition/revision/generation is coalesced. The oldest intended instant
remains the identity while busy. On admission, the range closes at current time and
recurring time re-anchors there. One-shots have no next instant. A second definition
or goal cannot merge into the window. NMA-016 still owns external-event contributors.

## Authority, durability and priority

`wakes.py` is a durable ingress extension in the existing gateway-owned continuation
reconciler. It is not a standalone scheduler, worker or model executor. Native
Hermes owns session admission, reservation, execution, leases and recovery. Wake
production polls at Hermes's five-second cadence; the existing continuation loop
retains its own receipt reconciliation cadence. No overlapping native cron job or
session heartbeat is registered for mapped product goals.

The gateway shares its owner lock with user ingress. Any pending/running native
unit in the thread defers wake admission. A waiting user command gets the lock
before a subsequent automatic pass; user ingress fences already prepared/active
automatic units through the existing interruption path. Goal pause/stop, completion,
blocked status, obsolete goal generation, context reset or archived thread make
old watches ineligible. Pause/stop persists watch invalidation in the lifecycle
transaction. Resume never implicitly restores an obsolete watch: fresh scheduling
is required. Plain wait without a watch does not poll the model.

The pending trigger, goal state change, deterministic run/outbox and next time update
are committed under the same SQLite writer/epoch fence. Native parked Kanban mapping
and admission retain NMA-014's reconciliation protocol. A crash before domain commit
rolls back; after commit, delivery reuses the saved run identity. Native unknown
admission/effect outcomes retain NMA-010 behavior; this work does not blindly retry
external effects or claim exactly-once side effects. Trigger source payloads preserve
configuration and goal/context generations even after definition replacement.

A known binding refusal records a rejected trigger and a blocked goal with its error code;
restoring a configuration does not silently replay that refused occurrence. Transient
authority/service errors remain pending for reconciliation.

Synthetic wake prompts are internal continuations, not new user transcript messages.
Results and evidence use the existing responsible agent and home thread. No new UI
or notification channel is introduced; full delivery preferences remain NMA-021.

## Provenance and operations

Hermes revision `7489b22af47ce91b366dde81d5831ea422577498`, root MIT, remains pinned.
Imported behavior: `hermes_cli/heartbeat.py` (`HeartbeatState.is_due`, native prompt,
minimum interval and poll constant) and `cron/jobs.py` (`compute_next_run` for elapsed
interval arithmetic). Read reference seams: `gateway/run_heartbeat_restore.py`,
`run_heartbeat_acceptance.py`, `session_cron.py` and heartbeat feature documentation.
Their hashes were added to `runtime-pin.json`. No upstream source is patched or
copied; product goal/watch receipts and generation mapping are Ngertiin-authored.
The existing retained Hermes MIT notice remains applicable.

Migration 9 adds `nma_trigger_definitions`, `nma_triggers` and the due index. Migration
1–8 statements/checksums remain unchanged. Owner-bound foreign keys, unique source
keys and checked states retain receipts; no legacy schedules are imported or enabled.
Stop ingress and the sole owner before upgrade. Back up the complete partition,
including SQLite/WAL, native session and Kanban state, registry and secret references.
Upgrade exclusively, verify schema 9/checksums, integrity/foreign keys, watch snapshots
and run replay before reopening ingress. Older binaries reject schema 9. Rollback
preserves new state and restores a complete isolated predecessor backup; never drop
live trigger/goal/receipt tables to force an older binary to run.

## Verification and limits

Commands, results and artifact hashes are recorded in
[verification.json](evidence/nma-015/verification.json). Tests use a real pinned Hermes
subprocess and on-disk SQLite, not a simulated scheduler. Focused coverage includes
clock-controlled due/not-due and long-gap coalescing, native interval DST arithmetic,
one-shot restart, idle heartbeat/user interruption, pause restart, definition replacement,
additive schema-8 upgrade, and SIGKILL before domain commit, after commit, after native
card write and after native admission. The initial fault harness killed the gateway
before its startup probe completed; the final harness starts the fault-injected gateway
before advancing the persisted due clock. Full regression also identified a predecessor
thread-schema fixture that retained the new tables; its disposable reconstruction now
removes schema 9 before bootstrapping the predecessor. A subsequent full run exposed a provider-fixture mismatch in the priority test: the
generic command probe stripped the prompt before its last blank line, hiding the internal
continuation marker when the native heartbeat prompt was appended. The final test reads
the actual model message, arms the callback before releasing user work, and uses separate
user/wake barriers. The observed blocked reason was `LIFECYCLE_DECISION_REQUIRED`,
matching the default fixture reply. Initial failures
are retained separately and are not counted as passes.

The Chromium close/reopen walkthrough uses a small snapshot harness over the real
gateway with a controlled provider. It closes the entire browser, restarts the gateway
with an overdue accepted watch, observes model work without browser requests, then
reopens and reads the persisted result. Screenshots and browser commands are retained.
This proves browser-independent gateway execution; it is not a full authenticated
production DM UI walkthrough. The opt-in real-provider test separately exercises one
ordinary user instruction that schedules a calculation, waits offline through a restart,
and returns the result without another user message.

Author self-review covers owner/generation scope, atomic outbox/next-time writes,
idempotency, stale definitions, user priority and bounded clock coalescing. No independent
review, Linux acceptance, production deployment/migration, commit or push is claimed.
Large-watch-count throughput and pagination are not benchmarked. Quiet notification
suppression and calendar scheduling are not part of this slice.

## Final recorded results

- Core engine regression (excluding the three new wake test modules, which were run separately): 72 passed, 2 skipped in 230.16s (0:03:50).
- Real provider ordinary-language scheduling: 1 passed in 104.80s (0:01:44); gpt-6.1-sol produced 14 × 17 = 238 after the scheduled wake and gateway restart.
- Complete wake/browser regression (all three new modules): 11 passed, 1 skipped in 100.71s (0:01:40); additive upgrade: 1 passed in 7.36s; rejection and predecessor upgrade: 2 passed in 16.26s.
- Make check, engine Ruff/format, wheel/sdist build, package/source equality, docs-check and diff-check passed. The three opt-in provider tests are skipped by the offline regression invocations; the new schedule provider test was run separately.
