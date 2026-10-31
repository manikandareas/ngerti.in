# Workspace and artifact API v1.5.0

NMA-054 extends the existing application authority with real workspace resources and immutable artifact bytes. Application schemas are **1.5.0**; broker schemas are **1.4.0**. [Conversation controls and recovery](conversation-control-api.md) remain the lifecycle foundation. The API gate NMA-060, file-tree UI, preview and installation remain pending.

## Scope and binding

A workspace belongs to one installation owner, agent and thread. The same agent has different resources in its DM and each group. Native bindings and admitted execution snapshots retain the workspace ID and revision. Membership, workspace state/root identity, agent/connection grants, settings and native capabilities are checked before dispatch. Input artifact scope and the staging copy's hash are verified against the immutable original before prompting.

`POST /v1/workspaces` requires installation authentication and a UUID `Idempotency-Key`:

```json
{"agent_id":"<UUID>","thread_id":"<UUID>","name":"Analysis"}
```

It creates a managed directory outside credentials. An optional absolute `project_path` binds an existing, canonical, non-symlink project directory. Installation/credential ancestors and overlapping projects belonging to another lane are refused. An owner must explicitly share individual artifacts; pointing another thread at the same project is not implicit sharing. Revoked foreign project bindings retain this isolation restriction. Rebinding within the same lane preserves existing project files.

Creating another workspace replaces the active lane binding, revokes the previous workspace and invalidates its native binding. Active/unknown runs prevent rebind. Queued inputs carrying artifacts from the previous workspace fail authorization before native dispatch. Opening a session creates a managed workspace automatically when the lane has none. Reads do not create resources.

`agent.workspace_id` is a validated same-agent reference, not authority to mount another conversation's resource. The active per-thread workspace and captured native binding determine actual access.

| Route | Behavior |
| --- | --- |
| `GET /v1/threads/:id/workspace?agent_id=<UUID>` | Current workspace or `null`; validates thread membership. |
| `POST /v1/workspaces/:id/revoke` with `{}` | Durable revocation, native binding invalidation and stop intent for active runs. Stop confirmation retains native semantics. |
| `GET /v1/workspaces/:id/files?path=&after=&limit=200` | Sorted child entries with `name`, relative `path`, `type` and `next_after`. Maximum page size 500; symlinks and protected names are omitted. |
| `GET /v1/workspaces/:id/file?path=relative/path` | Authenticated bounded binary read. |

These listing/read APIs support a later file-tree panel without implementing that UI now. They are not an arbitrary host-filesystem browser.

## Upload, attach and download

`POST /v1/workspaces/:id/uploads` requires installation authentication and `Idempotency-Key`:

```json
{"name":"numbers.csv","media_type":"text/csv","content_base64":"dmFsdWUKMwo0Cg=="}
```

The maximum decoded file size is **16 MiB**; canonical base64 is validated. Transport requests are bounded to 24 MiB. Other endpoints retain their smaller declared-body limits and schema bounds. Media type defaults to `application/octet-stream`.

The returned `artifact` identifies immutable bytes, SHA-256, size, name, workspace, owner/agent/thread scope, origin and a relative staging path such as `inputs/<command-id>/numbers.csv`. Disk bytes and directory entries are flushed before their SQLite publication/event/command receipt commits. An exact retry returns the same artifact; a changed payload conflicts. An interrupted staging operation is acknowledged only if the retained bytes match exactly. It never overwrites another file.

Attach explicitly when admitting a run:

```json
{"agent_id":"<UUID>","thread_id":"<UUID>","text":"Sum the attached CSV.","artifact_ids":["<artifact-UUID>"]}
```

`ngertiin.read_run_context` supplies scoped attachment IDs, names, relative paths and hashes. Unknown, foreign, revoked or rebound resources cannot be attached or dispatched. A changed staging copy does not change the immutable download; it fences execution rather than silently supplying different input.

`GET /v1/artifacts/:id/content?workspace_id=<UUID>` returns verified bytes with attachment disposition, media type, SHA-256 ETag, `nosniff` and `no-store`. The artifact must belong to that active workspace and its exact agent/thread. Metadata-only foundation artifacts are not downloadable files.

