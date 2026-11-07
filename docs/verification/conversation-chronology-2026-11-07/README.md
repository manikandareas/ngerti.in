# Conversation dates and message clocks

Date: 2026-11-07. This report covers the user's requested conversation chronology refinement, including the explicit exception for Goal/Routine event bars. It does not change NMA-063/NMA-064 readiness.

## Implemented behavior

- A centered absolute date separates local calendar days across user/assistant messages, structured interactions, Computer and activity. Date labels and clocks share the viewing device's time zone.
- Goal/Routine event bars remain without clocks and participate in the correct day group. Normal administrative handoffs stay hidden. Retry replacements do not leave empty date groups.
- Earlier pages are deduplicated by retained part identity and ordered by publication sequence. Same-sender joins and milestone batches stop at day boundaries. Queued intake time does not replace public delivery time or reorder the transcript.
- Questions, approvals and retained native states use the common clock presenter. Their clocks retain request creation/first observation across decisions and reload. Group cards have an adjacent avatar and visible author; DM rows omit the avatar.
- Computer uses its retained start time through connecting, active and completed states. Its observation is positioned by that time without reopening historical viewers. Existing activity retains its public anchor.
- Verified native text boundaries remain intact. When a native question crosses midnight inside one retained answer, the card and following fragment use the retained interaction boundary. This is a presentation boundary, not a new claim of exact per-token output delivery.
- Approval history still removes choices, action details and controls after a confirmed answer; the question, author where applicable, and clock remain. Product selection buttons consistently use `Lanjut`; mobile decision targets are at least 44px high. File-only replies keep the same metadata without drawing an empty text bubble. Native fragments retain stable identities within a day when another request resolves.

## Source and setup

The implementation is in `conversation-time.ts`, `conversation-rows.ts`, `conversation-parts.ts`, `conversation-date.tsx`, the existing message/card presenters and `workspace-layout.tsx` under `apps/web-client/src`. The normal application API contract is unchanged. The source/configuration and screenshot hashes are retained in [the verification manifest](verification.json). Final browser verification uses [an isolated working-tree snapshot](isolated-snapshot.json) with separate loopback port pairs (8351/4351 and 8361/4361); each desktop/mobile invocation receives its own temporary database. This prevents concurrent viewer work and test artifacts in the main checkout from changing the build under test.

Browser verification uses the existing `playwright.conversation.config.ts` and `playwright.work.config.ts`, with isolated temporary SQLite/installation state and loopback API/preview servers. Desktop is 1440×1000; mobile is 390×844 with touch. The chronology cohort explicitly uses `Asia/Makassar` and tests light/dark themes. Pure checks also cover UTC day boundaries and repeated DST hours in other viewing zones.

The dedicated chronology browser cases use real API setup/identity/thread reads, then controlled conversation projections and interaction response fixtures to exercise exact historical dates. The existing interaction cohort uses its real API/SQLite and deterministic harness fixtures. These are browser/application-flow checks, not fresh external-provider inference or live Computer stream proof.

## Focused checks

The dedicated chronology cohort passed **10/10 browser cases** across desktop/mobile: overlapping pagination and overnight queue publication clocks in light/dark mode; approval/finished-Computer clocks with timeless Goal/Routine bars; native text boundaries across midnight; and file-only replies in DM/groups without empty text bubbles. The final per-project reports retain those cases together with the focused queue, navigation, scroll and rich-answer regressions.

The frontend pure cohort passed **61/61 tests**, including 11 new chronology cases. The standard production build, including TypeScript, passed with the existing bundle-size advisory. Final browser verification passed **38/38 cases**, with **0 failed and 0 skipped**: 11 conversation/rich-answer cases per desktop/mobile project plus eight interaction cases per project. The ten dedicated chronology cases are included in that total. Root lint, typecheck and production build passed; documentation links and scoped whitespace checks passed.

| Final cohort | Pass/total | Evidence |
| --- | --- | --- |
| Desktop chronology/queue/navigation/scroll/rich answers | 11/11 | [Report](final-conversation-desktop.json), [log](logs/final-conversation-desktop.log) |
| Mobile chronology/queue/navigation/scroll/rich answers | 11/11 | [Report](final-conversation-mobile.json), [log](logs/final-conversation-mobile.log) |
| Desktop native/product interactions and retries | 8/8 | [Report](final-work-desktop.json), [log](logs/final-work-desktop.log) |
| Mobile native/product interactions and retries | 8/8 | [Report](final-work-mobile.json), [log](logs/final-work-mobile.log) |
| Pure frontend checks | 61/61 | [Log](logs/unit.log) |

The isolated snapshot freezes the exact application and tests while concurrent viewer work continues in the main checkout. The manifest records both snapshot and current-root hashes. Later root edits in the shared workspace concern that separate viewer work; a final root build/typecheck also passed.

