Here is the result of "fetch" for the Page with URL https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1 as of 2026-10-25T09:23:25.341Z:
<page url="https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1">
<ancestor-path>
<parent-data-source url="collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a" name="Ngertiin Multi Agent · Backlog"/>
<ancestor-2-database url="https://app.notion.com/p/116e1edcee864b5da91887466d728aac" title="Ngertiin Multi Agent · Backlog"/>
<ancestor-3-page url="https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a" title="Ngertiin Multi Agent"/>
</ancestor-path>
<properties>
{"Depends on":["https://app.notion.com/p/402abdd618738149a019d35901a29e4b","https://app.notion.com/p/402abdd61873815186afe9c8bf2299bf"],"Fase":"Discovery","Jenis":"Spike","Name":"NMA-028 · Baseline, native architecture and capability adoption contract","Prioritas":"P0","Referensi":"https://app.notion.com/p/404abdd6187381d48e0cf27220703a95?pvs=204","Status":"Blocked","Ticket":"NMA-028","Urutan":28,"url":"https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1"}
</properties>
<iconMetadata>null</iconMetadata>
<content>
## Outcome

Produce reproducible interaction baselines and a source-backed native integration/backend decision, with every applicable Hermes capability accounted for.

<b>Status:</b> Blocked by configured model-provider credit exhaustion. The continuation closes local-CDP packaging, scoped native-code/secret isolation, real Clerk authentication and authenticated history/UI gaps. The 99-cell matrix has 89 attempted cells: 28 passed, 58 provider failures and 3 unknown; 10 product lifecycle cells remain unexecuted. Required live behavior and combined acceptance remain open; this is not a Done or release claim. It groups 2 related work packages at the user's request. Complete the numbered units in the order below; acceptance is evaluated per unit and for the combined outcome.

## Scope and prerequisites

Inventory IDs: O11, O12, W04, W07, C10, O09, O13.

Required predecessors: NMA-025, NMA-026. Read the native Depends on relations and current evidence before starting.

<mention url="https://app.notion.com/p/404abdd6187381d48e0cf27220703a95" /><br /><mention url="https://app.notion.com/p/402abdd618738149a019d35901a29e4b" /><br /><mention url="https://app.notion.com/p/402abdd61873815186afe9c8bf2299bf" />

## Ordered implementation units

### 1. Establish Hermes capability coverage and reproducible interaction baselines

Turn the user's report of pervasive tool failures into reproducible evidence and freeze the applicable Hermes capability contract before changing runtime behavior.

<b>Implementation</b>

1. Capture repository revision plus working-tree digest, actual runtime pin, environment/dependency versions and redacted agent/model/tool configuration. Preserve existing evidence and distinguish user-reported failures from reproduced incidents.
2. Create a paired harness for direct pinned Hermes, the Ngertiin adapter and the authenticated application. Match model/provider/tool/environment settings; record unavoidable differences instead of attributing them to Ngertiin.
3. Cover short/long DM, multi-step tools, browser navigation/form/download, restart, cancellation, reconnect, offline goals and group handoff. Capture command, session, admission, tool/effect and artifact IDs with phase timings.
4. Reconcile all 106 inventory IDs against this plan. Expand grouped features into concrete supported operations; register upstream additions at any selected new pin. Record exclusions, environment prerequisites and owning ticket.
5. Pre-register repeat counts, task-success oracles, latency measures and release thresholds before implementation. Report all attempts and separate adapter errors, provider faults, tool failures, unknown effects and user stops.

<b>Acceptance</b>

