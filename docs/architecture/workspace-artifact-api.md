# Workspace and artifact API v1.22.0

NMA-054 extends the existing application authority with real workspace resources and immutable artifact bytes. Application schemas are **1.5.0**; broker schemas are **1.4.0**. [Conversation controls and recovery](conversation-control-api.md) remain the lifecycle foundation. The API gate NMA-060, file-tree UI, preview and installation remain pending.

The paragraph above records the original foundation capture. Contract **1.21.0** added submit-time attachments and document tools. **1.23.0** adds shared group workspaces and group attachment submission/recovery. NMA-060's earlier engine/API gate closure remains separate from this amendment's verification and from distribution or production acceptance.

## Submit-time attachments

New composer files stay in the browser until submit. The browser freezes one operation in IndexedDB, including its files and exact message body. Removing a draft attachment sends no upload request. Existing workspace attachments are referenced without copying their bytes again.

After submit, `POST /v1/message-uploads` takes a UUID `Idempotency-Key` as the future artifact identity, plus `submission_id`, `thread_id`, `agent_id`, `name`, `media_type` and `content_base64`. Each request retains the existing 16 MiB decoded limit and 24 MiB transport limit. It creates a private `attachment_upload`, not a workspace artifact. For a group conversation, `agent_id` may be null and staged ownership is normalized to the group. DM staging requires its member agent. Internal routing threads cannot receive user uploads.

`POST /v1/runs` accepts optional `submission_id`, equal to its command key. Its `artifact_ids` may contain matching staged identities and existing scoped artifacts. All selected uploads must validate before artifact metadata, message, run and upload commitment are saved in one SQLite transaction. Durable bytes precede that transaction. Workspace input files are materialized only after commit; pending materialization recovers on startup and before native dispatch. A filesystem write is not described as a SQLite transaction. Projection failures keep the saved message and fence dispatch instead of duplicating admission.

`POST /v1/groups/:id/messages` accepts `text`, `artifact_ids`, optional `agent_id`/`router_agent_id`, and `submission_id` equal to its command key. It atomically commits the selected uploads, one group message and one route. File-only messages are allowed. Limits are 20 files and four images per message; unsupported visual targets are rejected before commitment.

`GET /v1/message-submissions/:id` returns `committed` with the original DM admission or group-route receipt, `pending`, or `missing`. The client reconciles before retrying. An unconfirmed result retains its exact body/key and local file copies across refresh. Definitive rejection restores an editable draft. Successful reconciliation clears the local pending copy. A saved message keeps its files when inference fails or stops.

Uncommitted uploads expire after 24 hours. Startup, later staging activity and the background minute sweep remove only expired private bytes with no committed artifact reference. Original user artifacts and earlier unlinked uploads are preserved. The explicit owner workspace-upload API below remains available for deliberate workspace operations.

## Document context and tools

`ngertiin.list_attachments` lists sent files and published agent output visible to the current run's conversation/workspace, with bounded cursor pagination. Draft uploads, later queued messages and foreign/revoked resources are excluded. `read_run_context` now distinguishes current `attachments` from bounded `previous_attachments`.

`ngertiin.read_attachment` accepts `artifact_id`, optional `start_page`/`end_page`, `offset` and `max_chars`. Reads cover at most twenty consecutive pages and 30,000 returned characters. `ngertiin.search_attachment` performs case-insensitive literal text search and returns bounded excerpts and PDF page indices. Page numbering starts at 1 in PDF order; it does not claim to identify printed page labels.

PDF.js 6.5.438 handles text extraction in a child process without provider credentials, with two active parsers, a 15-second deadline and a 2 MB output cap. Initial extraction covers up to 300 pages, 60,000 characters per PDF page and 800,000 retained document characters. Explicit reads can request later pages. TXT/Markdown/CSV and other declared UTF-8 text use local decoding. Empty, invalid, unsupported and limited documents have explicit states; OCR and additional document formats are not claimed. Images retain the existing native capability path.

Derived text is keyed by artifact identity, immutable source hash and parser version. Cache writes are atomic; interrupted derived content can be recomputed. Original bytes and access are rechecked before cached content is returned. File-based prompts receive attachment metadata and bounded previews (two pages, at most 2,000 characters each, 12,000 preview characters in total). The native harness still owns the model/tool loop. Source excerpts are untrusted data.

Snapshots include `attachment_documents`. Runs retain bounded `attachment_observations`: artifact/hash, operation (`context`, `read`, `search`), pages, truncation and timestamp. Accepted native prompt context and returned tool content are evidence boundaries; they do not prove comprehension or answer correctness. `succeeded` keeps its runtime meaning. User-facing chips keep their original document/image icon. A shared hover tooltip or touch popover contains file metadata, image preview and only relevant progress/error status. Local drafts have no "not sent" label, and technical extraction details are not displayed by default.

## Scope and binding

DM and internal-router workspaces have `scope: "agent"` and a member `agent_id`. A group conversation owns one `scope: "group"` workspace with `agent_id: null`; all current members resolve the same workspace. Group artifacts also have null ownership `agent_id`; `created_by_agent_id` and native run/session provenance identify the contributor. DM and other-group resources remain separate. Native bindings and admitted execution snapshots retain the workspace ID and revision. Membership, workspace state/root identity, agent/connection grants, settings and native capabilities are checked before dispatch. Input artifact scope and the staging copy's hash are verified against the immutable original before prompting.

`POST /v1/workspaces` requires installation authentication and a UUID `Idempotency-Key`:

```json
{"agent_id":"<UUID>","thread_id":"<UUID>","name":"Analysis"}
```

