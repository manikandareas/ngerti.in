# Conversation interactions and live Computer implementation

Implemented in the working tree on 2026-11-06 against [the accepted plan](../../architecture/conversation-interactions-and-computer-plan-2026-11-06.md). Existing November 5 redesign changes were retained. Unrelated skill/lockfile changes were left untouched. No commit, push, Notion status update, packaged desktop rebuild, or production deployment was performed.

The later [Studio and Computer UI refinement](ui-refinement/README.md) supersedes the preparation/completed bubble presentation and viewer controls described in this original delivery.

The subsequent [editable answers and approval details refinement](interaction-ui-refinement/README.md) removes Open Computer from connecting/completed cards, adds editable custom options and replaces collapsed approval arguments with visible scrolling details.

The later [HITL history and avatar follow-up](../conversation-followup-2026-11-06/report.html) supersedes the original disappearing-card behavior: confirmed cards retain their question only, mentions render as references, waiting bubbles are suppressed, and group cards/messages share visible adjacent avatars while DM rows omit them. The [cleanup verification](../conversation-cleanup-2026-11-06/README.md) records the subsequent refactor and local commit checks.

## Original delivered behavior

- `Interactions` owns durable product questions and approval decisions for both DM and group. `ngertiin.ask_user` and `ngertiin.resolve_user_input` use the normal scoped product-tool path on Codex and Muse. `group_ask_user` delegates to the same service as a compatibility alias. Native permissions keep their actual request identity, offered choices, submission acknowledgement and uncertainty fences; their UI uses the shared `InteractionCard` presentation.
- A plain question is an ordinary assistant message. The next normal composer message may answer it or change topic. The current agent turn interprets this context, without another classifier model or keyword rules. Resolving that message uses its existing run instead of creating a duplicate continuation. An owner button response admits one durable continuation. Existing Goals wait while input is pending, transfer to that continuation, and paused/stale responsibilities cannot be reactivated by an old answer.
- Actionless approvals are rejected before a card is persisted. Product approvals persist a typed decision, specific action fingerprint, owner response provenance, and one effect command. Buttons submit approve/reject. Clear conversational approval requires a real later user message and an exact evidence excerpt; the native agent interprets its meaning. Scoped product operations revalidate the decision immediately before effects. Changed arguments, missing decisions, stale responsibility and uncertain replay are fenced. This is a gate for explicitly protected operations; it does not add blanket approval to all tools or bypass native permission checks.
- Options use a compact assistant-side card with single/multiple bounds and optional custom text. Approval has Reject/Accept actions, an empty left footer and no close control. Confirmed cards disappear without a saved-answer receipt. Indeterminate submissions retain their exact durable operation and a status action.
- `POST /v1/runs/:id/retry` accepts an eligible failed response only. It keeps the original input, attachments, selected agent and task, links both attempts, and preserves old journal output. The old response disappears after admission and agent activity takes its place. Successful, cancelled and uncertain work is ineligible; unknown effects require reconciliation. Recorded research sources carry forward. Queued edits remain separate from already-processed input.
- Computer activity persists safe machine/run attribution. Preparation is compact, active work displays actual Cua video, and completed history is a compact bubble without an image or viewer. The Computer panel previews the same machine directly. Human/other-agent ownership is shown without attributing their input to the waiting agent.
- Viewer grants outlive incidental component mounts. Card and panel have distinct grants and cannot revoke each other. The gateway renews upstream credentials behind a stable viewer ID, preserves native transport reattachment, and reserves CloseMedia for explicit revocation/expiry. A same-origin external bridge reports native connection status and decoded-frame presence; the parent validates origin, source and viewer identity. Failed/unresponsive viewers can recover automatically without rebooting the machine or replaying a task.
- Existing neutral file chips, file-type icons, recorded source citations, source list, hover actions, dirty-composer Send/empty-composer Stop, and activity/streaming behavior remain integrated. Assistant Studio includes Computer preparing/live/completed states; its live state reads the configured local machine without taking control or invoking a provider.

Contract version: **1.31.0**. [Changed routes, tool schemas and interaction entity](contract.json). No existing installation data was reset. The previous packaged backend was stopped gracefully, then the source backend was started on port 8000 with the same installation directory; the web client runs on port 3001.

## Evidence

