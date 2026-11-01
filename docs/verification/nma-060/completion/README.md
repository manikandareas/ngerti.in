# Engine/API completion work — 2026-11-01

**Status: In Progress; API readiness remains pending.** This work completes the operation-response review and obsolete-runtime removal, but does not close native interaction/permission acceptance or the complete native/fault gate. UI, installation and production remain outside this result.

## Changes

- Publish contract **1.14.0** with reviewed responses for all **82 routes**: 69 inline JSON schemas, eight document/core-projection references, and five explicit SSE/bytes/MCP transport entries. Adding an unreviewed route fails contract export. Schemas reuse the persistence entity registry; historical defaulted fields remain readable.
- Add projections for creation/opening, goal progress, memory/skills, files, native login/interactions, app catalog/authorization/search and browser observation/VNC. Response references and native boundaries are documented in the [consumer guide](../../../architecture/api-consumer-contract.md).
- Fix an actual consumer defect: querying an unbound workspace now returns JSON `null`, rather than an empty 200 body that fails JSON parsing.
- Native interaction answers return only `{ "status": "submitted" }` after adapter acknowledgement. They do not expose arbitrary provider return objects or claim an approved action completed. Pending-stage/choice validation and dispatch fences remain intact. Fixture question/approval tests assert this acknowledgement.
- Record Codex 0.166.0 as the tested native version, retaining the 0.165.0 minimum. Muse CLI 1.4.14-R7309.1 / SDK 1.4.14 uses explicit API-key billing; Codex uses ChatGPT subscription.
- Remove **310** tracked obsolete Python/Hermes source, tests, migrations, dependency locks, build recipes, legacy Compose definitions and launch/operations scripts. Each removed byte was first compared with baseline `80f66b9786d7776138fbe001b26ef068f1132624`, archived and verified. [retirement.json](retirement.json) lists every path/hash and the local archive hash. No untracked files, databases, credentials, Docker resources or historical evidence were deleted. Provenance/license notices remain. Historical scripts must run in a separate checkout of the recorded revision; no old runtime fallback is retained.

## Verification

| Check | Result and limit |
| --- | --- |
| Backend suite | 243/243 passed, 0 failed/skipped, 1591 assertions in the final captured run across 22 files. Polling assertions may vary between runs. |
| Server lint/typecheck | Passed. |
| Verification-script strict typecheck | Consumer, coverage, retained, native and interaction-native scripts passed with TypeScript `--ignoreConfig --strict --noEmit`. |
| Consumer HTTP/SSE/restart | 6/6 passed; [consumer.json](consumer.json), [examples](consumer-fixtures.json). |
| Additional response regression | Validates 24 real operation responses, including null workspace, creation, memory/skills, groups, run controls and entity union; also rejects an unreviewed GET. Included in backend total. |
| Foundation process/HTTP | 8/8 passed, including controlled SIGKILL/recovery; provider behavior is fixture evidence, not a real provider crash. |
| Broker HTTP | 5/5 passed. Default PATH lacks Muse; actual native verification uses the explicitly installed binary. |
| Requirement coverage | 47/47 original backend requirements; current NMA-065 amendment routes/tools/events/tests validated against 1.14.0 and included separately in [coverage.json](coverage.json). |
| Retained evidence | 355/355 immutable files from 11 prerequisite manifests verified. Moved/removed historical source references are reported separately, not treated as missing evidence or silently passed. |
| Historical database schema | All persisted events/entities validate read-only against runtime and published schemas; current counts in [retained.json](retained.json). Two historical Composio effects remain unknown; no replay/reconciliation was attempted. |
| Active imports | [imports.json](imports.json): relative TypeScript graph from the real server entry, zero old-runtime imports. Dynamic/native dependencies are outside this static graph. |

## Native cohort and failed probe

[Six-run cohort](native-verified.json): **6/6 succeeded**, zero run failures/skips/unknowns. For each harness, one DM opener performs actual scoped profile read/update and returns 3151; one native router plus one selected group response updates shared configuration and returns 323. Both groups contain **both Codex and Muse agents**, with the requested agent responding and one published group answer. Global profiles remain unchanged by group updates; no goals/Routine are created. Admission replay and service restart preserve identities, run counts and event cursors. Native group/DM evidence is [native.json](native.json).

A separate Muse native-question probe adds **one succeeded native run but one failed acceptance case**: no native `request_user_input` event was observed, so there was no HTTP answer/acknowledgement round trip. The model attempted the scoped group question tool from a DM and reported `SCOPE_DENIED`; its prose is not evidence that a native permission interaction occurred. [interaction-native.json](interaction-native.json) records this failure. Overall planned native cases: **7; 6 pass, 1 fail, 0 skip, 0 unknown**. Native terminal run counts: seven succeeded. Native permission-approval cycles proven by this work: **zero**.

The six DM/group runs preceded the workspace-null response fix and tested-version metadata refresh. Post-change restart/readback and fixture regression cover those final changes; the failed question probe ran after restart. This is not a complete final frozen-build gate cohort. Browser/VNC, Composio, goals/Routine, cancellation and modality evidence remain at their prerequisite/native reports, with their original outcomes and limits. No new complete native fault/privacy/permission cohort is claimed.

The proof Muse connection was revoked and only its newly copied credential removed. The original ChatGPT connection and historical unknown effects remain. The verifier-owned service and native clients were stopped.

## Remaining gate conditions

1. Resolve NMA-050's native interactive permission-decision acceptance. Current adapter launch uses the empty preset and disables native shell/write; this review does not loosen those boundaries or infer capability from agent prose. The failed question probe requires investigation against that actual configuration. Fixture stage/choice/revoke checks are not native permission proof.
2. Complete the remaining gate-wide native integration/fault acceptance on the selected final build, preserving every failed/unknown outcome. The seven-case cohort above is partial coverage.
3. Recheck all acceptance/dependencies before changing readiness or status. Live prerequisite review found 10/11 Done, with NMA-050 In Progress and NMA-065 Done. Muse subscription is **not** a gate blocker under the explicit billing amendment; its unverified status remains separate.

## Reproduction and iterations

Run `bun run test:server`, server lint/typecheck, `bun run verify:foundation`, `bun scripts/verification/nma048/http.ts`, and the `nma060/consumer.ts`, `coverage.ts`, `retained.ts` scripts. New outputs go to this directory; immutable earlier captures remain unchanged. The native scripts retain command identities in `.dev/nma060-final-proof.json` and `.dev/nma060-interaction-proof.json`. They are cohort records, not safe instructions to reprovision or replay revoked/unknown work. Provisioning requires explicitly selected credentials; do not reuse cleaned-up proof connections.

Intermediate failures were resolved before the final checks: schema construction initially accessed a discriminated-union/default wrapper incorrectly; the new HTTP regression exposed the empty workspace response and initially supplied an invalid workspace field; its schema guard needed TypeScript narrowing; verifier typecheck needed `--ignoreConfig`; retained-source lookup initially failed on a previously moved file and now reports source drift separately while still failing on missing immutable evidence. The separate native-question acceptance failure remains unresolved and visible.

No commit, push, deployment or UI work was performed.
