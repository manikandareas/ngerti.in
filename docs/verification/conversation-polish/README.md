# Conversation polish and cleanup

Scope: normal handoff milestones stay in the authoritative journal but no longer render as permanent timeline bars. Queued handoff recipients retain their own activity anchor while the parent yields. Routing uses the group avatar and shared status treatment. DM/group status bubbles share text and surface shimmer, with static error/terminal states and reduced-motion support. Five thinking labels are distributed by random run identity and remain stable through renders and reloads.

Streaming text interpolates newly appended output over a short 100 ms window, with a shared 32 ms paint interval across incoming updates. Final/replaced text flushes immediately; historical content is not replayed. UTF-16 surrogate pairs are not split. Background visibility and reduced-motion changes flush pending text and cancel animation frames. This improves presentation; it does not reduce provider inference latency.

Cleanup found a paint-interval reset on each incoming chunk and retained that timestamp across updates. The older group collaboration test still required visible handoff bars; its UI assertions now require their absence while preserving journal chronology, public results, artifact references and goal evidence checks. Layout checks use the remaining Goal milestone.

The adjacent `agent-activity-bubbles` directory is an earlier immutable verification snapshot; its hashes were checked without altering that evidence. This report covers the subsequent handoff, streaming, routing and shimmer refinements. Tests use isolated local APIs and deterministic fixtures, not fresh provider inference or production traffic.

## Cleanup verification · 2026-11-04

- Server lint/typecheck passed; 361 tests passed with 2,278 assertions.
- Web lint/typecheck passed; 27 unit checks passed with 8,721 assertions.
- Full desktop/mobile conversation suite: 66 passed.
- Routing v3 regression: 10 passed.
- Group attachments: 10 passed. Group responsibilities initially failed two obsolete handoff-bar assertions; after updating those expectations, both desktop/mobile cases passed.
- The full suites above preceded the final streaming paint-timestamp refinement. The final production build and focused desktop/mobile streaming checks verify that last change separately.
- Existing large-chunk build warnings remain; no provider latency or production reliability guarantee is implied.

Commands: `bun run --filter @ngertiin/server lint`, `bun run --filter @ngertiin/server typecheck`, `bun run test:server`; from `apps/web-client`, `bun run lint`, `bun run typecheck`, `bun test verification`, `bun run build`, and Playwright with `playwright.conversation.config.ts`, `playwright.jev-v3.config.ts`, and `playwright.work.config.ts` (group attachment/responsibility specs). Final streaming check: `bunx playwright test --config playwright.conversation.config.ts activity.spec.ts --grep 'streamed bursts'`.

Final build passed; focused streaming: 2 passed, 0 failed.
