# Applications, web research and visual input API

Application integration introduced in contract **1.10.0**, with catalog metadata added in **1.32.0**; harness broker **1.5.0**. This is a backend contract; API readiness, UI and installation remain separate gates.

Composio Platform uses `COMPOSIO_API_KEY` from the root environment. The existing installation owner UUID is the remote Composio user ID. Neither this key nor Composio session credentials reach native process environments, prompts, tool results or workspaces. The SDK is pinned to `@composio/core` 0.27.0; its client uses REST API v3.1. No additional model framework or agent loop is involved.

## Account and tool configuration

All management routes require the private installation bearer, including when a native run has a valid tool lease.

| Route | Behavior |
| --- | --- |
| `GET /v1/apps/catalog?search=…&cursor=…` | Paginated live toolkit discovery, with logo/description/website, categories, action/trigger counts, no-auth state and metadata completeness. Accepts any provider-discovered toolkit, without a fixed app list. |
| `GET /v1/apps/connections` | Local account projections and explicit grants. |
| `POST /v1/apps/connect` | `{ "toolkit": "<discovered slug>" }`; returns an owner-only Connect Link and pending local connection. Complete OAuth on Composio's page. |
| `POST /v1/apps/connections/:id/refresh` | Rechecks that the account belongs to this installation owner, its toolkit and active state. No body fields. |
| `POST /v1/apps/connections/:id/reconnect` | Creates a new Connect Link for the same local connection and toolkit, increments the generation and marks it pending. Old sessions cannot dispatch. |
| `POST /v1/apps/connections/:id/assign` | Idempotency-Key plus expected revision and explicit grants. Replacing grants increments generation. |
| `POST /v1/apps/connections/:id/revoke` | Idempotency-Key; revokes local application access immediately. Does not claim to revoke the upstream OAuth token or undo previous effects. |
| `POST /v1/apps/search` | Owner discovery using `{ connection_id, query }`; returns original descriptions and complete input schemas. |

The 1.32.0 catalog keeps `slug`, `name`, `connected` and `cursor`, and adds optional item fields `logo`, `description`, `website`, `categories: [{slug,name}]`, `tools_count`, `triggers_count`, `no_auth`, plus optional page `metadata_complete`. Connected provider accounts do not by themselves establish local installation or grant agent access.

Discovery uses SDK 0.27.0 `session.toolkits` with a maximum page size of 50 and omits empty `search` values: the live v3.1 service rejects `search=""` and page limits above 50 with HTTP 400. One bulk `toolkits.getMany` call enriches each page; if enrichment fails, provider discovery/logo data still appears and `metadata_complete` is false. HTTPS asset/website URLs reject embedded credentials. SDK sessions are deleted after each page. The renderer drains pages automatically, retains partial results for retry, deduplicates by toolkit slug and bounds cursor loops. Its current browser resource stages provider pages, publishes each settled attempt atomically, shares one in-flight load across screen navigation and persists public metadata in a versioned IndexedDB cache for seven days. Stale metadata under thirty days old remains visible during background revalidation; failed refreshes preserve the complete retained catalog. Storage restrictions fall back to discovery. Connection/account/grant state and the provider connected flag never enter this cache. Near-viewport sections/category batches mount together with reserved offscreen space; logo loading has no global reveal barrier. Local connection/account status stays separate and uncached, refreshing on relevant app-connection events, local mutations, foreground/online return and visible thirty-second reconciliation. Unrelated conversation cursors do not invalidate it. Grouping uses provider categories with Title Case labels and six-item previews. A heading opens a URL-backed full category page; both category membership and search include secondary categories. The `category` parameter belongs to the client page URL, not this API endpoint. Contract 1.32.0 is unchanged by this presentation amendment. Loading is skeleton-only, errors appear as toasts with Retry, and runtime vendor icons use provider URLs exclusively. [Focused verification](../verification/marketplace-screen-2026-11-11/catalog-and-authorization/README.md) separates live catalog reads from fixture authorization and native browser handoff tests.

An assignment body is:

```json
{
  "expected_revision": 3,
  "grants": [{
    "agent_id": "<agent UUID>",
    "thread_id": "<conversation UUID>",
    "tools": ["<provider-discovered tool slug>"]
  }]
}
```

DM and group grants are separate. Account connection alone grants no agent execution. The agent's existing structured bridge exposes `ngertiin.list_apps`, `ngertiin.search_app_tools` and `ngertiin.execute_app_tool`. Call `ngertiin.describe_tools` for their exact wrapper schemas. Execution takes `command_id`, `connection_id`, **`tool`**, and `arguments`; a downstream provider schema is not the wrapper schema. Invalid input returns an actionable safe validation code.

