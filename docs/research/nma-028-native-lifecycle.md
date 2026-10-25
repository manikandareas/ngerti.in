# Native lifecycle baseline and read-only recovery

Date: 2026-10-25. Hermes source pin:
`7489b22af47ce91b366dde81d5831ea422577498`.
Protocol: `nma028-closure-v2`, SHA-256
`189f073d366760cc95f53fed3a806ada1ec9f34a242d24c5e26a9d74a787e3cb`.

The native group core oracle passes **3/3** from real model work and durable
native artifact evidence. Three native offline jobs were genuinely scheduled,
survived a gateway restart and fired exactly once, but their model executions
failed because the configured OpenAI account had no credits remaining. Their
task success is **0/3**. No mock or skipped case replaces those failures.

The complete machine-readable result and all source-attempt hashes are in
[native-lifecycle-summary.json](evidence/nma-028-closure/native-lifecycle-summary.json).
This document describes engineering evidence, not a production deployment or
full native/product parity claim.

## Native group result

The frozen group oracle requires persistent Researcher, Writer and Reviewer
peers, communicated and independently checked arithmetic, a readable final
scoped artifact, and preserved author/handoff lineage. Each of the three real
group tasks produced all three peer authors and a Writer-created `report.md`
containing the supplied 360 km, 45 litres and the verified result 12.5 L/100 km.

The Writer used the native terminal tool through the scoped tool executor. A
trusted client exported the model-written bytes and committed them as a native
room attachment; it did not synthesize the report. The attachment projection is
an explicit difference from Ngertiin's product artifact publisher.

| Repeat | Producer native session | Native attachment ID | Artifact SHA-256 |
| --- | --- | --- | --- |
| 1 | `local-436b8b2ca91f299571774fa66c22a718789f6fc149dba475cd810f922d5515ae` | `att_b06a5e779e609dbb405342641045c1c4` | `d850ac41b92ccdb978d3543767432a62a0bf122b00fdd1f8da7cc9bc7a579cc7` |
| 2 | `local-829011682b5fb5b10e2b4d65b6a9bac0698f4dd8521023831158d083746f874c` | `att_d6453ce1665ec90025f74bc95927d373` | `d667072a4f4aec23fd4c7485ddda8958b1ea54e0b5561f8b8ca7471fb1ad3eca` |
| 3 | `local-0c6d409196e37c5d3d52e84e898b8156daffd0d2d9397dc204842378b2834d04` | `att_bd03576d7ffea4b5f0e7389e1de736ab` | `d72dd107629a174df2d4e6eb74a8fda3b9721683487d98211681cb8717e7416a` |

The exact lineage in each recovered row connects the room and native Writer
admission/session to the UUID-derived agent/thread execution scope, native tool
arguments, durable operation argument hash and returned terminal receipt with
exit code zero. The native committed attachment and downloaded bytes match the
recorded hash. The native byte store refuses a different gateway authority.
This is stronger than an assertion that a similarly named file exists.

The native server-owned publication event IDs are:

- Repeat 1: `user:e25d0d967c8399823390ae26374bc02ae37fd6efd0805b02ca39783f04f96f28`.
- Repeat 2: `user:255356104785eed9af97f9d0f0e81b5b9d767feec693f0483ff2179bdbca6f61`.
- Repeat 3: `user:b6d992b3dbe751524d645c2d773c8850b31325ce23cda7c9698353bb7fb321e7`.

