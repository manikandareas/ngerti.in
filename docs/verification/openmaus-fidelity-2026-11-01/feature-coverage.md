# Existing-feature coverage

This is a source-to-implementation audit for the existing Ngertiin UI. It uses
OpenMausBot **0.1.137**, pinned revision
`7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`; artifact identities, retained REA
records and reference observations are in the [investigation ledger](README.md).
Source paths below are relative to that checkout. No source or test process was
run while writing this matrix.

The ledger's combined Goal/Routine entry is split here, giving **19 surfaces**.
**Mapped** means the named source pattern and current implementation were
inspected; it is not a passing test result. Final cohort reports, screenshots
and manifests are consolidated separately by the parent verification pass.
All assigned material gaps were implemented and verified. The [final case
index](browser-results.json) records 122 passing unique browser cases. Raw
reports preserve intermediate failures and their targeted reruns.

Path shorthand: **U** = upstream `src/components/`; **C** = current
`apps/web-client/src/features/conversation/components/`; **W** = current
`apps/web-client/src/app/workspace-layout.tsx`; **T** = current
`apps/web-client/tests/`.

| # | Existing surface | Pinned source paths | Current implementation and regression entry points | Adaptation / source-audit state |
| --- | --- | --- | --- | --- |
| 1 | Roster, Tobi, creation and selection | U `Sidebar.tsx`, `SidebarTiles.tsx`, `SidebarSimpleTop.tsx` | C `navigation.tsx`; W. T `conversation.spec.ts`: creation/opener identity and lost acknowledgement; `fidelity.spec.ts`: tile dimensions, creation-menu keyboard and responsive roster. | **Mapped.** Tobi/primary DM are automatic. Creation preserves application entity/operation identity instead of adding another lifecycle. |
| 2 | Agent identity and group avatar stack | U `Avatar.tsx`, `CursorAvatar.tsx`, `StackedMauses.tsx` | C `identity.tsx`; `components/openmaus-avatar/`; `assets/openmaus/cursor-chrome.webp`. T `fidelity.spec.ts`, `work.spec.ts` group/profile states. | **Mapped.** Reused renderer/modules and installed chrome asset have [provenance](../../../apps/web-client/src/components/openmaus-avatar/README.md). Stable local colors do not invent a backend identity field; user avatar content remains user content. |
| 3 | Header and model/account/reasoning popup | U `ChatHeadPill.tsx`, `SimpleModelMenu.tsx`, `model-menu-keys.ts` | W; C `model-picker.tsx`, `model-picker-keys.ts`, `settings.tsx`. T `model-picker.spec.ts`, `settings.spec.ts` default inheritance, `fidelity.spec.ts` capsule/menu geometry. | **Mapped.** Choices use discovered models and real revision-aware configuration. Authentication, selected billing and effective billing remain distinct; unavailable/unknown models are not fabricated. |
| 4 | History, prose, tables, code and sources | U `ChatView.tsx`, `chat-bubble.ts`, `ReplyBlocks.tsx`, `RichTable.tsx`, `CodeBlock.tsx` | W; C `answer.tsx`, `answer-code.tsx`, `rich-table.tsx`, `markdown-table.tsx`, `work-activity.tsx`; conversation `lib/` helpers. T `rich-answer.spec.ts`, `work.spec.ts` file preview/source return, `fidelity.spec.ts`. | **Mapped.** Safe Markdown and scoped resource links preserve API authorization. Rich assistant text is explicitly fixture-projected in rich-answer tests; sorting/copy/download/virtualization are actual browser interactions. |
| 5 | Composer, draft attachments and supported images | U `Composer.tsx`, `composer-simple.ts`, `composer-wrap.ts`, `ComposerPlusMenu.tsx`, `ComposerAttachments.tsx` | W; C `attach-input.tsx`, `draft-attachments.tsx`. T `fidelity.spec.ts` single/multiline geometry; `conversation.spec.ts` IME/draft cases; `work.spec.ts` unsupported images and attachment counts. | **Mapped; final attachment cases pass.** The sole supported plus action opens the picker directly. DM upload/modality/count checks remain real; group routing has no attachment field, and unsupported video/image input is not presented as supported. |
| 6 | Queue, edit/delete, steer, stop and unknown recovery | U `ComposerQueuedMessages.tsx`, `Composer.tsx`, `CancelledTurnRow.tsx`, `ChatErrorBanner.tsx` | W; C `queued-messages.tsx`. T `conversation.spec.ts`: same admitted message/run after composer edit, cancel/focus/draft restore, lost edit acknowledgement, 1500ms second-Enter guard, no duplicate admission; `work.spec.ts` cancellation. | **Mapped; final queue cases pass.** Source composer editing retains Ngertiin's existing message/revision rather than cancel-and-readmit. Durable retries reuse body/key. Steering requires an eligible current native run and fresh supported native-request checks. Stop intent and confirmed stop stay separate. |
| 7 | Agent overview, instructions and configuration | U `bot-panel/DetailsTab.tsx`, `bot-panel/rows.tsx`, `bot-panel/pages.tsx` | C `context-panel.tsx`, `agent-panel.tsx`, `settings.tsx`, `panel-primitives.tsx`. T `fidelity.spec.ts` hero/rows/nested Escape; `model-picker.spec.ts`; `conversation.spec.ts` panel navigation. | **Mapped.** Agent/Anggota, File, Goals and Routine remain the [Notion-required contextual tabs](https://app.notion.com/p/40babdd6187381abba02d29c7363474d). Name/role/instructions can be changed through conversation; capabilities retain truthful harness states. |
| 8 | Memory and application/native skills | U `bot-panel/LibraryTab.tsx`, `SkillsSection.tsx` | C `agent-panel.tsx`. T `conversation.spec.ts` real memory correction/removal; `work.spec.ts` member-DM privacy. | **Mapped.** Scoped memory pagination and native/application inventories remain separate. Native skills are read-only; agents create/repair application-owned skill packages through existing product tools. The listed UI cases do not independently prove every catalog item or pagination boundary. |
| 9 | Group creation, membership and shared instructions | U `SidebarNewRoomPanel.tsx`, `room-panel/RoomPanel.tsx` | C `create-group.tsx`, `group-panel.tsx`; W. T `work.spec.ts`: lost creation acknowledgement, membership rejection/concurrency, routing and private-member resources. | **Mapped.** One human owner and persistent member identities remain authoritative. Shared instructions use conversation; group member profiles expose no private DM memory/transcript/files. Required model routing chooses a responder without pass/skip bubbles. |
| 10 | Human replies and native question/permission cards | U `AskCard.tsx`, `QuestionCard.tsx`, `ApprovalCard.tsx`, `OptionsCardRow.tsx` | C `human-reply.tsx`, `native-interactions.tsx`, `native-settled-card.tsx`; conversation `lib/native-transcript.ts`, `native-transcript-boundary.ts`; W. T `work.spec.ts`: single/multiple/free-text, concurrent lanes, lost/unknown acknowledgements, reload/revocation/cancellation, unsafe cuts/changed prefixes. | **Mapped; final chronology cases pass.** [API 1.18 journal](native-interactions/README.md) retains observed requests/acknowledgements only. Submitted does not mean action completed. Immutable UTF-16 anchors require matching prefix hashes and safe whole-Markdown block boundaries; legacy/missing/changed/unsafe positions use labeled per-run history. No fabricated engine ordering or blind replay. |
| 11 | Tool, peer and activity details | U `ToolActivity.tsx`, `ActivityRun.tsx`, `ActivitySection.tsx`, `StatusActivityRow.tsx`; `ChatView.tsx` completed-step grouping | C `tool-chips.tsx`, `work-activity.tsx`; W. T `work.spec.ts` peer/routing/product-tool state; `conversation.spec.ts` conversation flow. | **Mapped; contiguous completed native steps fold together, with failed/unverified steps visible and accessible disclosures. Final desktop/phone cases pass.** Human action labels and actual received/running/verified/unknown distinctions remain. No input/output, native timestamp or success evidence may be invented when the API supplies only tool names/states. |
| 12 | Goal list/detail/evidence and controls | U `GoalRunCard.tsx`, `TriggersPage.tsx`, `bot-panel/rows.tsx` | C `responsibilities.tsx`, `responsibility-controls.tsx`, `work-activity.tsx`. T `work.spec.ts` contextual goal/source/evidence, pause/resume/stop, lost control acknowledgement and related-run distinction. | **Mapped.** Goals are captured/updated through conversation, without a required activation form. Pause/stop goal affects continuation; stopping one run is a separate command. Real revisions/receipts govern controls. |
| 13 | Routine list/detail/schedule and controls | U `TriggersPage.tsx`, `RoutineRunCard.tsx`, `bot-panel/rows.tsx` | C `responsibilities.tsx`, `responsibility-controls.tsx`, `work-activity.tsx`. T `work.spec.ts` list/detail switch, timezone/next occurrence, linked goal, previous results and quiet continuation. | **Mapped.** The name Routine, contextual tab and existing once/calendar/interval/heartbeat schedule shapes remain. The redesign does not add an upstream global calendar or mandatory schedule form. Quiet execution and goal blocking follow application state. |
| 14 | Workspace files, preview, download and sharing | U `FilesView.tsx`, `bot-panel/LibraryTab.tsx`, `ComputerFilesPane.tsx` | C `files-panel.tsx`, `file-viewer.tsx`, `file-viewer.css`; `lib/workspace-files.ts`. T `work.spec.ts`: real upload/download, safe table/code/Markdown previews, explicit cross-context share with byte identity. | **Mapped.** Existing managed/project folder binding stays server-authorized. Sharing copies the selected file to an explicit destination; it does not broaden source-folder access. No HTML execution, unsupported media promise or upstream cloud-sync feature is added. |
| 15 | Browser profile/session/VNC and reconnect | U `bot-panel/ComputerTab.tsx`, `BrowserPanel.tsx` | C `browser-section.tsx`, `browser-viewer.tsx`. T `work.spec.ts` real managed-browser observation/VNC handshake and view-ticket reconnect without action replay. | **Mapped.** The visible environment is the agent's managed browser. The view is honestly view-only; missing/working/unknown preview states are explicit. General desktop/native computer use and upstream host choices remain deferred. |
| 16 | Composio catalog, connections, access and receipts | U `AppsSection.tsx`, `PluginsPanel.tsx` | C `app-connections.tsx`. T `work.spec.ts` explicit context grants and application effects. Catalog/search, popup/polling, blocked-popup recovery, read failures and reconnect preserving grants have explicit browser assertions. | **Mapped; initial catalog, live search, source app rows and OAuth launch/polling pass real API/provider-fixture desktop/phone cases.** Explicit agent/thread/tool grants and provider/unknown receipts must remain. Optional upstream native integrations/categories do not expand the scope. |
| 17 | Settings, themes, providers/default/accounts/key/login | U `SettingsModal.tsx`, `SettingsSimplePages.tsx`, `EnginesSettings.tsx`, `DefaultBotControls.tsx`, `SettingsPrimitives.tsx` | Current `features/settings/`; shared C `model-picker.tsx`. T `settings.spec.ts`: overlay/URLs/history, focus/draft, theme, inline provider/key/login, lost key acknowledgement/revoke, default inheritance. | **Mapped.** Ngertiin General/Connections/About sections and Codex/Muse/account APIs are retained. Source overlay/disclosure and contained default picker do not conflate login/discovery/inference or silently change subscription to key billing. Only supported theme choices are exposed. |
| 18 | Shared controls, menus, dialogs/status and gallery | U `menu-recipe.ts`, `elevated.ts`; upstream `src/styles.css` | Current `styles/theme.css`, `index.css`, `components/ui/`, `features/design-system/`. T `theme.spec.ts`, `hover.spec.ts`, `design-system.spec.ts`, `fidelity.spec.ts`. | **Mapped.** Daylight/Midnight and observed phone variants are distinct, including menu radius/palette. Gallery tests enumerate installed primitive previews; a working preview or finite geometry assertion is not a whole-product visual equivalence result. |
| 19 | Responsive shell, focus, reconnect and background continuity | Upstream `src/lib/use-media-query.ts`; U `bot-panel/side-panel.ts`, `HomeScreen.tsx` | W; `hooks/use-workspace.ts`, `lib/api-client.ts`; contextual panels/sheets. T `fidelity.spec.ts` desktop/tablet/phone and modal release; `conversation.spec.ts` durable reload; `settings.spec.ts` return/history; `work.spec.ts` scoped recovery. | **Mapped; final phone Back and rapid Settings-close focus cases pass.** SSE/cursor refresh and durable operations consume application authority. Backend/host lifetime governs continuation with a closed tab; resizing or reconnecting does not replay external actions. Browser regression is not a deployment or host-lifetime acceptance claim. |

## Reading the evidence

- **Source proof:** exact upstream modules and retained installed-app observations
  establish the reference patterns. REA's selected shipped-module coverage remains
  partial as documented in the ledger; source inspection does not mean every
  reference interaction was executed.
- **Regression proof:** the named Playwright entry points exercise the current
  implementation. The conversation cohort uses real HTTP/SQLite with no native
  executor; settings/model tests declare inspection/login fixtures. Rich-answer
  and keyboard-native cases declare their projection fixtures. Work tests use the
  declared controlled harness/external-app boundary and actual scoped product
  persistence, with the managed-browser/VNC checks identified separately.
- **API truth:** the journal's backend/consumer evidence is linked in
  [verification.json](native-interactions/verification.json). Privacy, pending
  disappearance, submitted acknowledgement, unknown effect and confirmed run
  cancellation are distinct facts. Provider billing/authentication/inference
  claims are limited to their actual evidence.
- **Completion boundary:** the identified Apps, tool folding, queue, attachment,
  Markdown and focus gaps were implemented and verified through the final
  cohorts. Source mapping and regression evidence do not establish literal
  whole-app pixel equality. A fresh native-provider acceptance cohort is separate from this UI
  task. Installer/deployment, Notion Done and production acceptance are not
  inferred from local regression results.

Test files: [conversation](../../../apps/web-client/tests/conversation.spec.ts),
[model picker](../../../apps/web-client/tests/model-picker.spec.ts),
[rich answers](../../../apps/web-client/tests/rich-answer.spec.ts),
[settings](../../../apps/web-client/tests/settings.spec.ts),
[work/context](../../../apps/web-client/tests/work.spec.ts),
[source geometry](../../../apps/web-client/tests/fidelity.spec.ts),
[themes](../../../apps/web-client/tests/theme.spec.ts),
[hover states](../../../apps/web-client/tests/hover.spec.ts), and
[gallery](../../../apps/web-client/tests/design-system.spec.ts).
