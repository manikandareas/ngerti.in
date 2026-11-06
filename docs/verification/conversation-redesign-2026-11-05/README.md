# Conversation redesign — 5 November 2026

The approved conversation draft is applied to existing frontend features. No application lifecycle/API contract, provider capability, machine lease, or grant was expanded. NMA-060 was verified as **Done** in Notion before implementation; the active product/scope and frontend guidance were read. The standalone draft remains separate from production. Assistant Studio now reuses the updated components and composer binding.

## Implemented

| Surface | Current behavior | Main source |
| --- | --- | --- |
| Composer in DM/group | Empty during an active run shows Stop; typing restores the Send arrow. Typing alone neither submits nor cancels. Several active agents require an explicit Stop target. Existing queue admission remains authoritative. | `workspace-layout.tsx`, `composer-stop-picker.tsx` |
| Message actions | Assistant and user bubbles expose Copy on hover/focus and tap on touch. Pointer travel to the actions has a continuous hit area and delayed close. Supported preparation/routing retries use a neutral hover icon. Their failure state changes into the existing activity state on retry. | `message-actions.tsx`, `agent-activity-bubble.tsx`, `work-activity.tsx` |
| Questions/approval | One compact inline card component, no close action or overlay. Native options require explicit Continue/Submit, preserve single/multiple selection bounds, and retain values when moving back. Approval uses explicit decisions with an empty left footer. Product approval uses Tolak/Setujui; native labels/IDs/scopes remain harness-provided. | `interaction-card.tsx`, `native-interactions.tsx`, `human-reply-card.tsx` |
| Plain text questions | Product/group and native text-only requests bind to the ordinary conversation composer. Native replies retain the API's 500-character limit and freeText representation. | `composer-requests.tsx`, `human-reply.tsx` |
| Submission result | Confirmed replies do not add saved-answer/checkmark receipts or empty history labels. The server journal remains persisted. Unknown/submitting/not-dispatched outcomes keep their status/recovery controls. An uncertain text reply is locked against resubmission; confirmed cancellation releases the ordinary composer. | `native-settled-card.tsx`, `native-transcript.ts` |
| Files | Neutral rounded chips with a file-type SVG; file actions share the same chip in conversation and Studio. Preview, removal, upload recovery and open behavior use the existing flows. | `file-type-icon.tsx`, `file-action-chip.tsx`, `attachment-chip.tsx`, `inline-references.tsx` |
| Research | Exact known source links render as domain chips. The associated assistant answer owns a stacked source count and expandable source list. Duplicate URLs and non-HTTP(S) sources are excluded. Unmatched Markdown links retain their normal behavior. | `research-sources.tsx`, `answer.tsx` |

Source paths are relative to `apps/web-client/src/features/conversation/components/` unless otherwise specified. Composer registration and transcript placement are in the adjacent `lib/`; workspace composition is in `apps/web-client/src/app/`.

## Remaining features

| Feature | Existing boundary and remaining work |
| --- | --- |
| General response retry/regeneration | There is no general regenerate endpoint for a dispatched/completed response. Existing retry APIs cover preparation, rejected group routing and opening recovery. Replacing the selected response bubble with agent activity for a genuine rerun needs authoritative regeneration/lineage behavior; no resend simulation was added. |
| Editing processed user messages | Queue editing exists. Editing already-processed messages and determining which responses must be regenerated still need lifecycle/API support. |
| Structured product/group questions | HumanRequest/group_ask_user currently carry text, purpose and continuation identity, without a structured options/selection schema. Native option questions are supported where the connected harness advertises that capability. Product/group option cards need a contract/tool extension. |
| Inline Computer activity card | The real shared-machine panel, viewer and control lease already exist. A per-message preparation → screen card, durable activity association and opening its corresponding machine view have not been implemented. The draft's simulated screen was not placed in real conversations. |
| Automatic claim-level citations | Known Markdown source links and run.sources are restyled. There is no citation-range/claim attribution metadata for automatically attaching sources to arbitrary prose; no claim attribution was invented. |

