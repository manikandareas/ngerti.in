# Goals, Routine and continuation

Planned November 12 amendment: the [server-organizations plan](../architecture/server-organizations-plan-2026-11-12.md) owns user/organization scope, personal/Team agents, private interactions and durable execution principals. NMA-072–083 implement it for web/Tauri. The single-owner behavior below remains the current baseline until the changed API and product gates pass; multi-human shared chat remains deferred.

A Goal preserves an outcome whose ownership, progress and useful follow-through must survive current execution, or an outcome the user explicitly wants tracked as a Goal. Clear implicit ongoing responsibility is captured automatically from conversation without a form, command, activation button or confirmation ceremony.

A real request, many steps/tools, research, a file deliverable, a temporary clarification or a change of executor alone does not require a Goal. Ordinary work can complete through its run/task. Standalone reminders and recurring checks can use Routine with no Goal. A task can acquire durable responsibility later as scope develops.

## Identity and ownership

Goal identity is separate from a run or native session. Preserve source conversation, owner/group scope, responsible agent or coordinator, objective, revision/generation, progress, artifact results and evidence. Corrections update the same intended Goal; quotations, hypothetical discussion, repetition and unrelated follow-ups do not create or alter responsibility blindly.

DM responsibilities remain private. Group Goals and Routine belong to the group, with separate coordinator/executor assignments and shared member visibility. A removed executor does not destroy the responsibility; scope revocation fences old work and unknown native outcomes reconcile before reassignment. Related peer artifacts may prove completion only through validated task/generation provenance.

## Lifecycle

Conversation → scoped capture/update tool → durable Goal → application admission → native harness execution → reconciled progress/results/effects → continue, wait, blocked, stopped or evidenced completion.

The harness uses the full conversation and authoritative state to interpret responsibility. Ngertiin owns persistence, admission, scheduling, delivery and recovery. The capture policy does not introduce a language-keyword classifier, extra application inference loop or a second harness scheduler.

Completion requires suitable evidence, not an agent's claim alone. Preserve evidence generations, immutable nonempty artifact requirements where applicable, and native settlement. Administrative completion updates status without repeating the public answer. Review findings and actual outputs remain visible; technical handoff instructions stay private.

## Routine

Routine is the product name for one-time schedules, recurrence and heartbeat/periodic checks. It records timezone, next execution, prior results and its originating conversation/Goal when relevant. Creation, correction, pause and cancellation happen through conversation and scoped tools.

Each occurrence has a durable identity and one executor. A group Routine may target a fixed member or semantic automatic selection. Restart, schedule changes and recovery must not duplicate an old occurrence; waiting does not busy-loop. Webhooks/external event triggers remain optional, separate from required time-based Routine.

## Background work and control

Work continues with the tab closed while backend and harness host remain alive. Host sleep/power-off is not supported execution. Quiet checks may produce no notification; useful progress, questions, blockers and results return to the correct conversation.

Stopping a run stops that execution. Pausing/stopping a Goal or Routine stops its continuing responsibility and future triggers across restart. Late observations may reconcile usage/outcome but do not authorize publication or new work after scope revocation. Waiting for input retains the correct interaction reference.

Goals and Routine are reached from contextual Detail views, without global mandatory pages or activation forms. File results remain reachable from the conversation and Library. Personalization alone does not create responsibility. No universal approval layer or additional initiative restriction is introduced.

## Evidence

[Goal/Routine API](../architecture/goals-routines-api.md), [NMA-057](../backlog/NMA-057.md), [group responsibility verification](../verification/group-responsibilities/README.md), and [semantic capture evaluation](../verification/goal-capture/README.md) retain their separate samples. The recorded capture cohort passed 29/30 full scenarios with no observed extra/missing Goal; a separate focused handoff cohort passed 2/2. An earlier Muse handoff timeout remains part of the evidence. These observations describe their captured models and sample, not a universal behavior guarantee.
