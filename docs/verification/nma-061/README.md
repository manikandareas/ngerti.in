# NMA-061 — conversation web client

Verified on 2026-11-01 against repository baseline `bc0510bb9f099fd642eb520f75bb88a706c22a82` plus the working-tree changes described here. The live Notion gate NMA-060 was Done before implementation, including NMA-065 and API contract 1.16.0. No commit, push, deployment, installation or NMA-063 acceptance is claimed.

## Delivered

`apps/web-client` now opens a responsive conversation workspace. The left sidebar combines agents/groups and conversations; Tobi/bootstrap uses the real API. Create agent uses Tobi's explicitly configured connection/model/billing defaults, persists a creation operation before dispatch, opens the returned DM and displays the backend's single opener. Lost creation/message acknowledgements reuse the original key and body after reload. Existing chat reads never request inference.

The Agent panel contains live profile/revision/instructions, scoped memory correction/deletion, and separate application/harness/native skill inventories. App skills can be created/repaired conversationally through existing scoped tools; native packages remain read-only. Advanced connection/model/reasoning and capability details are progressively disclosed. Account login/model discovery/inference/billing are shown separately. Missing configuration preserves the chat for repair.

Snapshot/event streaming refreshes authoritative projections, with complete SSE frame parsing, cursor deduplication, abort on thread changes, monotonic snapshot publication, reconnect and history pagination. Messages render safe Markdown without executing HTML or loading remote images. Queue edit/delete, supported steer, conversational stop, explicit stop intent/native confirmation, opening continuation and unknown-result reconciliation use backend commands. Product-tool feedback comes from the run's completed tool observations; generic tool-response receipt is not labelled external-effect success.

Create group is a visible, disabled handoff to NMA-062; File/Goals/Routine tabs and group detail are reserved for that ticket. No simulated group/file/goal state or extra runtime was added.

## Verification

| Check | Result | Evidence |
| --- | --- | --- |
| Backend suite after Codex default-reasoning repair | 247 pass, 0 fail, 1599 assertions | `bun run --filter @ngertiin/server test` / tool run |
| Focused Codex protocol suite | 13 pass, 0 fail | `apps/server/tests/codex.test.ts` |
| Backend lint/typecheck | pass | `bun run lint`, `bun run typecheck` in `apps/server` |
| API consumer HTTP/SSE/replay/restart | 6 pass, 0 fail, no native dispatch | `consumer.json`, `consumer-fixtures.json` |
| Web-client typecheck/lint/build | pass | package scripts; `verification.json` |
| Existing design-system/theme/hover browser suite | 40 pass, 0 fail across desktop/mobile | `bunx playwright test` in web-client |
| Conversation production-preview browser suite | 10 pass, 0 fail/skip | actual API + isolated SQLite, zero native executors |
| Final native creation + scoped profile tool | 4 succeeded / 4 native runs, no errors | `native.json`, native screenshots |
| Native queue/control | 2 cancelled with confirmation / 2 native runs | `native-controls.json`, control screenshots |
| Backend restart + mobile existing-chat/reload reads | 2 pass, zero new runs | `restart.json`, native mobile screenshots |
| Credential cleanup | Both proof connections revoked; copied credentials removed | `cleanup.json` |

The conversation cohort covers create/open, queued edit/delete, memory correction/deletion, panel close, narrow viewport, reload without inference, creation and message acknowledgement loss, duplicate prevention, cancelled-opening continuation and cross-origin bridge rejection. It uses the actual API/domain/SQLite, not mocked frontend state. Native execution is separately verified through the running product server and Playwright browser.

Final native scope: Codex 0.166.0 / ChatGPT subscription, `gpt-6.1-sol`; Muse 1.4.14-R7309.1 / SDK 1.4.14 / explicitly selected API key, `muse-spark-1.3`. Both creation openers complete and both agents use `ngertiin.update_agent`, update the visible name and answer 137 × 23. Codex queue edit → steer → scoped `cancel_run` confirms cancellation. Muse queue edit/delete → Stop run confirms native cancellation. Two extra queued inputs are respectively steered and removed without independent inference; they are not counted as native executions.

