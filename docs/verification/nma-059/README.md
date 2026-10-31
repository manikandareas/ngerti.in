# Application, research and visual capability verification

NMA-059 implements Composio Platform integration and capability-aware research/visual input on the existing backend. Initial verification was captured before commit authorization. UI and API-readiness gate NMA-060 remain separate.

The contract is in [apps-research-visual-api.md](../../architecture/apps-research-visual-api.md). [provenance.json](provenance.json) records exact Openbot modules/revision, installed dependencies, Codex declarations, local adaptations, source documentation and upgrade checks. [verification.json](verification.json) contains the denominator summary; [iterations.json](iterations.json) preserves failures and corrections.

## Delivered behavior

- Live Composio toolkit/account discovery, owner-only Connect Links, refresh/reconnect/local revoke and explicit agent/conversation/tool assignment. The installation owner UUID remains the Composio user identity.
- Structured product-tool calls reuse the existing run lease and native agent loop. Persisted sessions pin one account and current tool grant. Final dispatch checks local scope/generation/cancellation and remote account/session binding. Credentials remain server-side; automatic SDK host-file upload and remote sandbox paths are disabled.
- Durable command/effect receipts, safe result/request/log identifiers, exact retry deduplication and unknown-outcome holds. Restart does not replay external operations.
- Codex native live web search/read with public source observations and direct answer links. Model catalog image capability, immutable artifact preprocessing and in-memory native image payloads. Muse and native video remain explicitly unsupported where unimplemented.

## Verification results

| Check | Actual result |
| --- | --- |
| Backend tests | **227/227 pass**, 0 fail/skip, 1378 assertions; 16 tests added. |
| Focused integration/visual tests | **16/16 pass**, 71 assertions. |
| Server lint/typecheck | Pass. |
| Existing process/HTTP regression | Foundation **8/8**, broker **5/5** pass. |
| Final useful native scenarios | Image recognition, source-backed research and Linear provider read all passed through agent API. |
| All retained native attempts | **6 native Codex runs succeeded** as application runs. Scenario acceptance: **3 pass, 3 failed/incomplete**, retained below. |
| Composio application dispatches | **3 = 1 succeeded + 2 unknown**, 0 relabeled outcomes. One invalid wrapper attempt dispatched zero provider operations. |
| Unsupported video | One expected failed application run with `CAPABILITY_UNSUPPORTED`, **zero native inference requests**. |
| Receipt replay/restart | Seven original admission receipts replayed without new runs or app effects. App sessions, effect receipts, source and visual observations remained identical after process restart. |

Native configuration: Codex CLI **0.165.0**, **gpt-6.1-sol**, explicitly selected ChatGPT subscription. No additional model credential/billing fallback. Muse SDK remains 1.4.14, but this ticket does not claim a fresh native Muse provider run or subscription acceptance.

The image cohort read **RAVEN 7146**, a blue square and a yellow-orange triangle from the actual supplied image, without native/product tools. See [visual-input.png](visual-input.png) and [native-image.json](native-image.json). Image receipts retain original/normalized SHA-256 and dimensions.

Native research searched and opened the official Bun SQLite page, explained exception rollback and linked its transaction section. [native-research.json](native-research.json) includes native web-tool observations, exact source URL and answer. [source-validation.json](source-validation.json) records a separate successful fetch and content hash.

The useful app operation was **`LINEAR_GET_CURRENT_USER`**, with Composio log ID **`log_YGVQ9hK9pgtQ`**. It ran via `ngertiin.describe_tools` → `list_apps` → `search_app_tools` → `execute_app_tool`; provider data reached the agent and the answer reported the profile and receipt. [native-application-linear.json](native-application-linear.json) retains the run and result-key summary, excluding the full provider payload.

## Retained failures and limits

