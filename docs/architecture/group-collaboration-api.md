# Group routing, peer tasks and human input

Application contract **1.23.0** implements NMA-056 on the existing Bun/SQLite application authority. This is a backend contract; the NMA-060 API gate, UI, installation and production readiness remain separate.

A conversation group belongs to the installation's one human owner and contains that owner's persistent agents. `POST /v1/threads` creates it with `type: "group"` and unique `member_agent_ids`. Agent identity stays the same across channels, while bindings, native history and private memory stay separate. Contract **1.22.0** gives the group one shared workspace; DM and other-group files remain isolated. No other human can join.

## Commands

All mutations use the existing private bearer token and UUID `Idempotency-Key`. An exact retry returns its original receipt, which can predate the latest projection. Read snapshots/entities/events for current state. Changed input under the same key conflicts.

| Method and path | Body | Result |
| --- | --- | --- |
| `POST /v1/groups/{thread_id}/messages` | `text`, optional `agent_id`, `router_agent_id`, `artifact_ids`, `submission_id` | Durable `group_route` receipt |
| `POST /v1/groups/{thread_id}/routes/{route_id}/retry` | `expected_revision`, optional `agent_id` | Updated route for the same message; only rejected, unselected routes are retryable |
| `POST /v1/groups/{thread_id}/membership` | `expected_revision`, unique nonempty `member_agent_ids` | Updated group |
| `POST /v1/human-requests/{request_id}/reply` | `expected_revision`, `text` | Answered request receipt |
| `GET /v1/threads/{thread_id}/snapshot` | Existing snapshot query | Shared history, current profiles/bindings/runs, plus `routes`, `tasks`, `human_requests` |
| `GET /v1/contracts` | — | Entity, command, projection and event schemas |

For example:

```json
{
  "text": "Please produce a calculation and ask the reviewer to check it.",
  "router_agent_id": "11111111-1111-4111-8111-111111111111"
}
```

Use actual member UUIDs from the installation. A leading `@handle` or explicit `agent_id` addresses one current member directly, without a router turn. An unknown handle, a nonmember UUID, conflicting mention/UUID or several leading addresses is rejected. This contract selects one initial responder. Peer work can subsequently involve other valid members through structured handoffs.

Without an address, the selected router harness/model reads bounded member responsibilities, the group's name/shared instructions, attachment metadata and recent shared history. Code filters visual-input eligibility before selection and rechecks it when creating the target task. `router_agent_id` identifies which member's harness performs that selection; it defaults to the first member and does **not** preselect the responder. A separate internal execution thread and session receive only a routing prompt. The model must return exactly `{"agent_id":"<member UUID>"}`. The server validates its shape, current membership and the captured group revision before admitting any responder task. The router remains the selected member's Codex/Muse model. Jev/System One is not integrated. There is no random/round-robin answer selection or broadcast fallback. Invalid output becomes a rejected route (`ROUTING_INVALID` or `SCOPE_DENIED`); a changed group becomes `ROUTING_STALE`. Preparation diagnostics remain on the routing run. Unknown native outcomes stay unknown until native receipt reconciliation.

Routing uses the normal application queue, broker, billing checks, bindings and recovery. It has no private learning injection; all product-tool calls are denied. Codex routing advertises no dynamic product tool, disables shell execution and uses a read-only confined workspace. Muse uses the existing empty preset with shell/write disabled and an empty product-tool catalog. The router client closes at the end of its turn. Its internal thread/run/history remain inspectable through authenticated owner diagnostics with `thread.purpose="routing"` and `group_thread_id`; they do not appear in the group's conversation history or member runs.

## Handoff and review

Both adapters expose these structured tools through the existing scoped MCP bridge:

- `ngertiin.group_handoff({command_id, agent_id, instruction, purpose, summary?, continuation?})`, with purpose `handoff` or `review`, creates one child task and authored request in the caller's group. The caller cannot supply owner/thread/source identity. The target must be a current member supporting the bound visual inputs. The authored child request and later parent continuation retain the source attachment IDs. Self/ancestor cycles conflict; one root is bounded to 32 task identities.
- `ngertiin.group_ask_user({command_id, purpose, question})`, with purpose `input`, `review` or `approval`, creates one request for the installation owner and puts this task in `waiting_user`. This is an explicit agent request, not a universal approval policy.
- `ngertiin.group_read_task({task_id, offset})` retrieves a request/result from this same group in 16,000-character pages. It cannot retrieve another group's tasks or a DM's context.