The initial native cohort (`native-initial.json`) also completed four runs. Its first Codex opening initially stayed queued with `NATIVE_REJECTED`/`not_dispatched`; selecting explicit reasoning allowed the same opening to complete. Investigation found that the adapter supplied `model_reasoning_effort: null` in native config. The repair omits that config override for default reasoning; explicit reasoning is unchanged. A rejecting protocol fixture and regression test cover it. After server restart, the final native cohort verifies default reasoning without that workaround. API schema/response fields remain 1.16.0; consumer coverage was rerun after this internal mapping repair.

## Iterations and limits

Initial mobile tests found an overlapping sheet close button and duplicate hidden/visible popover roots; both were fixed. A later test incorrectly targeted a textarea/last action before the new queued message appeared; selectors now target the actual message container. Initial failing reports are retained as `browser-initial.json`, `browser-second.json`, `browser-third.json`, and `browser-production-initial.json`. Final tests run the built production preview. Development mode emits the existing next-themes script-render warning; the production design-system and conversation suites do not report runtime exceptions.

Muse subscription remains unverified under the already accepted gate billing scope. Full OAuth login from a signed-out account, group creation/HITL, File/Goals/Routine, VNC, Composio and broader product acceptance belong to their scoped tickets. No new general permission gate, silent billing fallback or retry of unknown native work is introduced. Unknown UI reconciliation uses the backend's existing reconciliation decision and does not force a rerun.

The loopback Vite dev/preview bridge reads only the selected installation token server-side, injects it into API requests and rejects foreign Host/Origin/cross-site requests. It is development transport, not a production authentication or installer solution. Original credentials and historical evidence are retained. Only proof-owned credentials are removed; SQLite proof state remains under `.dev/nma061-native`.

## Source and design provenance

- Existing `apps/web-client/DESIGN_SYSTEM.md` / Page 1 tokens, Inter/Geist Mono, local shadcn radix-nova primitives, sheets, dialogs, popovers, messages, bubbles and controls are reused without replacing the theme.
- AI Elements Conversation was installed from `https://registry.ai-sdk.dev/conversation.json` using the project shadcn CLI. Local adaptations: Hugeicons instead of Lucide, existing themed Button, labelled scroll control, formatting. Added `use-stick-to-bottom` 1.1.6. Upgrade by reviewing the registry diff; do not overwrite themed primitives.
- Beautiful UI `https://www.beautifului.dev/`, viewed 2026-11-01: Tool Chips/Chat/Prompt Bar informed the compact expandable activity and composer composition. `tool-chips.tsx` is a local adaptation using shadcn Badge/Spinner and real run observations, not an imported Beautiful UI runtime or simulated example.
- Markdown renderer: react-markdown 10.1.0 / remark-gfm 4.0.1; HTML skipped, links sanitized by the renderer, remote images rendered as text.
- Openbot revision `01e4b18e238e5de72a3570162c9f4275bb585786`, exact `docs/architecture/agents.md` and `docs/architecture/providers.md`: persisted retry identities, provider separation, scoped configuration, and source-separated tool/native behavior informed reuse of the already accepted Ngertiin API. No Openbot runtime code or cloud behavior was ported here. SHA-256: agents `03a67824295146a300d2a36fbec73cae6613345dea5df7a3f0230d2fdb14bf46`; providers `e288de377da590b93b1186b8f71f26bd636de4152fedabfce8f02ab913199e58`. Upgrade against the pinned API/provenance, preserving the application's lifecycle authority.
- Bun 1.3.10, TypeScript 7.0.2, Vite 8.3.5, React 19.3.1, Playwright 1.64.1. Root `bun.lock` records the exact dependency resolution.

## Reproduce

```sh
bun run --filter @ngertiin/web-client test:conversation
# Existing visual-system regression:
cd apps/web-client
bun run test:e2e
```

Native scripts are in `scripts/verification/nma061/`. Provisioning expects the explicit retained Codex proof credential source and an available `MUSE_API_KEY`; it copies credentials only into the isolated proof state, never into evidence. Start the server with `NGERTIIN_STATE_DIR=.dev/nma061-native`, port 8312, and the tested Muse executable on PATH. Start web-client port 4312 with the same state directory and `NGERTIIN_API_URL=http://127.0.0.1:8312`. Run `provision.ts`, `native-browser.ts`, `native-controls.ts`, restart the server, then `restart.ts` and `cleanup.ts`. Provisioning should use a fresh proof directory; do not overwrite retained evidence or reuse an old creation key for new input.
