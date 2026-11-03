# Brave live use-case audit — 3 November 2026

This is a manual computer-use test of the actual local installation, with real Codex runs. It does not replace the preceding fixture/API/native verification, and it does not establish production or installer acceptance. Application code was not changed during this audit.

Environment: Brave Personal profile, `http://localhost:3001/`, local persistent backend, base commit `dcc4070` plus the existing uncommitted attachment/responsibility work and concurrent user changes. All UI interactions used `mcp__cua_repl`; no standalone Playwright, agent-browser, fixture harness, or API mutation was used. Read-only SQLite observations and local hashes supplement the visible UI evidence.

Test group: **Uji Skripsi · Brave 3 Nov**, thread `3e144112-15f2-4b5c-b58f-7e05d5d4a458`, shared workspace `c7799f79-4a4e-4b01-aab9-853d9a6cb590`. Existing Marketing TIm messages and files were not edited. Existing agents Tobi and Skinny Vicuna were used.

## Real source files

Both files were selected from `/Users/vitoandareasmanik/Documents/skripsi-references/` with Brave's native macOS file picker:

| File | UI entry point | Bytes | Result |
| --- | --- | ---: | --- |
| M-RAG- Reinforcing Large Language Model Performance through Retrieval-Augmented Generation with Multiple Partitions.pdf | Composer → Tambah lampiran → send message | 671,084 | Attached to group message, present in shared Library, read by both agents |
| Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.pdf | Library → Unggah file → Lampirkan ke pesan | 885,323 | Stored in group workspace, reused in a message, read by Skinny |

The extension file-chooser setter initially required additional file-URL permission. No permission was changed. Native macOS selection succeeded instead. A downloaded copy of the first PDF, saved through the native Save dialog as `~/Downloads/ngertiin-brave-live-mrag-source-2026-11-03.pdf`, has the same SHA-256 as the original: `dab74ac8fcf1e7dbb5636b9b6834c086c45a83f321b4e300a845ad5405e0aeab`.

## Observed passes

- A real Indonesian literature-review request created exactly one group-owned goal, with Tobi as coordinator. Tobi published `ringkasan-m-rag.md`; Skinny independently reviewed relevant PDF pages and published `contoh-tutor-rag.md` in the same workspace.
- The review activity showed a concise **Tobi → Skinny Vicuna · Meninjau hasil** row with a friendly summary. The full technical task input was absent from the conversation UI, including after reload while native work continued.
- Both output documents opened successfully in the Library preview. They contain page references, a concrete tutor example, conceptual pseudocode, limits, and explicit statements that the pseudocode was not executed. This audit inspected the rendered documents; it does not independently peer-review every scientific claim.
- The goal became **Selesai**, with both contributors and both evidence files visible. The final coordinator run settled successfully, with no `SCOPE_DENIED`, duplicate goal, reverse handoff, or repeated automatic continuation observed.
- There were three useful public responses for the main request: Tobi's initial result/handoff notice, Skinny's review/example result, and Tobi's synthesis. This request used synthesis; it is not a proof of the separate finalize-only suppression path.
- A second original PDF uploaded through Library was reused in a group message. Skinny answered the one-sentence question correctly: Patrick Lewis, *Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks*, PDF page 1. No new goal or output file was created for that short question.
- Conversation-created Routine records are group-owned and independent of the completed goal. The UI shows automatic selection for one and fixed Tobi execution for the other, with WITA schedules matching their stored UTC times.

## Background execution, membership, and cleanup

The test tab was closed before 09:46 WITA and reopened only after the scheduled work completed. The user's pre-existing Ngertiin tab and unrelated tabs were preserved; this does not claim that every Ngertiin tab or the browser process was closed.

- One durable occurrence was created at `01:46:00.214Z` for the `01:46:00Z` schedule. A selection-only route chose Tobi, admitted one application run, and settled the occurrence at `01:46:24.230Z`.
- The reopened UI showed **3 Nov 2026, 09.46 · Selesai · Tobi — Tidak ada perubahan yang perlu dikabarkan.** No new agent conversation message was published for that run. Its publication is `quiet`, its outcome is successful, and the one-shot has no next due time. See `15-routine-background-completed.jpg` and `.txt`.
- Tobi was then removed through **Kelola anggota** in this test group only. The future fixed-Tobi Routine stayed group-owned and changed to **Menunggu penanggung jawab**. The completed goal, source PDFs, and two output artifacts survived. This is an idle membership-change check, not an in-flight cancellation/revocation race. See `16-member-removed-fixed-routine-waits.*`, `17-completed-goal-survives-member-removal.*`.
- Both test Routine records were stopped through their UI controls. Tobi was restored as a member. The test group and useful outputs are retained for inspection; no test schedule is left active.
- Final read-only verification records **7 succeeded application runs, 0 failed/cancelled/unknown, 0 recorded product-tool errors; 1 completed occurrence; 2 stopped Routine records; 1 completed group goal with 2 evidence artifacts**. Routing model sessions are recorded separately in group routes and are not included in the seven application-run denominator. This is a live scenario result, not seven independent regression test cases. See `final-state.json`.
- All four stored artifact blobs match their metadata hashes. Both uploaded PDFs also match their original source bytes. The two Markdown evidence copies were read from local artifact storage after their UI previews were inspected; those copies do not imply a successful browser download. See `artifact-integrity.json`.

