# NMA-031 implementation verification

Reviewed on 26 October 2026 against the live [task](https://app.notion.com/p/404abdd61873811d805efbabdf66ceca), primary specification, adoption plan and acceptance document. All four native dependencies were read and verified Done: NMA-028, NMA-029, NMA-030 and NMA-022.

**Verdict:** no blocking implementation gap found within the declared scoped Linux Docker delivery. The task's 12 acceptance criteria remain supported. No implementation changes were necessary. This conclusion does not extend to production rollout, external-network browser deployment, every language server, or release reliability sample sizes.

## Requirement coverage

| Acceptance | Implementation and evidence reviewed |
| --- | --- |
| Native read, patch, execution, logs, stdin, process stop | Native worker dispatch retains upstream handlers; fresh native lifecycle test and retained actual-model PTY receipts. |
| File persistence separated from RAM | Persistent workspace volume versus execution scope; fresh restart/pause and process recovery cases. |
| Concurrent scope isolation and revoked access | Owner/agent/thread scope, exclusive workspace dispatch, live authorization callbacks, context fencing; fresh parallel-scope and cancellation/isolation cases plus retained revocation evidence. |
| Browser prerequisites and executable skill assets | Fresh Chromium-managed download and gateway helper execution inside the reviewed image. |
| Supported document input and binary download | Fresh PDF/DOCX/XLSX/notebook/SQLite extraction, malformed-input rejection, gateway binary publication and exact bytes; retained authenticated browser hash evidence. |
| Retry/lost ACK and incomplete uploads | Fresh upload/finalize retry, immutable parts, incomplete visibility and message/run deduplication tests. |
| Explicit private/group sharing and download revocation | Fresh share/revoke/restart tests; production download propagates thread scope per chunk; retained actual Clerk isolation evidence. |
| Durable background file and old text artifacts | Fresh background completion after gateway restart and retained output; additive storage and retained legacy-artifact/preservation evidence. |
| Real LSP diagnostics and repair | Fresh native Pyright error, repair and verified clean result; unsupported diagnostics remain unknown. |
| Independent worktrees | Fresh conflicting edits in distinct native worktrees with independent byte checks. |
| Selected restore preserves unrelated edits | Fresh selected-file conflict guard and safe whole-workspace restore cases; retained authenticated UI restore and external receipt hash evidence. |
| Restart mappings and safe cleanup | Fresh persistence and refusal to clean active/dirty worktrees. |

Reviewed source paths include `native_executor.py`, `native_worker.py`, `native_jobs.py`, `coding.py`, `files.py`, `workspaces.py`, artifact sharing, schema migration, DM/transcript attachment ingress, backend download streaming and web upload/workspace controls. Knowledge-graph tools were unavailable in this session; local source inspection was used.

## New verification

- Native/workspace/file/gateway suite: **8 passed, 0 skipped**, 100.54 seconds.
- Production backend HTTP suite: **14 passed**.
- `bun run check`: passed (web lint/typecheck and backend Ruff/format/type analysis).
- Engine source/test Ruff: passed.
- Integrity verification: **47 source files, 4 dependency inputs, 55 retained evidence files**, zero mismatches.

Fresh raw logs and machine-readable attribution: [review evidence](evidence/nma-031-review/verification.json). The original evidence files and their manifest were preserved unchanged.

Native test command, from repository root:

```sh
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
NMA_TEST_RUNTIME_PYTHON="$PWD/.dev/nma-040/production/bin/python" \
PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source" \
NMA_TEST_NATIVE_IMAGE=sha256:69b9e9b7ca9eb47b76bef9aaa69b55e533c45077a9ce5321d5b2fee11886c7f8 \
.dev/nma-001/runtime/bin/python -m pytest \
  apps/engine/tests/test_native_workspaces.py \
  apps/engine/tests/test_workspace_delivery.py \
  apps/engine/tests/test_files.py \
  apps/engine/tests/test_native_isolation.py -q
```

The initial invocation used the production interpreter as the test runner and stopped because pytest is intentionally absent. The successful command uses the existing test interpreter while launching the production gateway interpreter. No packages were installed.

## Evidence limits

Actual-model calls, authenticated browser interaction, backup/restore rehearsal and the complete 190-test regression were not rerun in this review. Their retained evidence was inspected and hash-verified against the unchanged source manifest. The historical real-model candidate image remains distinguished from the delivered image. This review's eight native tests ran against the delivered image.

The existing three-model-task smoke cohort does not establish release SLOs. NMA-039/NMA-027 retain those gates. Original account data, migrations, resource identities, historical evidence and unrelated working-tree changes were preserved. No commit, push or deployment was performed.
