# Conversation latency and Jev routing

User-authorized amendment to NMA-056, with API and UI regression coverage, 3 November 2026. The local application is running contract **1.25.0**, with **Jev** enabled from the existing root environment. No data reset, commit or push was performed.

## Implemented behavior

- **Fast group selection:** explicit targets and valid mentions bypass classification. Other group messages use one typed TypeSafe decision over bounded shared context. No native routing session is created for a successful Jev selection. The application rechecks membership, revisions, input capability, resource access and Goal/Routine validity before admitting work.
- **Bounded uncertainty:** Jev gets a 1.5-second deadline, no SDK retries, and at most four concurrent pure decisions. An unresolved or low-confidence result records one configured member-model fallback. Service failures reject the original route for same-message retry. Persisted attempt fencing prevents a late or restarted classifier from admitting duplicate work.
- **DM readiness:** a visible idle DM can prepare its native session without inference, prompt submission or a tool lease. Warm sessions are reused. Idle sessions expire after three minutes; speculative warming is limited to one operation and three retained sessions. Busy and unknown work is never evicted. Availability/model/skill discovery has bounded caches; native account, grant and billing checks remain authoritative.
- **Immediate dispatch and events:** committed transactions wake the dispatcher and SSE stream. The periodic scheduler remains a safety net. FIFO heads, shared-workspace writer serialization, cancellation receipts and unknown-native reconciliation remain intact. A rejected claim becomes explicit blocked preparation instead of a microtask retry loop.
- **Recoverable preparation:** persisted run timestamps distinguish preparation, dispatch, acceptance, output and settlement. Temporary preparation errors retry with bounded backoff. Explicit repair retries the same queued input; changed agent/connection/thread configuration automatically rechecks undispatched blocked input. Already dispatched unknown work is never resubmitted by this mechanism.
- **Shorter handoffs:** ordinary tasks can use `continuation=complete`. A useful successful peer result can settle the parent administratively without another coordinator inference. Failure, empty results and Goal-linked work retain the required coordinator continuation/evidence flow. Targeted tool-schema discovery avoids repeatedly loading the entire schema catalog.
- **Conversation updates:** one owner event stream survives thread changes. Bootstrap reads run concurrently; event bursts coalesce affected projection reads for up to 40 ms. Version/cursor and scope guards prevent stale responses from replacing newer state. Contextual resources without a top-level thread ID, including browser sessions and app connections, still invalidate their dependent views.
- **Large workspaces:** offscreen navigation/group-picker avatars do not rasterize. Visible textures use the required pixel size, a serial decode queue and bounded caches; seeded fur is reused across expressions. Existing avatar recipes, motion, exports and native identity stay intact.

## Evidence and measurements

`checks.json` and the final JSON/log files record the final denominators. These are local observations, not production latency guarantees.

| Check | Observed result |
| --- | --- |
| Backend | 334 tests passed across 34 files |
| Conversation UI | 48/48 desktop/mobile checks passed; 100-member roster painted in 794/1,484 ms with 14/10 mounted navigation avatars |
| Workspace UI | 62/62 desktop/mobile checks passed, including real managed browser/VNC, apps, human replies and membership recovery |
| Avatar UI | 18/18 desktop/mobile checks passed |
| Web unit | 18 tests passed, including all 1,280 avatar combinations |
| API contract | 94 declared operations; prepare and exact-input retry verified |
| Jev live classification | 30/30 expected selections; p50 254 ms, p95 353 ms; zero fallbacks in this synthetic cohort |
| Final native cohort | 8/8 runs succeeded; Codex subscription and explicitly selected Muse API key |
| Native group flow | Jev selected Writer, then Codex handed work to Muse; zero native routing runs and zero coordinator continuation runs for the ordinary complete handoff |
| Local activation | Health ready, routing Jev; all 160 pre-activation message/artifact/Goal/Routine records remained byte-identical |

