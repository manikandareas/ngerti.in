# Shared group workspaces and attachments

The user authorized group attachments with one workspace shared by the group's active members. Jev/System One is explicitly excluded: routing continues through a selected member's Codex/Muse model.

## Delivered behavior

- Group workspace ownership is explicit (`scope: group`, null ownership `agent_id`). Native sessions, DM resources, router workspaces, credentials and member temporary directories remain separate. Output artifacts retain `created_by_agent_id` and native run provenance.
- Group attachments use the existing local-until-submit editor, private staging, atomic message/artifact/route publication, IndexedDB recovery and exact receipt reconciliation. File-only messages and existing scoped artifact references are supported. Rejected uploads restore an editable draft; unknown acknowledgements never create a second user message.
- Group file tools validate both the run/member lease and group-owned artifact resource. Current and previous source files, handoffs and continuations use the same immutable source identities. Documents use the existing bounded PDF.js/text extraction and caches; input images follow the selected harness/model capability and normalization path.
- Routing includes group instructions and file metadata, filters visual-input eligibility, and rechecks capability before admitting the responder. Rejected routes can retry against the original message and files. Unknown native routes require receipt reconciliation.
- All current native group turns are conservatively treated as writers and serialized through the application's durable run state. No parallel read-only mode is advertised. Unknown work continues to hold the workspace across restart. Group clients close after their native turn and resume their distinct persistent session later. Owned Codex writer process groups terminate before settlement, including ordinary background descendants; this process test is macOS arm64 evidence, not cross-platform packaging acceptance.
- Removed members also receive cancellation intent for unknown runs. Owner-authorized receipt inspection does not grant a workspace, resume a turn or send a prompt; it can resolve revoked work without publishing revoked output.
- Idle existing group lanes are retained under stable `previous/<workspace-id>` directories with artifact IDs/hashes and contributor provenance preserved. Original directories remain intact. Active/unknown work prevents cutover. Protected names and foreign/DM resources are not imported.
- The group Library panel presents the shared workspace, downloads and artifact reuse. Image eligibility follows a leading mention or the eligible member set. Selecting a valid replacement clears the corrected attachment warning.

Contract: [1.22.0](../../contracts/1.22.0.json). Semantics: [workspace API](../../architecture/workspace-artifact-api.md), [group collaboration API](../../architecture/group-collaboration-api.md).

## Verification and reproduction

The final machine-readable results are in [verification.json](verification.json). Native proof is [native.json](native.json), full real-API browser regression is [browser-full.json](browser-full.json), and the final focused group run is [browser-group-final.json](browser-group-final.json). [local-runtime.json](local-runtime.json) records the existing installation's activation and content preservation. Logs keep their actual attempt results.

Run backend checks from `apps/server`:

```sh
bun test tests
bun run typecheck
bun run lint
bunx tsc --ignoreConfig --noEmit --target ESNext --module Preserve --moduleResolution bundler --lib ESNext,DOM --types bun --strict --skipLibCheck --allowImportingTsExtensions ../../scripts/verification/group-attachments/native.ts
```

Run UI checks from `apps/web-client`:

```sh
bun run build
bun run lint
bun run typecheck
bunx playwright test --config playwright.work.config.ts
bunx playwright test --config playwright.work.config.ts group-attachments.spec.ts
```

From the repository root, `bun --env-file=.env scripts/verification/group-attachments/native.ts` provisions an isolated temporary owner/database and private copy of the existing authenticated Codex profile. Muse uses the explicitly selected `MUSE_API_KEY`; its CLI defaults to `.dev/nma050/muse` and supports `NGERTIIN_MUSE_EXECUTABLE` override. `NGERTIIN_AUTH_SOURCE` can override the source installation. No source credential is returned in the reports. The verifier removes its services, temporary credentials and database afterward.

The final native cohort records every application run: one automatic router, a Muse PDF read beyond the automatic preview, a different member's list/search/read after restart, a Codex-to-Muse review plus parent continuation, and a Codex image answer. Assertions bind exact pages, unique source text, shared workspace identity, native session continuity, normalized visual input, original-send replay and zero new goals/Routines. Codex uses ChatGPT subscription billing and Muse uses an explicit API key. No silent billing fallback occurs.

Browser tests use the actual application HTTP/domain/storage/tool/broker paths with a deterministic external harness boundary. They are separate from live model evidence. The final focused group run covers the small corrected-warning UI refinement after the full regression run.

## Retained iterations

- Initial backend regression: only three version assertions still expected 1.21.0; they were advanced with the published 1.22.0 contract. A group cycle test was updated to finish the parent turn before taking the shared writer workspace.
- The first live cohort found a genuine resource-authorization gap: group files were listed but attachment read/search still required an agent-owned artifact. This was repaired in the tool resource check and tested through an actual product-tool lease before native re-verification.
- A second verifier setup pre-opened unused member sessions and timed out on a later follow-up. Normal lazy session creation was then exercised successfully; the timeout's independent root cause is not claimed as established.
- A native verifier import-path error occurred before any new native run; the script now resolves the repository's existing server dependency directly.
- The initial browser group run passed eight cases and failed two assertions that expected routing to be selected immediately after its retry receipt. Routing was legitimately pending. The assertions now wait for the authoritative selected projection.
- Additional revoke/recovery coverage found that membership changes did not record cancellation intent on unknown removed-member runs. Unknown work stays held; explicit intent now allows a confirmed cancelled receipt to release it without granting revoked resource access.
- The shared-process shutdown test exposed a two-signal exit race. A settled shared writer's owned process group is now terminated together before lease release; the descendant test passes.

## Proof boundaries

The shared native filesystem contains current group working files, not a point-in-time snapshot. Attachment tools use immutable source blobs and the input-message visibility cutoff. Workspace writes are serialized; simultaneous native writers are not supported. OCR, new document parsers, Jev, additional runtimes, installer, deployment and production acceptance are outside this amendment.

Earlier evidence under `attachments`, NMA-054, NMA-056 and NMA-060 retains its original scope and bytes. The unrelated authentication-library research file and concurrent agent/model settings edits are preserved and excluded from this amendment's responsibility manifest. Recorded cohorts do not claim acceptance of those concurrent edits. `workspace-layout.tsx` contains both attachment integration and independent settings-navigation hunks; its manifest entry hashes the full coexistence snapshot, not exclusive authorship. No commit or push is part of this delivery.
