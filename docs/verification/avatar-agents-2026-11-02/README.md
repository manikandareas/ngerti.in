# Agent avatar integration · 2026-11-02

Baseline: `a62cb93590832e9703349e3c0e99a5048b73955f`. Published API: `1.19.0`.
The current Notion NMA-060 gate was fetched as Done before implementation. This is a
local agent-avatar/UI increment, not a new provider/native acceptance or release claim.

## Delivered behavior

- Shared, dependency-free `@ngertiin/avatar` catalog/recipe package. New identities persist
  the complete versioned `avatar_config`; Tobi defaults to the lilac circle. Older records
  resolve deterministic defaults without a development reset. Legacy emoji text no longer
  bypasses the product avatar renderer.
- The DM profile's **Ubah avatar** opens an agent-targeted studio. Saves use the existing
  configuration command, expected revision and receipt. Malformed recipes and stale writes
  are rejected. DM and group snapshots/restart retain the saved identity.
- Read-only, authenticated `GET /v1/agents/activity` returns one minimal summary per current
  agent/thread membership. It excludes transcripts, native input content, routing-only
  contexts and removed members. Running work precedes queued inputs; unknown stays unknown.
- One frontend mapping drives the header, sidebar and profile. Generation, tools, user input,
  stop intent, unknown, failure and newly observed success remain distinct. Stop is not
  presented as confirmed cancellation. Each thread retains its own activity; hidden tabs
  suspend rendering only. Reopening a completed chat does not replay celebration.
- Group agent replies show a still profile portrait outside the left edge of the bubble;
  partial/live replies may animate. Portrait/name clicks open the correct member profile.
  Large profile portraits follow the pointer and play boop on click. The studio keeps its
  standalone recipe/import/export flow and respects reduced motion.

## Verification

| Check | Result |
| --- | --- |
| Backend suite | 273 pass, zero fail, 1770 assertions |
| Engine and activity unit checks | 6 pass, zero fail, 8597 assertions |
| Consumer HTTP/SSE/replay/restart | 6 pass, zero fail; 85 registered routes |
| Conversation/model/rich-answer/browser regression | 32 pass, zero fail, desktop and mobile |
| Studio browser regression | 14 pass, zero fail, desktop and mobile |
| Server and web-client lint/typecheck/build | Pass |
| Shared package lint and diff whitespace | Pass |

The initial full conversation run had one mobile queue-test race: the test filled the
Lexical composer while the prior send still held its documented read-only state. Waiting
for `contenteditable=true` before the next input resolved the race; the final entire
32-case suite passed. This changed test synchronization, not admission/queue semantics.

Backend avatar cases use real SQLite and HTTP, including invalid recipes, revision
conflicts, DM/group identity and process reconstruction. Group HITL summaries remain
waiting after the source native run completes and omit private question contents. The
consumer cohort uses real in-process HTTP/SSE and database restart without native dispatch.

Browser identity saves use real isolated HTTP/SQLite. Reply text and native state changes
in the avatar browser scenarios are explicit fixtures; real committed configuration events
trigger the SSE refresh. No fresh Codex/Muse inference, installation or production test is
claimed. Source adapter protocols, grants, billing and cancellation authority are unchanged.

## Reproduction

```sh
cd apps/server
bun run lint
bun run typecheck
bun test tests
cd ../web-client
bun run lint
bun run typecheck
bun test verification/avatar*.test.ts
bun run build
bunx playwright test --config playwright.conversation.config.ts
bunx playwright test --config playwright.avatar.config.ts
cd ../..
bun scripts/verification/nma060/consumer.ts .dev/avatar-integration-consumer
```

Screenshots were visually reviewed at 1440px, 390px and 320px. Long member names and
reply text wrap without root overflow; portraits remain outside the bubble.

- [Desktop group](group-desktop.png)
- [Mobile group](group-mobile.png)
- [320px group](group-320.png)
- [Verification counts](verification.json)
- [Consumer result](consumer.json)
- [Published contract](../../contracts/1.19.0.json)