The final native cohort used synthetic tasks and concurrent local verification load. Codex cold preparation took 11,839 ms; warm preparation took 2 ms. Preparing another DM before submission took 2,492 ms and added **zero inference runs**; its later preparation phase took 3 ms. Muse cold/warm preparation took 3,703/5 ms. Total Codex cold/warm/prepared responses took 17,229/5,352/4,319 ms; Muse responses took 14,069/16,046 ms. Provider generation still dominates many turns, so warm preparation does not guarantee a faster model response. An actual group classification with a different context took 640 ms. See `native.json` for timestamps, exact source hashes and cleanup.

`native-initial.json`, `native-group.json`, and `native-before-*.json` retain earlier cohorts and their captured boundaries. The initial native cohort completed five DMs before a verification setup error in the group request was repaired. The final cohort includes all eight successful runs on the final backend source. Source databases were opened read-only and isolated credentials were removed after all native work settled; no unknown work was replayed.

Initial browser checks exposed obsolete inferred-timeline fixtures, heavy avatar initialization, missing contextual-resource invalidation, and a protocol fixture that forgot its prior human question when an idle native transport was reopened. Fixes preserve published timeline order and native session identity. The fixture now remembers that question by resumed native identity. Failed/interrupted logs and reports are retained alongside final results. A concurrent backend run and an uncached avatar stress run also hit existing test deadlines under contention; the final isolated backend and cached web unit runs passed without relaxing timeouts.

## Configuration and compatibility

`apps/server/src/config.ts` reads `TYPESAFE_API_KEY` from the process or root `.env`. With a key, Jev is the default. `NGERTIIN_GROUP_ROUTER=member` in the server process environment explicitly selects the member-model router; `NGERTIIN_GROUP_ROUTER=jev` requires a key. The key is used only by the server classifier and is not copied into native harness credentials or routing state.

The exact dependency is **@typesafe-ai/sdk 0.6.0**, with **jev-1.14.0**, on **Bun 1.3.10**. SDK 0.7.0 was evaluated and rejected here: its response-reader inspection marks the Bun response body as consumed before JSON parsing (`Body already used`). Version 0.6.0 completed the actual typed calls without dependency patches. Upgrading requires rerunning the SDK success/429/deadline fixtures and a real typed-response check; do not silently widen the version range.

Native versions observed: Codex **0.166.0** through App Server, Muse **1.4.14-R7309.1** through SDK **1.4.14**. Muse subscription acceptance is not claimed. Authentication and billing sources were kept separate.

## Reproduction

From the repository root:

```sh
bun --env-file=.env scripts/verification/conversation-latency/api.ts
bun --env-file=.env scripts/verification/conversation-latency/jev.ts
bun --env-file=.env scripts/verification/conversation-latency/native.ts
```

The native script requires the existing local authenticated Codex subscription source and, for the cross-harness cohort, an explicitly supplied Muse API key. It creates isolated synthetic work and temporary credential contexts; it does not send test messages into the user's workspace.

From `apps/server`: `bun run lint`, `bun run typecheck`, `bun test`. From `apps/web-client`: `bun run lint`, `bun run build`, `bun test verification`, and Playwright with `playwright.conversation.config.ts`, `playwright.work.config.ts`, and `playwright.avatar.config.ts`. The work suite uses the real scoped API/SQLite and an external native protocol fixture; the browser viewer uses the managed Docker browser/VNC. Build retains the existing large-chunk warning.

## Provenance and preservation

Integration Git revision at final verification: `418b54f6c7829e0edcd4c311ed81d9f5c810b4e5`. This amendment is locally authored on the existing harness-first lifecycle, broker, group service and conversation projection; it imports no new Openbot application module. TypeSafe uses the official published SDK pinned in `bun.lock`. Existing upstream adoption records retain their original revisions and scope.

The working tree already contained independent Goal-capture changes. Their files were preserved; only narrow tool-discovery/schema sections overlap this amendment. The original dirty patch and private consistent SQLite backup remain under ignored development directories. The backup SHA-256 is `55e5777238930108053e3d318425b2bf373bf8bb4dbe15caa5a7bead2151e3ff`. Evidence exports contain synthetic work and metadata, not credentials or the user's raw backup records. `SHA256SUMS` covers this amendment's source and evidence; historical manifests were not rewritten.