Mutation fingerprints include operation, current group, actor, task and normalized input. Exact tool retries can return their original receipt across continuation runs without performing the effect again. Every call still validates the current native run lease, membership, connection, grants and capabilities before using the receipt or committing a new effect.

A child returns by finishing its task, not by creating a reverse handoff to its ancestor. Task results carry published artifact references, goal IDs and generation pins. `continuation=synthesize` requests a combined answer; `finalize` retains the parent execution but suppresses its administrative answer. Default is synthesize. Native item phases keep commentary separate from final answers.

Every root/child has a stable `peer_task` identity, `root_task_id`, optional `parent_task_id`, original request, source agent/run and `current_run_id`. The child's authored request has the source agent and `source_run_id`; its answer belongs to its own target run. This preserves authorship without treating an agent-to-agent request as a user message or as the child's answer.

After handing off or asking the owner, the harness ends its current turn. The task remains `waiting_peer`/`waiting_user` while the ordinary native run finishes. The application's reconciler admits a continuation only after that source run succeeded and the exact children/user request have resolved. Children can fail/cancel explicitly; those outcomes are passed to the parent rather than invented as successful reviews. Child results and parent continuation admission are stored transactionally, so repeated ticks/restart/lost acknowledgement do not enqueue another continuation. Unknown native work is never blindly resubmitted. A matching native receipt can resolve it through the existing recovery path.

## Human reply and restart

The owner replies to a specific `human_request.id` and expected revision. It is bound to the source run and task that asked the question. A stale/double response conflicts; an exact HTTP retry returns the saved receipt. A reply can be retained while the native outcome remains unknown, but no continuation starts until the source outcome is reconciled. Unrelated messages do not answer an old request automatically.

On success, the child continues in its original native session with the request ID, question and human response. Its parent then continues with the child result. `human_request.continuation_run_id` and `peer_task.continuation` expose that binding. Cancellation/revocation does not become approval or an implicit reply.

Group packets are regenerated before each native prompt, include explicit member/message identities and are bounded. Long peer results remain retrievable with `group_read_task`; bounded snippets never replace the stored full text. Internal continuation input has `message.purpose="continuation"` and is excluded from conversation history and replacement-session history. Handoff/review is a compact user-friendly activity. `summary` is bounded to 240 characters; the complete technical instruction remains in the authoritative input and owner diagnostics. History/snapshot replaces technical handoff text with that summary (legacy records use a generic source/target activity); previews omit internal transfers. Public SSE/replay preserves cursors but projects internal instruction bodies. Human questions/replies and actual final results remain visible. Unselected agents have no answering runs or pass/skip/no-response bubbles.

## Isolation and revocation

The routing/member packet reads only this group's messages. It does not read DM transcripts, private facts or private artifacts. Existing learning scopes and workspace/artifact grants still apply. A file from a DM or another group is transferred only through explicit artifact sharing. Files sent into this group belong to its shared workspace and are available to its active members. Membership does not import private files or native history. See [workspace ownership, writer serialization and recovery](workspace-artifact-api.md#shared-group-execution-and-recovery).

Membership edits validate the expected group revision. Removed members' queued runs are cancelled; active work receives cancellation intent and cannot call product tools or pass final dispatch authorization. Removed router work is fenced too. Readding an agent does not revive cancelled work. Retained members' existing runs receive the current membership revision, preserving their valid work. Pending user requests and tasks of removed members are cancelled. A route selected from an older membership revision is rejected rather than silently retargeted.

Groups also own Goals and Routine with separately assigned coordinators/executors. Membership removal preserves those resources while fencing removed execution. See [shared responsibilities](goals-routines-api.md#group-ownership-and-assignment).

Run controls, native stop confirmation and unknown receipts retain their existing semantics; deletion of a message is not an undo of committed handoff effects. [Conversation control contracts](conversation-control-api.md) remain available for explicitly targeted run controls.

See [verification](../verification/nma-056/README.md) for exact source/stack versions, protocol/process checks, real Codex-to-Muse review/HITL/restart evidence and retained failures.
