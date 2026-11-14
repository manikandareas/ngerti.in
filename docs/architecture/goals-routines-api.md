# Persistent responsibilities and Routine API

NMA-079 amendment: the [2.0.0 server-organizations consumer contract](server-organizations-api.md) and [verification report](../verification/nma-079/README.md) own current account-mode authentication, scope, normal native dispatch and readiness. Earlier versioned examples and pending-gate statements below retain their captured scope. Web/Tauri UI and deployment remain later milestones.

Planned November 12 amendment: [the server-organizations plan](server-organizations-plan-2026-11-12.md) and NMA-072–083 define PostgreSQL, authenticated organization/user scope, private Team-agent interactions and explicit connections. This guide retains its current/recorded implementation boundary until the new NMA-079 API gate verifies the changed contract; its owner-only examples do not establish multi-user authorization.

Application contract **1.24.0** extends the existing [conversation controls](conversation-control-api.md), [group collaboration](group-collaboration-api.md), [memory/skills](memory-skills-api.md), queue, SQLite authority lock, transactional command receipts and event replay. It introduces no additional model/tool loop, scheduler process or engine. Browser connections are not required for execution; the backend and native harness host must remain alive. Host shutdown/suspend is not offline execution.

## Conversation to responsibility

Every working native turn receives fresh scoped goal/Routine state and responsibility-selection guidance. The harness interprets the intended outcome in the full conversation and chooses the semantic capture/correction/wait/stop decision through structured product tools. A Goal preserves an outcome whose ownership, progress and useful follow-through need to survive current execution, or which the user explicitly wants tracked as a Goal. A genuine request alone does not imply persistence. Ordinary work can finish through its run even when it involves research, many tools, file output or several agents. Native plans/checklists and application Goals have separate purposes.

Schedules can stand alone through Routine with `goal_id: null`; a reminder or periodic check does not require a Goal. Group handoffs, reviews and temporary human-input waits retain their task's existing continuation owner. These mechanisms link to a relevant existing Goal when they advance its outcome. They do not create a tracking obligation by themselves. A clear ongoing responsibility is still captured automatically, including when it emerges later in a conversation. Corrections reuse its identity; unrelated follow-ups do not rewrite it. Hypotheticals, quotations, feature discussions and preferences about possibilities are not commitments. When persistence has no clear benefit, the agent keeps helping through ordinary work and asks only for context needed to do it.

There is no required form, slash command, activation button, extra application inference or prose parser for goal capture. The policy is defined in `apps/server/src/goals/instructions.ts` and injected into each working turn. Aligned tool descriptions reach application MCP discovery, `describe_tools` used by Codex, and the Muse native MCP catalog. Backend source/scope/revision, completion evidence and recovery checks remain authoritative. No semantic keyword filter or database migration is introduced. Each conversation remains private; a router session receives no product tools or responsibility context. Ordinary answers and standalone reminders do not acquire an evidence-file requirement by being promoted unnecessarily to Goals.

The tools use server-issued run leases. Agent, owner and thread identities are derived from the lease. Membership, connection/grant revisions, run dispatch and native binding are checked before effects. Mutation, command receipt and publication events commit in the same SQLite transaction. New mutations use a UUID `command_id`; exact retries reuse it. An old receipt is historical evidence and does not revive a stopped goal or old schedule.

| Tool | Arguments, excluding command_id | Behavior |
| --- | --- | --- |
| `ngertiin.list_goals` | `{}`; no command_id | Shared Goals and Routine for a group; agent-private inventory in a DM. Includes paused/stopped/completed records. |
| `ngertiin.capture_goal` | `goal_id`, `expected_revision`, `title`, `objective`, `source_message_id` | Revision 0 creates a stable identity. Corrections use the same ID/current revision. Source must be this run's user input or explicit peer handoff/review, never a foreign/private message or automatic tick. |
| `ngertiin.report_goal` | `goal_id`, `expected_revision`, `progress`, `disposition`, `evidence_artifact_ids`, `continuation` | Persist a progress decision and its source. Dispositions: continue, scheduled, wait, blocked, completed. |
| `ngertiin.control_goal` | `goal_id`, `expected_revision`, `state` | Active, paused or stopped; invalidate old continuation generations and cancel related queued/native/task work. |
| `ngertiin.write_routine` | `routine_id`, `expected_revision`, `goal_id`, `instruction`, `schedule`, `timezone`, optional `execution_target` | Create at revision 0; revise the same identity otherwise. The thread/agent are implicit. |
| `ngertiin.control_routine` | `routine_id`, `expected_revision`, `state` | Active, paused or stopped. Invalidate old generations; stopped identities are not silently recreated. |
| `ngertiin.routine_no_update` | No fields beyond command_id | Structured quiet decision for an automatic goal/Routine run. No localized phrase matching or marker parsing. |

