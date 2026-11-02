# OpenMausBot UI/UX fidelity investigation and implementation

The existing-feature redesign is complete across the **19 surfaces** in the
[feature coverage matrix](feature-coverage.md). The implementation follows the
pinned OpenMausBot layouts, assets, typography, controls and interactions while
retaining Ngertiin's required contextual tabs and authoritative API state.
**122 unique browser cases pass**, alongside 270 backend tests and 6 API consumer
checks. This is local source/render/interaction evidence; it does not establish
literal whole-application pixel equality or close NMA-063.

## Authority

- Installed application: `/Applications/OpenMausBot.app`, bundle
  `com.openmausbot.app`, version/build **0.1.137**.
- Exact source reference: OpenMausBot
  `7124ebc4ff57b7e7dc5c0ad94c09ff9f842c93c9`, available locally at
  `/tmp/ngertiin-openmaus-source-20261101` during this investigation.
- Installed `app.asar` SHA-256:
  `123baad523c82bcc3210d5092d0c1d9f211c4cfcb44de43813f8bff1cbd14e6f`.
- Installed `ui/assets/index-C515F6gO.css` SHA-256:
  `ec0fc627dd6325e29c71a320b0cc8013e1de0162486db9da0e932d3915d6cf01`.
  Both identities were remeasured and match the retained original study.
- The [earlier study](../../research/openmausbot-2026-11-01/README.md)
  preserves eight runtime states, shipped styles and source findings. Original
  evidence bytes are unchanged.