| View | Desktop | Mobile |
| --- | --- | --- |
| Light date groups | [Capture](screenshots/desktop-dates-light.png) | [Capture](screenshots/mobile-dates-light.png) |
| Dark date groups | [Capture](screenshots/desktop-dates-dark.png) | [Capture](screenshots/mobile-dates-dark.png) |
| Pending approval and Computer | [Capture](screenshots/desktop-cards-pending.png) | [Capture](screenshots/mobile-cards-pending.png) |
| Settled history | [Capture](screenshots/desktop-cards-settled.png) | [Capture](screenshots/mobile-cards-settled.png) |
| Native boundary across midnight | [Capture](screenshots/desktop-native-midnight.png) | [Capture](screenshots/mobile-native-midnight.png) |
| File-only group reply | [Capture](screenshots/desktop-file-only-group.png) | [Capture](screenshots/mobile-file-only-group.png) |

Representative desktop/mobile captures were visually inspected for centered separators, author/avatar attribution, compact clocks, card geometry and overflow. The native recovery row was adjusted to a content-sized surface so its clock stays visually associated with its status.

## Reproduction

From the repository root:

```sh
bun test apps/web-client/verification
bun run lint:web-client
bun run typecheck:web-client
bun run build:web-client
bun run docs:check
```

From `apps/web-client` after building:

```sh
# Run each project independently to obtain a fresh temporary installation.
bunx playwright test --config playwright.conversation.config.ts conversation-chronology.spec.ts conversation.spec.ts rich-answer.spec.ts --project desktop --grep 'calendar groups|group approval and finished|verified native question|file-only assistant|opens at the latest|switching conversations|queued inputs enter|rich reply matches'
bunx playwright test --config playwright.conversation.config.ts conversation-chronology.spec.ts conversation.spec.ts rich-answer.spec.ts --project mobile --grep 'calendar groups|group approval and finished|verified native question|file-only assistant|opens at the latest|switching conversations|queued inputs enter|rich reply matches'
bunx playwright test --config playwright.work.config.ts work.spec.ts --project desktop --grep 'native acknowledgements|unsafe Markdown|group writers|unconfirmed option|native text-only|approval is inline|retry is available|group interaction history'
bunx playwright test --config playwright.work.config.ts work.spec.ts --project mobile --grep 'native acknowledgements|unsafe Markdown|group writers|unconfirmed option|native text-only|approval is inline|retry is available|group interaction history'
```

The initial focused browser iteration is retained in [its report](browser-initial-report.json): four cases passed and four failed while the test fixture sent a name to the strict legacy thread-create body. The fixture was corrected without changing the API; all eight then passed. Initial test import errors and a concurrently changing, unrelated viewer prototype type error were resolved before the final standard build; this slice did not modify that prototype.

## Earlier regression attempts

The broader mixed-checkout run is retained in [its report](mixed-checkout-regression-report.json): 68 passed and 8 failed. It is not used as a clean acceptance result. Four failures concerned a table-viewer selector while that separate feature and its tests were changing; the other failures were queue-status timing or mobile navigation timeouts. The subsequent [shared-state isolated run](isolated-shared-state-report.json) passed 19/22, including all ten chronology cases, but timed out in three mobile navigation cases after the desktop fixtures had accumulated in the same installation state. These observations do not establish a production latency result or a confirmed root cause for every timeout.

The final cohorts run desktop/mobile independently. Navigation helpers scroll deferred portraits into view before selection. Approval-history assertions now verify the question heading, absence of controls, and stable clock separately, because author/clock metadata is intentional. The initial assertion/navigation errors remain in [the error summary](initial-regression-errors.json) and initial logs.

## Cleanup and scoped local delivery

The user subsequently authorized cleanup and a local commit. The cleanup removes an unused native-fragment attribution argument and the task-owned verification worktrees. A second export of the scoped Git index was validated independently on base `6f20ae3`; concurrent content-viewer work remains preserved in the main checkout.

The commit candidate passed **61/61 unit tests** and **38/38 desktop/mobile browser cases**, with zero failures, skips or flakes. Frontend lint, typecheck, production build and documentation checks passed. Exact staged source hashes, commands, port overrides, reports, logs and cleanup records are retained in the [local delivery manifest](delivery/manifest.json). The earlier mixed snapshot and screenshots above remain historical evidence with their original hashes. Raw log whitespace exceptions are limited to the exact hash-verified paths in the delivery manifest.

## Boundaries

No provider login/billing, fresh native inference, live Computer transport, installed Tauri journey, accessibility assistive-technology session, installation or production acceptance was rerun. Existing frontend runtime receipts and timestamp fields remain the authority. Unrelated local changes remain preserved. The requested delivery is a local commit; no push or deployment is included.
