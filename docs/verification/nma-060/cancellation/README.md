# Agent-selected cancellation

The user approved replacing deterministic cancellation-language recognition with native-agent decisions and scoped tools on 2026-10-31. This amendment supersedes the original C07 conversational recognizer described in NMA-053 and the initial NMA-060 capture. NMA-060 remains **In Progress / API gate pending**; the selected cancellation change is implemented and verified.

## Delivered behavior

- `RunControls.send` always admits the original user input to the ordinary FIFO queue. The `cancellationIntent` regex function is removed. New admission returns `control: null`; historical command receipts retain their original shape.
- The native agent interprets chat and steering context. `ngertiin.cancel_run({command_id})` selects only the calling run through its server-issued lease. Target-ID injection, forged scope and revoked connections cannot cancel another run. Existing goal/Routine tools retain explicit IDs/revisions.
- Stop intent and the command receipt commit in the existing SQLite transaction. The self-stopping call may return its receipt; further tool use through that lease is denied. Cancellation does not pause goals/Routine, invent native confirmation or replay unknown effects.
- The existing explicit HTTP cancel endpoint bypasses a stalled agent and ordinary queue. Tool-selected stop is observed by the background lifecycle's wake loop; steering acknowledgement does not guarantee immediate model processing. No new UI button, classifier model or approval step is added.
- Agent instructions, application contract **1.12.0**, the [consumer guide](../../../architecture/api-consumer-contract.md), [control guide](../../../architecture/conversation-control-api.md), [schema bundle](../../../contracts/1.12.0.json), [consumer fixtures](consumer-fixtures.json) and [coverage](coverage.json) describe the new behavior. The original 1.11.0 bundle and prior raw evidence remain unchanged.

## Verification

| Evidence level | Actual result |
| --- | --- |
| Backend regression suite | **234/234 pass**, 0 fail/skip, 1431 assertions. [Log](logs/tests.log). |
| Final focused controls/adapter fixtures | **15/15 pass**, 140 assertions. The final test-language change and explicit fixture null guard were rechecked. |
| Lint / server and verifier typecheck | Pass, server lint has no warnings. |
| Consumer HTTP/SSE | **6/6 pass**, 77 routes, 26 entity schemas, 36 product tools. [Report](consumer.json). |
| Process/HTTP and broker regression | **8/8** and **5/5** pass. The faults are synthetic process/protocol tests. |
| Native Codex | **1/1 run cancelled, native confirmation**. An ordinary native shell check was active when the owner sent cancellation wording through steer. The native agent chose `ngertiin.cancel_run`; original admission retry added no run/events. [Report](native-codex.json). |
| Native Muse | **1/1 run cancelled, native confirmation**. The native agent interpreted cancellation wording in its ordinary prompt and chose `ngertiin.cancel_run`. Original admission retry added no run/events. [Report](native-muse.json). This does not claim native Muse steering. |
| Retained evidence/schema integrity | **341/341** original evidence files match ten prerequisite manifests. Read-only validation accepts **2097 events** across all 26 kinds and **461 entities**. Both earlier Composio unknown effects remain unknown. [Report](retained.json). |

Native configuration: Codex CLI **0.166.0**, `gpt-6.1-sol`, explicit existing ChatGPT subscription; Muse CLI **1.4.14-R7309.1**, SDK **1.4.14**, `muse-spark-1.3`, explicitly selected API-key/developer credits. [Provisioning](native-provision.json) records independent billing/catalog observations. There are **two native requests total**, both terminal cancelled/confirmed, no failed/skipped/unknown runs in this cohort and no billing fallback. Muse subscription/permission acceptance remains on NMA-050.

The native prompts contain an Indonesian simulated user cancellation stimulus. Agent/backend instructions remain English. The Codex/Muse admission-to-settlement observations were **11153 ms / 9334 ms**; they include model/tool orchestration and are two examples, not a cancellation-latency guarantee. Native tool processing and steering can be delayed. Muse steering remains `unknown` and is rejected by the existing capability gate.

[iterations.json](iterations.json) preserves the pre-change failing regression and intermediate type/format corrections. [verification.json](verification.json) separates current checks, native outcomes and the still-pending API gate. Existing public source pins/dependencies and upstream-boundary reasoning remain in [parent provenance](../provenance.json); this change reuses `Lifecycle.cancel` and existing product-tool leases/native bridges without adding a provider loop, SDK, lifecycle authority or migration.

## Reproduction and cleanup

```sh
bun run test:server
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun scripts/verification/nma060/consumer.ts
bun scripts/verification/nma060/coverage.ts
bun scripts/verification/nma060/retained.ts
bun run verify:foundation
bun scripts/verification/nma048/http.ts
```

The native service used the existing private verification installation, preserving its owner and subscription connection:

```sh
PATH="$PWD/.dev/nma050:$PATH" NGERTIIN_STATE_DIR=.dev/nma049-native \
  NGERTIIN_PORT=49959 bun apps/server/src/main.ts
bun scripts/verification/nma060/cancellation-native.ts provision
bun scripts/verification/nma060/cancellation-native.ts codex
bun scripts/verification/nma060/cancellation-native.ts muse
bun scripts/verification/nma060/cancellation-native.ts cleanup
```

The proof script persists original admission/steering keys privately before dispatch and does not submit replacement runs on failure. Existing provisioned state refuses reprovisioning; do not rerun it as a fresh cohort. Later rechecks use original private payloads and keys, preserving what was actually submitted. [Cleanup](native-cleanup.json) records two terminal proof runs, zero proof goals/Routines, revocation of only the new Muse connection and deletion of only its generated credential copy. The original subscription connection and the exact two historical unknown application effects were verified unchanged in state/fingerprint. The server and native clients were shut down after the probe.

No UI change, user-data reset, external message, commit, push or deployment was performed. This change does not close NMA-050 or the overall NMA-060 readiness gate.