| Boundary | Result |
| --- | --- |
| Backend domain/API/adapters | 411 tests passed in the final complete run. A preceding loaded run had one timing-sensitive recovery-test failure; the complete isolated rerun passed. |
| Frontend unit verification | 49 tests passed. |
| Conversation browser cohort | 81/84 passed initially; the three desktop startup/table timeout cases passed in a separate 3/3 rerun. |
| Work browser cohort | 76/78 passed initially; the two desktop navigation/API timeout cases passed in a separate 2/2 rerun. |
| Native Computer browser cohort | 4/4 passed, covering desktop and mobile: live decoding, in-place credential renewal, transport loss/recovery, takeover/handback, simultaneous card/panel grants, independent close, and compact completed history. |
| Real harness inference | Codex and Muse each passed a three-turn DM journey: ask, unrelated topic, later answer. The pending request survives the new topic and resolves through the third existing run, with no fourth continuation. |
| Static/build gates | Server/web typecheck, server/web Biome, web production build and whitespace checks passed. The build retains its large-bundle advisory. |

[Machine-readable results and reproduction commands](verification.json), [real harness observations](native-interactions.json), [actual viewer asset hashes](viewer-assets.json), [screenshot hashes](screenshots.json).

The browser conversation/work harness is a deterministic external protocol fixture; HTTP, tool scopes, application authority and SQLite are real. The Computer cohort uses the actual retained Linux machine and its encoded/decoded video. Its active-work harness is a fixture that performs a real `get_desktop_state` product-tool call, then yields time for observing the UI. The real-provider journey is separate, uses Codex subscription and the explicitly configured Muse API-key credential, and performs no external app effects. No real email, purchase, or other irreversible external action was used for testing. An app-host fixture proves the approval gate reaches the actual scoped dispatch boundary and deduplicates its receipt.

### Screenshots

Representative desktop and mobile captures were visually inspected after capture. These are actual browser captures; the Computer captures contain live video rather than inserted screenshots.

| State | Desktop | Mobile |
| --- | --- | --- |
| Question before selection | [View](screenshots/desktop-product-question-pending.png) | [View](screenshots/mobile-product-question-pending.png) |
| Question selected | [View](screenshots/desktop-product-question-selected.png) | [View](screenshots/mobile-product-question-selected.png) |
| Answer submitted | [View](screenshots/desktop-product-question-answered.png) | [View](screenshots/mobile-product-question-answered.png) |
| Approval pending | [View](screenshots/desktop-product-approval-pending.png) | [View](screenshots/mobile-product-approval-pending.png) |
| Approval submitted | [View](screenshots/desktop-product-approval-submitted.png) | [View](screenshots/mobile-product-approval-submitted.png) |
| Failed response actions | [View](screenshots/desktop-failed-response-retry.png) | [View](screenshots/mobile-failed-response-retry.png) |
| Response retried | [View](screenshots/desktop-failed-response-retried.png) | [View](screenshots/mobile-failed-response-retried.png) |
| Computer card and panel | [View](screenshots/desktop-computer-card-and-panel.png) | [View](screenshots/mobile-computer-card-and-panel.png) |
| Computer reconnecting | [View](screenshots/desktop-computer-reconnecting.png) | [View](screenshots/mobile-computer-reconnecting.png) |
| Computer recovered | [View](screenshots/desktop-computer-recovered.png) | [View](screenshots/mobile-computer-recovered.png) |
| Computer finished | [View](screenshots/desktop-computer-conversation-finished.png) | [View](screenshots/mobile-computer-conversation-finished.png) |

## Remaining proof boundaries and deferred scope

- Renewal was exercised with an accelerated **client-side deadline** against the real upstream ticket issuer and unchanged iframe. This does not establish an hours-long soak, real ticket-expiry/backend-restart fault matrix, or stability under every browser suspension condition.
- The health bridge uses pinned native status and decoder counters. It distinguishes initial decoded readiness, reconnect and a healthy unchanged screen. It does not establish capture-freeze-versus-idle diagnosis using upstream protocol statistics. The two surfaces use independent media sessions; a shared browser decoder is not claimed.
- Real inference verifies natural conversation behavior on both harnesses. The entire options/approval/files/research/Computer journey in one thread on each paid provider has not been claimed as one completed native cohort. Other flows have the separate domain, protocol and browser evidence above; ambiguous conversational approvals still depend on native-agent interpretation plus backend provenance checks.
- Automatic per-claim citation extraction, editing processed messages, regeneration of successful responses, historical Computer recordings/images, new harness families, remote machines and installer/native-package changes remain outside the accepted implementation scope.

[Transport source and upgrade constraints](../../research/computer-preview-transport-2026-11-06.md). Viewer `1000` means intentional native stop and is unsuitable for a transient-loss test. The recovery test uses client close `4001`; the native viewer reattaches without changing the gateway URL. The initial `1000` test correctly did not reconnect and was corrected as a test stimulus, not hidden as a passing network-loss result.
