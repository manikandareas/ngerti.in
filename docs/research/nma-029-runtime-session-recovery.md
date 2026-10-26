# Hermes runtime, session fidelity and durable recovery

Task: [NMA-029](https://app.notion.com/p/404abdd618738173a4dbeb0ef22a8308). Primary authority: [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a), its live ticket and dependency relations, read on 2026-10-26. The task source captured before implementation is retained in [notion-source.md](evidence/nma-029/notion-source.md). NMA-028, NMA-005, NMA-009 and NMA-010 were all Done when implementation began.

## Selected boundary

Hermes commit `7489b22af47ce91b366dde81d5831ea422577498` remains unchanged, MIT, with existing provenance/notices. Startup checks the source hashes and required signatures in `runtime-pin.json`. Hermes alone owns model iteration, session claims, admission, cancellation, native compression, scheduling and recovery. The product gateway extensions own authenticated domain scope and durable projections inside that authority. API and process supervision do not own an independent execution queue.

ADR-08 from NMA-028 selects scoped Linux dispatch for native browser/terminal/file tools. This task uses the versioned ADR-08 verification transport for paired live tool tests. Production workspace and browser adoption remain NMA-031 and NMA-032. The existing production computer actuator is hardened here; a successful prototype test does not imply the complete native browser package is shipped.

## Unit 1: integration and lifecycle

`integration.py` centralizes and orders native adaptations: redaction, grant checks, discovery, goals/artifacts/computer dispatch, native usage receipts, context references, frozen native settings, then runtime reliability before bootstrap recovery. Native middleware at this pin fails open, so it cannot replace final-dispatch authorization wrappers. Signature checks run before wrappers obscure upstream signatures.

Every lifecycle projection correlates owner, agent, thread, configuration revision, context generation, logical/native session, native admission, operation and authority epoch. Readiness prevents startup-recovered work from entering model execution before product fences and pending cancellations are installed. The socket closes admission during drain. Accepted request tasks survive client disconnect, while native shutdown owns inference and context-mutation draining. Long compression calls use native per-session gates without holding the product-wide command lock.

A command acknowledgement is admission evidence, never proof of inference completion. Exact retries use original operation IDs and native receipts. Recovered started work with unknown effects is blocked rather than implicitly replayed. Structured failure phases and terminal iteration-exhaustion metadata are redacted alongside native receipts.

## Unit 2: context and native continuity

Native typed messages are canonical, including tool calls/results and compression markers. The removed plain-text transcript rebuild had discarded tool lineage and repeatedly injected visible history. Scoped context now contributes persona, agent memory, shared artifacts, explicit instructions and peer updates without duplicating the executing agent's own native transcript. Stable logical identity is derived from owner/agent/thread. A configuration change creates an immutable native binding, seeds authorized native history once and records its parent. Revoked context generations cannot be selected as parents.

Optional `config.session` validates native iteration/compression settings. `max_turns` defaults to native unlimited (`null`/`0`); a finite positive limit produces visible `continuation_required` and `turn_exit_reason`. Only the installed native compressor is selectable; accepting arbitrary context-engine import paths would violate the workspace boundary. Task-local frozen policy is supplied through the same config-snapshot seam used by managed native workers. In-process native policy scope alone did not bind config readers, which previously left compression settings at unrelated profile defaults.

Manual compression/reset use `mutate_session` with exact request identity and native revision/generation. Native receipts recover lost acknowledgements without repeating summary/reset. A frozen reset watermark prevents a recovered projection from excluding messages received after its intent. Known native refusals finish their durable command, avoiding a permanently pending startup poison. Completed product history and goals remain visible after reset. The UI provides per-conversation controls and an agent selector for groups, with an exact pending request retained across uncertain transport.

Core reference parsing is pure and pinned. Absolute/traversal/drive/home paths, unsupported git ranges and non-HTTPS/private literal destinations are refused. No reference reads the gateway filesystem. Workspace resolution must reauthorize generation, containment/symlinks and egress on every read. Product persona and explicit instructions precede workspace instructions; attached content remains data. Until NMA-031 provides that resolver, supported references report `WORKSPACE_REFERENCE_UNAVAILABLE`; composer wiring is NMA-038. The ticket's historical NMA-054 mention is superseded by that current split.

## Unit 3: durable effects and work outcomes

Schema 15 adds `nma_effect_outcomes`, `nma_session_lineage` and `nma_goal_unit_outcomes`. Historical migration checksums and existing native bindings/messages remain intact. Legacy confirmed `INDETERMINATE` values are inventoried as unknown while their original receipt bytes are preserved.

The effect protocol records intent, dispatch and provider operation identity before external invocation, then execution and observation evidence separately. `INDETERMINATE`, ambiguous mutation errors and partial nested batches remain unknown. Known pre-dispatch rejection is a receipt; a failed safe observation is independently repeatable. Unknown mutations block later writes in that thread while explicitly safe reads remain possible. Arbitrary shell/browser batches remain mutations; the product never blindly retries their whole body.

The backend separates action from post-action observation. A completed click followed by failed DOM inspection remains a completed action with failed observation. Lost actuator output is unknown. `computer.reconcile` only queries existing durable provider receipts, never allocates a replacement browser or repeats the action. Missing receipts cannot clear the blocker. Late execution evidence is saved even when publication scope has been revoked. Managed goal work-unit decisions persist terminal verdict, receipt references and linked continuation child. Peer unit outcomes remain durably anchored in the existing native-backed goal/run ledger; native queued recovery and existing stop/pause/descendant fences remain authoritative.

## Verification and evidence

The evidence manifest records final checks, earlier failed attempts, hashes and precise limitations. Deterministic tests run actual pinned gateway subprocesses with a controlled HTTP provider, real SQLite and injected process death; they do not replace the production model loop. Fault tests also use external counting services so a database status alone cannot prove absence of duplicated effects.

Native session tests cover twelve tool iterations, typed history across restart/config changes, finite iteration exhaustion, compression/reset identity, manual/automatic/micro compaction, host-path canaries, schema-14 migration, native reset receipt recovery and durable busy refusals. The complete suite includes existing DM/group/goal/trigger/isolation/cancel tests. Opt-in live tests remain explicitly distinguished.

The fresh live smoke protocol freezes nine scenarios, three repeats and three surfaces (81 planned cells), the same Luna model/Responses wire and native unlimited iteration budget. It retains NMA-028 thresholds and all attempted failures. Direct native, signed internal adapter and actual Clerk-authenticated application surfaces remain separate denominators. Raw scoring is retained; any allowed task-label case-fold adjudication is recorded separately. Three repeats do not establish release SLO confidence; NMA-039 requires at least 100 representative tasks per supported configuration.

## First candidate verification

- Complete pinned engine suite: **164 passed, 9 explicitly opt-in skipped**, `engine-candidate.log`. All 41 engine source/config files remained byte-identical throughout this run (`candidate-source.json`).
- Backend authenticated-transport/counting-actuator contracts: **17 passed**, `backend-delivery.log`.
- Disposable PostgreSQL/account provisioning and actual gateway: **6 passed**, `provisioning.log`. The existing Alembic configuration deprecation warning is retained.
- Static checks and web build pass; final log paths and source/artifact hashes are recorded in the manifest.

The earlier `engine-complete.log` had four failures: native metadata probing used the original upstream address without the scoped credential relay, and an offline wake fixture lacked its newly required authority epoch. Both were corrected; the four targeted tests passed in `regression-corrections.log`. `engine-verified.log` was interrupted after a refactor changed module signatures during the run; it is retained as an invalid mixed-version attempt, not counted as candidate validation. A context-metadata double missing a compressor was also corrected before the frozen full pass. The first candidate remained byte-identical during its complete suite and 54 attempted live cells. A subsequently observed browser grammar failure motivated the separately versioned second candidate below.

The nine opt-ins are real-provider goal/connection/group/wake evaluations, E2B resource acceptance and three legacy automated Chromium closure/reopen cases. They are listed explicitly instead of being treated as successful tests. This task exercises the new native-tool transport in the fresh paired corpus and uses the user's existing Brave browser for applicable UI acceptance. Broader provider/quality and production E2B adoption remain separately scoped; current live companion results are listed below when available.

## Known pre-dispatch grammar rejection

The first paired corpus retained 54 attempted cells (native and adapter); its application cells were not executed after the candidate failed the browser-task threshold. Four raw task-label failures satisfy the pre-registered case-folding review. Two actual adapter failures remain failures: top-level `await` caused native Python compilation to fail, while the prototype dispatcher exposed only an indeterminate outcome and discarded the useful grammar error. These results are retained in `direct.jsonl`, `adapter.jsonl` and `first-candidate-summary.json`; they are never pooled into the new candidate.

The second candidate performs a pure compilation check for synchronous `browser_exec` code before executor dispatch, using the pinned Python 3.14 grammar. It never executes the resulting code or evaluates imports. Compilation rejection returns `INVALID_TOOL_CODE`, line/error context and the synchronous helper contract, with a durable pre-dispatch rejection receipt. Valid code proceeds unchanged through native dispatch. A runtime exception, including deliberately raising `SyntaxError` after an effect, remains unknown. This does not attempt static proof that arbitrary code is read-only and does not enable browser capabilities by itself.

Two real-gateway/counting-HTTP tests verify syntax repair dispatches once, rejected code dispatches zero times, and a runtime failure after a counted effect remains unknown across restart without replay (`code-admission-delivery.log`). The controlled fixture replaces the optional browser SDK's schema rewriter only inside the test launcher; production capability/discovery guards remain installed. The exact Docker browser executor also passes fresh receipt replay and lost-ACK/form tests: one actual form POST despite timeout and retries (`native-effect-faults.json`, two tests).

The second candidate has its own source manifest, full regression log, frozen protocol and complete fresh paired corpus. First-candidate source hashes, failed development fixtures and partial corpus remain separate evidence. Engine source stays frozen during each verification run.

## Second candidate deterministic and live regressions

- Frozen full gateway suite: **166 passed, 9 opt-in skipped**, `engine-v2-candidate.log`; `candidate-v2-source.json` records unchanged source throughout the suite.
- Four separately enabled Luna regressions: **4 passed in 312.10 seconds**, `live-regressions.log`. They cover configured connection/native tool streaming, ordinary conversation to verified goal completion, three-agent goal handoff and scheduled offline work across restart.
- The ordinary goal completed two work units with one user message. The three-agent group completed one shared goal through four units. Native-backed unit status, explicit managed decisions, correlations and evidence survived hard restart.
- Actual E2B production adoption, the historical multi-session capture-quality dataset, and the three legacy automated Chromium cases remain outside this run. The selected native browser fixtures and existing Brave walkthrough are recorded separately; no skipped test is a pass.

The fresh paired corpus is bound to `protocol-v2.json` and the second candidate source hash. It does not reuse the first candidate's attempts or silently overwrite raw label failures.

## Completed paired corpus

All **81/81 planned cells** ran: nine scenarios, three repetitions, three surfaces, with the same existing ChatGPT plan and `gpt-6-luna`. There was no model/account fallback. The credential relay recorded 457 completed provider responses, all Luna, across both candidates and companion checks. Renewable credentials stayed with the existing gateway.

| Surface | All planned cells | Verified task successes | Planned, verified stops | Actual failures | Non-stop task completion |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native direct | 27 | 21 | 3 | 3 | 21/24 (87.50%) |
| Product adapter | 27 | 23 | 3 | 1 | 23/24 (95.83%) |
| Authenticated API | 27 | 23 | 3 | 1 | 23/24 (95.83%) |

Original all-cell success ratios remain **21/27, 23/27 and 23/27**; the non-stop column is an additional view, not a changed denominator or threshold. Raw scores are 61 successes, 11 failures and nine stops. Six label-only failures satisfy NMA-028's existing case-folding review, yielding **67 successes, five actual failures and nine verified stops**. Raw JSONL is unchanged. `v2-results.json` contains every review, attempt ID, Wilson interval and per-family count. Neither the direct task-success point threshold nor the release sample-size requirement is satisfied. This is foundation evidence, not release acceptance.

The five actual failures are native navigation repetitions 1/3, native download repetition 1, and navigation repetition 3 on each product surface. The model used an unsupported browser executor API. Product grammar rejection exposed synchronous Python guidance; one application download repaired the code and passed. In the remaining product navigation failures, the model repaired the syntax but referenced a nonexistent `page` object. Once code was dispatched, that runtime failure remained unknown and further writes were refused. A succeeded native admission did not override the external oracle. No unsafe NameError heuristic or arbitrary batch replay was added to improve the score.

| Surface | First progress p95 (n=24) | Settlement p95 (n=27) | Recovery p95 (n=6) |
| --- | ---: | ---: | ---: |
| Native direct | 6.743 s | 36.235 s | 3.091 s |
| Product adapter | 7.279 s | 37.392 s | 3.131 s |
| Authenticated API | 6.643 s | 38.661 s | 2.716 s |

These observed latency points are below the unchanged 10/180/60-second thresholds; their small samples do not establish the release SLO. There were zero provider or harness-classified integration failures in 81 attempts; the five external-oracle failures retain their original category rather than receiving a stronger causal attribution.

The tool journals contain **25, 29 and 31 corpus dispatch batches**, respectively; a separate application API-restart companion adds one returned batch. Unknown batch counts are **6/25, 4/29 and 4/31**, including three deliberately stopped batches per surface. They remain unknown in immutable receipts. A dispatch batch can contain multiple effects, so these are not individual-action rates. The nine instrumented form cases each produced exactly one POST: **zero duplicate form submissions in nine cases**. All nine cancellation oracles verified absence of the delayed effect. Broader duplicate/leak rates are unavailable where instrumentation does not supply a denominator. See `corpus-effect-denominators.json` and the retained counted fault tests.

## Authenticated Brave acceptance and delivery corrections

The existing Brave browser exercised the production conversation components against the production API and a real ClerkJS JWT, using disposable PostgreSQL and native gateway state. Only router/auth-hook plumbing is supplied by the Vite acceptance host; engine/model responses are real. `authenticated-isolation.json` records own-thread 200, foreign-owner thread/foreign-agent 404, and missing/invalid credentials 401. The adapter principal is an internal signed fixture, not a claimed second authenticated browser user.

- Manual native compression reduced **52 to 12 native messages**, retaining a summary and unchanged product transcript.
- DM reset preserved all **53 original messages byte-equivalently**, stable logical identity and goals. A real follow-up returned `CONTEXT_RESET_CONFIRMED` while old messages remained visible; the transcript then contained 55 messages.
- Group reset changed only the selected writer's native tip. Both peer tips, all logical identities and the complete four-message group transcript remained unchanged. Switching the selected agent cleared the preceding agent's notice.
- A short group history correctly displayed “Konteks masih ringkas. Belum perlu dirangkum.” with the conversation still connected.
- Killing/restarting only the disposable API during an active native terminal operation preserved its original run, admission and native session; it completed with the expected marker. `v2-application.api-restart.json` records the changed API PID and 19.96-second restart/settlement observation.

This walkthrough exposed two delivery corrections after the frozen live corpus: context-change intent events lacked their replay sequence, disconnecting the UI stream; and native read-only compression noops omitted mutation revision fields, leaving a pending product command. `session_controls.py` now emits the sequence and finishes noop commands using the native handle's revision/generation. Native noop reports remain read-only. An interrupted pending noop was recovered at startup, exact retry returned a finished report, and the UI remained connected. `context-event-fix.log` records 20 passing fidelity tests; `context-noop-fix.log` records 21, including noop/restart/replay coverage. The final full suite and `delivered-source.json` bind the delivered source separately from the live-corpus candidate. The only engine source delta from that candidate is this control module; model/tool dispatch code is unchanged.

The delivered full suite passed **167 tests, with nine explicit opt-in skips, in 616.86 seconds** (`engine-delivered.log`). All 41 engine source/config files remained byte-identical throughout it. The four separately enabled live regressions are additional results, not reclassified skips. Final `bun run check` and `bun run build` passed. Engine Ruff/format checks pass with the unchanged, pre-existing E731 callback assignment excluded; the root repository checks pass without new exclusions.

Screenshots `brave-dm-reset.jpg`, `brave-group-reset.jpg` and `brave-group-compression-noop.jpg`, plus read-only API/native receipts in `ui-context-evidence.json`, retain the walkthrough evidence. These tests do not claim the entire production application or native browser migration has shipped.

## Acceptance mapping

| Ticket requirement | Evidence |
| --- | --- |
| Create/resume, lost ACK, duplicate submit, active/queued cancellation, hard restart | `test_runtime.py`, `test_reliability.py`; all three live restart/reconnect/cancellation families |
| Closing clients and API restart preserve accepted execution | Offline receipt tests; live reconnect cases; authenticated API-restart companion |
| Stale ownership cannot publish/dispatch; selected pin and single authority | Stale-authority/generation tests, modified-pin refusal, integration manifest and runtime README |
| Native tool/results, compression and scoped context survive restart | `test_session_fidelity.py`, context/revocation suites; actual long-DM corpus |
| Work exceeds eight native iterations without silent truncation | Twelve-step native todo oracle; explicit finite-budget continuation oracle |
| Compression/reset preserve identity and expose context changes | Native automatic/micro/manual/reset/noop tests; authenticated Brave DM/group receipts |
| Revoke preserves completed history; references cannot reach host paths | Context revoke/active fence tests; parser rejection and host-canary tests |
| Four effect crash boundaries and separate action/observation | Reliability fault parameters, counted backend HTTP tests, native Docker lost-ACK/form tests |
| Confirmed receipt reuse, unknown writes blocked, safe observation retained | Computer-boundary and code-admission tests; five retained live failures and immutable unknown journals |
| Actionable pre-dispatch recovery and durable stop | Syntax rejection/repair counting oracle; actual repaired download; all nine live stop oracles |
| Migration/history/goal/receipt preservation and rollback | Schema-14-to-15 inventory test, historical checksum tests, complete partition backup/restore/new-write preservation test |
| Required live evidence and unchanged thresholds | Complete v2 corpus, raw v1 failures, registered protocol, real-provider goals/group/offline wake, Brave/auth isolation evidence |

Final release quality remains with NMA-039/NMA-027, native workspace/browser adoption with NMA-031/NMA-032, and complete application composition with NMA-038. This ticket's foundation acceptance does not certify those outcomes.

## Data, backup and rollback

All verification uses disposable partitions, authenticated development identities, test databases and scoped tool resources. The original user's running partition is not migrated by these tests. The schema-14 migration fixture compares old checksums, bindings, messages and unknown receipt bytes before/after migration. The gateway backup suite rehearses stopped-partition backup, inventory/hash verification, restore quarantine and preservation of newer writes. Rollback must use a separate prior Git revision and verified pre-migration backup; never run schema-14 code against a schema-15 partition or drop the new tables in production. Preserve post-migration state and external effect receipts before rollback.

## Release boundaries

The evidence establishes only the exercised local candidate and disposable fixtures. Production isolation/load/rollout, native workspace/browser migration and the larger release SLO corpus remain their named follow-up tasks. Unknown mutations without durable provider receipts remain concrete blockers, never inferred failures or successes. Native usage-anchor validation is conservative: trailing-whitespace normalization at this pin can invalidate an anchor and defer preflight until provider evidence; tests retain that failed fixture attempt and use normalized synthetic input for the committed compression oracle.

The native Responses adapter also logged its conservative removal of opaque encrypted reasoning when a per-run relay URL changed the apparent issuer. Visible typed messages, tool/results and summaries remain available; this evidence does not establish encrypted reasoning reuse across those routes. Issuer metadata is never forged to bypass the native check. Stable advanced provider routing and broader parity remain NMA-030/NMA-039 follow-up evidence.

## Follow-up implementation review · 2026-10-26

A separate [implementation review](nma-029-implementation-review.md) rechecked the live ticket and dependencies, verified all 80 archived evidence hashes, and corrected three gaps: guarded no-input refusals now retain rejection evidence; computer reconciliation requires a matching receipt and accepts proven no-input rejection; context-control request identities survive reload and transient authentication failures. The only engine source change from the historical delivered candidate is `computer.py`; the model loop and native compression boundary are unchanged.

Fresh verification: 168 gateway tests passed with nine explicit opt-in skips; 20 backend tests passed in five consecutive runs; repository checks and production build passed. Browser fault injection verified one native reset despite lost acknowledgement, reload and a transient 401, plus durable compression-noop retry and unchanged transcript. Current source hashes and new evidence are recorded in [the review manifest](evidence/nma-029-review/verification.json). Original manifests and failed live attempts remain unchanged and describe their historical candidates. The original 81-cell live corpus and real Clerk walkthrough were hash-verified, not rerun on this review revision. Foundation acceptance remains complete within the stated scope; release gates remain open.
