# Native capabilities, plugins and advanced model routing

Implementation and acceptance record for [NMA-030](https://app.notion.com/p/404abdd6187381509cbfd08486cde81f), 2026-10-26. The live parent specification, both ordered units and Depends on were read before implementation. NMA-029, NMA-008 and NMA-040 were Done. NMA-040's explicit exception for real OpenCode Zen/Go testing is retained; this delivery does not extend that claim.

## Delivered behavior

The gateway resolves configured capability bundles from the pinned Hermes registry, including installed plugins, native schema fingerprints, dependencies and execution prerequisites. The previous three-toolset resolver restriction is removed. Installing a compatible native toolset and adding a catalog entry requires no new resolver branch. Catalog availability and an agent's grant are separate; installing an image or plugin grants nothing to existing agents.

Agent configuration now accepts optional `inference.version: 1`: generation parameters, ordered fallback models, auxiliary compression/vision/review selections, OpenRouter provider ranking, compatible credential pools and native Mixture-of-Agents. All routes use the owner-local connection/model IDs from NMA-040. Credentials stay in the connection vault, which retains the single refresh writer. Hermes owns retry, provider failover, pool selection, MoA, execution and recovery.

The Agents editor exposes progressive model controls, ordered fallbacks, auxiliary choices, ranking, pool strategy and MoA references. Missing selections remain visible and removable. Unready tools explain their prerequisite and cannot be newly granted. Validation errors identify the field and repair reason. Native MoA is a model route returning through one acting agent, separate from persistent product groups.

## Exact source and deployment boundary

- Hermes: `7489b22af47ce91b366dde81d5831ea422577498`, MIT; archive SHA-256 `8bb5bc691b509caa847b4e388258be2adec297f06b1ee01f56c9a742eb043d95`; gateway Python 3.14.9. [runtime-pin.json](../../apps/engine/src/ngertiin_engine/runtime-pin.json) records the added native registry/plugin/model seams and source hashes. `source_patches` remains empty.
- Gateway inference dependencies are unchanged. Existing packaging exclusions and notices in [engine provenance](../../apps/engine/notices/provenance.json) remain in force.
- Powerful native handlers execute in a dedicated Linux capsule, using the already verified [NMA-028 packaging profile](nma-028-packaging-resolution.md) and [isolation recipe](../../scripts/spikes/nma028/isolation.Dockerfile). Browser Harness is `0.1.13+ngertiin.localcdp.1`: native modules/resources and its original MIT notice are retained. Hosted Fetch/fetch-use is excluded; no missing notice is invented. [NMA-028 closure](nma-028-native-contract-closure.md) records dependency/notice verification.
- [native-image.json](evidence/nma-030/native-image.json) records the exact tested image, base and worker hashes. The image is immutable in the catalog, and the gateway verifies its protocol/Hermes labels. Registry tools retain native names, argument schemas and results. Filesystem/process isolation supplies the boundary.
- Capsules have separate scope-labelled volumes, UID 10001, read-only image, bounded resources, no network/capabilities, and no host paths, Docker socket or provider credentials. Only an Ed25519 public verifier enters the capsule. The supervisor signs short-lived, scope-bound requests; stale/forged RPC is denied. Browser CDP is local to the capsule. Network-dependent browser/provider variants require their separately verified deployment configuration; enabling an image does not claim every native tool or provider is ready.
- Operator-reviewed plugins run as trusted gateway extensions. They are executable deployment code, not arbitrary model-installed packages. Untrusted/model-written shell and browser Python belongs inside the capsule. Plugins cannot register external channels/platform handlers through this integration.

The production native supervisor is adopted from NMA-028's proven isolation boundary; it is a tool actuator, not another agent runtime. Durable native operation receipts distinguish dispatching/completed/rejected/indeterminate results. Cancellation fences/kills the active capsule and retains unknown outcomes. Restart never automatically replays an indeterminate mutation.

## Capability catalog and upgrade procedure

Use [the versioned example](../../apps/engine/config/capabilities-v2.example.json) as a reviewed deployment template. `new_agent_template` documents version 1's conservative tasks/files grant set; apply it explicitly through the existing `NMA_DEFAULT_GRANTS` provisioning setting. Catalog template metadata does not reconfigure agents on login.

Each `tool_grants` entry has `enabled`, `toolset`, optional `requires`, `execution_surface` and a pinned `plugin` selection. The public catalog returns `installed`, `configured`, `runtime_ready`, `reason`, native tools and schema fingerprints. `granted` is derived from the selected agent's persisted grants. Dependencies must be granted explicitly; browser can declare a terminal dependency. Cycles, missing configuration, secret-bearing schemas and unavailable execution images fail closed.

The built-in product task/files/computer integrations retain their existing scope boundaries. Other bundles require a configured execution surface: `scoped_linux` with an installed immutable image, or `trusted_plugin` with a selected, reviewed plugin pin. `all`, wildcard and external send-message bundles are excluded. This is capability authorization, with no new approval or initiative policy.

Build the optional native image from the exact verified NMA-028 base:

```sh
docker image inspect ngertiin-native-base:b81f1bf356adb3f4c --format '{{.Id}}'
# Require sha256:b81f1bf356adb3f4cff012b2b95d95c6458b5ba876c1e886a59a24a82e574ebd.
docker build -f apps/engine/native-tools.Dockerfile -t ngertiin-native-tools:local .
docker image inspect ngertiin-native-tools:local --format '{{.Id}}'
```

Record the resulting immutable ID in the catalog; set the selected surface `ready: true` and enable only reviewed bundles. On another host, build/verify the base through NMA-028's locked recipe and notice checks first. Never substitute a floating tag for an image ID in an agent execution catalog.

Existing persisted grants are not rewritten. For the unchanged original product bundles, the resolver recognizes the historical stored fingerprint even after a catalog version upgrade. It checks the exact historical tool names, absence of added dependencies/plugins and unchanged execution boundary. New version-2 grants receive the complete native fingerprint. A changed surface, toolset, plugin pin or modern schema fingerprint requires explicit reconfiguration; it cannot silently widen an old grant. [The catalog upgrade regression](../../apps/engine/tests/test_catalog_upgrade.py) exercises use, restart, byte-identical stored config and refusal after a surface change.

Dispatch authorization applies at both model dispatch and final native registry dispatch, covering deferred `tool_call`, programmatic/nested calls and inherited scoped work. Native MCP uses its existing session-local discovery/auth path. Revoking a grant or disabling its catalog entry fences new effects and secrets; an admitted snapshot is not permission to ignore live revocation. Schema refresh is checked before storage/execution, including after restart.

## Plugin operations

Use the same pinned runtime interpreter/environment as the gateway, with `HERMES_HOME` set to the private partition. Review executable code, provenance, license and dependencies before installation:

```sh
python -m ngertiin_engine.plugins inspect /reviewed/plugin
python -m ngertiin_engine.plugins install /reviewed/plugin --sha256 REVIEWED_DIRECTORY_DIGEST
python -m ngertiin_engine.plugins enable plugin-name
```

The manifest requires name, version and license. Python dependencies must be exactly pinned and already provisioned. Symlinks, unprovisioned external dependencies and excluded plugin kinds/platforms are refused. Keep the returned `{id, version, sha256}` in the capability's `plugin` field. Configure a reviewed `trusted_plugin` execution surface and grant the bundle through the Agents API/UI.

For update/disable: disable the live catalog entry first, stop ingress, settle or explicitly cancel existing work, stop the gateway, and verify no nonterminal native admissions remain. An existing socket or nonterminal admission makes installation/configuration fail with `PLUGIN_UPDATE_REQUIRES_DRAINED_GATEWAY`. Remove a stale socket only after proving its process is stopped. Install the reviewed new digest or run `python -m ngertiin_engine.plugins disable plugin-name`; update catalog pins and affected agent configurations explicitly, then restart and verify discovery. Previous plugin bytes are archived under `plugin-archive` for external rollback. No plugin hot-swap mutates admitted runs. Native hooks/middleware/events use the same per-agent authority; final dispatch guards remain necessary because this upstream pin fails open after some middleware errors.

## Inference contract

An illustrative persistent agent configuration extension (IDs are owner-local catalog selections):

```json
{
  "inference": {
    "version": 1,
    "parameters": {"temperature": 0.4, "max_tokens": 2048},
    "fallback_models": ["CONNECTION_B:MODEL"],
    "auxiliary": {
      "compression": {"model": "CONNECTION_C:MODEL"},
      "vision": {"model": "CONNECTION_D:MODEL"},
      "review": {"model": "CONNECTION_E:MODEL", "fallback_models": ["CONNECTION_F:MODEL"]}
    },
    "moa": {"references": ["CONNECTION_G:MODEL"], "fanout": "user_turn", "reference_timeout": 120}
  }
}
```

Parameters must be supported by every selected primary fallback transport. Chat Completions supports sampling, penalties, `seed`, `max_tokens`, `reasoning_effort`, `service_tier`; Responses supports sampling, `max_output_tokens`, `reasoning`, `service_tier`; Messages supports sampling, `top_k`, `max_tokens`, `thinking`. Typed/range/combination validation rejects unsupported fields. ChatGPT plan sampling uses provider defaults; conflicting explicit sampling is rejected. Thinking requires compatible token budgets and cannot combine with sampling. Model-specific remote rejection remains a provider diagnostic; the adapter never silently drops a field.

`provider_routing` supports native OpenRouter `only`, `ignore`, `order`, `sort`, `require_parameters`, `data_collection`. It is rejected on other primary providers and reaches OpenRouter unchanged through the scoped transport.

`credential_pool: {"models": ["CONNECTION:MODEL"], "strategy": "fill_first"}` selects native `fill_first`, `round_robin` or `random`. Members must share provider, model, transport and endpoint. The primary is included once. Pool entries use signed run-bound relay tokens, with a shared route address and per-token connection binding; no provider credential is persisted in pool status files. Native cooldown/request-count state survives restart; NMA-040 still owns refresh/reconnect/key generations.

Admission freezes nonsecret route snapshots, configuration revision and connection generation. Future runs bind current connection generations; an older run cannot acquire a newly reconnected credential implicitly. Primary, auxiliary, fallback, MoA and pool traffic crosses the same owner/thread/run/execution fences. Native MoA reference calls do not receive tools and are attributed separately from the acting agent's aggregate response. Reference failure follows native degraded behavior and does not prove a successful participating model.

`provider.attempt` records connection, model, billing owner, HTTP status/error class and available numeric usage/cache metadata without prompts or keys. Run diagnostics include native context length, cache read/write deltas and routing summary. Missing provider cost/cache metadata stays unavailable rather than being fabricated as measured savings. A narrowly scoped classification addition lets native auxiliary fallback recognize pure HTTP 5xx, which this exact upstream pin otherwise retries without entering its fallback ladder.

## Verification and unsuccessful attempts

Evidence is in [evidence/nma-030](evidence/nma-030). [protocol.json](evidence/nma-030/protocol.json) was recorded before live runs and retains NMA-028's thresholds unchanged: success at least 95%, integration failure at most 2%, first-progress p95 at most 10s, settlement p95 at most 180s, recovery p95 at most 60s, zero duplicate effects/cross-scope leaks/stop violations, zero unresolved effects for release. NMA-039 still requires at least 100 representative tasks per supported configuration. These small smoke batches do not establish release SLOs.

| Verification | Result and evidence |
| --- | --- |
| Initial full gateway suite | 179 passed, 9 explicitly skipped, 730.56s; [engine-full.log](evidence/nma-030/engine-full.log). Native Docker test enabled. Other live opt-ins are separate from live evidence below. |
| Final source gateway suite | **180 passed, 9 skipped, 697.56s**; [engine-final.log](evidence/nma-030/engine-final.log) and [verification.json](evidence/nma-030/verification.json), including the catalog-upgrade regression and real native Docker test. |
| Focused native configuration/plugin tests | [10 passed](evidence/nma-030/native-tests.log); exact parameters, configuration revision race, 503 fallback with one tool result, native MoA, 429 credential rotation/restart, real installed plugin/hook/deferred dispatch/nested denial, auxiliary 503 fallback, repairable invalid settings. |
| Real native Linux handler | [1 passed](evidence/nma-030/native-isolation.log); native terminal file written and independently read, UID/key/socket negative controls, forged RPC rejected, ungranted agent denied, cancellation retained indeterminate receipt, restart did not replay. Included in both full suites. |
| Real HTTP MCP | Existing real HTTP discovery/call/restart/connector error, grant revoke, schema-race and secret-redaction regressions remain in the full suite; these are actual local HTTP servers, not mocked dispatch. |
| Production backend boundary | 14 unittest cases passed; [backend.log](evidence/nma-030/backend.log). |
| Real Clerk owner isolation | 8 HTTP assertions passed, distinct catalogs, mutual thread 404, foreign connection-model refresh 404, foreign fallback/auxiliary model 422, restart catalog persistence; [owner-isolation.json](evidence/nma-030/owner-isolation.json). |
| Real provider batch 2 | 8/8 passed: ChatGPT plan Responses 3/3 with native todo, OpenRouter OAuth Chat Completions 3/3 with native todo, MoA 1/1 with both HTTP 200, plugin auxiliary review 1/1; [attempt-2/live-results.json](evidence/nma-030/attempt-2/live-results.json). |
| Restart after batch 2 | Agent/config catalog unchanged byte-for-byte in canonical response; [attempt-2/restart.json](evidence/nma-030/attempt-2/restart.json). |
| Authenticated desktop/mobile UI | Actual ClerkJS sessions and production `current_account`; compatible config saved, invalid fallback rejected with field/reason, reload preserved revision 2/output 3072. [ui-config.json](evidence/nma-030/ui-config.json), [desktop](evidence/nma-030/ui-desktop-config.png), [mobile controls](evidence/nma-030/ui-mobile-config-viewport.png), [final mobile readiness](evidence/nma-030/ui-mobile-readiness-final.png). The final wording screenshot uses the already authenticated page's retained catalog after gateway shutdown; the preceding save/reload used the live API. |
| Offline backup/quarantined restore | 379 files verified, all 50 domain tables' rows/hashes and all SQLite counts preserved, schema 15, restore quarantine retained; [backup-restore.json](evidence/nma-030/backup-restore.json). |
| Repository gates | [check.log](evidence/nma-030/check.log), [build.log](evidence/nma-030/build.log), engine Ruff and docs/whitespace checks recorded in verification. |

Live calls used private fixed-model custom endpoints relaying to actual configured ChatGPT and OpenRouter accounts. The original gateway's vault remained the only actual credential/refresh writer; the disposable partitions stored only opaque relay credentials. Their commands passed through the production backend with actual Clerk JWTs. Original model selections, agents and transcripts were not changed. This verifies real upstream inference and custom endpoint integration; it does not claim a new subscription proxy product or every provider was tested.

Batch 2 was a fresh paired batch using a healthy existing OpenRouter OAuth connection. Primary settlement times were 16.67/7.59/8.14s; secondary 8.36/5.04/4.16s; MoA 9.78s; auxiliary review 16.44s. Detailed first-progress/usage observations remain in raw evidence. Cache metadata forwarding is also asserted deterministically (160 cached tokens in the contract fixture); provider-reported live values are not assumed interchangeable across transports.

Failed attempts are retained and excluded from the fresh batch denominator:

- Initial real batch: raw 4/8 passes, reviewed **3/8 passes and 5/8 failures**. The first relay selected a stored OpenRouter API-key connection that returned inference 401. Three ChatGPT cases passed; three OpenRouter cases failed; auxiliary review became indeterminate. MoA's degraded reference answer initially passed a weak oracle, then was correctly rescored failed because both required models did not succeed. [Raw bytes](evidence/nma-030/attempt-1/live-results.json) and [oracle correction](evidence/nma-030/attempt-1/oracle-review.json) are preserved. Unknown effects were not replayed.
- Owner-isolation harness initially used a command-only route that the public boundary correctly refused with 422; it was corrected to the dedicated connection-model endpoint. [The original attempt](evidence/nma-030/owner-isolation-attempt-1.json) is retained.
- The backend test command first attempted unavailable pytest; the correct project unittest command passed. [Failed invocation](evidence/nma-030/backend-invocation-failed.log) is retained.
- Catalog-upgrade regression reproduced `ACCESS_REVOKED` before the compatibility fix and passed afterward. [Red](evidence/nma-030/catalog-upgrade-red.log) and [green](evidence/nma-030/catalog-upgrade-green.log) remain separate.
- The first backup harness left its inspection SQLite connection to garbage collection, letting its own WAL/shm disappear during copying. Explicitly closing that inspection connection fixed the harness; the production backup implementation was unchanged. The subsequent stopped-partition rehearsal passed.
- During development, pool rotation exposed differing relay endpoint addresses, auxiliary HTTP 5xx exposed an upstream fallback-classification gap, and Responses/chat parameter mixing produced the intended validation error. The final native tests cover these paths. Development failures are not additional successful live samples.

[candidate-source.json](evidence/nma-030/candidate-source.json) fixes the source used for the first full suite and both live batches. [delivered-source.json](evidence/nma-030/delivered-source.json) records the final source and exact delta: historical-grant compatibility and human-readable readiness text. The final full suite validates that delta; live evidence is attributed to its recorded candidate, not relabelled as a new batch.

## Data, migration and rollback

No schema migration is introduced; extension schema remains 15 and historical migration files/checksums remain untouched. Optional inference settings extend existing revisioned agent config. Existing valid basic model selections remain valid. The grant-upgrade test preserves original config bytes and admission identity; installed capabilities never auto-broaden an old agent.

The stopped disposable live partition was copied with the existing backup tool, restored to a fresh private directory and compared by all domain row hashes, native SQLite counts and file checksums. Restored state remained quarantined and was not activated. Identities, history, goals, config revisions, receipts, provider metadata and migration records were preserved. The live harness deliberately deletes disposable relay secrets on shutdown; production credentials and external capsule volumes are separate private backup obligations, not public evidence artifacts.

Rollback uses a previous Git revision plus a verified complete private backup and external resource/secret inventory. Drain ingress/execution, retain post-cutover evidence and reconcile unknown effects before activating a restored partition. Do not drop tables, reset agents, replay unknown mutations or run two lifecycle engines. Plugin archives and capsule journals/volumes must follow the same owner-specific rollback plan.

This is local implementation and acceptance for the configured supported surfaces. Production partition isolation/capacity, broader browser/network flows, and the NMA-027/NMA-039 release gates retain their established acceptance requirements. No original account was migrated, no production deployment was performed, and excluded provider variants were not silently treated as passes.

The two disposable Clerk development users, their sessions/database, both private inference relays, the auth helper and Vite server were cleaned up. Only the two created browser sessions were closed and the created fixture symlink was removed. The original signed gateway remained responsive. Private disposable backups and public verification evidence were retained; [cleanup.json](evidence/nma-030/cleanup.json) records that scope.
