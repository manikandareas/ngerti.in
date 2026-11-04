# Shared machine commit review — 2026-11-04

The shared-machine implementation, desktop UI, temporary-window cleanup, group-opener revision fix and event-stream inactivity deadline form this commit. The cleanup refactor names the idle-input gate and window-cleanup steps explicitly and adds return types; behavior is preserved.

Four mixed files were staged selectively: broker machine bindings/async inputs, machine startup/shutdown, the original event inactivity deadline, and the Computer panel. Unrelated native-run recovery, request/reconciliation improvements, composer/group edits and research remain outside this commit. Their working bytes were preserved.

## Validation of the staged tree

An isolated export of the Git index, with unchanged installed dependencies, passed:

- Backend: **384/384**, 2,362 assertions, 41 files.
- Frontend units: **30/30**, 8,806 assertions, eight files.
- Computer UI: **2/2**, desktop and mobile.
- Server and web lint/typecheck; web production build. The existing chunk-size warning remains.

`make docs-check` still reports **78 historical broken links**, identical to baseline `ba887f53a4ea44bec3b8e565fcdc58e7d5b8a091`; no new failures remain. References to retired browser UI files in the new architecture audit were changed to historical code labels.

The earlier 392-test working-tree result includes eight tests for unrelated recovery work. It is historical evidence, not the denominator for this commit. Native Cua, Codex/Muse and Brave evidence remains at the boundaries recorded in the adjacent reports; provider inference was not repeated for this behavior-preserving refactor.

Source/evidence integrity is recorded in [commit-SHA256SUMS](commit-SHA256SUMS), computed from staged blobs rather than mixed working files. Older manifests retain their earlier scope.

## Immutable whitespace exceptions

Generated upstream protobufs preserve their original final blank line, and the two captured log-excerpt files preserve original trailing spaces. Their hashes were checked against the existing manifests. All other staged paths passed the ordinary whitespace check.

- `apps/server/src/machines/protocol/common_pb.ts`
- `apps/server/src/machines/protocol/stream_pb.ts`
- `apps/server/src/machines/protocol/windows_pb.ts`
- `docs/verification/shared-machine/brave-checks-2026-11-04.md`
- `docs/verification/shared-machine/cleanup-checks-2026-11-04.md`
