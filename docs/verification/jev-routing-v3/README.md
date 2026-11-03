# Semantic group routing amendment

Verified locally on 2026-11-03. Contract **1.27.0**, TypeSafe SDK **0.6.0**, Jev **1.14.0**, Bun **1.3.10**. This completes the user-authorized semantic-routing amendment to NMA-056 and its API/UI delta. Earlier conversation-latency and v2 evidence retains its original scope.

## Behavior

Jev identifies the initial conversational recipient separately from a requested downstream peer. It receives the complete current request, stable member identities, bounded responsibilities, attachment metadata and observed group work. The focused first judgment excludes historical message bodies; Jev can request shared context. Potential delegation receives an identity-focused relational judgment identifying initiator and peer. The application validates typed results and calibrated admission evidence; it does not infer intent with agent-name/phrase routing rules or impose a tool plan. Existing explicit structured targets remain authoritative.

At most two System One requests share one 1,500 ms deadline, with SDK retries disabled. Uncertain/conflicting judgments use one existing member's isolated native classifier. Genuine ambiguity can return a natural clarification instead of arbitrary task admission. The native classifier has no tools, task execution or private DM context. Jev and fallback share one group packet builder and a pinned context-message boundary; an explicit retry refreshes that boundary. The private owner diagnostic endpoint is `GET /v1/groups/:id/routes/:routeId/decision`; normal snapshots/events expose progress, not private prompts. SQLite retains the latest 1,000 bounded attempt traces.

Structured `ngertiin.group_handoff` requires an agent-authored public announcement. The application publishes it before the peer is admitted; wording, whether to delegate and the actual task plan remain with the agent. Ordinary complete handoffs finish without a needless coordinator inference. No name-specific behavior was added for Tobi or Skinny.

The UI displays “Memastikan penerima…” during relational review and the native question when the recipient is unresolved. Existing same-input preparation retry and reconciliation-only unknown outcomes remain intact. DM preparation/reuse, event-driven dispatch and conversation publication from earlier amendments remain in place.

## Frozen evaluation protocol

`dataset.json` contains **520 authored scenarios across 20 families**, including addressing, delegation direction, negation, quotation, conditionals, pronouns, continuations, controls, open roles, ambiguity, absent members, attachments, agent-origin requests and adversarial content. These are authored labels reviewed by the implementation agent, not an independent human evaluation or production sample.

- 216 development cases, grouped by adjacent authored situations.
- 104 diagnostic validation cases. An earlier calibration attempt exposed design failures and was explicitly reclassified; it is not claimed as untouched calibration.
- 40 fresh calibration cases, added and frozen before their inference.
- 160 frozen final-test cases. Prompts and thresholds were selected before final inference. No final-test tuning occurred.
- 444 dependent perturbations of 148 unique-actor final cases: member order, consistent renaming, and irrelevant older history. They are not 444 additional independent scenarios.

Dataset SHA-256: `64d4035d723256f7763352653a70c77c57185316fcae85bfc90a7e8bca3a7e98`.

The development-only 60-point coarse search selected confidence >= 0.60, top probability >= 0.70, margin >= 0.15 and relational support >= 0.60, alongside structural/unresolved/context checks. `calibration-policy.json` preserves candidates and the 290 accepted / zero wrong development-validation-calibration rescore. Model confidence is self-assessment, not a calibrated success probability. All exploratory failures remain in the versioned reports.

## Results

| Cohort | Jev accepted | Accepted wrong | Native fallbacks | Final correct | Wrong member chosen |
| --- | ---: | ---: | ---: | ---: | ---: |
| Frozen final test | 133/160 | 0 | 27 | 159/160 | 0 |
| Dependent perturbations | 394/444 | 0 | 50 | 441/444 | 0 |

The sole final-test miss and its three perturbations requested a Routine interval change. Native fallback asked who owns that Routine instead of selecting the expected active reviewer. This is retained as an unnecessary clarification, not relabeled as success. The packet contains ongoing review facts but no explicit Routine ownership. Every unaccepted input received actual native classification: **77/77 succeeded, 73 matched the authored label, zero tools or scenario tasks executed**. Final selections/abstentions agree across **444/444** perturbation comparisons; raw Jev selections agree across **438/444**. See `quality.json` and `fallback-quality.json`.

The 133 accepted final cases have zero observed wrong decisions. A nominal independent-binomial one-sided 95% error upper bound is about 2.23%; independence and production representativeness are not established by this corpus. This does not prove a production error rate below 1%.

| Measured final-test path | n | p50 | p95 |
| --- | ---: | ---: | ---: |
| Single System One call | 91 | 242 ms | 320 ms |
| Two System One calls | 69 | 490 ms | 536 ms |
| All Jev judgments | 160 | 268 ms | 519 ms |
| Isolated native fallback | 27 | 4,981 ms | 7,503 ms |
| Jev + observed native fallback when needed | 160 | 470 ms | 5,931 ms |