`read_run_context` exposes `input_message_id`, `goal_id`, `routine_id`, and actual attachments. Multiple goals can originate from one input, with separate objective, source references, progress, evidence, generation and continuation. Context injection is bounded; `list_goals` returns the full authoritative inventory. Historical events retain prior revisions even when bounded source-reference lists roll forward.

## Group ownership and assignment

Conversation groups own their Goals and Routine, with `scope=group` and `agent_id=null`. `owner_id` remains the human installation owner. `created_by_agent_id` records provenance. A goal has a separate `coordinator_agent_id`, `assignment_revision`, optional assignment route and root task. DM ownership remains agent scoped. All active group members read the same inventory; the current execution/coordinator reports final progress, while peer contributors return their task results. Lease, membership, generation and revision checks remain server authoritative.

`ngertiin.assign_goal({command_id, goal_id, expected_revision, agent_id})` changes the coordinator without changing resource identity. It records cancellation intent for previous work, fences its assignment and waits for native settlement before continuing. A same-coordinator assignment is a no-op. Group Routine `execution_target` is either `{"type":"auto"}` or `{"type":"agent","agent_id":"<member UUID>"}`. New group schedules default to automatic selection; imported schedules retain their previous fixed agent.

Existing agent-owned group records normalize transactionally at application startup. Identities, receipts, schedules, source runs and artifacts are retained. Legacy task goal generations and root lineage are reconstructed from authoritative records, including goals whose latest run was a standalone continuation. Startup recovery still fences unsettled native runs as unknown.

## Continuation and completion

A standalone capture has an immediate default continuation after its source run succeeds. A report with `continue` supplies `{ "at": "UTC instant", "instruction": "next useful work" }`. The scheduler stores an internal continuation message and run atomically under `goal:<id>:<generation>:<sequence>`. Internal inputs never appear as human or agent chat bubbles. Repeated ticks, process restarts and command retries reuse the admitted identity.

`wait` and `blocked` have no polling wakeup. A later scoped user turn can update that goal, while group user/peer waits retain the existing exact task/request continuation owner. Native `unknown` remains held for receipt reconciliation; it is never treated as a successful turn or permission to retry an external effect. A definitive group report failure records `last_report_error` and blocks without a second model finalizer. A completed collaboration without a structured report becomes blocked. A standalone continuation that exits without a structured decision becomes blocked, preventing an unproductive busy loop. After an explicit deferral, the source run cannot undo that decision, complete the goal, or use product file/publication tools to perform the future stage. It receives RESPONSIBILITY_DEFERRED; a distinct scheduler run is authorized for that stage. Source-turn final publication uses the structured progress decision rather than a later prose completion claim. Other independent responsibilities can still be recorded for subsequent admission. Native workspace bytes are not completion/publication proof without their authorized application receipts.

A linked active Routine owns scheduled wakeups. Creating it clears capture's default immediate continuation. `scheduled` records progress with that schedule as owner; a second `continue` wakeup is rejected while the linked Routine is active. Multiple genuine Routines remain distinct triggers, each with its own occurrence identity. In-flight work, pending peer/HITL tasks and unknown outcomes prevent overlapping responsibility runs.

`completed` is initially `completion_pending`. Evidence must reference nonempty, hash-verified immutable bytes produced by actual native work in this responsibility's thread/workspace and task lineage. Metadata-only artifacts, uploads and foreign outputs cannot prove completion. Group evidence accepts related parent/child outputs, not arbitrary files from the same group. Published artifacts pin applicable goal generations; old objective evidence is rejected after correction. Bytes are verified again at finalization. The goal completes only after its reporting native run succeeds without cancellation and its task lineage settles. A plain answer claiming success does not complete a goal. Failed/unknown/cancelled work cannot finalize it. The application verifies evidence existence, provenance and bytes; the harness evaluates whether that result meets the objective.

## Schedules and quiet publication

| Schedule | Shape |
| --- | --- |
| One-shot | `{ "type": "once", "at": "2026-11-02T01:00:00.000Z" }` |
| Recurring interval | `{ "type": "interval", "anchor_at": "2026-11-02T01:00:00.000Z", "every_ms": 3600000 }` |
| Heartbeat | `{ "type": "heartbeat", "anchor_at": "2026-11-02T01:00:00.000Z", "every_ms": 21600000 }` |
| Local calendar | `{ "type": "calendar", "local_time": "09:00", "weekdays": [1,2,3,4,5] }` with e.g. `timezone: "Asia/Makassar"` |

