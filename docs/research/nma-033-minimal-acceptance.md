# Initial package: minimal live acceptance

NMA-033 is complete for the initial package under the user's instruction on 27 October 2026: "selesaikan task NMA-033 dengan minimal test pada connection notion dan linear". The current completion check is two live connection/read tests. It supersedes the broader live validation gate for this delivery, without claiming every connector operation or release readiness.

## Actual external results

[Results](evidence/nma-033/minimal-live-2026-10-27/connections.json): **2/2 passed** through the product's saved `AppConnections.native_config`, scoped native MCP registry and actual vendor servers. No Codex app connector, simulated response or model-generated answer was used.

| Connection | Read operation | Result check |
| --- | --- | --- |
| Notion | `notion-fetch` of NMA-033 | Expected page ID and task title matched |
| Linear | `list_teams`, limit 1 | One team with a provider ID returned |

Both negotiated protocol `2025-11-25`. Each temporary scope exposed only the selected tool and verified its native read-only annotation. Existing app journals retained identical bytes; no agent grants changed and no workspace writes occurred. Hermes remained the OAuth/token writer. This verifies connection/authentication and actual reads, rather than model-driven DM/group execution or writes.

The live Notion server offered 64 ordinary tools; the earlier 68-entry UI catalog also included native utility tools. Linear offered 69. These are discovery counts, not operation-pass counts. Exactly one read per app is the denominator.

Public evidence retains result hashes, sizes, checks and timings. Raw responses remain under `.dev/nma-033/minimal-live-results`, with mode 0600 in a mode-0700 directory. The first successful run is also retained. The final run followed a lint-only exception-class correction in the verifier; no product code changed.

## Retained verification

The verifier checked pinned source hashes, Python 3.14.9 and distributions before running. Hermes remains `7489b22af47ce91b366dde81d5831ea422577498`. The reproducible script is `scripts/verification/nma033_live_connections.py`; it accepts the authorized home/owner and evidence paths, never credentials as arguments.

Earlier verification was inspected, not relabelled as newly executed: broad engine 200 passes/31 explicit skips; subsequent 20 focused passes plus one source-pin pass; backend 28 passes; static checks, build, controlled UI and disposable backup/restore. All 15 [original](evidence/nma-033/manifest.json) and 13 [setup follow-up](evidence/nma-033/setup-followup-2026-10-27/manifest.json) evidence checksums were reverified unchanged.

## Limits retained after task closure

- GitHub and Google setup are implemented, but their actual account operations remain unverified. Personal Gmail still needs a registered OAuth Web client and consent. n8n is deferred from new setup; existing support is preserved.
- Notion/Linear writes, all other operations, real credential expiry/outage cases and model-driven use were not exercised by this minimal test. Earlier controlled protocol/fencing/recovery coverage remains attributed to its original runs.
- Actual research-provider/X calls and identity/mTLS deployment acceptance remain pending. Controlled research fidelity/paging/cache/failure evidence is retained.
- Experimental MCP event-to-thread wakes are unavailable and fail closed; URL elicitation remains unsupported. Neither is claimed as delivered by this closure.
- NMA-028 release thresholds, representative corpus requirements, production rollout and actual-credential restore are not waived.

Done refers to the explicitly limited initial delivery and its requested minimum validation. The pending items above remain visible follow-ups rather than reported passes.