Sessions persist per connection, agent, thread and grant generation. Their toolkit/tool filters and one `connectedAccounts` pin derive from current grants. Search normalizes the provider's uppercase toolkit names and only exposes complete schemas; search the exact tool to expand other results. Owner discovery does not grant the returned tools. Agent meta tools, remote workbench/bash, automatic local file upload/download and Instant account routing are disabled on this path. These restrictions preserve the existing product resource boundary and selected account.

Immediately before dispatch, the application rechecks the run lease, cancellation and responsibility fence, membership, grant generation and tool assignment after asynchronous reads. Remote account discovery uses the current owner. The host reattaches the persisted session and verifies that exactly one remote account remains pinned before executing. The per-call `account` selector is intentionally omitted: this live project rejects it with HTTP 400/code 4300 despite wider support in the current SDK reference. No project setting or billing source is changed as a fallback.

## Effects and recovery

`app_effect` stores the stable command identity, account/run scope, argument fingerprint, generation and `dispatched` state before invoking the SDK. It retains sanitized result data, safe error/request IDs and Composio log ID. Raw arguments, connection credential objects and SDK exception bodies are not persisted. Inspect receipts using authenticated `GET /v1/entities/app_effect`.

Exact retries return the existing receipt. Changed input conflicts. Concurrent operations serialize per external account. An unknown/dispatched effect holds that account, including across reconnect and backend restart; changing command IDs does not bypass it. Restart converts an unacknowledged `dispatched` effect to `unknown`. There is no automatic replay or speculative success. A distinct application's account can continue independently.

The SDK disables execution transport retries. The host bounds acknowledgement waiting to 25 seconds. The exported SDK Session facade lacks the concrete method's request-options overload, so a deadline does not claim that native execution was cancelled; late effects remain possible and unknown receipts remain held. Stop/grant changes fence new dispatches and suppress late results, while durable receipts preserve known outcomes.

Unknown effects currently require investigation using the recorded request/log ID; there is no API that guesses their outcome or releases the hold. The two initial GitHub/Notion verification outcomes remain unknown, with no repeat. A later diagnostic read established the account-selector rejection, but was not used to relabel missing original acknowledgements.

## Research and modality capabilities

Codex 0.165.0 uses native `web_search=live`; the routing-only lane keeps it disabled. Completed native `webSearch` items become native-tool observations. Open/find actions with public credential-free HTTP(S) URLs produce bounded `run.sources` records. The native harness is instructed to open sources and include direct supporting Markdown links in the answer. These observations prove a native read, not an independent guarantee that every generated claim is correct. No legacy engine or additional paid search/model fallback is selected.

| Adapter | Web search/read | Image input | Video input |
| --- | --- | --- | --- |
| Codex App Server | Supported on the tested adapter | Supported only if the selected model catalog advertises `image` | Unsupported |
| Muse scoped SDK/MSP adapter | Unsupported native capabilities; separately granted browser tools remain available | Unsupported in this adapter | Unsupported |

Model discovery exposes optional `input_modalities`. Missing metadata means unknown for image admission, not inferred support. An unsupported/unknown modality fails before inference, with `CAPABILITY_UNSUPPORTED` or `CAPABILITY_UNKNOWN`. Ordinary text/CSV attachments retain the existing scoped file path.

Visual input uses immutable, hash-checked artifacts from the run workspace. Sharp 0.35.5 decodes PNG/JPEG/WebP, checks declared type, rejects multiple frames and inputs above 40 million pixels, applies orientation, strips metadata and scales within 2048×2048. At most four images are supplied, each limited to 6 MB normalized PNG. The in-memory image data URL uses Codex's native `image` input contract. `run.visual_inputs` records only source/normalized hashes, dimensions and artifact identity. Transformed bytes and credentials are not written into a free workspace. Video is explicitly rejected rather than silently converted into still frames.

Generation/editing, document generation, previews, custom MCP host registration, UI and installation are outside this change.

## Evidence and environment identity

See [verification](../verification/nma-059/README.md) and [source provenance](../verification/nma-059/provenance.json). The live connections created for verification belong to the pre-existing native-test installation `.dev/nma049-native`. Its owner differs from the default `.dev/harness-first` installation. They are retained there without copying or silently sharing account credentials into another owner. Start that state explicitly to inspect them; normal installations connect their own accounts through the same API.

The owner-requested performance refinement and its cache expiry/failure, bounded rendering, complete-category search and live connection-event checks are recorded in [performance/cache verification](../verification/marketplace-screen-2026-11-11/performance-cache/README.md). Earlier catalog/category evidence retains its original source cohort.