Weekdays use 0=Sunday through 6=Saturday. Intervals/heartbeats measure elapsed milliseconds; calendar recurrence uses IANA wall time. A missing DST time is skipped; an ambiguous repeated time fires at its first instant only. One-shot timestamps are explicit UTC instants. Missed periodic ticks coalesce to one latest occurrence instead of a catch-up burst.

A Routine occurrence is durable under `(routine_id, routine_generation, scheduled_for)`. For a group, the occurrence and advanced schedule are committed before selection. An automatic occurrence retains its isolated routing identity, then persists one selected executor and execution admission. A fixed target skips model selection. `run_id` is null while selection/assignment is pending; `route_id`, `selected_agent_id` and `state` expose progress. Reconnect/restart does not reselect or duplicate work. Owner stop/pause does not label an unresolved native execution as confirmed cancelled. Child/parent continuations remain within the same occurrence. DM occurrence admission retains its existing atomic path. Schedule edits invalidate and cancel old queued work; a lost native acknowledgement remains unknown even after an edit. The scheduler does not blindly repeat that work.

Automatic run output is deferred until successful native settlement. `routine_no_update` suppresses its entire chat answer, including streamed text; the run, tools and occurrence remain available as evidence. A quiet decision cannot hide an already published artifact, a human request or an explicit blocker/completion. A later meaningful report/artifact restores deferred publication. Ordinary user runs keep streaming. Late responses after cancellation, goal stop or scope revocation cannot publish into the conversation, but native receipts remain available for reconciliation.

## Controls and group boundaries

Stopping a run records cancellation intent separately from native stopped confirmation. It leaves the goal and future Routine schedule intact. A stopped known occurrence is not replayed; a later scheduled occurrence has a new identity. A standalone cancelled run requires a new scoped user/resume decision before continuation. Unknown native work remains fenced even after pause/resume.

Pause/stop goal invalidates its generation, linked schedules, queued continuations, group task descendants and outstanding owner requests. Pause remembers which Routines were paused by the goal; resume does not enable Routines the user had already paused independently. A stopped goal/schedule is not silently resumed from old native context. Group membership removal preserves group resources and revokes the removed executor. A missing coordinator is reassigned through the member-model router only after old native work is known terminal. A fixed Routine target waits for a valid assignment; automatic Routine selection uses current eligible members. Readding a member never revives a cancelled execution. A synchronous self-stop may return its own committed control receipt, but the cancelled lease cannot execute another tool.

## HTTP, snapshots and replay

All routes except liveness require the private development bearer token. Mutations require a UUID `Idempotency-Key` and strict schemas; foreign identities, stale revisions, conflicting retries and invalid source/evidence are rejected with the existing safe errors. These trusted owner/test-client routes use the same domain methods as native tools.

- `GET /v1/threads/:id/goals?agent_id=<uuid>`: scoped inventory; agent_id is optional for authenticated owner reads of a group.
- `POST /v1/goals/:id/assignment`: expected_revision and agent_id.
- `POST /v1/goals/:id/recover-completion`: owner-only evidence reconciliation with expected_revision, evidence_artifact_ids and progress. Requires successful settled work and the same provenance/hash checks; admits no model run.
- `POST /v1/goals/capture`: capture arguments plus `run_id`.
- `POST /v1/goals/:id/progress`: report arguments excluding goal_id, plus `run_id`.
- `POST /v1/routines/write`: Routine arguments plus `run_id`.
- `POST /v1/routines/:id/control`: `{ "expected_revision": 2, "state": "paused" }`.
- Existing `POST /v1/goals/:id/control`, `POST /v1/runs/:id/cancel` and direct foundation goal/Routine creation remain available.
- Thread snapshots include `goals`, `routines`, `occurrences`, and their authoritative cursor. Existing events/SSE replay exposes committed revisions and stable run/message identities.
- `GET /v1/contracts` publishes all entity/command/error schemas, version 1.24.0. Semantic capture guidance and tool descriptions do not change command payload shapes or require data migration.

The HTTP capability is backend readiness evidence only. UI/API-wide readiness, installers, deployment, webhooks, additional providers and general desktop/computer use are outside this ticket. See [verification evidence](../verification/nma-057/README.md) for actual denominators, versions, retained failures and native limitations.