1. The first native app scenario used the wrong wrapper field. The native run completed, but no provider tool dispatched. It remains a failed acceptance assertion in [native-application.json](native-application.json).
2. Initial GitHub and Notion dispatches produced unknown acknowledgements without provider results/log IDs: [native-application-retry.json](native-application-retry.json), [native-application-notion.json](native-application-notion.json). Their exact receipts remain unknown; repeated or fresh command IDs cannot bypass the account hold. No replay was performed. The Notion request ID is `dbc1a113-c00c-4e0a-a9d3-22f1a09237b2`.
3. A distinct standalone read-only GitHub rate-limit diagnostic returned HTTP **400/code 4300**, request ID **`bff5c564-5173-4cdd-86aa-bea47ed03d52`**: the live project rejects the per-call `account` selector because multi-account selection is disabled. [account-selector-diagnostic.json](account-selector-diagnostic.json) retains the safe response. Current SDK/reference claims broader support; the implementation instead verifies the session's exact account pin and omits the redundant selector. This later diagnostic does not supply the missing original acknowledgements.
4. Two successful schema-only SDK diagnostic calls are not counted as provider acceptance. Their log IDs are recorded in verification.json. Provider operational logs for the initial request IDs were unavailable; no outcome was inferred from their absence.
5. Unknown-account hold release/reconciliation is not guessed by an endpoint. Investigate its recorded request/log evidence before restoring use. Other connected applications continue independently. This implementation does not prove arbitrary custom MCP hosts, native Muse vision/search, native video, generation/editing, preview, UI, installer or production readiness.

Fixtures cover owner/DM/group isolation, tool allowlists/meta-tool denial, exact account pins and remote drift, grant/revoke/stop at the final asynchronous boundary, expiry/reconnect, concurrent requests, malformed MIME/image bytes, unsupported/unknown model capabilities, safe errors and credential/URL redaction. These results are distinct from the native evidence above. Earlier fixture/type/formatting failures are retained in iterations.json and raw logs.

## Commands and lifecycle

From the repository root, the isolated live service was started with:

```sh
NGERTIIN_STATE_DIR=.dev/nma049-native NGERTIIN_PORT=49959 bun apps/server/src/main.ts
bun scripts/verification/nma059/native.ts provision
bun scripts/verification/nma059/native.ts image
bun scripts/verification/nma059/native.ts research
bun scripts/verification/nma059/native.ts application
bun scripts/verification/nma059/native.ts application-retry
bun scripts/verification/nma059/native.ts application-notion
bun scripts/verification/nma059/native.ts application-linear
bun scripts/verification/nma059/native.ts unsupported
bun scripts/verification/nma059/receipts.ts before
# Stop and restart the task-owned backend process.
bun scripts/verification/nma059/receipts.ts after
bun scripts/verification/nma059/receipts.ts cleanup
bun run --filter @ngertiin/server lint
bun run --filter @ngertiin/server typecheck
bun run test:server
bun scripts/verification/nma047/foundation.ts
bun scripts/verification/nma048/http.ts
```

The native script preserves admitted command/run identities on failure and never automatically submits replacements. App selection was prepared with the owner API using exact discovered tool slugs and a narrow read-only grant. The root project key and Connect Links were never written into tracked evidence. Do not rerun failed phases as a way to replay an unknown effect.

The user authorized Gmail, Google Calendar, Google Drive, Google Sheets, Notion, GitHub and Linear; all seven local connections were verified active. Slack remained unapproved. These accounts belong to the existing **native verification installation `.dev/nma049-native`**, whose owner differs from default `.dev/harness-first`. No account or credential was silently transferred across owners. Proof agent grants were removed after verification; user connections and historical/unknown receipts were retained. No proof goals or Routines were created.

[receipts-before.json](receipts-before.json), [receipts-after.json](receipts-after.json) and [receipts-cleanup.json](receipts-cleanup.json) retain persistence, replay, cleanup and account-state evidence. The final backend/client shutdown and hygiene/credential checks are recorded in verification.json and hygiene.json. Native operations were not rerun for final formatting, test-only SDK injection or the final credential-fragment filter; those final changes have fixture coverage.

## Local commit authorization

On 2026-10-31 the user authorized local commits, including the repository agent skills. Implementation/evidence and the Composio skill installation are committed separately. Only this README and its manifest entry changed during commit preparation; implementation, tests and raw evidence retain their verified bytes. The historical `commit_created: false` fields describe the initial verification capture. Tests and native inference were not rerun for the commit operation. Manifest content, staged blobs, credential exclusion and whitespace are checked before delivery. No push or deployment was requested.
