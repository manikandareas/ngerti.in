# Scoped memory, transcript and context

Date: 2026-10-24 (work began 2026-10-23). Authority: [NMA-009](https://app.notion.com/p/402abdd61873812aa2d9fae23a3f6399),
[Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a), product document 02,
acceptance document 07 and the accepted [ADR-03](nma-005-domain-contract.md).
NMA-007 was read live and is Done. The task began Ready. The unrelated untracked
`docs/assets/critters/` directory was preserved. A concurrent change to
`docs/agent.pen` was also left untouched.

## Implementation

The separately packaged engine now persists scoped memory and selected-content
scope grants in its existing owner partition. Agent-private memory follows the
same persistent agent across its DMs only. Thread-shared memory and transcript
remain bound to one DM or group and its current membership. Group execution never
implicitly imports another DM, another agent's private memory or profile-wide
`MEMORY.md`/`USER.md` content.

Native terminal receipts are reconciled into immutable finalized text with stable
message IDs, thread ordering, author and run provenance. Reconciliation receipts
commit with messages and make repeat reads/restarts idempotent. It never submits
or retries native work. Native histories remain intact. The table is the text
context slice of ADR-03's message contract; streaming, admission-time message
publication, system/artifact parts and complete group delivery remain NMA-010/011/017.

Explicit authenticated owner commands may share one revision of one memory or
message into a target thread. Provenance retains the source identity/revision,
user instruction message, target, reason and grant generation. Assistant messages
cannot authorize sharing. Model tools and browser commands cannot invoke these
private service mutations. The target gets selected content, not the source
transcript. Source IDs alone never grant retrieval access.

Context is resolved again before model execution. The hook hydrates only current
thread-generation text, memory and grants; a config revision preserves the same
scope. `ignore_rules` continues disabling native profile memory/rules loading.
A source-memory tombstone or grant revocation removes retrieval, advances affected
thread generations, fences unfinished work in the same transaction, then requests
native cancellation. Execution and final tool dispatch check current membership
and generation. Restart redelivers cancellation; old sessions cannot restore the
revoked context. Completed results retain their successful status and historical
transcript stays available to the owner. No new execution owner or scheduler exists.

Migration 4 is additive. It keeps migration 1–3 checksums, agent/thread identities,
command receipts and native transcripts. Existing product sessions are invalidated
at upgrade and pending work is fenced; fresh work uses the new generation. The
startup preflight rejects unknown/checksum-altered schemas. Backup/rollback and all
private command payloads are documented in the [engine README](../../apps/engine/README.md#scoped-memory-and-transcript-context-nma-009).

## Acceptance and verification

- DM/group/agent memory: real native executions verify private-agent memory across
  two DMs, DM-only shared memory, group-only shared memory, distinct agent memory
  and absence of profile files in actual captured model requests.
- Owner/scope retrieval: a different agent cannot retrieve the DM; a foreign-owner
  signed envelope returns `NOT_FOUND`; unrelated DMs/groups contain neither the
  source transcript nor ungranted memory. Existing runtime tests also cover owner
  partition binding and tampered service authentication.
- Transfer provenance: one selected memory becomes visible to both group members
  with its source revision and instruction message. The remainder of the private
  conversation stays absent. Source-scope mismatches, unknown sources, assistant
  authorization, changed-payload retries and repeated commands are checked.
- Restart identity: hard process restarts preserve the same agents, thread scopes,
  source IDs, grants and tombstones. A config revision retains authorized DM
  context without importing group history. Revocation stays effective after restart.
- Active/queued revocation: a blocked model and a queued successor are fenced;
  queued text never reaches the provider, output is suppressed and the cancellation
  survives restart. New sessions exclude the revoked content.
- Upgrade: a disposable schema-3 predecessor retains agent identity, native
  messages and the first three migration checksums, advances context generation,
  and accepts a new scoped run. `foreign_key_check` returns no violations.

The final macOS arm64 suite passed **30/30** tests (86.56s), using the foundation
interpreter with Python 3.14.9 and SQLite 3.53.1/WAL. The final Linux aarch64
suite passed **30/30** (159.31s) as UID 10001 with the same Python/SQLite/WAL
combination; its sole warning is a non-failing pytest-cache permission warning.
`make check`, engine Ruff, docs and diff checks passed. The model
is a deterministic loopback server; these tests execute pinned Hermes in separate
processes and inspect real provider request bodies, not a mocked engine. Additional
final verification is recorded in [the evidence manifest](evidence/nma-009/verification.json).
No UI changed, so no browser acceptance is claimed or required for this foundation slice.

## Review and provenance

Author self-review examined authorization at retrieval/execution/tool dispatch,
command idempotency, selected-source provenance, generation changes, terminal
result reconciliation and additive migration. No separate reviewer was delegated.
A review correction replaced an invalid assumption that native policies retain
`request_id`: native `build_policy` deliberately removes that field. New policies
use a frozen scope marker; existing policies resolve through the stable native
source/binding. Another correction ensures revocation fences unfinished work
without relabeling completed runs as cancelled. Both paths are covered by runtime tests. A final regression also verifies that a
server-provisioned binding pointing to a product group cannot load profile memory;
registered thread scope disables profile rules even without a generated persona.

Hermes remains at `7489b22af47ce91b366dde81d5831ea422577498`, MIT. Reviewed seams:
`gateway/session_policy.py`, `gateway/session_local_recovery.py`,
`gateway/session_results.py`, `hermes_state_keys.py`, `hermes_state_terminal.py`,
the existing gateway runner and final tool dispatch. The additional source hashes
are recorded in `runtime-pin.json`; no upstream source or dependency was changed.
The existing Hermes notice remains in the repository.

Nakama `ac0643f8196fdf9133e66f5a13eef86103c45d0c`, MIT,
[soul composition](https://github.com/ahmadrosid/nakama/blob/ac0643f8196fdf9133e66f5a13eef86103c45d0c/packages/core/src/soul/compose.ts)
was read directly. It explicitly composes identity/style/instructions/memory.
Ngertiin keeps reusable persona separate from conversation-derived memory and
applies ADR-03's stricter channel scopes; its scope store, grants and reconciliation
are original Ngertiin code, not a claim that upstream supplies these contracts.

## Boundaries

This is foundation service/context integration. It does not add public memory UI,
automatic memory extraction, an agent-callable memory API, semantic/vector search,
artifact grants, goals or complete group routing. Model callers cannot self-select
an owner or self-authorize a private-to-group transfer. The trusted owner service
command is authorization; it does not use a classifier to infer authorization from
arbitrary text. Future conversational tools must preserve that boundary.

Historical content already delivered to a group is not erased by revocation;
future execution begins a fresh context generation. External effects already
executed are not undone. Retrieval currently reads the complete scoped finalized
text set; large-history pagination/compaction and scaling are not proven. Full
runtime effect/recovery, public DM/group delivery and executor/tenant isolation
remain their existing downstream tickets. No production migration, deployment,
push or paid model call occurred.
