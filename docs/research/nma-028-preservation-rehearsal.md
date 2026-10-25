# Disposable preservation and rollback rehearsal

Date: 2026-10-25. This is supplemental NMA-028 evidence for the selected
execution/configuration seam. No product schema migration, real-account
migration or production cutover is performed. It uses no live provider or model
requests and does not add a runtime rollback engine.

Implementation: [preservation_rehearsal.py](../../scripts/spikes/nma028/preservation_rehearsal.py)
and [controlled product contract](../../scripts/spikes/nma028/test_preservation_rehearsal.py).
The frozen isolated supervisor and image from the earlier proof remain unchanged.

## Read-only copy of a settled original partition

The settled disposable pilot `/tmp/nma-45nh5ljg/state` was copied under its
existing gateway locks opened **read-only**. The script never opens an original
SQLite connection and never starts that original profile. It hashes persistent
bytes before/after copying, then normalizes WAL only in the new private copy.
All **378 original persistent files**, including original database/WAL/shared
memory bytes, remain identical. Ephemeral transport sockets are not backup data;
this source contained no symlinks requiring a separate mapping.

The canonical engine `backup`/`restore` implementation is applied to that copy.
Every table's row count, typed-row digest and schema digest is identical after
restore across `state.db`, `kanban.db` and `cron/executions.db`. The original
schema is 13. It contains six persistent agents/configurations/threads, eighteen
product messages, twenty-four durable commands, six native sessions and
twenty-four native messages. Empty goal/memory/artifact tables are reported as
empty, not used as evidence that nonempty examples were preserved.

The restored copy remains quarantined. A real engine startup attempt refuses
with `RESTORE_QUARANTINED` before any key or model request is configured. Its
identities/history/receipts are never admitted as new work. Original content and
private backup bytes are not published; the evidence contains digests/counts and
the private local backup location only.

## Native scoped workspace and journal rollback

A fresh isolated native scope creates nonempty file bytes and one terminal file
effect through the actual native tools. The operator pauses its sole tool
container, snapshots the private supervisor journal plus the complete scoped
workspace, and reopens a supervisor against those same identities. Exact receipt
replay leaves the external effect at **one byte**, without dispatching again.

The rehearsal then creates post-cutover data and a new operation receipt,
preserving both in a separate second controller/workspace backup. It cancels and
removes the old executor before restoring the earlier backup. The restored
journal/resource scope preserves the original operation identity/result and all
selected file hashes. The old controller refuses new dispatch. The later data
remains available in its separate archive for forward reconciliation; no new
database is downgraded in place and no old runtime is selected as a fallback.

Moving a Chromium profile to a new container hostname exposed stale singleton
ownership links. The initial reopen failure is retained. The **explicit trusted
restore rehearsal**, after asserting the old executor is fenced and absent,
reconciles only the `SingletonLock`, `SingletonSocket` and `SingletonCookie`
symlinks. Cookie databases, browser history, file bytes, receipts and the original
snapshots remain intact. This is not an automatic cleanup added to the running
supervisor. The restored native file tool then reads the preserved content, and
the effect count remains one.

## Nonempty product-state preservation through actual APIs

A separate synthetic controlled-loopback model fixture seeds an agent with a
skill assignment, a private conversation, attributed private memory, a stopped
goal, an authored skill file and an immutable artifact. It reuses the existing
complete-partition restore and sole-gateway-owner contracts against the real
pinned gateway and SQLite.

The test proves live backup refusal, no competing gateway takeover, checksummed
backup/restore, quarantine, retained configuration/skill assignment, unchanged
conversation and memory provenance, stopped-goal generation and exact skill
bytes. Replaying the original command returns its original run ID without a
model/effect request. New post-cutover conversation data is retained in a
separate snapshot. Corruption, wrong-owner restore and in-place overwrite are
refused by the existing canonical contract.

The operator capability catalog lives outside the native profile and is backed
up/restored separately in this synthetic fixture. External credentials,
workspaces and registry/launcher configuration remain explicit separate backup
obligations; this rehearsal does not imply a distributed production backup.
The authored skill-file case proves byte preservation, not activation of a new
native skill-management capability.

The initial supplementary oracle compared an owner-wide replay watermark while
other threads were working. Its expected advancement caused a failure. The
corrected oracle excludes only `through_sequence` and still compares all domain
identities, messages, goals, artifacts, configuration and run state. That initial
failure is retained separately. Final result: **1 passed**, no skipped cases,
with one upstream pytest marker-registration warning. This controlled fixture is
not counted as a paired live-provider baseline pass.

## Evidence and reproduction

Selected redacted evidence:

- `docs/research/evidence/nma-028-closure/preservation-rehearsal.json`
- `docs/research/evidence/nma-028-closure/preservation-controlled-fixture.json`
- `docs/research/evidence/nma-028-closure/preservation-attempts.json`

Private profile/controller/workspace archives remain under the new
`.dev/nma-028-closure/preservation-rehearsal-2/` directory. Do not publish those
archives or whole native profiles; they may contain cached credentials and user
content. Snapshot hashes and row digests are sufficient for the checked-in
evidence. The original profile and the first-turn evidence are unchanged.

```bash
.dev/nma-006-closure/runtime/bin/python scripts/spikes/nma028/preservation_rehearsal.py \
  --original-home /tmp/nma-45nh5ljg/state \
  --owner f7a15538-3c07-44a2-ad61-01a1eda06c66 \
  --source .dev/nma-001/source --work-dir NEW_PRIVATE_DIRECTORY \
  --output NEW_REDACTED_REPORT.json \
  --image sha256:b81f1bf356adb3f4cff012b2b95d95c6458b5ba876c1e886a59a24a82e574ebd
env -u NMA_TEST_LIVE_ENV \
  HERMES_SOURCE="$PWD/.dev/nma-001/source" \
  PYTHONPATH="$PWD/apps/engine/src:$PWD/.dev/nma-001/source" \
  .dev/nma-006-closure/runtime/bin/python -m pytest \
  scripts/spikes/nma028/test_preservation_rehearsal.py -q -s
```

This closes the disposable preservation/reopen exercise for the new tooling
journal and selected seam. It does not replace production migration, capacity,
secret-storage or operational acceptance in NMA-029/031/032/039/027.