It creates a managed directory outside credentials. An optional absolute `project_path` binds an existing, canonical, non-symlink project directory. Installation/credential ancestors and overlapping projects belonging to another lane are refused. An owner must explicitly share individual artifacts; pointing another thread at the same project is not implicit sharing. Revoked foreign project bindings retain this isolation restriction. Rebinding within the same lane preserves existing project files.

Creating another workspace replaces the active conversation binding, revokes the previous workspace and invalidates its native bindings. In groups, this applies to every member sharing the workspace. Active/unknown runs prevent rebind. Queued inputs carrying artifacts from the previous workspace fail authorization before native dispatch. Opening a session creates a managed workspace automatically when the lane has none. Reads do not create resources.

`agent.workspace_id` is a validated same-agent reference, not authority to mount another conversation's resource. The active per-thread workspace and captured native binding determine actual access.

| Route | Behavior |
| --- | --- |
| `GET /v1/threads/:id/workspace?agent_id=<UUID>` | Current workspace or `null`; validates thread membership. |
| `POST /v1/workspaces/:id/revoke` with `{}` | Durable revocation, native binding invalidation and stop intent for active runs. Stop confirmation retains native semantics. |
| `GET /v1/workspaces/:id/files?path=&after=&limit=200` | Sorted child entries with `name`, relative `path`, `type` and `next_after`. Maximum page size 500; symlinks and protected names are omitted. |
| `GET /v1/workspaces/:id/file?path=relative/path` | Authenticated bounded binary read. |

These listing/read APIs support a later file-tree panel without implementing that UI now. They are not an arbitrary host-filesystem browser.

## Shared group execution and recovery

Each group conversation serializes native member turns through the authoritative run queue. All current group adapters can mutate workspace files, so they are conservatively treated as writers; parallel read-only turns are not advertised. The durable active/unknown run holds the workspace until settlement/reconciliation. Handoff children start after the parent's native turn has finished; continuations retain the original attachment identities. Native clients close after each group turn and resume their distinct persistent session on later turns. Owned Codex writer processes use a separate process group that is terminated before releasing the workspace; the descendant shutdown check is verified on macOS arm64. Muse native shell/write remain disabled.

Owner-authorized native receipt inspection grants no workspace/tools and remains available after membership/workspace revocation. It does not resume a turn or issue a prompt. Unknown outcomes never expire into an implicit writer takeover.

When an idle existing group first resolves its shared workspace, safe files from older agent-owned group lanes are preserved under `previous/<old-workspace-id>/...`. Artifact identities, immutable hashes and original source directories are retained; metadata moves to the shared workspace and records its former contributor. Existing native bindings are invalidated. Active/unknown group work prevents cutover. Protected names and foreign/DM roots are never imported.

Attachment tools retain the input-message cutoff when listing prior sent files. The shared native filesystem represents current group working files, not a point-in-time snapshot. The immutable artifact blob remains the source for attachment document reads and downloads.

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

`GET /v1/artifacts/:id/content?workspace_id=<UUID>` returns verified bytes with attachment disposition, media type, SHA-256 ETag, `nosniff` and `no-store`. The artifact must belong to that active workspace and its exact ownership scope/thread. Group product-tool access additionally validates the executing member/run lease. Metadata-only foundation artifacts are not downloadable files.

`POST /v1/artifacts/:id/share` with `{"workspace_id":"<target-UUID>"}` is an explicit owner command requiring `Idempotency-Key`. It creates an independent immutable copy and staging path in the target lane, with `source_artifact_id` provenance. Product tools cannot use this owner endpoint or select an arbitrary foreign workspace.

## Responsibility evidence provenance

Contract 1.23.0 also pins `artifact.goal_generations` at native publication from the producing task/run. Group goal completion validates the shared workspace, exact parent/child lineage, successful native settlement and immutable hashes. A contributor's output can prove the same group goal; an unrelated output or prior objective generation cannot. See [group responsibilities](goals-routines-api.md#group-ownership-and-assignment).

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

Traversal, symlink ancestors/files, hardlinks, foreign artifacts and credential names/directories are refused. The blob store is outside agent-writeable roots. Native temporary directories are also outside agent-writeable roots, under a private per-workspace parent (separate member directories in shared groups); an agent-created `.tmp` symlink cannot expand its permissions. Sharing or revocation is validated server-side, independent of model instructions.

| Adapter | Scoped file behavior |
| --- | --- |
| Codex 0.165.0 | Native file edits, shell/code execution, file search and read-oriented Git operations are supported and live verified. A named native permissions profile denies host reads by default, permits the selected workspace/private temporary directory, denies connection credentials and protected names, and allows minimal/system developer-toolchain reads. Native command network access is disabled. `.git` remains read-only. Shell environment excludes provider keys and uses an isolated HOME/TMPDIR. Escalation remains declined. |
| Muse 1.4.14-R7309.1 / SDK 1.4.14 | Scoped app file tools and artifact round trips are live verified. This adapter uses the empty native preset with native writes/shell disabled. `native_files`, `native_shell`, `native_code` and `native_git` are **unsupported in this scoped adapter configuration**. This is not a claim that the Muse CLI lacks those tools; a scope-compatible direct native configuration has not been verified here. |

The adapters do not promise identical capabilities. [Codex permission profiles](https://learn.chatgpt.com/docs/permissions) and [Muse permissions](https://dev.meta.ai/docs/muse-code/permissions) inform the native boundary; the [retained local evidence](../verification/nma-054/README.md) establishes what actually ran. Muse evidence uses explicitly selected API-key/developer-credit billing, not subscription acceptance. No billing fallback, universal approval, general computer use, VNC, preview UI or installer is added.
