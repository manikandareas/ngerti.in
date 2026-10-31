# Workspace, attachment, artifact and native coding verification

Implemented on 2026-10-31 (Asia/Makassar), from clean baseline `9a8d0dd525bcb9544794a5e7d92651814656200a`. The live NMA-054 scope, matrix F01–F04/H03, active architecture, source guidance, roadmap and readiness rules were read. Its direct prerequisite NMA-053 was Done. The selected scope is engine/backend/API; the earlier file-tree discussion remains a UI proposal after NMA-060. At verification completion, no commit had been requested or created. The user subsequently authorized a local commit.

See the [API contract and examples](../../architecture/workspace-artifact-api.md), [provenance](provenance.json), [results](verification.json), [retained iterations](iterations.json), [cleanup](cleanup.json) and [responsibility hashes](SHA256SUMS).

## Delivered boundary

- Persistent managed or explicitly bound project workspace per owner/agent/thread; captured workspace/revision in native bindings and runs. Rebind/revoke invalidates native bindings. Active/unknown work cannot be silently moved to another project.
- Authenticated file listing/read, bounded upload, input attachment references, immutable download and explicit scoped sharing copies. SHA-256 and scope are rechecked; modified staging input is fenced before prompting.
- Structured artifact publication with native session/turn provenance, durable bytes before transactional metadata/events/receipt, and publication deduplication. Prose paths never publish files. Cancellation/restart/rebind does not delete files or replay unknown effects.
- Descriptor-relative file access using `openat`, no-follow opens, root device/inode identity, regular-file/link/size/change checks and credential-name protection. A fixed C ABI wrapper handles the variadic mode argument on Apple arm64.
- Codex native file editing, search, terminal, Python and read-oriented Git are live verified under root-deny permissions. System developer tools are readable, credentials stay denied, command networking is disabled, and temporary storage is outside agent-writeable roots. A planted workspace `.tmp` symlink cannot grant the installation directory.
- Muse uses the empty native preset and scoped app file tools. Direct native file/shell/code/Git capabilities are **unsupported in this adapter configuration**. The CLI's broader capabilities are not promoted without scope-compatible enforcement evidence. This is an explicit capability boundary, not a claim that every harness has identical tools.

## Local checks

| Evidence | Planned / passed | Result |
| --- | --- | --- |
| Backend tests | 131 / 131 | 0 fail, 0 skip; 15 new workspace tests. Assertion count varies with concurrent path-swap scheduling; retained final run: 769. |
| Backend lint and typecheck | 2 / 2 | Pass. |
| Existing foundation process/HTTP checks | 8 / 8 | Pass, including authority locking, restart, receipts and conservative unknown recovery. |
| Existing broker HTTP checks | 5 / 5 | Pass. Its controlled PATH reports Muse missing; native probes use the explicit local binary PATH. |
| Artifact SIGKILL process fixture | 5 / 5 | One durable artifact/event after forced death; native run stays unknown; zero native replay; unrelated file retained. This is not provider-crash evidence. |

Commands:

```sh
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun run verify:foundation
bun scripts/verification/nma048/http.ts
bun scripts/verification/nma054/crash.ts .dev/nma054/crash-state
```

Use a fresh fixture directory when rerunning the crash command; it deliberately retains its owner-bound state. The new tests cover 12 concurrent exact upload retries, immutable bytes, explicit DM/group sharing, traversal, symlink ancestors/files, hardlinks, corrupt blobs, root replacement, native temporary-root substitution, concurrent path swaps, scoped project binding, final-publication revocation, queued-resource changes and input-hash validation. Successful tool calls retain bounded observation names; native command receipts retain redacted commands, item states and exit codes.

## Native/live checks

The final acceptance cohort contains **4/4 succeeded application native runs**, 0 failed/cancelled/unknown. Final operation and restart reports are separate:

| Harness | Billing | Operation evidence | Restart evidence |
| --- | --- | --- | --- |
| Codex CLI 0.165.0 / `gpt-6.1-sol` | Explicit subscription | Separate grep and Git commands, native file edit, executed Python, output hashes/downloads, and six denied foreign/credential/symlink read/write operations. A planted `.tmp` symlink is present before native startup. | Same native session, attached input rechecked/read, original artifacts hash-verified after backend restart, no new publication. |
| Muse CLI 1.4.14-R7309.1 / SDK 1.4.14 / `muse-spark-1.3` | Explicit API key / developer credits | Successfully read the attached CSV through `ngertiin.read_file`, computed its sum, created a file and published/downloaded the verified output. No native shell/Git support is claimed. | Same native session and retained artifact bytes after restart; no duplicate publication. |

