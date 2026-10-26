# Native capabilities and routing implementation review

Reviewed against the live [NMA-030 task](https://app.notion.com/p/404abdd6187381509cbfd08486cde81f) on 2026-10-26, its parent specification, adoption plan, and three Done dependencies (NMA-029, NMA-008, NMA-040).

The configured foundation scope remains complete after the corrections below. This is not production release approval or universal native-tool/provider readiness. The knowledge-graph tools were unavailable, so inspection used repository source directly.

## Corrections

1. An Anthropic thinking configuration with an invalid output-limit type could raise `TypeError` when `thinking` preceded `max_tokens` in the request. The validator now checks the limit type before comparing budgets, returning `INVALID_INFERENCE_CONFIGURATION` with a field and repair reason. Five malformed values are tested in both field orders. The prior failure and corrected result are retained in [validation-red-green.log](evidence/nma-030-review/validation-red-green.log).
2. Editing auxiliary model selection, OpenRouter ranking or MoA references replaced the entire nested configuration, losing saved fallback chains, routing restrictions or fanout/timeout values. The editor now changes only the selected field and preserves the other settings. Removing the auxiliary slot or the last MoA reference still intentionally removes that route.
3. An unavailable auxiliary model was absent from the select options, visually concealing the saved selection. It now remains visible as unavailable and can be replaced or removed.

## Acceptance mapping

| Requirement | Implementation and evidence reviewed |
| --- | --- |
| Extensible native catalog, dependencies, readiness and unchanged old permissions | `native_catalog.py`, `capabilities.py`, versioned catalog template, catalog-upgrade regression and native isolation test |
| Actual callable native/plugin/deferred tools; live denial and revocation | Registry/model dispatch guards, scoped capsule worker, real installed plugin and HTTP MCP integration tests; retained live native todo and plugin review receipts |
| Pinned plugin lifecycle and active-run semantics | `plugins.py`, drained-gateway installation fence, manifest/provenance checks, archived bytes, scoped hooks and explicit platform registration exclusion |
| Validated provider parameters, immutable admission configuration | `inference_config.py`, adapter snapshots and provider transport; exact wire-parameter/revision-race tests plus new malformed thinking regressions |
| Native fallback, auxiliary recovery, credential-pool rotation and restart | `inference.py`, owner-scoped signed relay, 503 fallback, auxiliary outage and 429 rotation tests; tool effects are counted |
| Owner isolation, credential lifecycle and MoA attribution | Connections/generation fences, current connection regressions, MoA contract, retained two-Clerk-owner assertions and both successful live MoA provider attempts |
| Cache/context metadata and usable UI | Provider-attempt events and diagnostics, cached-token contract, retained live usage; current browser interaction checks of the production editor |
| Preservation, provenance and rollback | All 63 delivery source/validation hashes matched before edits; unchanged historical migration scope; retained 379-file/50-table quarantined restore evidence |

## Fresh verification

- Initial focused gateway run: **12 passed**, including actual native Docker terminal, cancellation/no replay and catalog upgrade.
- Final targeted gateway regression: **29 passed, zero skipped**, 111.02 seconds. Includes native capability/routing/isolation/catalog suites, capability/MCP tests and connection tests. Five additional parameter cases each check both JSON field orders.
- Production backend HTTP suite: **14 passed**.
- `make check`, `make build`, engine/test Ruff checks, documentation links and whitespace checks passed.
- A disposable browser fixture mounted the actual `InferenceSettingsEditor`. Changing the auxiliary model retained its fallback list; changing provider ranking retained `only` and `data_collection`; changing MoA references retained fanout and timeout. The unavailable auxiliary selection was displayed and successfully removed. Browser state and a 390px mobile screenshot are retained. This is a component interaction check, not a new authenticated backend save or Clerk login.

Evidence: [review directory](evidence/nma-030-review), [source hashes](evidence/nma-030-review/source.json), [machine-readable results](evidence/nma-030-review/verification.json). The local browser session and fixture server were stopped; the temporary dependency symlink was removed. No original account state was modified.

## Retained evidence and limits

The [original delivery report](nma-030-native-capabilities-routing.md) and all 49 original evidence files remain unchanged. Its final full suite was 180 passed/9 skipped; the actual-provider second batch was 8/8, with the earlier reviewed 3/8 batch and failures kept separately. Actual Clerk UI/owner isolation and backup/restore were inspected, not rerun. The full 180-case suite was not rerun for this narrow validator/editor change; current validation is the 29-case related regression plus backend/build/browser checks above.

The only production-source changes from the recorded delivery are `inference_config.py` and `inference-settings.tsx`; a regression was added to `test_native_capability_routing.py`. Earlier live evidence retains its original source attribution. Release sample sizes/SLOs and operational readiness remain NMA-039/NMA-027. NMA-040's OpenCode Zen/Go live-provider exception remains unchanged. No commit, push, deployment, new engine mode or migration was performed.
