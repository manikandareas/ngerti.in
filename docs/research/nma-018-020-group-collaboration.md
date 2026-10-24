# Persistent group collaboration and shared goals

Date: 2026-10-24. Authority: [NMA-018](https://app.notion.com/p/402abdd6187381949c4efa3ce2a25651),
[NMA-019](https://app.notion.com/p/402abdd618738117b1a2fabfe09f2eb2), and
[NMA-020](https://app.notion.com/p/402abdd61873814d889ce835e9967e3e).
Product documents 01–05 and 07 were read live, including the decisions appended to
04 by NMA-004/005. Dependencies NMA-008, NMA-010, NMA-012, NMA-014 and NMA-017
were read live as Done. The original repository was clean.

## Routing and execution

Public `message.send` now accepts existing group threads. The owner remains the
only human. Membership revision, bounded input and explicit handles are validated
before acceptance. Unknown handles are rejected rather than falling back to a
broadcast. The frozen roster uses the same persistent agent IDs as DM.

The pinned Hermes `hosted_room_discussion.plan_next_task` and `plan_publication`
functions supply first-round selection, multi-mention targeting, rotating sequential
turns, later unaddressed peer mentions, silence, three rounds and ten messages.
No-mention input selects the first round's members. A discussion bound is visible
and is not interpreted as goal completion. Ngertiin does not import Rakazo's
bounce prohibition or introduce a separate initiative policy.

Ngertiin persists the policy's frozen room, typed events and complete deterministic
task plans. Policy inputs use a stable projection epoch; actual writes are fenced
by the existing gateway epoch and native run authority. Each task ID maps to one
native session command/run. The existing gateway reconciliation loop projects
terminal receipts into the native policy and creates the next durable outbox item.
Models still run through Hermes session admission, reservations, leases and recovery.
This is a product projection of the native pure planner onto the already-integrated
executor, not a second hosted-room driver/executor or a claim of every upstream
hosted-room feature.

The first command, user transcript, initial turn and request identity commit together.
Retries with the same identity recover receipts; changed payloads conflict. Publication
and its policy receipt commit together. A restart can replay the policy without
repeating a model call. Synthetic peer prompts are never added as user messages.
Actual agent results retain persistent author IDs and the group thread.

User input supersedes pending discussion work. Run stop cancels the discussion's
outstanding turns; membership/configuration fences still apply before execution and
publication. Goal fences invalidate the linked discussion and its peer units. Late
results cannot schedule another peer. Indeterminate execution halts collaboration
and retains the existing external-effect receipts; it is not blindly replayed.

## Shared responsibility

The ordinary responsibility tool is available during scoped group turns, without a
form or activation approval. Its source is the actual group user message. Stored
shared goals are supplied as context. Repeated semantic creation keys in the group
reuse the existing goal; peers cannot take over lifecycle writes. Only the responsible
agent may change progress/status or accept completion evidence.

`nma_discussion_goals` maps an existing or newly captured goal generation to a
discussion. Peer turns are execution units of that same goal, not new owners or
independent goals. Their run, author and outcome remain inspectable. Peer bookkeeping
units do not spawn independent continuation loops. Responsible-agent continuation
waits for discussion settlement. Peer failure blocks the linked responsibility and
records the outcome instead of silently retrying it.

The responsible agent can accept persisted peer results as evidence only when the
existing same-thread, goal-generation, linked successful-run and cancellation checks
pass. Private DM context is not copied into group work. Goal stop advances the
existing generation fence and cancels pending/active peer work; restart cannot revive
it. Read models expose the responsible agent, linked contributions and evidence.

## Conversation experience

The existing conversation route serves DM and groups. Agent/group lists open a
conversation directly; the conversation rail switches between them. Group headers
show the roster, messages show their actual authors, and each active peer has its own
working state. Mention buttons insert an existing member handle into the composer.
Stop applies to the discussion. Failed/unknown runs, rejected sends, connection state
and bounded/stopped discussion outcomes are visible.

Results render in the existing Markdown view. Error details and goal contributions/
evidence use disclosures. Goal details identify the responsible agent. No human
invitation or mandatory goal setup flow was added.

## Storage, upgrade and rollback

Migration 11 adds `nma_discussions`, `nma_discussion_turns` and
`nma_discussion_goals` inside the owner-isolated Hermes database. Migrations 1–10
are preserved. The migration adds state; it does not rebuild or remove live tables.

Stop ingress and the sole owner process before upgrade. Back up the complete owner
partition, including SQLite/WAL, native sessions, Kanban state, configuration and
secret references. Upgrade exclusively; check migration checksums, SQLite integrity,
foreign keys and transcript replay before reopening ingress. Older binaries refuse
schema 11. Rollback preserves new work and restores a complete isolated predecessor
backup; never drop live receipts to make an older binary start. No production
migration or deployment was performed.

## Provenance and verification

Hermes remains pinned to `7489b22af47ce91b366dde81d5831ea422577498`, MIT.
The planner/driver/task-input/common source hashes were added to `runtime-pin.json`;
the existing MIT notice is retained. No upstream source was patched or copied.
Rakazo `group-handoff.ts` at `f6a1ef2229a81319a91758aa65fac97575215691`
(Apache-2.0) was read for transactional identity/membership and wake-after-commit
comparison. Nakama `agent-groups.ts` at `ac0643f8196fdf9133e66f5a13eef86103c45d0c`
(MIT) was read for explicit authors, speaker activity and member handles. Neither
comparator's queue, executor or source code was imported.

The verification manifest and logs are in
[evidence/nma-018-020](evidence/nma-018-020/verification.json).
Deterministic integration tests use a real separately launched Hermes process,
SQLite and a controlled HTTP model. They cover three-peer routing, no-mention and
multi-mention behavior, repeated bounce bounds, duplicate sends, restart, membership
revoke, active stop, goal cancellation during handoff, peer provider failure and DM
privacy. SIGKILL tests cover rollback before first-turn commit, committed work before
acknowledgement, and published peer results before the next turn is created.

Real-model HTTP acceptance uses one ordinary user message to produce a calculation,
writer report and independent reviewer result. One responsible agent accepts persisted
peer evidence and completes one shared goal. The final run waits for all linked units
to settle; its complete snapshot includes the responsible agent's final confirmation.
This is a small real-provider acceptance case, not a broad semantic reliability study.

Browser acceptance uses the actual production `DirectMessagePage`, composer, reducer,
streaming transport and CSS against the real API/gateway on disposable data. Only the
authentication dependency and router wrapper are test fixtures. Desktop 1440×1000 and
mobile 390×844 walkthroughs exercise mention, three authors, DM/group navigation,
rejected mention and active stop. Goal disclosures use the actual `GoalProgress`
component with the real-model snapshot; this portion is a component walkthrough.
No production Clerk-login or deployment claim is made. Initial harness stylesheet,
provider-script, schema-fixture and fault-selector failures are distinguished from
passing runs. The initial regression was collected before the final added cases;
its count is not added to the final regression count.

Author self-review covers command/outbox atomicity, deterministic reconstruction,
publication fencing, goal ownership, generation cancellation, transcript isolation,
SSE merging, migration preservation and responsive controls. No independent review,
OS tenant-isolation proof, external exactly-once guarantee, commit or push is claimed.
Large-history pagination/compaction of discussion policy records and high-volume
throughput are not measured by this slice.

## Recorded results

- Final full engine regression: **101 passed, 5 skipped**, 418.30 seconds.
  The skips are opt-in real-provider/browser tests. The live group test was run
  separately and passed; the other opt-in suites were not enabled by this slice.
- Final focused discussion/DM transport regression after review: **16 passed**,
  59.82 seconds. The six discussion cases include the additional peer-ownership
  denial check; counts overlap with the full suite and are not summed.
- Final real-model group acceptance: **1 passed**, 40.32 seconds, configured
  `gpt-6.1-sol`, one user message, three agents, one completed goal, four settled
  units and three accepted evidence records. This is application provider evidence,
  separate from the assistant used to implement the change.
- Backend HTTP contracts: **9 passed**. Make-equivalent `bun run check`, engine
  Ruff/format, web production build, wheel/sdist build, docs-check and diff-check
  passed. Final wheel modules match the current engine source.
- All ten predecessor DDL definitions compare equal to HEAD. The existing upgrade
  tests now include migration 11 and preserve earlier data; foreign keys pass.
- Browser evidence includes desktop/mobile handoff, rejected send, active stop,
  real-model goal ownership/contribution/evidence disclosures and result-anchor
  navigation. Recorded viewport widths equal document widths.

The final full suite was collected before the extra peer-ownership case and the
last group-list validation/snapshot-query tightening. The final focused 16-test run
covers those final changes. No collected count is presented as independent extra
coverage or a rerun of the whole suite after those small changes.