Reproduction uses existing, explicitly provisioned private connection state. These commands never include credentials in arguments or evidence:

```sh
NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=49954 bun apps/server/src/main.ts
bun scripts/verification/nma054/native.ts http://127.0.0.1:49954 .dev/nma049-native codex final
# Stop the service and wait for its authority to exit, then restart with the same state.
bun scripts/verification/nma054/native.ts http://127.0.0.1:49954 .dev/nma049-native codex resume-final final

PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma050/state NGERTIIN_PORT=49957 bun apps/server/src/main.ts
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma054/native.ts http://127.0.0.1:49957 .dev/nma050/state muse final
# Stop, wait, and restart the same service/state before this phase.
PATH="$PWD/.dev/nma050:$PATH" bun scripts/verification/nma054/native.ts http://127.0.0.1:49957 .dev/nma050/state muse resume-final final
```

These are backend/native clients, not UI acceptance. The final probe script was subsequently formatted and given explicit observation types; no additional native model request is claimed for those verification-only changes.

## Retained failures and denominators

All retained attempts contain **11 distinct application native runs: 11 succeeded outcomes, 0 failed, 0 cancelled, 0 unknown**. A succeeded run does not by itself establish file/coding acceptance. Three early runs remain incomplete acceptance evidence:

1. `native-codex-toolchain-limit.json`: native Python/Git failed because toolchain reads were too narrow. The agent used a shell fallback. The early verifier incorrectly accepted any successful command, so its raw `pass` is preserved but not counted as coding acceptance. Toolchain grants and exact native-command assertions were corrected.
2. `native-codex-nested-search.json`: Python/Git succeeded, but grep ran through Python rather than a separately observed command. The stricter assertion failed; final evidence contains the separate native search command.
3. `native-muse-unreadable-upload.json`: the staging file had the wrong permissions because of the variadic `openat` ABI. Muse reported failed reads but produced the requested known output; the early verifier was insufficient. The fixed wrapper, exact `0600`/read regression, computed-input prompt and required persisted `read_file` success close this gap. Its raw report remains unchanged.

Two additional server-restart-race reports admitted **zero runs**: a second authority started before shutdown finished and was correctly refused. Waited for process exit before retrying. Intermediate initial/resume reports provide four more successful runs; final acceptance uses only the four final reports listed in `iterations.json`. Raw errors, incomplete assertions and misleading early verifier results are retained and explicitly classified.

## Limits and cleanup

macOS arm64 is the verified platform. The POSIX/TinyCC source must be included and reverified during later distribution work. Other OS/architecture behavior, arbitrary code toolchains, Git writes, native command networking, full filesystem/browser/desktop access, preview and installation are not claimed.

Muse direct native tools remain withheld in its scoped adapter; the verified file path is the structured product-tool bridge. Muse subscription and interactive permission acceptance remain on NMA-050. Provider crash and power-loss durability are not inferred from the process fixture. Native command output is not a universal secret-classification mechanism; known credentials are isolated and redacted, and protected paths are denied.

Both verification services and owned native clients were stopped. All 11 proof runs are terminal, zero active proof runs remain, and no goals/Routines were created by these probes. The process crash fixture intentionally retains an unknown synthetic run without an executor or replay. Historical evidence, unrelated user files and credential state were preserved. No UI, installer, reset, commit, push or deployment was performed. This work does not close NMA-060 or production readiness.

## Local delivery

The user authorized committing this scope after reviewing the implementation and the small native ABI wrapper. Implementation and raw evidence bytes match the verified snapshot. Tests are not rerun for this documentation-and-commit operation; retained results remain 131/131 backend tests, lint/typecheck, 8/8 foundation, 5/5 broker HTTP, 5/5 artifact crash checks and 4/4 final native runs. The `commit_created: false` fields describe the verification snapshot; Git and the selected Notion ticket record subsequent local delivery. No push or deployment is included.