Combined time adds sequential measurements from separate local classification runs. It excludes answering-agent work and is not production chat latency. The ordinary single-call path meets a local 500 ms p95 target; aggregate Jev p95 and paths needing native fallback do not. More aggressive admission would trade additional wrong-routing risk for speed; no success or latency guarantee is claimed.

## Native conversation and original incident

`native.json` records **13/13 successful native runs** on an isolated database with existing Codex subscription auth copied read-only and an explicitly selected Muse API key. It covers Codex cold/warm/prepared DM, Muse cold/warm DM, Jev-to-native selection, Codex-to-Muse complete handoff, both Skinny/Tobi delegation directions with prior history, and an ambiguous Raka request that ends in clarification. The source agent's real announcement precedes child dispatch in both directions; parent and peer complete with zero extra coordinator continuation. No Goals/Routines or active/unknown runs remain. Copied credentials were removed only after settlement. This is not Muse subscription proof.

The original Uji Skripsi event packet is reconstructed at cursor 2191, with its original legacy request hash checked before replay. On the unchanged historical message, Jev selected Tobi in 3/3 attempts, accepting two and withholding one. Reversed candidate order and opposite delegation also selected the expected initial member in 3/3 each. A renamed-member stress initially changed only candidate/current-message names while preserving old historical names; all three decisions were wrong and withheld. That mixed-name stress remains in `historical-replay-mixed-name-stress.json`. A corrected consistent-renaming probe also produced three wrong low-confidence Jev decisions, all withheld. Actual native fallback then selected the expected member in **4/4** withheld exact/consistently-renamed probes (`historical-fallback.json`). This limitation is not hidden by the aggregate corpus.

No test message was sent to the user's group, and the original bad selected route was not replayed or rewritten. The historical packet stays private under `.dev`; public evidence includes the relevant user request and routing results, without private DM transcripts or credentials.

## Verification and reproduction

Backend: 351 tests, server lint/typecheck, strict verifier typecheck, scoped HTTP/SQLite checks for 95 declared operations. API checks cover owner trace auth/scope, public prompt redaction, review progress, exact-command replay with zero extra events, and no hidden native run for an accepted Jev decision. Regression tests cover chronology/retry context, native abstention, stale attempts, membership/capability fencing, private trace persistence and required public handoff announcements.

Browser, activation, checks and integrity results are recorded in `checks.json`, browser reports, `activation.json`, `source-hashes.json` and `SHA256SUMS`. UI verification follows the NMA-060 backend/native checkpoint. Baseline source captures for the original latency/v2 amendments remain immutable. The user's unrelated composer/color/scroll commits are preserved.

Run from the repository root, except commands explicitly using an app working directory:

```sh
(cd apps/server && bun run lint && bun run typecheck && bun test tests)
bun scripts/verification/jev-routing-v3/api.ts
# The following perform real provider inference; retain each capture rather than overwrite it.
bun --env-file=.env scripts/verification/jev-routing-v3/evaluate.ts semantic test <new-output.json>
bun --env-file=.env scripts/verification/jev-routing-v3/native.ts <new-native-output.json>
bun scripts/verification/jev-routing-v3/summarize.ts
(cd apps/web-client && bun run build && bun run lint && bun test verification)
(cd apps/web-client && bunx playwright test --config playwright.jev-v3.config.ts)
```

The frozen final test was consumed once. A future prompt/policy change must treat this final set as regression data and reserve new final cases for an unbiased estimate. Native fallback/historical scripts currently write their named capture; preserve those files before deliberately rerunning. No commit, push, installer or production deployment is included.

## Activated local state

The existing backend was gracefully replaced only after zero active/unknown user runs were confirmed. `/health/ready` serves 1.27.0 with Jev enabled and the same supported `/opt/homebrew/bin/codex` 0.166.0 resolver used by `/v1/harnesses`. The local default Muse executable remains missing; the explicit native test executable/key is not silently installed or substituted. The frontend on port 3001 remains available.

A private mode-0600 SQLite backup and record hashes remain under `.dev/jev-routing-v3/activation/`. All **200** baseline message/artifact/Goal/Routine/agent/thread records are byte-identical after restart. The original problematic route is unchanged and no test message was sent to the user's group. `activation-check.py` performs read-only verification against that private baseline. There are zero active/unknown user runs. `retained.json` also verifies all 84 captured historical latency/v2 evidence, verifier and contract files unchanged.

The final credential-value scan checked 13 known secrets against 312 source/evidence/build files with zero matches. Verification source hashes match the final model/native cohorts. The running backend is left available; isolated proof sessions and copied credentials have been cleaned after settlement. Changes remain uncommitted and unpushed.