## Findings

1. **High — generated file references cannot be clicked in answers.** Stored responses contain valid `ngertiin://file/<id>` Markdown links, but the visible answer has plain text and no corresponding anchor/button. This reproduces for the first summary, Skinny's example, the coordinator synthesis, and the second PDF citation. Users must discover Library as a workaround. `answer.tsx` passes custom URLs only when `referenceFromUrl` accepts them, but `inline-references.ts` accepts agent/skill references, not file references. `defaultUrlTransform` therefore removes the file URL before `AnswerLink` can resolve the artifact. See `04-output-link-observation.jpg`, `11-library-attachment-answer.txt`; source pointers: `apps/web-client/src/features/conversation/components/answer.tsx:155`, `apps/web-client/src/features/conversation/lib/inline-references.ts:32`.
2. **High — Routine detail renders the complete internal instruction as a large heading.** UUIDs, SHA-256 values, workspace paths, and `ngertiin.routine_no_update` fill the panel; users must scroll substantially to reach schedule, executor, and controls. `PanelPageHeader` receives `routine.instruction` directly at `responsibilities.tsx:160`. A separate concise display title/summary is needed while retaining exact internal execution instructions. See `12-routine-list.jpg`, `13-routine-technical-instruction.jpg` and its accessibility transcript.
3. **Medium — technical coordination text remains in public agent results.** Skinny's otherwise useful review ends with “Bukti artifact untuk Tobi” followed by an artifact UUID. The compact handoff projection works, but final-answer guidance still allows internal evidence identifiers into user prose. Use a readable file reference publicly and deliver identifiers in the internal result packet. See `07-review-result-technical-id.jpg` and `.txt`.
4. **Medium — file details expose raw execution metadata.** The normal Library view shows `Asal: native_output` and a full run UUID under `Pekerjaan`. Prefer readable creator/task context, with technical diagnostics behind explicit disclosure. See `05-artifact-details-technical-metadata.jpg`; `files-panel.tsx:118-123`.
5. **Medium, cause not isolated — repeated duplicate React keys.** Browser logs show repeated duplicate-key errors for the test thread around 01:40:41–01:40:53 UTC. No visible duplicate conversation was established. Retained in `browser-errors.json`; do not infer data duplication from the warning alone.
6. **Low — completion text can become stale immediately after settlement.** The final answer says confirmation is still pending, while the authoritative goal panel already shows Selesai. That prose reflects the pre-settlement report state and is never updated. Prefer outcome-focused prose and the live status chip. See `08-completed-shared-goal.txt`.
7. **Medium — membership changes obscure historical attribution and completed-state semantics.** After removing Tobi, the completed review row changed from Tobi to the generic “Agent”, and the contributor display lost Tobi even though his summary artifact remained. The completed goal also displayed “Menunggu penanggung jawab”; restoring membership did not reassign its cleared coordinator. Preserve readable historical attribution separately from present membership/authorization, and avoid a waiting-for-assignment label for already completed work. See `17-completed-goal-survives-member-removal.*`. No evidence bytes or completion state were lost.

## Incomplete checks and boundaries

- Markdown downloads were attempted through preview and Library controls. The native Save dialogs appeared and were confirmed, but no resulting Markdown file was found in Downloads. Their browser-download outcome remains unverified; opening both rendered documents succeeded. The browser event waiter also timed out while the first PDF was waiting in the native Save dialog; that PDF was subsequently saved and hash-verified.
- Direct navigation to Brave's internal Downloads page was rejected by the browser URL policy. No alternate route into the blocked internal page, security change, or permission expansion was attempted.
- Backend restart, unknown native outcomes, cancellation races, stale membership dispatch, cross-harness billing, and every isolation fault case were not re-executed in this manual audit. Those remain separate earlier test boundaries.

Screenshots and accessibility transcripts capture key visible states. `checkpoint.json` and `final-state.json` are filtered read-only domain observations that exclude dispatch tokens and credential material. The final screenshot `18-final-shared-library.jpg` shows both original PDFs and both outputs after membership restoration. Historical evidence in the parent verification directory is unchanged. No application source, ticket status, commit, or push was changed as part of this audit.
