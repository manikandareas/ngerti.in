# Current interface and product flows

The primary interface is one responsive conversation workspace. The accepted November 1 layout is implemented with later Detail, Library and Computer navigation refinements. Earlier Agent/Anggota, File, Goals and Routine tabs describe contextual content ownership; current labels and placement follow the implementation below.

## Navigation and content

| Surface | Behavior |
| --- | --- |
| Left sidebar | Agent/group list is also the chat list. Select an item to open its conversation. The + menu offers Create agent and Create group. |
| Conversation | Messages, streamed answers, agent activity, authored mentions, sources, attachment/result actions and actionable human questions. |
| Detail | Selected agent/group profile, members/shared directions, contextual Goals and Routine. Advanced memory, skills and instructions stay within contextual navigation. |
| Library | Saved artifacts and Working files for the same shared Linux machine used by browser/terminal/desktop. Saved metadata retains conversation scope. |
| Computer | The retained Cua desktop; view-only and human takeover observe/control the same machine as agents. |
| Settings | General harness/provider/default and app settings open in place with URL-backed navigation. Model selection remains in its canonical picker; avoid duplicate controls. |

Clicking the conversation header name/avatar opens contextual detail. Goal/file actions open their relevant details/viewers. Panels can close; on mobile use a sheet/full-screen view with a clear return to chat. There are no mandatory global Agents, Workspace, Goals or Routine pages and no duplicated agent list. Keep tabs/lists legible, with progressive disclosure instead of stacks of cards or badges.

## Create agent

+ → Create agent → create an owner-unique library-generated name and DM → open that conversation → publish one automatic human-owner opener → the agent helps and updates its profile through scoped tools when useful.

Use the chosen connection/model/billing defaults and default avatar. No mandatory technical form, Tobi intermediary or onboarding checklist. Creation can succeed while connection/initial response fails: preserve the entity, explain the actionable state and continue in the same conversation. Retry/reconnect/restart preserves the same operation identity. Reopening a chat does not infer or resend an opener. Tobi's bootstrap welcome remains separate.

## Create group

+ → Create group → simple name/member dialog → validate owned agents → create and open group chat → one automatic user opener → route one valid member to help.

Other members stay silent. Personalization updates shared purpose/directions through scoped tools, not all private member profiles. Invalid membership and creation failures retain useful input; repeated operations do not duplicate entities/openers/admission.

## Personalization and work

Ask one necessary question, work immediately on a clear request, and offer brief optional choices when helpful. Name, persona, role, Goals and working style are possibilities, not a checklist. Request an app connection, folder or schedule when relevant and explain its purpose. Only successful backend receipts/revisions update profile/sidebar state.

Ordinary busy-conversation input is queued; edit/delete applies before processing. Contextual steer/stop follow native capabilities and receipts. Stop requested differs from native stopped; edit/delete is not undo. Stop run differs from stopping durable responsibility.

Handoff/review activity is concise and agent-attributed. Keep internal instructions, prompts, commands and raw observations private. Preserve useful results, review findings and input/failure states. Sources and neutral file actions open correct references. Long answers and streamed text keep stable scroll/composer behavior; reduced-motion and final/history flushes remain immediate.

Questions and approvals follow the shared conversation interaction model. Natural text uses the ordinary composer. Explicit option/approval cards bind to a current request/revision; confirmed cards retain the question according to the later refinement. Failed-response Retry follows durable backend eligibility, preserving the intended message/conversation and reconciling unknown effects.

Computer progresses from preparation to an active preview and a compact finished state; the preview follows authoritative machine/run activity. Viewing is separate from acquiring control. Transient viewer loss can reattach without silently obtaining a new input lease. Human handback revokes interactive access and reconciles in-flight state.

## State and acceptance

| Condition | Required outcome |
| --- | --- |
| Loading/empty/failure | Clear state and actionable repair; preserve authored input and local attachments. |
| Queued work | Correct ordering, author and editable pending state; no lost or duplicated message on reload. |
| Waiting for input | Current question/work relationship is clear and resumes from the correct response. |
| Creation retry/restart | One entity, conversation, opener and admission per intentional operation. |
| Opening failure | Keep the entity and recover in the same chat; reconcile unknown native work. |
| Tool/configuration update | Show changes only from a successful authoritative revision/receipt. |
| Scope/membership change | Refresh authorization and avoid leaking private DM data. Shared working-file visibility remains explicit. |
| Desktop/mobile | Same information architecture, usable controls/viewers and a clear path back to conversation. |

Composio and visual inputs expose only supported capabilities. Harness vs app skill source stays visible; app workflows do not overwrite native packages. Subscription does not silently switch to key billing. Optional search/fork/meter/dashboards do not become mandatory screens.

## Verification and remaining gates

[Creation](../backlog/NMA-065.md), [conversation UI](../backlog/NMA-061.md), and [contextual work UI](../backlog/NMA-062.md) are completed for their recorded scope. [NMA-063](../backlog/NMA-063.md) remains Backlog for product-wide real-API desktop/mobile acceptance with both required harnesses. [NMA-064](../backlog/NMA-064.md) remains Backlog for installation after that gate.

Use the [interaction/Computer implementation evidence](../verification/conversation-implementation-2026-11-06/README.md), [later refinements](../verification/conversation-followup-2026-11-06/report.html), [shared-machine verification](../verification/shared-machine/README.md) and [Tauri guide](../architecture/tauri-development.md). Screenshots/build/typecheck or a development bundle do not complete the open product/distribution gates.
