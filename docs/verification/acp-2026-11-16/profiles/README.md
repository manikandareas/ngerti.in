# ACP profiles, controls and consumer delta — 2026-11-16

Status: partial implementation evidence. The [migration](../../../architecture/acp-harnesses.md) remains In Progress. This capture does not retire the active legacy Codex executor, establish every native profile, or complete rendered web/Tauri acceptance. Initial foundation evidence in the [parent report](../README.md) remains unchanged.

## Source and setup

The [manifest](manifest.json) and compressed [source patch](source.patch.gz) capture Git baseline `8e92fda1c581c8dc363de16a8d3b4870e09ad1f9`, 79 affected working-tree files, SDK **2.7.0** / wire **1**, dependency versions and executable/source SHA-256 values. All hashes were checked before capture, including new files; the [archive receipt](source-archive.json) records a successful apply check against a separate baseline index. Bun is **1.3.10**, macOS ARM64. Installation remains isolated under the verification runtime directory. The snapshot includes later handshake-cache and consumer work; the native completed-turn probe uses one tool call per turn and is not a native multi-call performance benchmark.

Tests use disposable PostgreSQL containers/schemas. SDK child fixtures, HTTP authorization, encrypted provider storage, durable app records and native/provider observations are identified separately. No production records, global CLI accounts, refresh tokens or deployed application were changed.

## Executed checks

| Cohort | Result | Evidence and boundary |
| --- | --- | --- |
| Affected backend regression | **193/193**, 17 files, 1,756 assertions | [Log](regression.log). Lifecycle/broker, nullable-ID steering, form validation/decline/stop, native phases, bounded streaming, progress/compaction/diffs, per-run MCP, Codex/Muse fixtures, HTTP/account isolation and revocation. Native transports here are fixtures. |
| API 2.3.0 delta | **17/17**, 3 files | [Log](api-gate.log), a subset above. Installed authenticated schemas, private encrypted key creation/rotation with preserved provider choice, cross-user denial, response/replay contracts and organization fences. The [export](../../../contracts/2.3.0.json) precedes consumer changes. No inference. |
| Server + web typecheck | Pass | [Log](typecheck.log). |
| Changed consumer files | **30/30** Biome checks | [Log](consumer-check.log). |
| Shared web/Tauri bundle | Pass | [Build log](consumer-build.log). Existing size warnings remain. This is not rendered acceptance. |
| Whole web lint baseline | **1 existing formatting error, 11 warnings** | [Log](consumer-baseline-lint.log). Blocking error: unchanged `public/images/sign-in/provenance.json`; unrelated retained provenance was not reformatted. Changed consumer files pass above. |
| Real adapter setup/catalog/model selection | **5/5 candidates** | [Report](native-setup.json): Codex, Claude, OpenCode and both Pi candidates. Synthetic invalid key only; no inference or useful tools. Provider-key bytes absent from all five private probe trees; zero files skipped. |
| Native Codex subscription | **2/2 turns**, **2/2 useful tool calls**, reload and **2/2 matching native receipt reads** | [Report](native-codex-subscription.json), [log](native-codex-subscription.log). Real provider/shared SDK/HTTP ProductTools with isolated owner-mode app state. A distinct selected subscription lane, not fallback from the API-key failure. |

## Native profile stages

| Profile | Adapter / runtime | Configured key + catalog + new session/model | Inference / useful tool / reload |
| --- | --- | --- | --- |
| Codex | 2.6.0 / independently pinned 0.169.0 | Pass; 9 account-catalog models | Subscription passes two turns, scoped tools and reload. API key fails provider quota. |
| Claude | 0.107.0 / SDK 0.3.323 | Pass with synthetic key; 5 models | **Unverified by owner choice**; no selected project Anthropic key. |
| OpenCode | 1.19.5 | Pass with synthetic key; 83 selected-provider models | Real API-key attempt fails provider quota; no completed inference/tool/reload. |
| Pi upstream | 0.0.34 / SDK/CLI 1.5.2 | Pass with synthetic key; 44 selected-provider models | Unverified. No success inferred from the exhausted project API account. |
| Pi OpenMA | 0.1.8 / SDK 1.5.2 | Pass with synthetic key; 44 selected-provider models | Unverified; a final production candidate has not been selected. |

