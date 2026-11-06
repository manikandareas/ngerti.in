# Conversation initial position and send scrolling

Date: 2026-11-06.

Opening a DM or group now positions its latest message synchronously before the first painted frame. The scroll controller runs after the composer/header clearance measurement. A new owner message restores following even after reading older history; successful queued submissions also reveal the conversation end. Assistant updates and history pagination preserve user scroll intent.

## Verification

- Baseline: four desktop cases reproduced both reported failures in DM and group. See [baseline output](logs/before.log).
- Chromium: 22 unique desktop/mobile cases passed, including cold opening, cached sidebar switching, normal sending, queued sending, reading history, FIFO publication and existing composer navigation.
- WebKit: eight unique scroll cases passed. The temporary local harness under `.dev/scroll-verification` uses the same application/API fixtures with separate ports. This is engine coverage, not an automated native-window interaction claim.
- Web lint, build/typecheck and all 50 frontend unit tests passed.
- `bun run package:desktop` passed, including its isolated packaged Bun/backend smoke check. All current frontend output files match the packaged web resources by SHA-256.

Expanded-test iterations are retained: the group queue fixture needed an explicit target agent; one WebKit startup wait exceeded five seconds during concurrent compilation and passed with the corrected initial-data wait. Neither change weakens the assertions on first painted position or bottom distance.

Machine-readable checks and asset hashes: [verification.json](verification.json). Raw command output is retained under `logs/`.

To use the updated desktop bundle, fully quit the older app with Command-Q, then open `apps/desktop/src-tauri/target/release/bundle/macos/Ngertiin Tauri.app`. Persistent profile data is unchanged.

## Cleanup verification

The scroll hook now uses explicit state types and descriptive transition names. Regression tests share their scroll-position assertions and use named fixture options. Composer focus and chip alignment behavior are preserved.

Final checks: web lint, typecheck and build; 50 frontend unit tests; 26 Chromium desktop/mobile cases; and eight unique WebKit cases. The group first-frame WebKit case initially collected nine of twelve samples before its five-second timeout. Increasing only the sampling wait to 15 seconds passed; the two-pixel position limit and twelve-frame assertions are unchanged. All four Chromium first-frame cases also passed again.

All 143 final web output files match the latest desktop package byte for byte. No additional native rebuild was necessary after cleanup. Earlier manifests retain the build snapshots from their respective verification steps.

The documentation checker still reports 85 broken-link occurrences (75 unique). Every affected source document is unchanged from the starting commit; no new broken links were introduced.

Final commands, results, and raw evidence hashes: [cleanup verification](cleanup/verification.json).