The initial client mistakenly supplied its retry key to attachment download
instead of the server-owned `user_event_id(key)` value. The original download
failure is retained; it does not erase the underlying model work or committed
artifact. The native mapping is defined by
[the pinned room implementation](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_rooms.py#L250-L252).

## Read-only correction of the group score

[native-lifecycle-groups-recovered-final.jsonl](evidence/nma-028-closure/native-lifecycle-groups-recovered-final.jsonl)
retains each original attempt identity, protocol hash, prior failed score and
prior error. Recovery used the pinned native
`HostedRoomAttachmentStore.read_viewer` on a disposable SQLite backup and copied
attachment bytes. Its constructor was allowed to initialize the private copy;
the original database, WAL files, receipts and unfinished work were not changed.

No gateway, model, scheduler or tool dispatcher was started during recovery.
Consequently it neither re-ran the report creation nor replayed the third room's
unfinished supplemental work. Every original database/WAL byte hash checked
before recovery remained identical afterward. The source attempt file hash,
copy path, native records, tool receipts and downloaded bytes are retained in
each recovered row. The native read performs the normal committed-byte and
authority/epoch checks, including its post-I/O authorization fence.
([Pinned native reader](https://github.com/NousResearch/hermes-agent/blob/7489b22af47ce91b366dde81d5831ea422577498/gateway/hosted_room_attachments.py#L1120-L1178).)

An additional artifact-review request, beyond the frozen core oracle, obtained
the explicit `NMA028_ARTIFACT_REVIEWED_12.5` acknowledgment in **2/3** rooms. The
third extra review encountered provider exhaustion; its pending/failed native
work remains preserved and was not restarted. The recovered rows state this
separately. The **3/3 core result must not be represented as 3/3 supplemental
artifact-review acknowledgments**.

## Native offline result

The real model created three one-shot jobs through native `cronjob_manage`.
All three were stored before the gateway was killed and restarted. No gateway
RPC client remained open during the offline interval. The native ticker later
admitted and executed each job once; each has one scheduler output file and
`repeat.completed=1`.

| Repeat | Persisted native job ID | Final scheduler status | Task result |
| --- | --- | --- | --- |
| 1 | `63b343feedec` | `error` | Provider credits rejected execution; expected arithmetic result not delivered. |
| 2 | `e3d5363aed7e` | `error` | Provider credits rejected execution; expected arithmetic result not delivered. |
| 3 | `2b0f0bf5d338` | `error` | Provider credits rejected execution; expected arithmetic result not delivered. |

The native scheduler output records the OpenAI rejection: no credits remaining.
The error also occurred in subsequent interactive native group requests, so it
was not classified merely from a scheduler routing assumption. Native admission
IDs, job configuration, schedule, output, restart timing and original scoring
are preserved in
[native-lifecycle-offline-provider.jsonl](evidence/nma-028-closure/native-lifecycle-offline-provider.jsonl).
Provider attribution corrects the initial generic oracle label without changing
the failed task status or original raw evidence.

All three jobs shared one profile and one gateway restart. This is three
scheduled task repetitions and **one independent restart sample**, not three
independent restart measurements. Native explicit cron scheduling also differs
from Ngertiin's automatic conversational goal capture; native `deliver=local`
persists an output file rather than publishing a Ngertiin conversation message.
Those differences remain part of the comparison.

The schedule/firing/receipt evidence establishes that work was admitted after
restart. It does not establish the missing successful model result, stopped-goal
generation behavior or a passing end-to-end offline task oracle. Those must
remain open until the configured real provider can complete the task.

## Preserved attempts and resume procedure

The summary links the original, corrected, provider-failed and read-only scoring
batches with hashes. Initial fresh-WebSocket mutations omitted the required
session attachment and returned `permission_denied`; the helper now resumes the
session on that connection before mutation. Initial group download used the
wrong event namespace. A first recovery scorer expected an operation state name
different from the journal's actual `returned` receipt; the final scorer checks
the returned terminal result and canonical artifact bytes. These instrumentation
failures remain visible and are not relabelled as product failures or additional
independent successful tasks.

After provider credits are restored, rerun only the missing native offline task
oracle with fresh disposable profiles, owner and control directory. Keep all
existing evidence and the frozen protocol unchanged:

```bash
nma028_run=".dev/nma-028-closure/resume-$(date +%Y%m%dT%H%M%S)"
nma028_owner=$(python3 -c 'from uuid import uuid4; print(uuid4())')
mkdir -p "$nma028_run"
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
  .dev/nma-006-closure/runtime/bin/python scripts/spikes/nma028/native_lifecycle_cases.py \
  --source .dev/nma-001/source \
  --env-file .env \
  --protocol scripts/spikes/nma028/protocol-closure.json \
  --output "$nma028_run/native-lifecycle-offline.jsonl" \
  --control-dir "$nma028_run/control" \
  --owner "$nma028_owner" \
  --only offline_goal \
  > "$nma028_run/native-lifecycle-offline.log" 2>&1
```

The helper reads only the configured OpenAI model/route credentials for this
work, creates its own private profiles, removes their credential files on
teardown and cleans only its own scoped resources. Use the virtual environment's
interpreter path as shown; do not dereference it to the underlying bootstrap
interpreter. No real account, existing partition or historical receipt is a
resume target. A new provider or changed model requires an explicitly recorded
new configuration/protocol rather than silently replacing the frozen route.

This continuation authored documentation only. No tools, models, scheduled
jobs or recovery executions were rerun while writing this report.
