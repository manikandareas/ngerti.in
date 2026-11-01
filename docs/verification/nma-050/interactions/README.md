# Native interaction repair — 2026-11-01

**Done under the explicitly accepted API-key billing scope.** The user approved applying the gate billing exception to NMA-050 closure; subscription remains unavailable and unverified.

The NMA-060 question regression was caused by `--preset empty`: it removes the native `request_user_input` tool along with filesystem and shell tools. Workspace conversations now select only `request_user_input` and `mcp__ngertiin__*` through `run.toolset`. Routing selects an empty list. Shell and writes remain disabled. The native binary validates this configuration; a real Muse model question/answer completes through the application HTTP API.

Pending approvals now retain native tool names, arguments and human-readable choice labels/previews. The existing redaction boundary still processes the snapshot. Consumers receive an acknowledgement of submission, not a fabricated action completion. Contract 1.15.0 includes these optional display fields.

## Results

- Backend: 246/246 tests pass, zero failures/skips, 1590 assertions; lint and typecheck pass. Three added regressions failed before their respective fixes.
- Consumer: 6/6 HTTP/SSE/replay/restart scenarios pass against contract 1.15.0.
- Native Muse 1.4.14-R7309.1, SDK 1.4.14, model muse-spark-1.3, explicit API-key billing: question/answer, one-time approval with a verified profile mutation, denial with unchanged profile, and stale answer rejection (HTTP 409) pass.
- Five native run identities: four succeeded and one explicitly cancelled with native confirmation after a verifier failure. The cancelled run retains its earlier NATIVE_UNKNOWN diagnostic; it is not rewritten as clean execution. No terminal unknown is hidden.
- Permission probes used an isolated, task-owned native Ask-me profile. This is not a new global approval requirement or a change to application defaults. Question verification used the normal configuration.
- The task-owned Muse connection was revoked and only its copied credential removed. Original ChatGPT authentication, historical unknown effects, evidence and data were preserved.

## Reproduction and scope

Start the backend with `.dev/nma050` on PATH, state `.dev/nma049-native`, port 49959. `scripts/verification/nma050/interactions-native.ts` provisions one private verification connection and runs the native question case. For permission probes its task-owned `home/.config/muse/settings.json` contains `{"schema_version":1,"permissions":{"schema_version":1,"default_profile":":ask-me"}}`. Then run `approval-native.ts approved` and `approval-native.ts abort`. Each script persists original run/command identities under `.dev/nma050-interactions`; after cleanup, provision a new isolated cohort rather than replaying revoked credentials. Never automatically approve an unrelated tool or reuse a persistent permission choice.

Retained failed iterations: `approval-native.json` records a verifier expecting `deny` while the native choice is `abort`; that run was cancelled. Initial profile setup omitted required schema versions and delayed dispatch; native stderr identified those configuration errors. `approval-allow-before-verifier-fix.json` records an overly narrow probe allowlist rejecting the harmless `list_agents` read. The verifier resumed the same pending native approval after correcting its allowlist; it did not duplicate the model run or the effect. The earlier gate question failure remains unchanged under `../nma-060/completion` (relative to the verification root).

Source provenance remains the pinned Openbot modules and SDK revision in `../provenance.json`. Additional configuration evidence: [official MCP/toolset documentation](https://dev.meta.ai/docs/muse-code/extending), [settings and debug documentation](https://dev.meta.ai/docs/muse-code/configuration), and [native approval semantics](https://meta-models.github.io/muse-code-sdk/next/cookbook/approve-or-deny-a-tool-call/). The upstream approval cookbook uses a fixture; it was not counted as native proof here.

Muse subscription remains unavailable/unverified. NMA-060 explicitly accepts selected Muse API-key billing; this repair closes the native interaction gap, not subscription proof, UI, installation or production readiness.
