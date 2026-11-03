# Agent activity bubbles

Verified locally on 2026-11-04. This amendment implements the user's approved activity presentation in private DMs and group conversations. The local API is activated at contract 1.28.0. No commit, push, installer or production release is included.

## Behavior

- A transient agent bubble displays short English activity text and the existing avatar loading animation. DM bubbles omit the visible agent name; group bubbles show it.
- The avatar occupies a fixed 32 by 32 pixel box positioned absolutely within a permanently reserved gutter. Switching loading off preserves the avatar bounds, bubble left edge and row height in the measured single-line case.
- Text has a subtle shimmer while the agent is processing. Reduced motion removes the shimmer and uses the avatar engine's existing reduced-motion behavior.
- One bubble follows each public run's latest visible output, input or handoff anchor. State updates replace its text rather than creating chat messages. Completed work removes its indicator; old failed attempts are suppressed when the same input has a newer run.
- Group continuations explicitly bound to a user's reply remain visible at that reply, including deferred native output. Unrelated quiet and administrative continuations stay out of the conversation.
- Waiting for the user, confirmed cancellation, failure and unknown outcomes have static states. Stop intent remains animated until native/local confirmation. Unknown outcomes retain the existing reconciliation action.
- Browser offline events immediately stop loading, abort the observation stream and show a friendly reconnection state. Reconnection refreshes authoritative projections without admitting another message or native run.
- Message delivery/queue status remains attached to the user's pending input. Agent processing state is rendered on the agent side. Group recipient selection uses a neutral conversation bubble until an agent has been selected.

## Backend and contract

Contract [1.28.0](../../contracts/1.28.0.json) adds bounded `active_tools` observations to runs and agent activity summaries. Each observation contains a call identity, a closed semantic category and an optional validated group target. It contains no prompt, reasoning, raw command or tool arguments.

Codex maps native item start/completion for web search, command execution, file changes and MCP calls. Search is observable at start rather than only after completion. Muse uses the installed official SDK 1.4.14 `Item.tool`, revision and terminal status fields; later updates can refine an initially generic activity. Terminal updates clear activity even without a separate completion notification. Product tools publish activity around the existing authorized execution path. Call identities preserve overlapping work and terminal run settlement clears active tools.

Known structured tool identities select specific labels. Attachment searches map to file reading rather than web searching. Unrecognized tool work uses “Working on it…”. Status presentation never guesses stages from commands or user prose and never invokes a model.

The exported contract exactly matched the authenticated local `/v1/contracts` response after activation. The existing API readiness gate was verified Done in Notion before UI integration, and the backend checkpoint preceded UI integration.

## Source and implementation

- Existing avatar loading is reused from local commit `f5199c8`; no avatar identity recipe is changed. The existing Bun, TypeScript, Elysia, SQLite and HTTP/SSE architecture remains authoritative.
- Local base commit `5a45eab` contains the separate composer-driven preparation work. That work and concurrent streaming/timeline edits were preserved. This report describes the activity amendment, not ownership of those other changes.
- [Backend activity normalization](../../../apps/server/src/runs/activity.ts), [public projection](../../../apps/server/src/agents/activity.ts), Codex/Muse adapters and the existing product-tool broker carry semantic observations.
- [Shared presentation](../../../apps/web-client/src/features/conversation/lib/activity-presentation.ts), [conversation anchors](../../../apps/web-client/src/features/conversation/lib/conversation-activity.ts) and [activity bubble](../../../apps/web-client/src/features/conversation/components/agent-activity-bubble.tsx) implement the UI. `isLoading` is forwarded to the existing avatar's `loading` property.
- No new upstream module, dependency, native runtime or model loop is introduced. Upgrade checks should retain the pinned Muse item-field mapping and recheck the Codex item protocol with the adapter fixtures.

## Verification

| Check | Result | Evidence boundary |
| --- | --- | --- |
| Backend | 361 passed, 0 failed/skipped; 2,280 assertions | Domain, HTTP, SQLite/restart and native protocol fixtures |
| Web unit checks | 25 passed, 0 failed/skipped; 8,688 assertions | State precedence, chronology, continuation anchors, existing avatar and preparation behavior |
| Conversation regression | 62 passed, 0 failed | Desktop/mobile; completed before the final interactive-continuation and offline-message refinements |
| Final activity checks | 8 passed, 0 failed | Final build; both projects cover DM, group, offline/reconnect, reload, streaming, interactive continuation, static terminal states, reduced motion and dark tablet geometry |
| Routing regression | 10 passed, 0 failed | Private fallback recovery, exact retry, unknown outcome and friendly public progress |
| Group regression | 12 passed, 0 failed | Attachments, idempotent recovery, group collaboration and no raw tool bubbles |
| Static checks | Server/web typecheck and lint; web production build; whitespace check passed | Build retains the existing non-blocking large-chunk warning |
| Local activation | Ready at 1.28.0; exact contract match | Existing local backend and stored data, no fresh provider inference |

The browser runs use real isolated APIs and SQLite with deterministic native processes/progress overlays. They do not establish a fresh Codex or Muse provider inference, web-search result quality, subscription/billing acceptance, installation or production readiness. The 62-case conversation run includes six earlier activity cases; the final eight-case activity run adds two tablet cases and verifies the last refinements. Counts should not be summed as independent full-suite executions.

Initial development checks exposed outdated contract/label expectations, an unsupported fixture field, duplicate accessible routing text and a real browser-offline observation gap. These were corrected. Interrupted or earlier failing runs are not counted as successful verification.

Reproduction from the repository root:

```sh
bun run --filter @ngertiin/server typecheck
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server test
bun run --filter @ngertiin/web-client lint
bun run --filter @ngertiin/web-client build
```

From `apps/web-client`:

```sh
bun test verification
bunx playwright test --config playwright.conversation.config.ts
bunx playwright test --config playwright.jev-v3.config.ts
bunx playwright test --config playwright.work.config.ts group-attachments.spec.ts group-responsibilities.spec.ts
```

## Local activation and preservation

The previous local API was ready at 1.27.0. Before its graceful restart there were zero queued, dispatching, running, cancel-requested or unknown runs. An online SQLite backup passed `PRAGMA integrity_check` and was retained privately under `.dev/harness-first/backups/agent-activity-20261103T164439Z/`.

After activation, all 423 stored domain entities retained byte-identical JSON; the aggregate SHA-256 was `e99eda85a1fa96c6d6c28dbdbdd08e608b084bd0875bc7d18da8d795409cda0e`. The 79 succeeded and four cancelled runs were preserved, with zero new native runs. Installation credentials and original user files were retained. See `local-runtime.json` for the safe activation summary.

## Visual inspection

Final screenshots were inspected for readable text, attribution, overflow and stable avatar positioning at desktop 1440 by 1000, mobile 390 by 844 and dark tablet 820 by 1180. Geometry assertions compare loading and confirmed-stop states rather than relying on a screenshot alone.

- [DM desktop](screenshots/dm-desktop.png)
- [DM mobile, without a visible agent name](screenshots/dm-mobile.png)
- [Group handoff and separate working agents](screenshots/group-mobile.png)
- [Dark tablet](screenshots/tablet-dark.png)

Final logs, source fingerprints and screenshot integrity are recorded in `verification.json` and `SHA256SUMS`.