- Live Notion: [NMA-060](https://app.notion.com/p/409abdd61873819b80c4dd2b3e593834),
  [NMA-065](https://app.notion.com/p/40babdd61873819b9d04e1e33442a7e1),
  [NMA-061](https://app.notion.com/p/409abdd61873816fadd3e28e1d3bbe5d)
  and [NMA-062](https://app.notion.com/p/409abdd618738165877cc6c59f2a8cde)
  were fetched as **Done**. [NMA-063](https://app.notion.com/p/409abdd6187381e3a083dfb7644b7c90)
  remains **Backlog**. The current [screen map](https://app.notion.com/p/40babdd6187381abba02d29c7363474d)
  and [feature decisions](https://app.notion.com/p/409abdd61873813284bbf75698073d8e)
  retain Agent/Anggota, File, Goals and Routine as Ngertiin's contextual tabs.
  Upstream-only optional/deferred features are not silently added.

## Fresh reverse-engineering evidence

REA analyzed four additional shipped chunks without executing them:
`FilesView-Bf1KBcQh.js`, `TriggersPage-2dvP0OJ6.js`,
`RoutinesPage-DQ5g5OK4.js`, `SettingsModal-C15bRIgz.js`.

- Complete retained record:
  `ev_d491d266398491f34626355f79e6450d51a3a244c743b63c9f8d321b13c83a0f`.
- Summary view:
  `ev_042a8b479a3e1f3fef274374fe5ab8e450a6f803cbb790f5a773d12d4bb43eb1`.
- The [portable bundle](evidence/rea-focused-bundle.json.gz) contains both
  records. Four JavaScript files parsed, zero parse failures, 486,914 text
  bytes read. **148 other inventoried files remain outside this selection.**
  Semantic coverage is partial at 1,500 nodes/file and 6,000 total; 22,261
  semantic unknowns remain explicit. No global source equivalence or runtime
  behavior is inferred from these counts.

CUA also inspected the running application's current conversation, question
card and agent profile. No message was sent, no native question answered and
no account/model/preference changed in the reference application.

## Full feature mapping

The [final case index](browser-results.json) records the latest result per test
and viewport. [Rendered states](render-index.json) index 175 retained screenshots.
The detailed coverage matrix maps each surface to its source and test entry points.

| Existing Ngertiin surface | Pinned OpenMaus source pattern | Implementation location under `apps/web-client/src` | Required evidence |
| --- | --- | --- | --- |
| Roster, Tobi, creation menu, agent/group selection | `Sidebar.tsx`, `SidebarTiles.tsx`, `SidebarSimpleTop.tsx` | `features/conversation/components/navigation.tsx` | Desktop/phone creation, no duplicate entity/opener, source tile/row metrics |
| Identity/avatar/group stack | `Avatar.tsx`, `CursorAvatar.tsx`, `StackedMauses.tsx` | `identity.tsx`, `components/openmaus-avatar/` | Exact asset/source provenance, rendered ordinary/chrome/group states |
| Header and model/account/reasoning popup | `ChatHeadPill.tsx`, `SimpleModelMenu.tsx`, `model-menu-keys.ts` | `workspace-layout.tsx`, `model-picker.tsx`, `model-picker-keys.ts` | Grouping, compact expansion/search, keyboard, persisted selection and explicit billing |
| Chat history, replies, rich tables/code, sources | `ChatView.tsx`, `chat-bubble.ts`, `ReplyBlocks.tsx`, `RichTable.tsx`, `CodeBlock.tsx` | `workspace-layout.tsx`, `answer.tsx` and rich-answer helpers | Typography/geometry, rich-block separation, safe rendering and overflow, source/resource navigation |
| Composer, attachments, supported image input | `Composer.tsx`, `composer-simple.ts`, `composer-wrap.ts`, `ComposerPlusMenu.tsx` | `workspace-layout.tsx`, `attach-input.tsx` | 44px single-line and multiline behavior, phone dock, IME, real upload/modality rejection |
| Queue/edit/delete/steer/stop/unknown recovery | `ComposerQueuedMessages.tsx`, `CancelledTurnRow.tsx`, `ChatErrorBanner.tsx` | `workspace-layout.tsx` | Real API state and revision/idempotency behavior; requested versus confirmed stop |
| Agent overview/instructions/configuration | `bot-panel/DetailsTab.tsx`, `rows.tsx`, `pages.tsx` | `context-panel.tsx`, `agent-panel.tsx`, `settings.tsx` | Hero, compact rows, nested Back/Escape/focus, shared picker and truthful capabilities |
| Memory corrections/removal/pagination and native/application skills | `bot-panel/LibraryTab.tsx`, `SkillsSection.tsx` | `agent-panel.tsx` | Scope privacy, real edits/deletes, source provenance and read-only native skills |
| Group creation, membership, shared instructions, member profile | `SidebarNewRoomPanel.tsx`, `room-panel/RoomPanel.tsx` | `create-group.tsx`, `group-panel.tsx` | Real creation/retry/lost acknowledgement; group-safe profile, one selected responder |
| Human requests and native questions/permissions | `AskCard.tsx`, `QuestionCard.tsx`, `ApprovalCard.tsx` | `human-reply.tsx`, `native-interactions.tsx` | One-tap single choice, multi-question navigation, exact request identity and receipt |
| Tool/peer/activity/status details | `ToolActivity.tsx`, `ActivitySection.tsx`, `StatusActivityRow.tsx` | `tool-chips.tsx`, `work-activity.tsx` | Human action labels, per-action detail, truthful running/received/verified/unknown state |
| Goal/Routine list/detail/evidence/source/control | `GoalRunCard.tsx`, `TriggersPage.tsx`, `RoutineRunCard.tsx` | `responsibilities.tsx` | Goal versus run stop, schedule/timezone/next occurrence, evidence/source return, quiet updates |
| Workspaces/files/artifact preview/download/sharing | `FilesView.tsx`, `bot-panel/LibraryTab.tsx`, `ComputerFilesPane.tsx` | `files-panel.tsx`, `file-viewer.tsx` | Scope/binding, real upload/download/share, unsafe media rejected, detail/Back/focus |
| Browser profile/session/VNC/reconnect | `bot-panel/ComputerTab.tsx`, `BrowserPanel.tsx` | `browser-section.tsx`, `browser-viewer.tsx` | Honest preview/Watch, same managed environment, new view ticket without action replay |
| Composio connections/access/receipts | `AppsSection.tsx`, `PluginsPanel.tsx` | `app-connections.tsx` | Nested page, explicit grant/revoke, OAuth recovery and provider result/receipt |
| Settings, themes, provider/default/account/key/login | `SettingsModal.tsx`, `SettingsSimplePages.tsx`, `EnginesSettings.tsx`, `SettingsPrimitives.tsx` | `features/settings/` | Source overlay/inline expansion, focus/draft/history, auth/billing and API-key idempotency |
| Shared forms/menus/dialogs/status and theme gallery | `styles.css`, `menu-recipe.ts`, `elevated.ts` | `styles/theme.css`, `index.css`, `components/ui/` | Source palette including phone variants, keyboard/focus/contrast, all252 gallery previews |
| Mobile/tablet/desktop and background/reconnect behavior | `use-media-query.ts`, `bot-panel/side-panel.ts`, `HomeScreen.tsx` | Shared workspace, hooks and panels | No overflow, overlay focus/return, durable continuation and scoped error recovery |

## Evidence cohorts

| Final unique browser cases | Passed | Failed / skipped |
| --- | ---: | ---: |
| UI, source geometry, themes, hover and gallery | 54 | 0 / 0 |
| Conversation, queue, model picker and rich replies | 24 | 0 / 0 |
| Settings, providers, keys and default inheritance | 12 | 0 / 0 |
| Groups, work, files, browser, apps and native receipts | 32 | 0 / 0 |
| **Total** | **122** | **0 / 0** |

The gallery cohort checks 63 installed primitives in two themes and two viewports
(252 preview checks). The case index retains original cohort reports and applies
targeted reruns to the affected cases; earlier failures remain visible in those
raw reports. Test retries are disabled. Additional reruns were limited to changed
behavior and newly diagnosed assertions.

The final fixes include source composer queue editing, the guarded 1500 ms
second-Enter shortcut, source attachment previews, catalog search/OAuth polling,
completed-tool folding and explicit disclosure accessibility. A real phone focus
race was traced to Settings closing before the navigation sheet finished exiting;
public Radix close callbacks now restore focus after the relevant scope releases.
The rapid-close desktop/phone cases pass with draft and focus assertions intact.
The [bounded diagnostic timeline](evidence/focus-race-diagnostic.json) retains the
original fixture-only failure that identified the closing navigation portal.

The first managed-browser run spent 81.5 s starting the actual host. Its overall
test budget now includes cold startup and cleanup; the 45 s connected assertion,
same-session view renewal and zero action-replay checks remain unchanged. Both
final desktop/phone managed-browser cases pass.

Build, frontend 178-file lint, client/test/verification-fixture typechecks, frozen
dependency installation and whitespace checks pass. The build retains Vite's
large-chunk warning for the lazily loaded C++ grammar; it is not hidden.
Backend/consumer denominators and limitations are in
[the journal verification](native-interactions/verification.json).

The [source geometry browser suite](../../../apps/web-client/tests/fidelity.spec.ts)
asserts finite measurements taken from the pinned source. It does **not**
prove whole-application pixel equality. Full screenshots and the feature
mapping above remain separate evidence obligations.

## Boundaries and reproduction

The redesign includes frontend source and one bounded backend addition: the
[observed native interaction journal](native-interactions/README.md), published
as API 1.18.0. It retains submitted/unknown request cards through completion and
reload and records immutable first-observed transcript anchors. The browser
verifies the prefix hash before placing a card within streamed text; missing,
legacy or edited anchors use a labeled per-run history fallback. Only one
component polls live pending requests for each eligible run. Settled fragments
read the scoped snapshot and never reopen a native session automatically.

Pre-existing backend work is preserved, with 13/13 original contents accounted
for by the [preservation check](native-interactions/user-work-preservation.json).
The latest journal gate is 270 backend tests plus 6 API consumer checks, all
passing; it is fixture/HTTP evidence rather than a new native-provider cohort.
No commit, push, deployment or Notion status mutation was performed.

The active development client is `http://127.0.0.1:3001`. Its API was gracefully
restarted on port 8000 only after checking zero active runs and pending logins and
verifying a private SQLite backup. [Runtime verification](runtime-reload.json)
confirms API 1.18 readiness, unchanged installation credentials and preserved
identities across all 26 entity collections. No development data was reset.

The temporary manual review client/API used 3003/8333 with isolated fixture state
`.dev/openmaus-fidelity-zdWriI`; they were separate from the user's installation.
Screenshots in this evidence set use declared fixture data. The final
[source manifest](evidence/source-sha256.json) records the verified implementation;
the original research evidence still passes all 36 historical hashes.

From the repository root:

```sh
bun run typecheck:web-client
bun run lint:web-client
bun run build:web-client
```

From `apps/web-client`, with separate output folders:

```sh
bunx playwright test --output=/tmp/ngertiin-openmaus-fidelity-ui
bunx playwright test --config playwright.conversation.config.ts --output=/tmp/ngertiin-openmaus-fidelity-conversation
bunx playwright test --config playwright.settings.config.ts --output=/tmp/ngertiin-openmaus-fidelity-settings
bunx playwright test --config playwright.work.config.ts --output=/tmp/ngertiin-openmaus-fidelity-work
```

Root `make check` still targets the retained `apps/web`; it is not evidence
for this active client. Installer/deployment and a fresh provider-native
acceptance cohort are distinct from fixture-backed UI/API regression results.
