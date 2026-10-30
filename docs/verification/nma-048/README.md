# NMA-048 broker verification

Verified on 2026-10-30 against baseline `f5640df` (NMA-047 foundation), with [NMA-047](https://app.notion.com/p/409abdd6187381bab741d401c8031f67) Done in live Notion. [NMA-048](https://app.notion.com/p/409abdd618738145ae75fb44fdf47e83) covers the shared broker, version/connection isolation and structured product-tools contracts. This report does not close the native adapters or the API/UI/installation gates.

Implementation: [broker contract](../../architecture/harness-broker-contract.md), [harness modules](../../../apps/server/src/harness), [contract tests](../../../apps/server/tests/harness.test.ts). Machine-readable results are in [verification.json](verification.json); exact upstream source hashes and SDK observations are in [provenance.json](provenance.json).

## Commands and results

Run from the repository root with Bun 1.3.10. Contract tests and process probes use temporary state, leave existing development state and credentials untouched, and remove their temporary directories/processes.

| Command | Result | Evidence |
| --- | --- | --- |
| `bun run --filter @ngertiin/server lint` | Pass, no warnings | [server-lint.log](server-lint.log) |
| `bun run --filter @ngertiin/server typecheck` | Pass | [server-types.log](server-types.log) |
| `bun run test:server` | 58/58 pass, 0 fail, 0 skip, 227 assertions | [server-tests.log](server-tests.log) |
| `bun scripts/verification/nma048/http.ts` | 5/5 pass, 0 fail, 0 skip | [process-http.json](process-http.json) |
| `bun scripts/verification/nma047/foundation.ts` | 8/8 pass, 0 fail, 0 skip | [foundation-regression.log](foundation-regression.log) |
| `bun scripts/verification/nma047/native.ts` | 2/2 pass: Codex handshake + Muse SDK fixture | [native-compatibility.json](native-compatibility.json) |
| `git diff --check` | Pass | No whitespace errors |
| `git diff --exit-code HEAD -- apps/web` | Pass | UI unchanged; UI checks not rerun |

The two existing NMA-047 probe scripts are reused without modifying their source or historical evidence. `http.ts` launches the actual development server twice and checks host detection, the broker schema with zero implicit executors, idempotent explicit connection selection, revocation, persistence and cursor replay after process restart. On this host, the API reports Codex 0.165.0 `supported` and Muse `missing`.

## Acceptance mapping

| Selected criterion | Evidence and boundary |
| --- | --- |
| Supported/too-old/missing executables and a tested minimum | Both version floors, preceding patch versions, prereleases/unknowns, real controlled executables, failed probes, API state projection and refusal before adapter connect. Floors: Codex 0.165.0, Muse 1.4.12. |
| Separate login, discovery and completed inference; distinct auth/billing | Durable independent states, catalog-failure scenario, connection selection schema, native account/auth/billing mismatch rejection. Success observations in these tests are controlled fixtures. |
| Keys used only for selected connections | Ambient keys stripped, native-login does not read a secret, private credential-file checks, two simultaneous key connections on one harness retain separate account/model/key contexts. No native billing claim. |
| Explicit unsupported/unknown capabilities | All capability fields required, manifest defaults unknown, refusal of unknown resume, capability revocation at the final tool boundary. |
| Concurrent identity/process/session/account/model and verified tool scope | Two harnesses/accounts in parallel, two connections on one harness, two agents sharing a connection, separate actual child PIDs/environments, no cross-connection resume, scoped HTTP and direct useful read-tool round trips, private-resource denial and grant/account changes while awaiting initialization/settings. |
| Lifecycle errors, terminal status and secret redaction | Rejection vs unknown, malformed native identity, persisted native run ID, native stop receipt, unconfirmed stop/shutdown/late-completion fencing, request/close deadlines, fragmented UTF-8 diagnostics and text-secret redaction, sanitized errors. |

There are 30 new broker/connection/tool tests plus the 28 foundation tests. Real controlled child/executable tests establish local process behavior; fake harness clients establish the shared lifecycle contract. Neither represents provider acceptance.

## Native evidence and remaining ownership

Codex CLI 0.165.0 completed isolated App Server initialize/initialized without inherited API keys. It did **not** log in, discover a model, complete inference, verify billing or invoke a product tool. The official Muse SDK 1.4.12 completed spawn/initialize/request/close against an explicitly labeled MSP fixture. The Muse CLI is absent, so no native Muse minimum/capability/account/inference result is claimed. Its 1.4.12 policy floor follows the installed SDK README's lockstep release rule and is boundary-tested only.

NMA-049/050 supply native adapters, account setup, actual supported capabilities, model discovery, completed inference and a useful native product-tool round trip. NMA-053 supplies full native recovery/control proof. Domain-specific mutating tool handlers remain with their owning tickets and must use durable receipts/reconcile unknown effects. NMA-060 is still pending; UI and installer were not implemented. The default bootstrap still registers zero native executors and has no Hermes fallback.

## Iteration findings and preservation

An initial concurrency regression run had **20 pass, 1 fail**: two agents opening the same connection raced over its observed login/capability generation. Initialization is now serialized per connection, with parallel native execution preserved. An initial full suite after adding connection entities had **47 pass, 2 fail** from its previous explicit v1.0.0/entity-list assertions; expectations now cover contract v1.1.0 and the connection entity. Final results above supersede these failures. A root-invoked Biome command rejected nested configs; the final workspace lint command passes.

No commit, push, deployment, user-data reset or UI change. The pre-existing user change in AGENTS.md is preserved and excluded from this ticket's responsibility manifest. Historical evidence remains unchanged. `SHA256SUMS` records the final implementation/docs/test/probe/evidence files, excluding itself.
