# Conversation, collaboration, goals and recovery

Implemented against repository HEAD `e349f95` (the refreshed successor to planning baseline `41da6eb`), after reading live NMA-043, NMA-041, NMA-042 and the web redesign coverage specification. NMA-041/042 were Done. `docs/agent.pen` was read/exported through Pencil and was not modified.

## Implementation

- Adapted MIT Beautiful UI `ChatComposer`, `PromptBar`, `LoadingState` and `TaskRows` from commit `44a274e598395ab61e7c96c26fda2758780253b7`. Source attribution, adaptation notes and full license are in `apps/web/src/components/beautiful-ui/`. Demo timers/replies/retries were removed; runtime state drives the components. Shared shadcn controls and active agent.pen semantic tokens remain authoritative.
- Multi-author transcript uses author avatars, dark user bubbles and subtle agent surfaces. Streamdown retains streaming markdown, code actions, tables and overflow behavior. Composer uses compact accessible attachment/recording actions, mentions, persisted drafts, the existing message identity and steering semantics.
- Goals, evidence, reviews, subgoals and timezone-aware schedules are accessible from a focus-managed Sheet. Session inspect, compression/reset, memory, workspace, artifacts and computer controls remain available from Opsi. Continuation/resume happens through normal conversation; no new execution lifecycle or automatic retry is introduced.
- Sidebar previews/unread indicators use existing owner-scoped conversation summaries. Read acknowledgement advances only at the visible conversation end; the server's monotonic watermark survives reload/two-tab use. Long-history loading preserves scroll position. Snapshot rendering explicitly rejects a different thread ID, in addition to the existing keyed route isolation.
- Enter dispatch now applies the same readiness/connection/availability guard as submit. Inactive group members cannot be mentioned through the member buttons. Unknown group results receive the same no-blind-retry explanation as DMs. Pending context commands have explicit result-check labels and reuse the original command identity.

## Evidence and scope

`coverage.json` maps the existing action surface to components, design screens and evidence. `manifest.json` contains SHA-256 values for retained files. No credentials, Clerk storage state, provider keys or private environment files are retained here.

- `browser-results.json`: real Clerk-authenticated API/provider send, two tabs, reconnect/refresh, read watermark, keyboard/focus and 8 viewport/theme combinations (1440/390/320/768, light/dark), with zero axe WCAG A/AA violations or horizontal overflow.
- `lifecycle-results.json`: real automatic goal capture/clarification, pause, resume/change through chat; cancel, long content/jump-to-latest and unauthenticated denial.
- `group-results.json`: real two-agent group creation, mentions and multi-author responses, empty state and desktop/mobile light/dark screenshots. The private DM test marker is absent from the group transcript; stronger private-context isolation is independently covered by gateway regression.
- `schedule-results.json`: real one-shot schedule in Asia/Makassar and pause via chat. The initial combined compression/reset check timed out, and is retained as a failed attempt.
- `session-recovery-results.json`: the same compression command was recovered and reset preserved transcript/goal identities. Compression had finished natively (38 → 12 native messages, without fallback), but the HTTP boundary timed out at 30 seconds. The exact persisted command was restored into the isolated browser's sessionStorage for this recovery check; the request identity was asserted equal. No new compression intent was fabricated. Product messages were unchanged. The initial screenshot is `failure-1.png`.
- `closure-results.json`: real steering and final goals panel accessibility/screenshots.
- `presentation-results.json`: **presentation fixtures, not live provider acceptance**. Snapshot/SSE interception exercises indeterminate results, expandable collaboration/subagents, tool progress/reduced motion, archived read-only state and permission errors. These images are named `fixture-*`. No fixture is counted as evidence of runtime execution or effect reconciliation.
- `runtime-regression-configured.log`: 49 passed using the pinned Hermes test runtime. Covers long history/pagination, replay/restart, cancellation, unknown effects, authenticated streaming boundaries, sessions and goal lifecycle.
- `collaboration-regression.log`: 23 passed for scoped context/privacy, discussions, peer collaboration/handoff and wakes. Both suites run serially in the shared host-lock namespace. The deterministic provider fixtures are not production/provider-live proof.
- `runtime-regression.log`: initial environment failure (`pytest` missing in the project-only venv), retained. It was replaced by the configured pinned-runtime run, not counted as a passing test.
- `build-final.log`, `typecheck-final.log`, `lint-final.log`, `web-tests-final.log`: final frontend checks; seven replay projection tests pass.

## Design adaptations and capability boundaries

The active canvas references are LqqSi/GvP4L/x1pigr/ATYiC/ZWVyR/QmxYi/YEtOy/Arwjx/BeivF and their nine dark pairs, exported under `design-reference/`. Existing shell dimensions, Geist, inset surface, avatar identity and neutral palette are retained. Goals/schedules use a shared responsive Sheet instead of a fixed-size canvas modal; controls remain usable at 320px. Long code may scroll inside a bubble. API/runtime-authored or user text is preserved rather than replaced with canvas copy.

Goal pause/resume/change remains conversational, as required by the accepted product direction. The canvas's separate date-picker, direct goal action buttons and rich calendar event agenda are not fabricated: the existing runtime exposes conversational clarification and schedule configuration/next-at, not a calendar agenda payload. Heartbeat kind/interval is rendered from the same existing wake payload. Webhook status is not exposed in the existing goal/snapshot API; it must not be inferred from a schedule. The missing webhook-status projection remains capability scope under NMA-038, not silently claimed complete here.

Account-scoped MCP elicitation stays on the existing `/connections` form and has a discoverable link from conversation options. The interaction API does not expose a conversation binding, so account-wide forms are not injected into a DM/group transcript. NMA-045 owns its settings presentation; NMA-038 owns missing capability contracts. Session resume uses the existing message path; there is no `session.resume` public command. These are explicit coverage mappings, not new engines or fake controls.

Local scoped redesign acceptance does not mean deployment, full manual screen-reader certification, external webhook delivery, or NMA-038/039/027 release completion. Unknown external effects were not deliberately induced against a real provider; gateway fault tests establish the lifecycle invariant and presentation fixtures establish the UI behavior separately. Earlier failed attempts remain visible in this evidence set.