- [x] Every inventory ID has an explicit disposition and owner or exclusion reason; no row disappears because implementation is difficult.
- [x] The browser complaint has reproducible cases or a precise evidence gap; historic [example.com](http://example.com) success is not presented as broad reliability.
- [ ] Paired runs produce machine-readable results and redacted traces; a replay does not re-execute external actions.
- [x] Thresholds and denominators are recorded before fixes; skipped live cases cannot count as passes.

<b>Verification:</b> Run representative baseline scenarios with real model/tools in disposable accounts; keep deterministic fixtures for fault reproduction. Baseline evaluation is engineering tooling, not a public training-data product.

<b>Data and rollback:</b> Read-only inventory and disposable fixtures; do not migrate real accounts or alter historical receipts.

<b>Boundary:</b> No application redesign or blanket feature disablement in this ticket.

### 2. Decide the native Hermes integration and execution environment

Select a source-backed integration and execution environment that retains native Hermes capabilities without assuming E2B or the existing custom browser must remain.

<b>Implementation</b>

1. Compare documented gateway session/admission/event interfaces, supported plugins/hooks and the current subclass/wrappers. Produce a seam inventory identifying retain, replace, upstream contribution or narrowly versioned adaptation.
2. Run native browser\_exec plus terminal/files in disposable isolated environments, starting with Hermes-supported Chromium/terminal combinations. Compare applicable Docker/SSH/cloud/plugin options on compatibility, isolation, startup, persistence, latency, cost and operational complexity; E2B is a candidate only.
3. Verify exactly where browser\_exec Python, terminal commands, CDP and cua-driver execute. A sandboxed browser does not prove the model-written Python or gateway host is isolated.
4. Resolve browser-harness/fetch-use packaging exclusions and executable/browser dependency provenance. If the current pin cannot be packaged, evaluate a specific compatible upstream pin or supported backend; record differences and notices, never silently remove browser capability.
5. Record a successor ADR covering account/agent/thread isolation, workspace/session mapping, sole lifecycle authority, supported backend, browser/tool contracts, old-data migration and upgrade strategy. Keep a single active executor per scope.

<b>Acceptance</b>

- [x] At least one packaged native browser+terminal path passes multi-step interaction in the chosen isolated environment, or the ADR clearly remains unresolved with a blocker.
- [x] The ADR contains measured comparison evidence and an explicit backend choice; no E2B constraint is carried forward by inertia.
- [x] Runtime/model-worker/container boundaries prevent access to other accounts and runtime secrets; profile separation alone is not accepted.
- [x] Every replaced seam and schema/data transition has an implementation owner in subsequent tickets.

<b>Verification:</b> Use the NMA-028 paired cases, native source at exact revisions and clean-install package inventories. Research results do not claim production release.

<b>Data and rollback:</b> Specify preservation and resource reconciliation before replacement. Keep the old implementation as Git history, not an automatic fallback.

<b>Boundary:</b> No hosted Nous dependency and no second scheduler/runtime. Exact technology choice is a spike output, not already approved.

## Combined definition of done

- [ ] All unit acceptance criteria are satisfied with linked evidence; an incomplete unit keeps this ticket open.
- [x] Exact Hermes revision, dependencies/notices, configured capabilities and integration changes are recorded. Native source availability alone is not product acceptance.
- [ ] Real runtime/tool behavior, applicable authenticated web UI, failure/restart, scope isolation, cancellation and duplicate-effect behavior are verified. Required live tests cannot be silently skipped.
- [x] Use NMA-028's pre-registered baseline/thresholds; record counts, denominators and limitations, including unsuccessful attempts.
- [x] Versioned API/config/schema changes preserve existing identities, history, goals, skills, files and receipts; migration and rollback are rehearsed on disposable data where applicable.

Each capability includes its minimal usable API/UI and evidence here. NMA-038 integrates the complete user experience; it must not become a reason to defer all product verification until the end. Hermes remains the sole execution/scheduling/recovery authority. No mandatory goal activation form, multi-human group, arbitrary initiative gate or alternate engine is introduced.

## Implementation starting points

- <code>apps/engine/tests</code>
- <code>apps/backend/tests</code>
- <code>docs/research/hermes-feature-inventory-2026-10-24.md</code>
- <code>apps/engine/src/ngertiin_engine/diagnostics.py</code>
- <code>apps/engine/build_runtime.py</code>
- <code>apps/engine/src/ngertiin_engine/runtime-pin.json</code>
- <code>apps/engine/src/ngertiin_engine/service.py</code>
- <code>apps/backend/src/ngertiin/agent_engine/computer_bridge.py</code>
- <code>docs/research/nma-006-packaging-closure.md</code>

These are current inspection entry points, not compulsory final module boundaries. Re-check live code with knowledge-graph tools when available. Preserve unrelated working-tree changes. New engine/backend code and authored technical text are English; preserve user content.

## Sources

<mention url="https://app.notion.com/p/403abdd61873817baf6af25d6636fe72" /><br /><mention url="https://app.notion.com/p/402abdd6187381beacd6c48fa521b99f" />

- [Hermes: batch-processing](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/batch-processing.md)
- [Hermes: built-in-plugins](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/built-in-plugins.md)
- [Hermes: cli](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/cli.md)
- [Hermes: browser](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/browser.md)
- [Hermes: computer-use](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/computer-use.md)
- [Hermes: tools](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/tools.md)
- [Hermes: plugins](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/features/plugins.md)
- [Hermes: managed-scope](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/managed-scope.md)
- [Hermes: multi-profile](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/multi-profile-gateways.md)
- [Hermes: egress](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/egress/index.md)
- [Hermes: secret-sources](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/website/docs/user-guide/secrets/index.md)

## Implementation and measured baseline — 25 October 2026

<b>Status: In Progress.</b> NMA-025 and NMA-026 were read live and are Done. This spike adds engineering tooling and evidence; it does not replace the product runtime. All pre-existing input paths remain byte-identical. No real account, production schema, runtime pin, deployment or fallback engine was changed.

<b>Repository deliverables</b>

- <code>scripts/spikes/nma028/</code>: frozen protocol, read-only input/capability capture, paired real-model workers, JSONL replay/scoring, isolated native probe, UI reproduction and seven evidence-boundary tests.
- <code>docs/research/nma-028-baseline-and-native-contract.md</code>: measured findings, successor ADR-07, data/upgrade boundary and open acceptance.
- <code>docs/research/nma-028-native-seams.md</code>: 14 source-backed seam dispositions, execution placement, backend comparison and transition owners.
- <code>docs/research/evidence/nma-028/verification.json</code>: commands, exact source/dependency/image provenance, all raw batches, redacted traces, screenshots and 65 verified source/evidence hashes.

<b>Frozen contract and coverage.</b> The protocol predates the live runs and any runtime fixes. All 106 inventory IDs have operation contracts, prerequisites, source URLs and owners. All 58 bundled and 152 optional skills have individual source hashes, declared prerequisites/platforms and open workflow verification. The eight proposed extra exclusions are assigned implementation/design owners rather than accepted as exclusions. The inherited M05/M06 reference to NMA-054 is a consolidation typo; effective owners are NMA-031/029/038.

<b>Paired live smoke evidence.</b> Hermes remains at <code>7489b22af47ce91b366dde81d5831ea422577498</code>, Python 3.14.9, model <code>gpt-6.1-sol</code>, custom OpenAI route, todo tools and existing max\_turns=8. Of 99 planned cells, 45 were executed: native direct 15/15, adapter 12/15 and public HTTP fixture 12/15. Six large-input cases are explicit product 100,000-character contract rejections; they are not a browser failure estimate or a compression test. The other four executed families pass 36/36 across surfaces. The remaining 54 paired cells are blocked, never passes. Public HTTP/UI uses a fixed disposable account dependency; production Clerk is unverified.

First-progress p95: direct 2.70s (n=15), adapter 4.69s and HTTP 5.22s (n=12 each). Settlement p95: 9.85s, 7.35s, 7.50s; restart readiness p95: 1.97s, 4.65s, 4.95s (n=3 each). Different product prompts and non-simultaneous samples prevent causal overhead claims. Full denominators, Wilson intervals and pre-registered SLOs are in the evidence. Initial binding/scoring/progress-instrumentation failures and corrected batches remain retained; replay never invokes external actions.

<b>Browser complaint reproduced through UI.</b> One real-model task opened the synthetic httpbin form through the existing E2B bridge. Both fill attempts returned <code>INDETERMINATE</code>, then observation showed <code>about:blank</code>. No successful submission/verification was observed. The response correctly reported failure, but run <code>f438f08e-1c64-57b5-b6a3-581e5dcd5c4a</code> settled as <code>succeeded</code> and all seven effect receipts were <code>confirmed</code>, including the unknown-outcome returns. Native admission: <code>98cfe433f58348d699fb09a278e42e9a</code>. Task success, response delivery, action outcome and observation must remain distinct. The exact low-level E2B cause remains undetermined. Screenshots, native calls/results, effects and diagnoses are retained; disposable resource deletion succeeded.

<b>ADR-07: research backend chosen, production integration unresolved.</b> Native browser\_exec and terminal pass 3/3 synthetic navigation/form/action/observation/file-byte checks in a clean non-root Linux Docker container with read-only root, private tmpfs, no network/host mounts/socket/provider credentials. Python, Chromium/CDP and terminal are co-located. The CSV uses urllib inside browser Python; browser-managed download semantics remain open. Fixed Python driving real tools is not live-model application acceptance. A synthetic negative control proves same-UID browser Python can read the runtime control canary in 3/3; whole-runtime containers and remote CDP alone do not satisfy secret isolation. Native cua-driver/display is not verified.

<b>Open blockers</b>

- Exact fetch-use 0.4.0 wheel/sdist still lack a license/notice file; declared repository/license endpoints return 404. Browser-harness 0.1.13 has its MIT notice and requires that version. The research image is not releasable. No alternative pin is silently substituted or browser capability removed.
- Prove a scoped native worker/tool and credential-broker seam under Hermes-owned admission. Generic middleware at this pin can fail open; retain the versioned final authorization fence until an equivalent gate is proven. Owners: NMA-029/030/031/032.
- Complete the required paired live browser/computer, cancellation, offline/group artifact and production-authenticated coverage; fixed fixtures and skipped/blocked cells do not close acceptance. NMA-029/032 own the reproduced unknown-outcome mapping. NMA-039 owns the larger release corpus.

<b>Fresh verification.</b> 25 deterministic crash/effect/context/membership tests, two real-provider group/offline-wake tests and seven harness tests pass. Ruff/format, UI fixture configuration checks, documentation integrity and whitespace pass. These supplemental tests are separate from the 99-cell paired corpus; group live evidence does not satisfy its artifact oracle. Author/source self-review only; no independent product acceptance is claimed.

No new data migration is needed in this tooling slice. Downstream replacement preserves identities, native lineage, scoped history/goals/skills/files/receipts and reconciles browser resources/unknown effects. Rollback stays isolated Git plus verified backups, with one active executor. Work remains local and uncommitted. Combined acceptance remains unchecked; the ticket is not Done.

## Continuation evidence — native execution, authentication and preservation

<b>Status: Blocked by model-provider credit exhaustion. Not Done.</b> This entry supersedes the earlier packaging/isolation/authentication blockers, while preserving the original raw baseline and its 65 verified artifact hashes. No production runtime, pin, schema, real account or deployment was replaced.

<b>ADR-08 and packaging.</b> <code>docs/research/nma-028-native-contract-closure.md</code> selects scoped Linux Docker native tool workers, with Hermes as sole model/session/admission/stop/scheduling/recovery authority. <code>browser_exec</code> Python, Chromium/CDP, terminal and files execute together in an owner/agent/thread/generation container; model/control credentials stay outside. The persistent native registry prevents upstream interpreter-exit browser cleanup between tool calls. Exact Hermes revision remains <code>7489b22af47ce91b366dde81d5831ea422577498</code>. The tested image is <code>sha256:b81f1bf356adb3f4cff012b2b95d95c6458b5ba876c1e886a59a24a82e574ebd</code>.

The explicit local-CDP package profile <code>browser-harness==0.1.13+ngertiin.localcdp.1</code> changes metadata only: all 17 modules/resources and the MIT notice are byte-identical. The lazy hosted Fetch-service dependency becomes an unselected optional extra; normal clean dependency resolution/checks pass. The unresolved fetch-use notice still blocks that remote service variant. No browser capability or upstream code was silently removed. Packaging details: <code>docs/research/nma-028-packaging-resolution.md</code>.

<b>Measured boundaries.</b> Eight real Docker/native tests pass, plus a strengthened key/symlink probe: three native multistep forms and browser-managed downloads, cross-owner/thread/secret refusal, durable receipt deduplication, active stop, lost acknowledgement after one POST, pause/restart and missing-volume quarantine. Three timed scopes measure cold readiness p50/p95 1.410/3.015s, warm terminal 0.463/0.486s and scope resume 0.879/0.879s. No production/dollar-cost or unmeasured SSH/cloud superiority claim. The headless cua-driver variant explicitly reports unavailable; desktop adoption remains included and owned by NMA-032. Details: <code>nma-028-isolation-proof.md</code>, <code>evidence/nma-028-closure/backend-measurements.json</code>.

<b>Real authentication/UI.</b> Two actual ClerkJS development sessions pass unmodified production <code>current_account</code>; invalid/missing tokens return 401. Own agent/history reads return 200; a foreign valid owner plus forged owner header receives 404. Actual production conversation components display the persisted real-model native form result, with message/command hashes unchanged. A separate controlled-model test through the real Clerk/API/native Docker path verifies stop beyond the delayed write, restart and exact request deduplication (1 passed). It is not a live-model corpus pass. All recorded disposable users/sessions/database/processes were cleaned and verified absent. Evidence: <code>nma-028-clerk-auth.md</code>, <code>evidence/nma-028-closure/auth-history-proof.json</code>, <code>authenticated-ui-history.png</code>, <code>gateway-stop-proof.json</code>, <code>auth-cleanup.json</code>.

<b>Preservation.</b> The real settled pilot was copied under read-only locks: all 378 original persistent files stayed unchanged. Canonical backup/restore preserves every typed table/DDL digest across three SQLite stores and refuses quarantined startup. Native journal/workspace rollback preserves bytes and exact receipts, leaves one effect byte, fences the old controller and retains post-cutover data separately. A supplemental controlled-model product contract passes for nonempty stopped goals, memory provenance, config/skill assignment, skill bytes, artifact and replay refusal. Restore-only Chromium singleton reconciliation happens after the old executor is absent; frozen runtime supervisor remains unchanged. Details: <code>docs/research/nma-028-preservation-rehearsal.md</code> and three <code>preservation-*.json</code> evidence files.

<b>Frozen live matrix.</b> <code>nma028-closure-v2</code>, SHA-256 <code>189f073d366760cc95f53fed3a806ada1ec9f34a242d24c5e26a9d74a787e3cb</code>, retains three repeats and all 99 cells. Long history now uses two 64,000-character inputs plus recall, within each product input limit. Direct: 33 attempted/12 passed/18 provider failures/3 unknown. Adapter: 28 attempted/7 passed/21 provider failures/5 unexecuted. Actual-Clerk application: 28 attempted/9 passed/19 provider failures/5 unexecuted. Total: <b>89 attempted, 28 passed, 58 provider failures, 3 unknown, 10 unexecuted</b>. Direct totals include the lifecycle companion: native group core 3/3 recovered from canonical native attachment bytes without re-executing work; native offline jobs fired once after restart but model completion is 0/3 due to provider rejection. Extra group review is 2/3 and remains separate.

All pilot batches, failed harness attempts, raw scores and read-only corrections remain retained. One navigation ledger-only raw pass is conservatively downgraded after its native result proves interrupted completion; prior score and observed effects remain. Native terminal receipt review verifies original DB/WAL hashes unchanged. JSON-only replay produces identical derived bytes; nine evidence/replay tests pass. Lint/format, UI configuration checks, docs integrity, whitespace and scanning ten private values/JWT shapes pass. Current counts do not meet release thresholds or complete required live acceptance.

<b>External blocker and exact next work.</b> The configured real <code>gpt-6.1-sol</code> route repeatedly returns <code>429 credit_balance_exhausted</code> and “You have no credits remaining”; a later minimal probe confirms the same. No alternative inference credential is configured. Restore provider credit or explicitly configure an available provider, then execute fresh paired browser/download/stop/restart/reconnect and product offline/group-artifact batches plus native offline completion. A different provider requires its own recorded paired settings. Keep failed/unexecuted cells in their denominators. Do not replace them with deterministic proofs or mark Done prematurely.

Reproduction: <code>scripts/spikes/nma028/CLOSURE.md</code>. Source/evidence manifest and read-only verifier: <code>docs/research/evidence/nma-028-closure/verification.json</code>, <code>scripts/spikes/nma028/verify_closure.py</code>. Work remains local and uncommitted. Historical evidence stays byte-stable. <code>docs/agent.pen</code> has unrelated external drift from the preceding run's final snapshot and is preserved; other prior snapshot paths remain unchanged. Combined acceptance and complete paired live verification remain open.
</content>
</page>

<parent-data-source-schema url="collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a">
The SQLite table definition for this page's parent data source. Use these column names and option values to set this page's properties, create sibling pages, or query the data source.
<sqlite-table>
CREATE TABLE IF NOT EXISTS "collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a" (
	url TEXT UNIQUE,
	createdTime TEXT, -- ISO-8601 datetime string, automatically set. This is the canonical time for when the page was created.
	"Owner" TEXT, -- JSON array of zero or more user IDs
	"Fase" TEXT, -- one of ["Discovery", "Foundation", "DM", "Goals", "Groups", "Integration", "Release"]
	"Referensi" TEXT,
	"Depends on" TEXT, -- JSON array of page URLs relating to {{collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a}} data source, you must "view" {{collection://9e5e7bf7-f822-4b73-a682-c60dcd50da4a}} to query this column
	"Jenis" TEXT, -- one of ["Spike", "Implementasi", "Validasi"]
	"Urutan" FLOAT,
	"Ticket" TEXT,
	"Prioritas" TEXT, -- one of ["P0", "P1"]
	"Status" TEXT, -- one of ["Backlog", "Ready", "In Progress", "Review", "Blocked", "Done"] Default: "Backlog".
	"Name" TEXT
)
</sqlite-table>
</parent-data-source-schema>