Native interaction availability still follows each connection's capabilities. A frontend redesign does not add native permission support to a harness that reports it unsupported.

## Verification

- `bun run build:web-client`: passed (TypeScript + production Vite build). Existing bundle-size advice remains informational.
- `bun run lint:web-client`: passed.
- Activity presentation, conversation parts and preparation unit suites: **10 passed, 0 failed**.
- Final targeted browser verification: **26 passed, 0 failed, 0 skipped** across desktop 1440×1000 and mobile 390×844. Work/native recovery: 14; composer/actions/sources/Studio/rich content: 12. See [verification.json](verification.json).
- Studio follow-up after the shared file-action chip and copy cleanup: **2 passed, 0 failed** (the same desktop/mobile Studio cases, including opening FileViewer).
- A broader earlier run exercised 70 work/file/group cases and 38 conversation cases. Old assertions for visible successful receipts and direct-child bubble markup were updated for the approved redesign, then the affected cases passed the final targeted reruns. Attachment uploads, replay identity, preview, removal and filename layout passed in that broader run.
- HTTP/domain/SQLite behavior is real in the work integration tests; the external harness uses `scripts/verification/nma062/fixture-harness.ts`. Research and activity progress projections are controlled frontend fixtures. These results prove UI/API integration, not a new live provider or machine capability.
- Native computer-use inspection was attempted but the environment could not obtain the browser window (`cgWindowNotFound`; browser connector also returned a timeoutMs error). Screenshots here are captured from the actual application through Playwright, not from the HTML draft.

Final browser commands (run inside `apps/web-client`):

```sh
bunx playwright test --config playwright.work.config.ts --grep 'native acknowledgements|ambiguous native|unsafe Markdown|unconfirmed human|native text-only|group writers|uncertain text answer'
bunx playwright test --config playwright.conversation.config.ts --grep 'rich reply|active composer switches|empty group composer|message actions stay|web studio previews'
```

## Screenshots

| Scenario | Desktop | Mobile |
| --- | --- | --- |
| Question before selection | [Open](screenshots/desktop-native-question.png) | [Open](screenshots/mobile-native-question.png) |
| Selected, awaiting explicit Submit | [Open](screenshots/desktop-native-question-selected.png) | [Open](screenshots/mobile-native-question-selected.png) |
| Question submitted, approval still pending | [Open](screenshots/desktop-native-approval.png) | [Open](screenshots/mobile-native-approval.png) |
| Approval submitted, conversation continued without a saved receipt | [Open](screenshots/desktop-native-settled.png) | [Open](screenshots/mobile-native-settled.png) |
| Active run, composer empty → Stop | [Open](screenshots/desktop-active-composer-empty.png) | [Open](screenshots/mobile-active-composer-empty.png) |
| Active run, composer dirty → Send | [Open](screenshots/desktop-active-composer-dirty.png) | [Open](screenshots/mobile-active-composer-dirty.png) |
| Hover/touch actions and sources | [Open](screenshots/desktop-hover-actions-and-sources.png) | [Open](screenshots/mobile-hover-actions-and-sources.png) |
| Native text answer through composer | [Open](screenshots/desktop-native-text-composer.png) | [Open](screenshots/mobile-native-text-composer.png) |
| File action chips | [Open](screenshots/desktop-studio-file-actions.png) | [Open](screenshots/mobile-studio-file-actions.png) |
| Product approval preview | [Open](screenshots/desktop-studio-product-approval.png) | [Open](screenshots/mobile-studio-product-approval.png) |

[Attachment chip alignment](screenshots/desktop-inline-attachment-alignment.png) is from the broader integration suite. Product approval previews run locally in Studio without dispatch. Native question/approval screenshots are successive states of the same thread/run in the integration case.

Open [Assistant Studio](http://127.0.0.1:3001/assistant-studio) for local previews without a backend. The actual conversation uses the existing configured backend and harness.
