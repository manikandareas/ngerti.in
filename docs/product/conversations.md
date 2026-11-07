# Agents, conversations and groups

[Product scope](../../PRODUCT.md), [interface behavior](interface.md) and [current architecture](../architecture/overview.md) are the companion specifications. These rules combine the original conversation decisions with accepted creation, group-resource, semantic-routing and presentation amendments.

## Identity and creation

An agent has stable owner/name/handle/avatar/instructions, selected harness/account/model, assignments and revision. Its identity persists across DM/group use; each conversation retains its own native session, transcript and private context. Configuration changes apply through authoritative revisions and snapshots without silently rewriting active work.

Bootstrap idempotently creates Tobi, its primary DM and an authored welcome without inference. Create agent is a separate intentional operation: use an owner-unique library-generated name, default avatar and the user's selected connection/model/billing defaults, create the DM, and publish one automatic opener with human-owner authorship and app-generated origin. Create group validates a name and owned members, creates its conversation, and routes one opener to one valid member.

Concurrent creation, collision handling, duplicate submit, lost acknowledgement, reconnect and restart preserve one entity/conversation/opener/admission per operation. A missing connection or failed initial response preserves the entity; continue in the same conversation. Unknown native outcomes are reconciled before retry. Reopening existing chat reads history without inference or a new opener.

Personalization serves useful work: ask one necessary question or work immediately when clear. Names, roles, persona, Goals and working style are examples, not an onboarding checklist. Successful scoped tools update the intended profile or shared group directions and publish revisions/events. Group instructions do not rewrite every member's global profile or import private DM context.

## Queue, steer and stop

Idle input can be admitted directly. During active work, ordinary messages use durable FIFO queueing; pending messages can be edited/deleted before processing. Contextual steer targets the native running turn only when supported. The user need not choose a technical mode for every send.

Native agents interpret cancellation in conversation context and call scoped `cancel_run`, `control_goal` or `control_routine` tools. There is no deterministic natural-language cancellation classifier. Ordinary chat remains FIFO; steer acknowledgement does not promise immediate processing. The explicit cancellation endpoint remains available independently when a harness is unresponsive.

The UI distinguishes sending stop intent from confirmed native stop. Edit/delete is message management, not undo of completed effects. Stopping a run differs from pausing/stopping a Goal or Routine and its future continuation.

## Group routing and collaboration

A group has one human owner and owned persistent agents. Valid explicit mentions retain their direct target behavior. Otherwise the selected semantic router chooses the first actor asked to act, including unique shortened names and compact shared context. For “Skinny, ask Tobi to greet me”, Skinny acts first and its harness performs the handoff.

TypeSafe Jev is the selected member-routing integration; the existing member-model route can be selected explicitly. Current routing-policy details and calibration are in [group collaboration](../architecture/group-collaboration-api.md) and [routing verification](../verification/jev-routing-v3/README.md). Confidence/ambiguity handling, bounded native fallback, authoritative writer ownership and receipt recovery remain explicit. This routing chooses a group actor; advanced provider/credential/billing routing remains deferred.

Only the selected member answers. Nonselected agents emit no pass/skip bubbles or mass greetings. Handoff/review creates attributable tasks, scoped context and traceable results; the human is not the relay. Temporary subagents are optional and do not become permanent group members automatically.

Groups own their shared attachment workspace, Goals and Routine. Responsibility coordinator and executor are separate assignments. Removing an executor preserves the group resource and fences old work; unknown work must reconcile before reassignment. Peer artifacts can support completion only with validated task/generation provenance.

## Input, privacy and presentation

Human questions/review/approval bind to the correct work and revision. Relevant work waits; restart/replay cannot bind an old request to an unrelated answer. Approval is contextual, not universal. Current natural answers, selection cards, native interactions and failed-response Retry follow [the interaction implementation](../verification/conversation-implementation-2026-11-06/README.md) and [later refinements](../verification/conversation-followup-2026-11-06/report.html).

Public history keeps useful answers, results, review findings and human questions. Normal handoff instructions, native prompts, shell commands and raw tool output stay private. Activity remains agent-attributed, transient and friendly; waiting/failure/input states stay actionable. Streaming polish preserves final/history content and reduced-motion behavior.

Visible history is grouped by the viewing device's calendar day, with a centered date separator and shared clocks on messages and assistant-side cards. Goal/Routine event bars belong to the same day groups but have no clock. Publication ordering, interaction boundaries and historical request/activity timestamps remain authoritative; see [date and clock behavior](interface.md#conversation-dates-and-clocks).

Files and maximized tables open in the conversation Focus viewer with a centered filename and the existing floating composer. Feedback carries a removable, explicit context reference through the existing scoped message/attachment flow and returns to chat after acceptance. Static HTML renders directly; its original source is downloaded through the actions menu. See [content viewer behavior](interface.md#conversation-content-viewer).

Private DM history/memory and saved-artifact metadata remain separate from group context. Shared-machine working files and attachment copies are intentionally shared, as described in the architecture. Scope, current membership, grants and capabilities are checked before dispatch and publication. Harness skills remain separate from app-owned packages; memory correction/deletion preserves identity/revision semantics.

[Local milestones](../backlog/README.md) retain acceptance and dependencies for NMA-052/053/054/055/056/061/062/065. Their completion does not close NMA-063 product-wide acceptance or NMA-064 distribution.
