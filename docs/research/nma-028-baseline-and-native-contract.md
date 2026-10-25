# Native capability baseline and adoption contract

Date: 2026-10-25. [NMA-028](https://app.notion.com/p/404abdd6187381baa12cdeca39c310b1)
is **In Progress**. The engineering harness, capability registry, measured
baseline, source audit and successor ADR are implemented. The combined acceptance
is open: native distribution notices, a proven secret-isolated worker seam and
the complete paired live/authenticated corpus remain unresolved. No runtime
replacement or production readiness is claimed.

Authority: [Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a),
[adoption plan 09](https://app.notion.com/p/404abdd6187381d48e0cf27220703a95),
and the live NMA-028 acceptance. Dependencies NMA-025 and NMA-026 were read and
both were Done. Historical evidence remains unchanged.

## Delivered scope and exact inputs

- [Reproduction tooling](../../scripts/spikes/nma028/README.md): frozen protocol,
  inventory, paired live workers, read-only replay, native isolated probe and UI harness.
- [Capability manifest](evidence/nma-028/capability-manifest.json): all **106**
  family IDs, operation contracts, prerequisites, source URLs and owners; **58**
  bundled and **152** optional skill entries with exact source hashes. These
  entries remain open until their owning tickets prove usable behavior.
- [Source/seam audit](nma-028-native-seams.md): native interfaces, 14 adaptation
  seams, placement, backend alternatives, downstream owners and migration boundaries.
- [Packaging review](evidence/nma-028/packaging-review.json): exact wheel/sdist
  hashes, notice members, repository checks and verified native source hashes.
- [Evidence manifest](evidence/nma-028/verification.json): commands, counts,
  input/working-tree digests, inventories, redaction and artifact hashes.

Application base is Git `60b439191f5d26a9a83995ec9bee8aa286729577`, with the
pre-existing dirty tree captured in `before.json`. Runtime remains Hermes
`7489b22af47ce91b366dde81d5831ea422577498`, archive SHA-256
`8bb5bc691b509caa847b4e388258be2adec297f06b1ee01f56c9a742eb043d95`.
The runtime pin's source hashes were verified. No new pin is selected and no
upstream source patch is applied.

Paired settings: CPython 3.14.9, SQLite 3.53.1/WAL, `gpt-6.1-sol`, custom route to
`https://api.openai.com/v1`, native todo toolset, existing max_turns=8. Generation
parameters are unset on all three paths. Native direct uses the canonical
authenticated gateway; the adapter uses signed domain commands; public HTTP uses
the actual router and the fixed disposable account dependency. Product identity,
context/goal tools and prompts necessarily differ. Runs occurred at different
times and some surfaces overlapped, so latency differences do not establish
causal adapter overhead. This captures the existing eight-turn limit; no new
autonomy policy or blanket feature suppression is introduced.

## Frozen experiment and measured results

`protocol.json` was recorded before live runs/runtime fixes. It defines eleven
scenario families × three surfaces × three repeats = **99 planned cells**.
Five families were executed in the paired worker: short DM, large input,
multi-step todo, restart after settlement and client reconnect. The other **54
cells remain blocked**, with explicit prerequisite gaps. Separate lifecycle and
browser experiments below do not replace those paired cells.

| Surface | Planned | Executed | Passed | Rejected large input | Blocked |
| --- | ---: | ---: | ---: | ---: | ---: |
| Native Hermes | 33 | 15 | 15 | 0 | 18 |
| Ngertiin adapter | 33 | 15 | 12 | 3 | 18 |
| Public HTTP fixture | 33 | 15 | 12 | 3 | 18 |

The large input contains 12,000 synthetic ledger words and exceeds the product's
100,000-character DM contract. Native Hermes returns the retained code in 3/3;
the adapter rejects with `INVALID_REQUEST` in 3/3 and HTTP returns 422 in 3/3.
This is a reproducible input-contract difference, **not a measured browser root
cause** or an estimated general failure rate. It is not a valid long-session
compression test. Native history/compression acceptance remains NMA-029.

For the other four paired families all **36/36** tasks pass across the three
surfaces. Todo acceptance uses distinct persisted tool-call IDs and native
results showing two pending tasks become completed; final text alone cannot pass.
Restart receipts retain admission/run identity and transcript. Reconnect uses
new ingress connections; the HTTP case also checks unique replayed message IDs.
This is settled-work replay evidence, not restoration of arbitrary in-memory work.

| Surface | First progress p50 / p95 (s) | Settlement p50 / p95 (s) | Restart readiness p50 / p95 (s) |
| --- | --- | --- | --- |
| Native Hermes | 1.97 / 2.70, n=15 | 2.66 / 9.85, n=15 | 1.48 / 1.97, n=3 |
| Adapter | 1.74 / 4.69, n=12 | 4.26 / 7.35, n=12 | 3.74 / 4.65, n=3 |
| HTTP fixture | 1.69 / 5.22, n=12 | 3.35 / 7.50, n=12 | 3.84 / 4.95, n=3 |

Timings use monotonic polling and nearest-rank percentiles. Progress starts at
native tool or message output, not admission. Full denominators, admission
timings and Wilson 95% intervals are in `paired-summary.json`. No duplicate,
unknown-effect or provider-failure rate is inferred from absent instrumentation.

Pre-registered release thresholds: at least 95% task success, at most 2%
integration-attributable failure, p95 progress ≤10s, settlement ≤180s and recovery
≤60s. The defined corpus permits zero observed duplicate effects, cross-scope
leaks, stop violations and unresolved effects at release. NMA-039 must execute
at least 100 representative tasks per supported configuration and all required
live cases. These small samples do **not** establish those SLOs.

All initial attempts are retained. An initial native harness used `/tmp` rather
than canonical `/private/tmp` in the ticket binding and failed before model
execution. Initial tool scorers misunderstood native `tool_call` batching;
the corrected score is derived from saved native results and retains the prior
score. An early direct-progress metric counted admission; its original batch
is retained and a fresh batch measured actual message/tool progress. No product
behavior was fixed between these batches. Replay only reads evidence.

## Reproduced browser complaint through the UI

One additional real-model task used the production DM components, actual public
HTTP/gateway and existing E2B bridge with a disposable account dependency. Prompt:

> Use your browser capability to open https://httpbin.org/forms/post. Fill Customer name with NMA028 Synthetic and submit the form using its button. Verify the submitted name from the resulting page. This is a disposable test form. Report the observed result and any tool error accurately.

Run `f438f08e-1c64-57b5-b6a3-581e5dcd5c4a`, native admission
`98cfe433f58348d699fb09a278e42e9a`: navigation observed the form. **Both fill
attempts returned `{"error":"INDETERMINATE"}`**; following observations showed
`about:blank`. No successful submit/verification was observed. The assistant
accurately reported failure; its run was `succeeded` because response completion
does not imply task success. All seven effect rows were `confirmed`, including
the returned unknown-outcome values. This reproduces the suspected action-outcome
classification flaw in the current integrated path; the exact low-level E2B
failure cause remains undetermined.

Evidence: `ui-result.json`, `ui-native-tools.json`, `ui-effects.json`, final UI
text and screenshots. Action outcome, post-action observation, response delivery
and task success must remain separate. NMA-029 owns durable result semantics;
NMA-032 owns the browser replacement and native outcome mapping. The two fill
attempts are one failed user task, not two independent task samples. Do not
extrapolate a universal failure percentage. Production Clerk authentication and
full three-surface browser pairing remain open. The disposable E2B resource was
deleted successfully; no real account was used.

## Native isolated experiment and successor ADR-07

**Decision: Linux Docker is the selected research backend; production native
adoption is unresolved with explicit blockers.** Retain the current exact Hermes
pin for the baseline. Do not activate a second executor or carry the current
custom browser forward as an automatic fallback. Follow the source-backed
[seam/backend comparison](nma-028-native-seams.md) for downstream implementation.

The clean research image includes native browser-harness 0.1.13, fetch-use 0.4.0,
terminal/files and Debian Chromium 156.0.8078.47 through explicit loopback CDP.
The image/apt/Python inventories and probe hashes are recorded. PM's bundled
Chromium and cua-driver artifacts are inventoried in the source lock; they were
not installed or accepted by this probe. Native computer_use/display acceptance
remains open; no host desktop was controlled.

With UID 10001, read-only root, private tmpfs state/home, no network, no host
mount/socket, dropped capabilities and no provider keys, native `browser_exec`
and `terminal` pass **3/3** navigation/form/observation/CSV-byte checks. Form POST
counts are exactly three and contain only synthetic fields. The CSV SHA-256 is
`b611b0fafb38f99c14d214548fe8f89e1a7839670c66bb72e2824c9eb181dfb4`.
The browser Python uses urllib for transfer; browser-managed download events and
application attachment delivery are not verified. Fixed Python driving actual
tools is not real-model application acceptance.

The execution probe reports Python UID/PID/cwd inside the container; terminal,
Chromium and loopback CDP are co-located. Synthetic negative controls prove
browser Python can read a same-UID control file in **3/3** attempts. No actual
secret was exposed. Consequently a whole-runtime container alone cannot satisfy
the runtime-secret boundary. Remote CDP or a Docker/SSH terminal setting alone
also does not move the browser's Python subprocess. A separately scoped native
worker/tool boundary plus credential broker must be proven under Hermes-owned
admission before production selection can close (NMA-029/030/031/032).

Early research image attempts are retained: a run raced an unfinished image
build; another lacked a writable home and Chromium crashpad failed. Adding a
private writable tmpfs home produced the measured successes. A later supervisor
reconnect warning is retained even though all step and server oracles passed.
No failed attempt is omitted or silently converted into a pass.

`browser-harness` has an exact MIT notice; its required `fetch-use==0.4.0` wheel
and sdist have no license/notice file, and the declared repository/license
endpoints return 404. Metadata says MIT but is not a substitute notice. The
research image is not a releasable distribution. No compatible alternate pin
has been selected/tested; NMA-028 remains open until this is resolved without
silently removing browser support.

## Isolation, data, upgrade and verification boundaries

Persistent account/agent/thread IDs, native session/admission/tool lineage,
private DM/group context and sole Hermes lifecycle authority remain mandatory.
Workspace identity must include owner/agent/thread/generation, with process,
filesystem and network enforcement beyond profile names. The exact placement
and fail-closed broker seam remain unproven. Generic plugin execution middleware
can fail open on pre-dispatch exceptions at this pin; retain the narrowly versioned
final authorization fence until an equivalent native gate is verified.

Every replaced seam and data transition has a downstream owner in the seam audit.
All eight proposed exclusions receive implementation/design owners rather than
being approved as exclusions. The inherited M05/M06 reference to NMA-054 is a
consolidation typo; effective workspace/session/composer owners are 031/029/038.

This slice adds tooling/docs only. It changes no application schema, pin,
production dependency profile, data mapping or API contract. Existing identities,
history, goals, skills, files and receipts remain intact. Downstream replacement
must inventory existing browser resources/effects and preserve old receipts;
never replay unknown batches or merge private histories. Upgrade uses reviewed
source/lock/notice hashes and disposable restore rehearsals. Rollback retains the
isolated previous Git revision and verified backups, preserving new data read-only;
there is no in-place downgrade or dual active runtime.

Fresh verification: **25** deterministic crash/effect/context/membership tests
pass against the actual pinned gateway; **2** real-provider group/offline scheduled
wake tests pass, including restart; **7** evidence-harness tests pass. These are
separate from the 99-cell paired corpus. Group live evidence verifies peer work
but does not satisfy the paired artifact oracle. Ruff, format, documentation
integrity and owned-path whitespace checks pass. The report records author
self-review and source-review findings, not independent product acceptance.

Harness teardown was corrected to exhaust the imported pytest yield fixture
normally; closing that generator skipped its teardown. Four verified disposable
gateway processes from the early batches were explicitly cleaned up, with their
database paths recorded. A fixed-account HTTP fixture also exceeded its 10-second
SSE shutdown wait; the harness now retains its process handle and closes its own
process safely. The pre-existing development gateway was preserved. No deployment,
push, real-account migration or production Clerk acceptance was performed.
