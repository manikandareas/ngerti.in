# Conversation references and ordered public parts

Implemented locally on 3 November 2026, extending baseline `4df6a93`. This closes the approved conversation UX amendment for NMA-056, NMA-061 and NMA-062. API contract [1.24.0](../../contracts/1.24.0.json) includes the verified backend delta. Existing evidence keeps its original captured scope.

## Result

- Composer, user messages, assistant answers, handoffs and human requests share readable person references. The final requested style is **avatar + name**, with no mention background or visible `@`. Canonical references retain their IDs and mention syntax for durable routing. The anonymous owner appears as **Kamu**, addressed internally as `@user`.
- File references open the scoped File panel and preview. Known historical artifact receipts become readable file links in the presentation layer. Original messages, instructions and file bytes are preserved. Fenced code and unrelated identifiers are not globally rewritten.
- DM and group timelines use the same persisted publication sequence. Queued intake is separate from publication; later answers cannot move milestones retroactively. The snapshot includes a timeline page, and `GET /v1/threads/:id/timeline` paginates with numeric publication cursors.
- Goal creation, verified completion, blocked/pause/resume/stop transitions and handoff requests are distinct parts. A useful handoff announcement can be published transactionally before the handoff milestone; a duplicate final acknowledgement from that source turn is suppressed. A later combined answer remains possible when synthesis is requested.
- Adjacent Goal milestones of the same kind can share a compact expandable row. **Routine milestones always remain separate, directly visible rows.** Routine detail instructions are also displayed directly. No-change Routine executions and ordinary progress updates add no milestone spam.
- Routine has an optional short `name`, separate from execution instructions. Legacy titles are derived from the original instruction with readable reference labels; incomplete protocol/opaque titles fall back safely. Historical event identities and avatar recipes remain available after membership changes. Tobi's default avatar matches its persistent identity.
- A successful native start clears a resolved preflight diagnostic. The conversation also avoids displaying an obsolete not-dispatched error while that run is already running.

## Verification

| Boundary | Result | Evidence |
| --- | --- | --- |
| Backend API/domain/protocol suite | 315 passed, 0 failed; 2,001 assertions | [backend log](logs/backend.log) |
| Web unit checks | 14 passed, 0 failed; 8,630 assertions | [unit log](logs/web-unit.log) |
| Full DM/group/work regression | 60 passed across desktop and mobile | [full UI log](logs/work-full.log) |
| Final style and timeline checks | 6 passed across desktop and mobile | [delta UI log](logs/work-style-delta.log) |
| Mention/composer regression | 24 passed across desktop and mobile | [reference log](logs/references.log) |
| Mobile deletion followed by typing | 5 consecutive passes | [repeat log](logs/mobile-repeat.log) |
| Server/web | Typecheck and lint passed; production web build passed | [checks](checks.json), [build log](logs/web-build.log) |
| Live Brave + native Codex | One group goal and one DM goal completed; four native runs succeeded | [group receipt](brave-live-2026-11-03/group-native.json), [DM receipt](brave-live-2026-11-03/dm-native.json) |
| Preservation | All 90 baseline messages and 30 artifact entities retain byte-identical stored JSON | [preservation](preservation.json) |

The full 60-case run preceded the final mention styling, direct Routine rows, short Routine names and historical-author presentation refinements. The six focused cases, reference suite, repeated mobile case and final Brave observations cover the subsequent changes. Browser fixtures exercise real HTTP/domain/storage and provider protocol seams; live provider inference is reported separately. The existing Vite bundle-size warning remains.

An initial mobile test intermittently lost a slash after two synthetic `fill()` replacements around token deletion. The test now verifies the empty editor and types through the normal keyboard path. The full reference suite and five repeated mobile runs pass. An experimental application timing change was reverted; the composer lifecycle remains unchanged.

## Live use cases

The group scenario reads the original **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.pdf**, publishes `catatan-rag-terverifikasi.md`, delegates an accuracy review, publishes `review-catatan-rag.md`, and completes one shared goal with both files as evidence. Observed order is user → Goal created → Tobi result → handoff → peer review → combined result → verified Goal completed. The source PDF matches SHA-256 `23e3249e9a1e75418d82efecab0ea8c4d033b89c93742f63208d47ce01f21233`; both outputs download through the scoped API with matching hashes.

The original PDF was selected through Brave's native file picker and appeared in a new draft. Browser control detached before that draft was submitted. The completed scenario reattached the existing original upload from the same group File panel. This capture does not claim a new committed upload from the interrupted picker attempt. Earlier committed upload evidence remains in the preceding attachment audit.

The DM scenario creates a generic five-point thesis revision checklist, mentions the owner, completes its goal, and creates two independent one-shot reminders through ordinary conversation. Their creation parts are directly visible. Both test reminders were then stopped through the UI; neither has a next run. The checklist opens successfully in Brave's Markdown preview. No group transcript was needed for that generic DM result.

The local backend initially selected an older Homebrew Codex binary. Its queued request was not dispatched. Restarting with the already installed NVM Codex **0.166.0** resumed that same admission. These live runs used **gpt-6.1-sol** with the existing ChatGPT subscription selection. No new login, billing fallback, Muse live proof, installer or production acceptance is claimed. The SQLite authority lock was respected during replacement.

Final screenshots and UI excerpts are in [the Brave evidence folder](brave-live-2026-11-03). Early visual observations are labeled separately. The four live runs are terminal, both test goals are completed, both newly created DM reminders are stopped, and the final preservation capture found zero queued/running/unknown runs.

## Reproduction and source

Run `bun test tests`, `bun run typecheck` and `bun run lint` in `apps/server`. Run `bun run build`, `bun run lint`, `bun test verification`, `bunx playwright test --config playwright.work.config.ts` and `bunx playwright test --config playwright.references.config.ts` in `apps/web-client`.

The read-only [native audit helper](../../../scripts/verification/conversation-parts/audit.ts) accepts a thread ID, completed goal title and output label. Credentials stay in memory and never enter its report. The private SQLite backup remains under `.dev/conversation-parts-backup-2026-11-03`.

Implementation reuses the repository's Pen-aligned `ConversationEvent`, Lexical `ReferenceNode`, procedural avatars, safe Markdown renderer, scoped File viewer and existing lifecycle authority. New journal/part/reference modules live in `apps/server/src/conversations`; shared rendering and grouping live in `apps/web-client/src/features/conversation`. No additional router model or parallel lifecycle was introduced. Changes remain uncommitted and unpushed. Ticket evidence is maintained through the repository's [ngertiin-ticket skill](../../../.agents/skills/ngertiin-ticket/SKILL.md).
