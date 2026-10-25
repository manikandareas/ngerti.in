# Native integration decision and remaining live acceptance

Date: 2026-10-25. Authority: [NMA-028](https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1)
and [capability adoption plan](https://app.notion.com/p/404abdd6187381d48e0cf27220703a95).
Status: **Blocked by configured provider credit exhaustion; not Done**.

This continuation closes the packaging, scoped arbitrary-code execution and real
Clerk authentication gaps in the earlier [baseline report](nma-028-baseline-and-native-contract.md).
Its raw evidence and 65-file hash manifest remain historical and unchanged.
Required live acceptance remains incomplete: failed provider requests are real
attempts, but they do not verify the browser/tool/cancellation/goal behavior that
the model could not perform. No release threshold or acceptance criterion is waived.

## ADR-08: select scoped Linux Docker native tool execution

ADR-08 supersedes ADR-07's unresolved execution/packaging recommendation for this
spike. Select **Linux Docker with a persistent native tool dispatcher per
owner/agent/thread/context generation**, private workspace volume and local
Chromium/CDP. Hermes remains the only model/session/admission/cancellation/goal
scheduling/recovery authority. The dispatcher transports native tool requests;
it has no model client, prompt queue or scheduler.

The trusted gateway/model worker retains control state, provider credentials and
authenticated scope binding. Model-written `browser_exec` Python, terminal and
file operations run inside the scoped container. Neither remote CDP alone nor
putting the entire gateway and browser into one same-UID container protects the
gateway's own secrets. That failed historical canary remains retained.

The exact native source is still `7489b22af47ce91b366dde81d5831ea422577498`,
archive SHA-256 `8bb5bc691b509caa847b4e388258be2adec297f06b1ee01f56c9a742eb043d95`.
The tested tool image is
`sha256:b81f1bf356adb3f4cff012b2b95d95c6458b5ba876c1e886a59a24a82e574ebd`.
Python is 3.14.9; the recorded Chromium executable is 156.0.8078.47.
The source pin and actual dependency/executable inventories are recorded separately
from this image identity; no newer upstream pin was silently selected.

| Candidate | Evidence | Decision |
| --- | --- | --- |
| Scoped Docker native tools | Eight real boundary/interaction tests pass, plus a strengthened secret/symlink probe. Three timed native-only scopes measure allocation, first/warm terminal, browser and resume. | Selected executable spike backend. |
| Same-UID whole-runtime container | Earlier 3/3 native Python probes can read the runtime control canary. | Reject this placement for arbitrary model code and runtime secrets. |
| Existing custom E2B browser bridge | Earlier real-model UI form failed twice with unknown outcomes; seven receipts were incorrectly confirmed. Workload differs from native fixtures. | Replace the custom action contract through NMA-032; retain receipts/resource reconciliation. No automatic fallback. |
| SSH, cloud terminal and provider plugins | Exact native source supports applicable variants, with differing stream, storage and desktop contracts. No configured comparable live environment was measured. | Unselected variants, with prerequisites recorded; no numerical superiority or exclusion claim. |
| Remote browser/CDP only | Native source launches harness Python locally; remote browser does not move Python or terminal. | Insufficient execution boundary by itself. |

Measured selected-backend phase p50/p95 seconds, n=3 each: cold scope ready
1.410/3.015; first terminal 2.219/2.746; warm terminal 0.463/0.486;
first browser navigation 1.647/1.746; idle pause 3.175/3.178; scope resume
0.879/0.879. These are distinct scoped fixtures on this development Docker host,
with prebuilt image, no external network and no model calls. They exclude image
pulls, cloud costs and production contention. Dollar cost is unmeasured; CPU,
memory/process limits and operational lifecycle are explicit in the supervisor.
See [backend measurements](evidence/nma-028-closure/backend-measurements.json).

## Packaging and source-backed adaptation

The selected local-CDP profile uses
`browser-harness==0.1.13+ngertiin.localcdp.1`, wheel SHA-256
`49c26eb458f31b2e58af3334821d721b1bddf892be109a74b29ea191c0f0a0ea`.
All 17 upstream modules/resources and the MIT notice remain byte-identical.
Only deterministic wheel metadata makes the lazy, hosted Fetch-service dependency
an optional unselected extra. Normal resolution, clean install and dependency
checks pass. No `--no-deps` bypass or invented notice is used. The missing notice
for `fetch-use==0.4.0` remains a blocker for that unselected remote service variant,
not the tested local native browser path. See [packaging resolution](nma-028-packaging-resolution.md).

The container keeps one native registry interpreter alive. A fresh interpreter
per call triggered upstream atexit cleanup and lost the browser between steps;
the retained failed probes document this cause. Native schema, arguments and
results remain unchanged. The versioned [gateway launcher](../../scripts/spikes/nma028/spike_gateway.py)
installs the registry transport and binds native operation identity before delivery.
Product live grant/context fences remain active. An indeterminate supervisor
receipt exits outside the native registry's error-to-text catch, preserving the
unknown outcome rather than confirming it as successful delivery.

No production service module, runtime pin, API or schema is replaced by this
launcher. The 14 seam dispositions and all schema/data transition owners remain
in the [source-backed seam audit](nma-028-native-seams.md). NMA-029 owns native
admission/session/history/stop integration; NMA-030 owns configuration, operation
grants and scoped credential brokers; NMA-031 owns workspace/artifact lifetimes;
NMA-032 owns native browser/desktop and existing resource reconciliation.
NMA-033–037 own their capability operations, NMA-038 integrated UI, NMA-039 release
rehearsal and the larger representative corpus. The 106 inventory families and
210 individual skills retain their operation contracts, sources and owners.

## Verified behavior and explicit variants

- Real isolated native navigation, later-call form submission/observation and
  browser-managed CSV downloads pass three repeats with exact file bytes.
- Other-owner/thread workspace, trusted control files/environment, provider key,
  Docker socket, scope spoofing, traversal and symlink export are refused.
- Durable operation replay returns the saved result; changed-body reuse conflicts.
  Lost acknowledgement after one real POST remains indeterminate and cannot
  dispatch another action. Pause/restart retains resource identity; missing ready
  storage is quarantined, including read-only export.
- A real production API command with real Clerk authentication and a controlled
  model cancels an active native terminal operation. Observation beyond its
  delayed write finds no file; restart plus exact command retry returns the same
  cancelled run. This supplemental test is **not** a live-model corpus pass.
- Two real disposable Clerk browser sessions pass unmodified production
  `current_account`; missing/invalid JWTs return 401. Authenticated owner lists
  return 200; another valid owner plus a forged owner header receives 404 for the
  foreign thread. Actual production conversation components show the persisted
  real-model form result. The local UI bridge supplies a real JWT and is not a
  production authentication route. Message and command-history hashes stay unchanged.
- Native three-peer group handoff and actual attachment bytes satisfy the frozen
  core oracle 3/3. Read-only recovery uses exact native attachment APIs on a backup;
  it starts no gateway, model, scheduler or tool. Extra final artifact review is
  2/3 and remains separate. See [native lifecycle evidence](nma-028-native-lifecycle.md).
- Headless `computer_use(list_apps)` precisely reports missing cua-driver with lazy
  installation disabled. No host desktop/display is mounted. This is an unavailable
  configuration observation; desktop capability remains included and owned by NMA-032.

Details: [isolation](nma-028-isolation-proof.md), [real authentication](nma-028-clerk-auth.md),
[stop receipt](evidence/nma-028-closure/gateway-stop-proof.json),
[history and cross-owner proof](evidence/nma-028-closure/auth-history-proof.json),
[UI screenshot](evidence/nma-028-closure/authenticated-ui-history.png).

## Frozen live corpus and provider blocker

Protocol `nma028-closure-v2` SHA-256
`189f073d366760cc95f53fed3a806ada1ec9f34a242d24c5e26a9d74a787e3cb`
was frozen before these runs and transport fixes. Long DM now spans two 64,000
character messages and a third recall request, respecting the existing per-message
contract while exercising 128,000 characters of history. This is not a claim that
all native compression modes have been adopted.

| Surface | Planned | Attempted | Passed | Provider failures | Unknown | Unexecuted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Direct native | 33 | 33 | 12 | 18 | 3 | 0 |
| Product adapter | 33 | 28 | 7 | 21 | 0 | 5 |
| Application with real Clerk | 33 | 28 | 9 | 19 | 0 | 5 |
| Total | 99 | 89 | 28 | 58 | 3 | 10 |

The direct total includes native lifecycle companion cases. Failed tasks remain
denominator entries. The three direct cancellation timeouts lack a saved final
card in the raw row and remain unknown rather than receiving inferred attribution.
Ten product offline/group cells were not executed after the provider stopped
accepting work. Three native scheduled jobs fired once after restart, but all
three model completions failed because credits were exhausted. They are 0/3 task
success, not three offline-goal passes.

The provider rejected real configured `gpt-6.1-sol` requests with
`429 credit_balance_exhausted` and “You have no credits remaining”. A later
minimal availability probe returned the same error. Product failures that only
exposed `RUNTIME_FAILED` were traced read-only to their exact native terminal
receipts. Database/WAL hashes remained unchanged. One direct browser navigation
raw score accepted the request ledger despite interrupted completion; the derived
score conservatively downgrades it and retains its prior score and observed effects.

The preliminary direct/application short-DM and native-form pilot batches each
passed 6/6 before exhaustion; the first direct attachment harness failed 6/6.
These whole batches are retained separately, never selected to replace failed
final cells. Earlier native lifecycle attachment scoring/connection failures and
read-only derived corrections remain retained with their original hashes.
All raw JSONL, attribution reviews, 99-cell derived matrix, sample sizes, nearest-rank
phase timings and Wilson intervals are under
[closure evidence](evidence/nma-028-closure/paired-summary.json).
Mixed provider failures make these timing distributions unsuitable for a causal
adapter-overhead or reliability claim. No 95% task-success or release claim is made.

## Preservation and completion boundary

Only disposable fixture accounts/databases/profiles/containers were used. This
spike does not edit existing user partitions or unrelated working-tree changes. Historical
migrations and receipts are retained. The spike introduces no production data
migration. Its new scoped journal and resource identity preserve workspace bytes
and receipts through restart; the preservation rehearsal records backup/restore
and quarantine separately from real-model behavior.

The [disposable preservation rehearsal](nma-028-preservation-rehearsal.md) copies
the settled real-model pilot under read-only locks and proves all 378 original
persistent files unchanged. Canonical restore retains typed table rows and DDL
across three SQLite stores and refuses startup while quarantined. A separate
controlled-model contract preserves nonempty stopped goals, memory provenance,
configuration/skill assignment, authored skill bytes and immutable artifacts.
Native workspace/controller rollback retains exact receipts and one effect byte,
fences the old controller and retains newer data in a separate archive. Explicit
restore-only Chromium singleton reconciliation happens after the old container is
absent; it does not alter the frozen running supervisor or erase browser history.

All 65 artifacts in the preceding verification manifest still match their hashes.
Compared with that run's final input snapshot, `docs/agent.pen` has unrelated
external changes; those bytes are preserved, and this continuation does not claim
that the entire mixed working tree stayed byte-identical. Other prior snapshot
paths remain unchanged.

Before production replacement, retain owner/agent/thread/native lineage and
configuration/context identity; drain/fence the single executor, snapshot and
verify control DB plus workspace/object bytes, reconcile unknown effects and old
browser resources, then activate one new executor. Never merge DM/group history,
recreate old goals or blindly replay old actions. Rollback is isolated Git and a
verified backup, with newer state retained for forward reconciliation.

To finish NMA-028, restore the configured provider's available credit or explicitly
configure another permitted provider in `.env`, then run the remaining live
families in fresh fixture profiles with a new output path. A changed provider
requires a new paired batch with its settings recorded; it cannot be pooled as
equivalent. Keep every failed attempt. Complete real-model browser/download/stop,
restart/reconnect, product offline and group artifact cases; rerun native offline
completion. Recheck all acceptance and update Notion only from actual results.
Deterministic proofs and provider-rejected attempts do not substitute for those
required behaviors. The current combined definition of done remains open.
