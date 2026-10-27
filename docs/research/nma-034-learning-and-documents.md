# Scoped memory, learning and native document workflows

Status: implementation and feature acceptance verified locally on disposable partitions.
Production rollout and release SLO acceptance remain separate gates.
Source of truth: [NMA-034](https://app.notion.com/p/404abdd618738183a3b1f1f048428268).
The live main spec and dependencies NMA-009, NMA-029, NMA-030 and NMA-031 were
read before implementation; all four dependencies were Done. The numbered unit evidence below covers the implemented outcome. No original account migration,
push or production rollout is claimed.

## Runtime and data decisions

Hermes remains the sole admission/session/scheduler/recovery authority at
`7489b22af47ce91b366dde81d5831ea422577498`. There is no second agent loop or
memory daemon in Ngertiin. Reviewed source seams and hashes are recorded in
`apps/engine/src/ngertiin_engine/runtime-pin.json`; upstream bytes are unchanged.

Schema 17 is additive. Existing `nma_memory_entries` IDs, contents and provenance
remain canonical. Native MemoryStore add/patch/remove/batch behavior runs through
its mutation seam; immutable snapshots, deletion tombstones and command receipts
are retained separately. Corrections advance context generations and fence stale
work. The correcting admission may finish its reply, while subsequent calls with
an old generation are refused. Duplicate extraction/command retries reuse the
same identity rather than multiplying rows.

Recall uses native FTS/browse/time/compression lineage against read-only scoped
SQLite views. The views are installed on every native connection, including
reconnect after an IO error. Authorized source session/thread links accompany the
result. Same-agent private DMs can recall one another; a group cannot read those
DMs, and an agent cannot recall another agent's private work. Revoked membership
or context generations are revalidated before returning data.

Dynamic skills use complete immutable packages: SKILL.md, scripts, templates,
references, executable bits and SHA-256 values. Native skill discovery/view and
skill_manage run in a temporary scoped native home, without executing skill
preprocessors on the gateway. Assets are staged into the isolated worker under a
content-addressed path. Assigned instruction text is converted verbatim to an
inline package; each future admission resolves its current version instead of a
frozen old persona. Local edits block catalog overwrite and remain recoverable.

All 210 pinned bundled/optional entries have individual asset hashes, upstream
metadata, platform/license data, declared requirements, extracted setup sections
where present and credential variable names. Seven workflows are selected:
DOCX, XLSX, PowerPoint, PDF, grounded-citations, codebase-inspection and
systematic-debugging. Another 197 require setup; six client/upstream-specific
workflows are excluded. Installation does not imply readiness. Missing selected
assets or the required immutable runtime image is an explicit repair state.
Default model discovery returns a compact supported catalog; native category
filters expose additional workflows without spilling an inaccessible host file.

Native curator state transitions run inside the existing gateway housekeeping
chore. They respect enabled/pause, first-run deferral, interval and minimum idle
settings, and skip active/queued admissions. Archive retains every asset revision;
restore creates a new revision. No stopped goal is submitted or resumed.
`curator.consolidate=true` reports an explicit setup state: the standalone native
auxiliary LLM fork is not connected to product scopes. Ordinary admitted agents
can consolidate methods using native skill_manage batches. Native detached
background-review forks are explicitly disabled in product session policy because
they do not own a product admission/credential lease; foreground learning and
gateway-owned deterministic maintenance remain enabled.

## Self-hosted memory service

[Hindsight](https://hindsight.vectorize.io/developer/installation) was selected
and tested in an isolated Docker service, after the user requested a self-hosted
alternative to RetainDB/ByteRover. Its exact OCI digest is in
`infra/memory.compose.yaml`; the native Hermes catalog references plugin version
1.2.3 at `d952b6e655fccab4581ee0722b51c5f103873d12`.
Ngertiin implements the pinned native MemoryProvider interface and calls the
service API. The standalone plugin's capture daemon is not installed.

Canonical corrections commit before optional indexing. Immutable bank snapshots
bind owner, authorized learning namespace, conversation and memory revisions.
Retain uses the same stable provider operation ID through a retry/restart. A stale
bank is never queried after a correction. Synchronization retires stale replicas
in the agent's other DMs as well; actual remote bank deletion, recall and document
export were tested. Empty/forgotten memory does not query a previous bank.
An unavailable index leaves an explicit pending status; a missing/malformed
operator configuration reports unavailable/setup required. The private service
configuration and credentials never enter model instructions or the web catalog.

The image includes PostgreSQL and local embedding/reranking. Extraction still
needs the configured LLM, which may be a local endpoint or a remote provider.
The acceptance service used the fixed ChatGPT Luna route through a private test
transport. The initial OpenAI API route had insufficient credits. Hindsight's
non-streaming Responses client also required transport adaptation: the selected
subscription endpoint rejects temperature/max_output_tokens and streams completed
output items separately from an empty final output array. The private acceptance
bridge preserves actual completed items and structured-output requirements. This
bridge is a test helper, not a production memory provider dependency.

## Office/PDF execution

The document image packages the four complete native workflows, hash-locked
Python dependencies, LibreOffice Writer/Calc/Impress, fonts, Poppler, file/ZIP tools,
ripgrep and pygount. Readiness requires the `office-pdf.v2` contract. The base
image is the reviewed local NMA-032 native workspace/desktop image; the exact
resulting image/dependency inventory is in the evidence directory.

A narrow MIT integration fix replaces the native DOCX helper's replacement
algorithm: original matches are applied once from right to left. The pinned
helper otherwise loops forever when replacement text contains its own search
text. Original upstream hashes remain recorded, and installed revisions record
the effective override hash. See [notices](../../apps/engine/notices/DOCUMENT-WORKFLOWS.md).

Uploads remain immutable binaries. Native document scripts operate on isolated
workspace files; publication copies verified bytes into the normal SHA-256 object
store with agent/run attribution. A source-file read failure is reported before
publication with a repairable relative-path instruction. It cannot become an
ambiguous delivery. Other genuinely unknown effects retain the existing fence.
PDF/image previews and all downloads use authenticated byte fetching. Office
files download for their target applications; generated PDF/image page previews
can be published as separate results. No online Office editor is introduced.

## Verification and limitations

The initial broad engine run recorded **217 passed, 4 failed, 33 skipped**. Failures
were retained: document worker display startup under concurrent acceptance load,
a maintenance fixture accidentally aging unrelated namespaces, a test interpreter
missing pinned research distributions, and the existing workspace test's 45-second
settlement limit. Targeted reruns after fixes are recorded separately, never
rewritten into the original count. Native integration runs are performed serially
for final verification. Optional unrelated provider/browser cohorts retain their
skip reasons; required new live cases run explicitly.

Verified evidence includes:

- Native memory retry/correction/forget, private/group recall boundaries, source
  references, revision conflicts, restart and stale-generation rejection.
- Concurrent owner corrections (one succeeds, one revision conflict), schema
  16-to-17 backfill retaining original memory bytes/IDs, complete learning backup,
  quarantined restore and repeat restart.
- Learned native packages with executable references, install/update conflict,
  archive/restore/rollback, malicious paths and missing prerequisites.
- Native curator protecting active work and archiving/restoring an aged learned
  package across restart without duplicate revision changes.
- Actual self-hosted provider recall/export/correction/deletion and cross-DM
  replica cleanup, plus peer/group privacy and restart.
- Actual Clerk development sessions for two isolated owners: learning read 200
  for its owner, 404 for the other owner, and 401 for missing/invalid authentication.
- Production conversation components exercised in the browser: memory correction
  and forgetting; skill correction, archive, restore and selecting revision 1;
  catalog search/install; desktop/mobile layout and no horizontal mobile overflow.
- Native DOCX/XLSX/PPTX/PDF create and edit, formula recalculation to 44, rendering,
  parsing and immutable binary publication after gateway restart. The final
  controlled native run passed in 48.29 seconds, with all four hashes checked.
- A longitudinal real-model memory/learning case: preference survives restart,
  correction changes the same memory, forgotten content is absent after restart,
  and a learned Python method is reused successfully after another restart.

Real-model document attempts are recorded separately. Early attempts found an
oversized catalog, a missing publication-path hint, model-generated JSON booleans
inside Python, and the missing file utility during final inspection. Errors after
partial shell execution remain indeterminate; the original dispatches were not
replayed. Repairs were tested in fresh disposable scopes. The final Office/PDF cohort completed eight real-model turns: create and revise
all four formats, with exact binary hashes checked through actual authenticated
browser downloads. The initial test assertion expected an exact `<f>` tag;
LibreOffice correctly emits formula attributes, so the oracle was corrected to
parse namespace-aware XML. The retained binaries were checked directly without
replaying their generation. Actual formulas contain `SUM(B3:B4)` and cached total
44. Writer/Calc/Impress opened and rendered all three Office binaries; PDF parsing,
page rendering and browser canvas preview were inspected.

Visual review found a clipped XLSX title. A subsequent live case imported the
actual uploaded XLSX, retained its original bytes and formula, set a suitable title
row height, recalculated, rendered and published the corrected XLSX plus its PDF
preview. This test passed and the final XLSX download matched its stored hash.
A separate real-model research/coding case used pygount plus the native citation
ledger and evidence verifier, producing a sourced report. Its first harness
incorrectly required the final chat reply to repeat 43 despite a correct report;
the actual artifact was verified and a corrected fresh run passed.

One intermediate visual-correction attempt could not publish after an untagged
image disappeared during a Docker rebuild. The exact pinned image is required
for read-only export helpers. Its files and learning revision were retained; the
attempt was not a delivery success. Setup diagnostics now distinguish a missing
runtime/image from a missing scoped source path. Keep a versioned Docker tag for
every image referenced by retained workspaces.

Final targeted results are **12/12** learning/context/lifecycle tests, **4/4**
native Office/PDF/research/coding/workspace/pin tests, **28/28** backend tests,
**1/1** actual Hindsight case, **1/1** uploaded-XLSX visual correction and **1/1**
real-model research/coding rerun. Web lint/type checks and production build pass.
The earlier longitudinal memory/learning case passed; the Office/PDF cohort's
actual files passed corrected structural/content/render/download oracles. The
original failed pytest reports are retained separately.

See [run inventory](evidence/nma-034/run-inventory.json),
[cohort metrics and unsuccessful attempts](evidence/nma-034/live-cohort.json),
[authenticated UI actions](evidence/nma-034/ui-walkthrough.json),
[owner isolation](evidence/nma-034/learning-auth-scope.json),
[browser downloads](evidence/nma-034/browser-downloads.json),
[Office/PDF content checks](evidence/nma-034/live-documents/content-validation.json),
[corrected XLSX](evidence/nma-034/spreadsheet-layout/verification.json),
[research/coding verification](evidence/nma-034/research-coding/final-verification.json)
and [tested image/dependencies](evidence/nma-034/document-image.json).

The NMA-028 `nma028-baseline-v1` protocol and thresholds are retained without
changes: success >=95%, integration failure <=2%, p95 first progress <=10s,
settlement <=180s, recovery <=60s, zero observed duplicates/leaks/stop violations,
and no unresolved effect for release. At least 100 representative tasks per
configuration remain an NMA-039 release requirement. This feature cohort is smoke
acceptance, not an SLO estimate. Failed/indeterminate attempts remain in its counts. Across the original 21
measured main-agent turns, settlement p50 was 62.03s and p95 212.126s, which exceeds
the 180s release threshold. First-progress timing was not instrumented. Four
uncertain receipts from failed disposable attempts remain explicitly recorded;
they were never replayed or converted to successes. A later research/coding rerun
and the unmeasured intermediate UI correction are listed separately. These
exploratory, changing feature scenarios are not a matched baseline cohort. No zero is invented for unmeasured progress/unknown-effect denominators.

The original user partition remains unmigrated and its running gateway is not
restarted. Rollback uses the prior Git version and a verified offline partition
plus volume backup, preserving post-cutover writes. Hindsight's external volume
has its own backup obligation. No data, migration history or historical evidence
was removed.

## Independent review repair — 2026-10-27

An independent review exposed incorrect identity/provenance mapping in mixed native memory batches. The repair now follows each native operation's matched-entry and patch receipts, preserving original IDs for corrections and creating new IDs for additions. The original failing reproduction, 22 memory/context/lifecycle regressions and one supplemental user-memory case now pass. See [closure report](nma-034-closure.md) and `evidence/nma-034-closure/verification.json`. Historical delivery and failed-attempt evidence is preserved; production rollout and release SLO gates remain open.
