# Conversation queue and hidden tool calls

Verified on 2026-11-02 against `fd0778a8d9c5607e0e46bff1d716c5e2b313d705` plus these uncommitted changes. NMA-060 and NMA-061 were fetched live as Done before this repair. This note records the requested follow-up to NMA-061 without replacing its historical acceptance evidence.

## Behavior and cause

The UI previously moved every `queued` run into the composer tray. Durable admission also uses that state while the first input is preparing, so an idle DM briefly looked like a waiting queue. It also used message insertion order: queued user inputs persist before a late assistant answer exists, producing consecutive user messages when the queue advances.

`message-timeline.ts` now separates the next pending input from inputs blocked by an active, earlier queued, or unresolved run in the same conversation/agent lane. The next input appears directly in the transcript with a connecting status; subsequent inputs retain their queue controls. Unknown runs and unresolved steering delivery remain blocking. Replies are associated by run/input IDs and appear before the following ordinary turn, including after reload/history reads. Steered inputs retain their observed position.

The conversation no longer mounts `ToolChips`. Native/product tool receipts remain in backend state. Native questions, explicit permission requests, run diagnostics, stop controls and results remain available. The application lifecycle, dispatcher, API schema and dependency versions are unchanged.

## Verification

| Check | Result |
| --- | --- |
| Conversation production-preview suite, desktop/mobile | 28 passed, 0 failed, 0 skipped |
| Related tool/native-interaction production-preview cohort, desktop/mobile | 6 passed, 0 failed, 0 skipped |
| Real lifecycle/SQLite with controlled executor | Passed: first admission, FIFO execution, two queued follow-ups, late answers, promotion, three complete turns and restart |
| Web-client lint, typecheck and build | Passed |
| Whitespace check | Passed |

The new browser regressions first reproduced the idle-message tray and completed-run promotion failures before the fix. They cover three turns whose assistant answers are stored after the queued user inputs, streaming without early queue release, unknown-result fencing and reload. Admission uses real HTTP/SQLite; native progress/output in this conversation test is explicitly a fixture. Existing edit/delete, exact lost-acknowledgement recovery, steering and opening-retry checks also pass. Opening retry now expects a directly displayed next input instead of a waiting tray.

The work cohort uses the actual API, broker and SQLite with the existing deterministic external harness fixture. It checks hidden tool calls with four persisted native receipts, native acknowledgements across lost replies/reload/revocation, and simultaneous group input requests. An initial cohort had one mobile group-request timeout; that case passed two isolated repetitions and the final complete six-case cohort. No unrelated connection-refresh change was made.

```sh
cd apps/web-client
bun run build
bun run lint
bun run typecheck
bunx playwright test --config playwright.conversation.config.ts
bunx playwright test --config playwright.work.config.ts --grep 'tool calls stay|native acknowledgements survive|all concurrent group lanes'
```

Browser reports are generated in `apps/web-client/test-results/conversation-report.json` and `apps/web-client/test-results/work-report.json`. The tests also capture `conversation-turn-order.png` and `tool-calls-hidden.png` in their configured output directories. These generated artifacts can be regenerated with the commands above.

This verifies local projection and controlled harness behavior. No fresh Codex/Muse provider inference, production deployment, installation or release acceptance was performed. No user data was reset and no commit or push was made.
