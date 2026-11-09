# Native retained conversations — 2026-11-09

Scope: the owner's request to apply Zed's per-thread conversation-state pattern to `apps/desktop-rs`. This is a follow-up to the accepted NMA-068 native conversation implementation. It does not reopen historical acceptance, replace Tauri, or certify a new development bundle, provider cohort or distribution.

## Ownership and behavior

- `workspace/thread_state.rs` owns each conversation's retained composer/scroller entities, message/table entities, question views/steps, loaded history and read projection. The shared workspace owns transport/feed, profile binding, command receipts, activation and contextual resource retirement. A state container holds the existing native entities; it does not import Zed's editor or agent runtime.
- A–B–A navigation reuses the retained entities. Composer metadata, selection and undo, exact logical scroll offsets, table interaction state and unanswered question choices remain in memory. Fresh activation reconciles backend scope before Send, model changes or question replies can dispatch.
- Eight inactive idle states are retained in addition to the active conversation and protected states. Queued/running/stopping/unknown work, pending human/native input, an active queued-message edit and unresolved journal operations prevent eviction. In-flight staging temporarily prevents eviction. Completed work becomes idle through the same ordered owner-wide event log; there is no additional scheduler, inference call or per-thread polling loop.
- Replay begins at the oldest retained projection cursor and reads at most one 1,000-event page per refresh. Each projection advances with its validated page; already newer checkpoints do not move backwards. Additional pages are scheduled after applying the preceding page. Inactive models update without rebuilding their hidden Markdown/table views.
- Unchanged message entities and parsed table extensions are reused. Structural updates splice their identity interval; changed message rows and adjacent structural boundaries are remeasured instead of invalidating every message. Other dynamic card rows conservatively remeasure. Native Markdown source readiness marks provisional heights, preserving an explicit reading anchor during asynchronous parsing.
- Rich composer snapshots (text, reference metadata and selection) and row-ID/publication-sequence/rem-offset reading checkpoints use the existing private atomic preferences file. They do not persist backend conversation copies, standalone event cursors, focus, expansion state or undo history. Missing rich snapshots fall back to the earlier text draft. Cold reading recovery backfills contiguous earlier timeline pages; user scrolling cancels the pending restoration. Snapshot pages that are disjoint from retained history track each missing interval and load bounded pages until they overlap; a newer activation preserves earlier unfinished intervals and the original older-history frontier. Deleted or changed anchors use a nearby retained message.
- An acknowledgement arriving after a thread switch updates the original journal and cached composer, without clearing the current chat's draft or changing its context panel. A confirmed queued-message edit returns to its original ordinary draft. Pending requests, unknown effects and operation identities retain the existing backend reconciliation policy.
- Context panels, document reads/WebViews and Computer presentation retire on switching as before. The retained cache does not keep private embedded surfaces or input leases alive.

## Source and dependency identity

Reference: `zed-industries/zed@b5cd310b3b54dfc659fcc06453e6358843dfe216`, particularly `agent_ui/src/agent_panel.rs`, `conversation_view.rs`, `conversation_view/thread_view.rs`, `entry_view_state.rs`, `draft_prompt_store.rs` and `agent/src/thread.rs`. The [adoption record](../../development/source-adoption.md#native-retained-conversations--2026-11-09) identifies the local adaptation and upgrade checks.

Pins remain GPUI Kit 0.9.0, GPUI Fast 0.1.13 and API contract 1.31.0. The feature composes GPUI's published `ListState`, scrollbar and Base `ScrollBounce` because Kit 0.9.0's `MessageScroller` does not expose exact within-row restoration or measurement readiness. Its row-owned insets follow the existing component. Original renderer behavior and controls remain native. No dependency or backend contract change is introduced.

The [source manifest](retained-threads-2026-11-09/source-manifest.json) records the baseline commit, exact changed-source hashes, contract identity and host/tool versions. [Raw check output](retained-threads-2026-11-09/check.txt) retains the executed cohort.

## Verification

`CARGO_BUILD_JOBS=1 bun run check:desktop-rs` exited 0 on the frozen Rust sources in the manifest. Dependency/rendering ownership, formatting and strict all-target Clippy passed. The complete workspace cohort passed **99/99**, with 0 failures and 0 ignored: avatar 8, client unit 4, read-only client 12, worker 1 and native desktop 74. The desktop cohort includes the ten new native thread tests and one profile-reopen test described below.

`git diff --check` passed. The repository-wide `bun run docs:check` retains the existing eight broken links in imported GPUI skill references; [raw output](retained-threads-2026-11-09/docs-check.txt) records that exit 1. A temporary copy of the same checker excludes only `.agents/skills/gpui-kit*` Markdown discovery and leaves milestone, feature ownership and API checks intact. The [scoped output](retained-threads-2026-11-09/docs-scoped-check.txt) passes 230 Markdown files, 2,239 local links (101 checked in pinned historical trees), 25 milestones, 83 decisions and contract 1.31.0. The repository checker and imported skill files are unchanged.

Native UI integration uses production components and isolated fixture data; avatar readiness is a separate fixture prerequisite in the sidebar navigation test. No human/provider message is sent by these tests.

Focused coverage:

1. Native sidebar A–B–A preserves composer/scroller identity, inline reference metadata, selection and undo; cached Send remains disabled before reconciliation.
2. Within-row reading offsets survive switching and reconstruction while Markdown parsing is pending.
3. Native question choices retain entity identity and do not submit on switching.
4. Idle eviction releases old entities while an unresolved operation protects its originating thread.
5. Inactive projections accept revisioned/deduplicated events and completed work becomes evictable.
6. A delayed send acknowledgement clears only its originating cached composer.
7. Cold restoration waits for contiguous older history and yields to a user's scroll.
8. A queued edit acknowledged while hidden clears that edit and restores the ordinary draft.
9. Disjoint latest/retained history pages backfill each interrupted interval without skipping the earlier-history frontier; overlapping pages deduplicate and a previously empty conversation acquires its first older frontier.
10. Late failures remain attached to their originating conversation, including a return to that conversation before the retry response arrives. Unknown operations remain unresolved.
11. Rich Unicode/reference drafts and reading checkpoints survive profile close/reopen; acknowledged cleanup preserves another thread's draft and the reading checkpoint.

Limits: this pass does not run fresh Codex/Muse inference, physical IME candidate UI, an OS Quit/relaunch of a rebuilt app, a real-API multi-page cold-history journey, memory/frame-time comparison or installer/bundle acceptance. The in-memory idle count is a policy bound, not a measured total-memory bound; protected states may exceed it. Earlier evidence retains its original source scope.
