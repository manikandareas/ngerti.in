# Marketing group snapshot repair

Verified locally on 3 November 2026 against baseline `4a880d6`.

Opening **Marketing TIm** failed with HTTP 422 and `Request does not match the contract.` The request had a valid thread ID. The failure came from server-side timeline parsing: the historical `handoff_requested` receipt at sequence 909, sourced from `peer_task.created` event 1145, omitted `summary`. The current public contract requires a string or explicit `null`.

Historical event replay reads the original event bytes without applying the current peer-task schema defaults. Passing `entity.summary` through unchanged omitted the JSON field when that old event had no summary. A separate read compatibility path is needed for receipts already materialized by the earlier implementation.

`ConversationJournal.record` now writes explicit `null` for an absent handoff summary, and `page` normalizes the same absent field before validating existing receipts. The public schema remains strict and unchanged at version 1.24.0. Existing messages, event bodies, stored receipts, actor identities, publication sequences and internal-instruction visibility rules are preserved. No live database repair or projection rebuild was required.

## Verification

- Before the fix, both new regression cases failed through the authenticated snapshot HTTP route with status 422. They simulate an existing receipt without `summary`, and reconstruction from historical peer-task events without `summary`.
- After the fix, both cases pass through snapshot and timeline HTTP routes. They verify exact timeline equality, explicit null summaries, hidden internal instructions, unchanged events/messages during reads, and explicit null persistence after replay.
- `bun test tests/conversation-parts.test.ts`: 8 passed, 0 failed, 48 assertions.
- `bun test tests`: 317 passed, 0 failed, 2,011 assertions.
- Server `bun run typecheck` and `bun run lint` passed. `git diff --check` passed. No frontend source changed.
- All four visible local conversations returned HTTP 200 for snapshot and timeline; publication IDs were unique and ordered. `/health/ready` remained `ready`.
- The original group opened with its composer available and no contract error at desktop width 1280 and mobile width 390 using `agent-browser`. An initial mobile assertion ran before reload completed; the subsequent rendered-state assertion passed.
- All three published artifacts in the Marketing group downloaded successfully and matched their stored SHA-256 and size.

See [checks.json](checks.json) and [preservation.json](preservation.json).

The local API was restarted to activate the fix. Its old listener stopped accepting requests but retained the authority lock while shutdown waited for open connections. The first replacement refused that lock. After rechecking that no runs were queued, active or unknown, the stopped listener process was terminated and the replacement started. No authority lock was bypassed. A private database backup is retained at `.dev/marketing-snapshot-backup-2026-11-03`.

All 102 baseline messages, 34 artifacts, 53 runs, 13 threads, 14 peer tasks, 9 goals and 6 Routines retained byte-identical stored JSON. Original event, command and publication rows also remained unchanged. Whole-database equality is not claimed: shutdown detached a browser session, UI initialization added setup receipts, and concurrent conversation use later appended messages/runs and refreshed two harness inventories. The audit itself submitted no messages or inference requests. The earlier offline diagnostic copy is separate from the live backup.

This is a local historical-data read regression repair. It adds no provider/billing, installer, deployment or production acceptance. Changes remain uncommitted and unpushed.
