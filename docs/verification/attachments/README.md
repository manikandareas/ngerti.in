# Submit-time attachment reliability

This amendment follows the user-observed Tobi failure: a PDF was persisted and attached to a message, but its identity/content was absent from native prompt input and the model answered without reading it. A later `read_run_context` only checked the newest message, so follow-up questions incorrectly appeared to have no file. The audit itself was read-only.

## Delivered behavior

- New composer files and previews stay local until submit. Removing a draft chip produces no upload. Local file references remain available to the editor's undo history until the conversation changes; they are not server artifacts.
- After submit, IndexedDB retains exact operation identity/body and selected file objects across refresh. Private per-file staging precedes one transactional artifact/message/run publication. Reconciliation and exact retries do not duplicate admission. Definitive rejection restores an editable draft. Successful admission clears the pending browser copy.
- Workspace projection follows committed admission and recovers after restart. Only expired uncommitted new staging bytes are swept after 24 hours. Pre-existing user artifacts, unlinked old uploads, native sessions, historical evidence and unrelated files are preserved.
- PDF.js 6.5.438 extracts page text through a bounded credential-free child process. UTF-8 text is decoded locally. Hash/version-bound derived caches recover after interrupted writes. Empty, corrupt, unsupported and limited documents retain explicit results; OCR is not implemented.
- Every native run receives current attachment metadata, bounded document previews and previous conversation references. Three scoped tools list sent attachments, read page ranges and search literal text. The harness still owns the model/tool loop. Source text is untrusted data; reads and cached output recheck access and immutable bytes.
- Native prompt acceptance and structured tools produce bounded attachment observations. These demonstrate supplied content/pages, not comprehension or factual correctness. Execution `succeeded` is unchanged.
- Chips retain their original document/image icon, with no additional information icon. Hovering the chip shows one tooltip with file name, size, a short file-type label and an image preview when applicable. `TooltipContent` uses the existing shadcn component defaults without custom surface, shadow, border or arrow styling. Only in-progress or error status adds a short nontechnical line to that same tooltip; local drafts have no "not sent" label. Touch opens the equivalent popover. Keyboard, inline alignment, reduced motion, undo and clipboard behavior are exercised.

Contract: [1.21.0](../../contracts/1.21.0.json). Detailed semantics and limits: [workspace API](../../architecture/workspace-artifact-api.md). The 16 MiB per-file limit is unchanged; group attachment admission remains unsupported.

## Verification

`verification.json` records the final commands, exact denominators, native results, source provenance, known earlier failures and boundaries. Adjacent logs, native reports, browser reports and status screenshots retain their own evidence classes. `SHA256SUMS` covers task implementation, contract, verification sources and evidence without rewriting earlier ticket evidence.

| Evidence | Result |
| --- | --- |
| Backend | 284 passed, 0 failed, 0 skipped; 1,835 assertions |
| Server lint/typecheck; web lint/build/typecheck | Passed |
| Full desktop/mobile workspace suite | 48 passed |
| Final desktop/mobile composer checks | 16 passed after the last status refinement |
| Final shadcn tooltip/preview checks | 4 desktop/mobile checks; maximum width 256 px |
| Final native cohort | 4 succeeded, 0 failed/unknown across Codex and Muse |
| Restart preservation | All 40 user messages and 21 artifacts retained byte-identical entity content |

The full workspace suite preceded the final UI-only status projection refinement; the final composer checks cover that refinement. Changed-document validation passes all 25 local links. The repository-wide `scripts/check_docs.py` still fails on 85 pre-existing links to retired source and archive paths, all outside these changed documents. Its output is retained in `docs-check.log`; historical documentation was not rewritten to conceal those failures.

Backend checks run from `apps/server`: `bun test tests`, `bun run typecheck`, `bun run lint`. The attachment regression covers private staging, all-file admission, lost acknowledgement, restart projection, cleanup, real PDF page text, previous-message references, exclusion of drafts/future messages, cache recovery, corruption and revoked access.

Browser checks run from `apps/web-client`: `bun run build`, `bun run lint`, `bunx playwright test --config playwright.work.config.ts`. The test server owns an isolated temporary installation and uses its existing native fixture boundary. Browser UI evidence is not live model evidence. One existing browser-panel assertion was updated from a removed heading to the existing activation control; the browser implementation was unchanged.

Live native verification uses `scripts/verification/attachments/native.ts` and an isolated temporary owner/database. Codex uses a private copy of the existing authenticated profile with ChatGPT subscription billing. Muse uses the explicitly selected `MUSE_API_KEY` through its scoped SDK/MSP adapter. No implicit billing fallback occurs. Set `NGERTIIN_MUSE_EXECUTABLE` to the installed CLI path when it is not on PATH. The report records observed versions and connection billing fields without retaining credentials.

Each harness answers a normal file question whose unique answer is on page 3, beyond the automatic preview. After service/native restart, it locates the previous file and performs list/search/read round trips without a new attachment. The follow-up deliberately requests all three tools to prove the bridge. Assertions check the unique source text, returned page observations, native session continuity and absence of new goals/Routines. Proof services and copied credentials are removed afterward; user state is not the proof database.

Earlier attempts are retained separately: the first run proved the Codex lane but could not discover the Muse CLI on PATH; a subsequent explicit CLI path proved both lanes. Later cohorts rechecked cache recovery changes and English-authored probe prompts. These earlier captures are not substituted for the final report.

## Local runtime

The development backend was restarted on the existing installation after confirming zero active/unknown runs. Shutdown took longer than the initial ten-second wait while connections drained, then the previous process exited. No forced kill was delivered. `local-runtime.json` verifies contract 1.21.0, all three published tools and an identical digest of all 40 user messages and 21 artifacts before/after restart. The original database and credentials were not reset.

The retained verification JSON describes the pre-commit validation snapshot. The user subsequently authorized local commits. No push, deployment, new provider, OCR service or installer change is part of this amendment.

Commit-time whitespace validation excludes only the hash-verified `web-build.log`: its captured Vite reporter banner contains one trailing space. The raw log is preserved byte-for-byte; all other staged paths pass the standard whitespace check.