“Authenticated” in synthetic reports describes local credential configuration, not remote key validity. Catalog discovery is not inference/billing success. Other model-provider bindings are not certified by the OpenAI probe.

## Codex stall and scoped correction

Before correction, the subscription probe reached a real native turn and one MCP tool-call update, then remained running without an app effect through the 120-second observation bound. It was neither claimed successful nor confirmed cancelled. [Observation](attempts/codex-before-scoped-mcp-policy.json), [log](attempts/codex-before-scoped-mcp-policy.log).

The pinned adapter's default MCP approval stopped the call before Ngertiin's grant authority. The deterministic bundle adaptation sets `default_tools_approval_mode="approve"` **only for the server-provisioned `ngertiin` bridge**. This per-server option is verified in the [0.169.0 configuration type](https://github.com/openai/codex/blob/rust-v0.169.0/codex-rs/config/src/mcp_types.rs). Each app call still requires its immutable lease and current grants/protected-operation checks. Other native permissions remain interactive; there is no global approval bypass.

After correction, both requested `read_run_context` calls execute. Explicit reload recalls the first turn's exact marker. Native turn IDs remain dispatch receipts; ACP accepted/terminal turn IDs stay null. Fresh process generations share the authorized session. **105 final-answer chunks** carry the negotiated native phase; commentary stays out of canonical answers. Native receipt reads match published answers exactly. Provider credential bytes are absent from private verification files; zero oversized files skipped.

Observed timing, not a controlled performance comparison:

| Turn | Preparing → ready | Dispatch → accepted | Dispatch → first visible answer | First visible → settled |
| --- | --- | --- | --- | --- |
| First | 2.007 s | 0.494 s | 9.735 s | 0.038 s |
| Reloaded | 1.138 s | 0.383 s | 7.051 s | 0.040 s |

Preparation reuses unused discovery setup; streaming coalesces subsequent snapshots within 40 ms and flushes on terminal/error. A concurrent HTTP fixture proves five calls perform one initialization/notification pair while preserving all five authorizations. No native multi-call or paired UI latency percentage is claimed.

## Retained failures and limits

- API quota: Codex [report](attempts/codex-api-quota.json), [log](attempts/codex-api-quota.log); OpenCode [report](attempts/opencode-api-quota.json), [log](attempts/opencode-api-quota.log). Their early `inference=not_attempted` bookkeeping label is stale for attempted prompts; `turn_1.status=failed` is authoritative. Neither counts as completed inference or a useful tool.
- An expanded owner probe initially asserted an account-mode admitted snapshot. Its [failure](attempts/owner-selection-assertion.json), [log](attempts/owner-selection-assertion.log) is retained. Owner mode uses pinned connection configuration; the corrected probe checks actual provider/effective billing. It is not account-mode isolation evidence.
- Live refresh/expiry, distinct external accounts, native cancellation/steering races, self-stop, native file/research work and the complete research cohort remain open. Fixtures do not substitute for native stages.
- Shared web/Tauri code consumes 2.3.0: five harnesses, explicit providers, key-only choices where supported, nullable-ID steering, typed forms and collapsed progress/previews. Real API browser/native journeys and installation remain unverified here.
- The legacy Codex executor/account implementation remains active in `main.ts` pending cutover/retirement. Muse SDK/MSP is retained. A development bundle is not distribution or production readiness.

Reproduction: use `scripts/verification/nma072/run-tests.ts` with the 17 files named in `regression.log`; run `scripts/verification/acp/profiles.ts` for synthetic setup. Native execution selects `NGERTIIN_ACP_NATIVE=1 NGERTIIN_ACP_NATIVE_PROFILE=codex-subscription` with runner path `../../scripts/verification/acp/native.test.ts`. It reads the retained selected short-lived token only; its existing authority owns renewal. Unknown outcomes do not authorize blind replay or a provider/billing switch.
