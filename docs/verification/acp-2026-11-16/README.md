# ACP migration: initial implementation evidence

Follow-up capture: [profiles, controls, native Codex and the 2.3.0 consumer delta](profiles/README.md). The initial observations below retain their original scope and versions.

Date: 2026-11-16. Status: In Progress. This report covers the shared SDK/session foundation and initial native probes, not the complete [migration](../../architecture/acp-harnesses.md). The full [research cohort](../../research/acp-harness-integration-2026-11-16.md#verification-and-completion-criteria) remains open. Production composition still registers the existing native Codex and Muse adapters; ACP execution has not been cut over and no replaced execution code has been deleted yet.

## Implemented scope

- Official ACP SDK 2.7.0, consistent unstable v1 entrypoint, bounded owned process trees, record redaction, setup deadlines and draining final stdout frames before transport closure. Native inference has no arbitrary application deadline.
- Shared session new/load, advertised model/reasoning configuration, ordered live text, replay suppression, partial tool-update merging, private thoughts/raw observations, safe permission choices, cancellation intent and deliberate terminal/error mapping. Lost acknowledgements remain unknown.
- Extracted MCP session proxy. ACP endpoints bind one immutable run lease, allow discovery without effects before dispatch, reject old-token/rebinding attempts, abort in-flight proxy requests and revoke the underlying ProductTools lease. Muse retains its existing reusable-session behavior through a wrapper.
- Nullable native turn IDs in accepted observations. Broker processing remains correlated to the admitted run/token/epoch, allows useful ProductTools calls without inventing a native ID, persists observed output and retires per-run processes. Missing processing evidence cannot fabricate success. Resource revocation still drains owned processes.

## Native probes

Host: macOS ARM64, Bun 1.3.10, Node 25.8.0. Exact adapter/runtime pins are in the [verification manifest](../../../scripts/verification/acp/runtime/package.json) and npm lock. No global harness installation or host-authenticated home was changed. Each probe used a temporary private HOME/XDG/agent directory and no provider keys or host settings; temporary homes were removed after process shutdown. The scripts never send `session/prompt`.

| Profile | Adapter/runtime baseline | ACP v1 initialize | Session/catalog observation | Native inference/useful tool |
| --- | --- | --- | --- | --- |
| Codex | codex-acp 2.6.0; independent Codex 0.169.0 | Pass | Session rejected with auth-required code -32000 | Not attempted |
| Claude | claude-agent-acp 0.107.0; Agent SDK 0.3.323 | Pass | New session and model selection pass; fresh-process load of a never-prompted session returns -32002 | Not attempted |
| OpenCode | opencode-ai 1.19.5 | Pass | New session, model selection and explicit fresh-process load pass | Not attempted |
| Pi upstream candidate | pi-acp 0.0.34; Pi 1.5.2 | Pass | New session rejected with -32000; advertised HTTP MCP false | Not attempted |
| Pi alternative | openma-pi-acp 0.1.8; Pi 1.5.2 | Pass | New session rejected with -32000; advertised HTTP MCP true | Not attempted |

[Pinned handshake results](handshake-pinned.json) cover **5/5** initialized candidates. [Shared session results](sessions.json) exercise the actual common session module against two different native harnesses: **2/2** new-session/model-selection operations, **2/2** fresh process/tool credentials, **1/2** reloads. Claude's reload error is retained; it does not establish recovery after real inference. System instructions were empty in this no-credential probe; instruction application and containment remain unverified. Pi adapter selection is still open pending the same complete cohort for both candidates.

The earlier [unpinned-runtime handshake](handshake.json) used the npm-resolved Codex 0.166.0 and Pi 1.5.2. [Initial installed metadata](installed-packages.json) records that baseline. It is separate from the independent 0.169.0 runtime pin and the final source manifest. The first Codex startup failed because the probe had not created its private CODEX_HOME; creating the directory corrected the probe. No account or provider fallback was used.

## Fixture and static verification

The final logs and source manifest are retained alongside this report. Tests use disposable PostgreSQL, controlled SDK peers and the actual ProductTools authorization gateway where declared. A controlled useful receipt is not a native provider/tool acceptance result.

| Check | Result | Evidence |
| --- | --- | --- |
| Combined broker/SDK/legacy adapters/lifecycle/interactions/recovery regression | 149/149 pass | [Log](regression.log) |
| Broker plus organization/provider authorization | 47/47 pass, including 40 broker tests also present above | [Log](authorization.log) |
| Shared SDK/session/tool proxy cases | 14/14 pass, also included in the combined regression | [Log](core.log) |
| Server typecheck and lint | Pass | [Typecheck](typecheck.log), [lint](lint.log) |
| Documentation links/status | Pass | [Log](docs-check.log) |
| Exact shared source and installed pins | Recorded | [Manifest](manifest.json) |

The initial [89/91 regression](regression-initial.log), [148/149 run before stdout draining was fixed](regression-before-drain-fix.log), and [initial documentation failure](docs-check-initial.log) remain separate. The documentation failure was an existing immutable sign-in report referencing a retired source file; the historical-link registry now verifies that report and target against the exact pre-retirement Git tree without rewriting retained evidence.

Commands:

```sh
npm ci --prefix scripts/verification/acp/runtime
bun scripts/verification/acp/handshake.ts
bun scripts/verification/acp/sessions.ts
bun scripts/verification/nma072/run-tests.ts tests/acp.test.ts tests/session-tools.test.ts tests/harness.test.ts tests/muse.test.ts tests/muse-launch.test.ts tests/codex.test.ts tests/lifecycle.test.ts tests/product-interactions.test.ts tests/interaction-journal.test.ts tests/run-recovery.test.ts
bun scripts/verification/nma072/run-tests.ts tests/harness.test.ts tests/organizations/providers.test.ts
bun run --filter @ngertiin/server typecheck
bun run --filter @ngertiin/server lint
bun run docs:check
```

Earlier failures are retained rather than counted as passes: invoking database-backed tests without the disposable database URL was a setup failure; the first regression found two stale floor expectations; a new nullable-ID test exposed the old output-publication ID requirement; process-death tests exposed a transient macOS group-kill EPERM while exit was pending; and a partial-output test exposed closing the SDK connection before stdout drained. Corrections preserve explicit cleanup failure/unknown behavior. Five repeated EOF/partial-output checks and six repeated process-death checks passed after their respective fixes. Final denominators are recorded in the retained logs.

## Required work still open

The production adapter wrapper/four launch-auth profiles, Codex external-token refresh hook, Claude native auth/settings confinement, Pi forwarding/failure adaptation and candidate selection, scoped catalog exceptions/instruction routes, frozen multi-provider selection, transport/version/generation binding metadata, native-history cutover compatibility, receipt recovery without native turn IDs, generic elicitation, plans/usage/commands/compaction/diffs, runtime/account/updater registration, API export/regeneration, web onboarding/pickers and actual web/Tauri journeys remain open. Native login, inference, useful product-tool execution, billing, credential containment, process/listener isolation and changed-instruction application must still be verified per profile. Earlier native acceptance does not certify ACP, and missing credentials never count as readiness.