`POST /v1/artifacts/:id/share` with `{"workspace_id":"<target-UUID>"}` is an explicit owner command requiring `Idempotency-Key`. It creates an independent immutable copy and staging path in the target lane, with `source_artifact_id` provenance. Product tools cannot use this owner endpoint or select an arbitrary foreign workspace.

## Structured publication and file tools

The native harness calls these tools through its existing scoped bridge:

| Tool | Inputs / behavior |
| --- | --- |
| `ngertiin.get_workspace` | `{}` → current authorized workspace identity and root. |
| `ngertiin.list_files` | Optional relative directory `path` → bounded children. |
| `ngertiin.read_file` | Relative `path` → UTF-8 text, at most 100,000 bytes. |
| `ngertiin.create_file` | `command_id`, relative `path`, UTF-8 `text` → create a new file without overwriting. |
| `ngertiin.publish_artifact` | `command_id`, relative `path`, optional `media_type` → immutable downloadable output. |

The server derives the run, agent, thread, workspace, native session and native turn from its lease and persisted binding. It checks authorization again after reading the file and before publication. The owner API `POST /v1/artifacts` provides the equivalent publication command with `workspace_id`, `run_id`, `path`, optional `media_type` and `Idempotency-Key`; it does not accept a caller-supplied hash/storage key as proof of an output file.

The publication receipt, artifact metadata and event share one SQLite transaction. Stable command identity and unique `(run_id, source_path, sha256)` publication prevent duplicates after lost acknowledgements or retries with another key. Existing files are not deleted on cancellation, failure, rebind or restart. Orphaned bytes left before a committed publication are retained, not blindly deleted or treated as published. A path in answer prose never creates an artifact.

Conversation snapshots include `workspaces` and `artifacts`; input messages contain `artifact_ids`. Runs contain bounded `product_tools` success observations and native tool item identities/states, redacted command observations and exit codes. These observations supplement actual file/receipt verification; prose is not native-operation evidence.

## Filesystem and harness boundaries

App file operations walk directory descriptors with `openat`, `O_DIRECTORY` and `O_NOFOLLOW`. Source reads require a bounded regular file with one link and unchanged size/timestamps. The root's device/inode must match its persisted identity. A small fixed C wrapper compiled by Bun's built-in TinyCC handles `openat`'s variadic mode ABI correctly, including Apple arm64. The POSIX shim is exercised on macOS arm64; other-platform distribution is not claimed.

Traversal, symlink ancestors/files, hardlinks, foreign artifacts and credential names/directories are refused. The blob store is outside agent-writeable roots. Native temporary directories are also outside agent-writeable roots, under a private per-workspace parent; an agent-created `.tmp` symlink cannot expand its permissions. Sharing or revocation is validated server-side, independent of model instructions.

| Adapter | Scoped file behavior |
| --- | --- |
| Codex 0.165.0 | Native file edits, shell/code execution, file search and read-oriented Git operations are supported and live verified. A named native permissions profile denies host reads by default, permits the selected workspace/private temporary directory, denies connection credentials and protected names, and allows minimal/system developer-toolchain reads. Native command network access is disabled. `.git` remains read-only. Shell environment excludes provider keys and uses an isolated HOME/TMPDIR. Escalation remains declined. |
| Muse 1.4.14-R7309.1 / SDK 1.4.14 | Scoped app file tools and artifact round trips are live verified. This adapter uses the empty native preset with native writes/shell disabled. `native_files`, `native_shell`, `native_code` and `native_git` are **unsupported in this scoped adapter configuration**. This is not a claim that the Muse CLI lacks those tools; a scope-compatible direct native configuration has not been verified here. |

The adapters do not promise identical capabilities. [Codex permission profiles](https://learn.chatgpt.com/docs/permissions) and [Muse permissions](https://dev.meta.ai/docs/muse-code/permissions) inform the native boundary; the [retained local evidence](../verification/nma-054/README.md) establishes what actually ran. Muse evidence uses explicitly selected API-key/developer-credit billing, not subscription acceptance. No billing fallback, universal approval, general computer use, VNC, preview UI or installer is added.
