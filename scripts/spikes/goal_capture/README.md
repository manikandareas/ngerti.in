# Automatic responsibility capture spike

Disposable evidence for [NMA-002](https://app.notion.com/p/402abdd61873815a9b15c67cea3e2ad6).
This is not a production agent, scheduler or final domain contract.

## Reproduce

Use the pinned environment setup from [the runtime spike](../hermes_runtime/README.md):

```bash
bash scripts/spikes/hermes_runtime/setup.sh .dev/hermes-goals
bash scripts/spikes/goal_capture/run_tests.sh .dev/hermes-goals
.dev/hermes-goals/runtime/bin/python scripts/spikes/goal_capture/boundaries.py \
  --source .dev/hermes-goals/source --output .dev/goal-boundaries
.dev/hermes-goals/runtime/bin/python scripts/spikes/goal_capture/probe.py \
  --source .dev/hermes-goals/source --output .dev/goal-capture --env-file .env
python3 scripts/spikes/goal_capture/verify.py .dev/goal-capture/results.json
```

Output directories must be new. The live probe makes 16 real provider requests using only
`OPENAI_API_KEY`, `OPENAI_MODEL` and optional `OPENAI_BASE_URL` from the file. No credential is
written to output. It uses the configured model, with provider defaults and JSON-object output.
A failed request/invalid mutation stops the run; it is not silently retried. Keep failed evidence.

The source commit is `7489b22af47ce91b366dde81d5831ea422577498`; the runtime audit setup verifies
its archive hash. The recorded run reused `.dev/nma-001-repro` and verified all 20,787 source
files against that archive. Its current interpreter reports Python 3.14.9; do not infer the
installed version from the bootstrap version in setup.sh. Record actual environment on reruns.

## What runs

`prompt.md` and the JSON action adapter are new Ngertiin experiment code. The real model sees
stored tasks (including archived tasks), same-session conversation, and the current user message.
It does **not** see expected operations, labels, or assertions from `dataset.json`.
It chooses zero or more create/update/stop actions. No regex intent classifier, threshold,
confirmation step or initiative policy gate is installed.

The adapter calls unmodified Hermes `kanban_db.create_task`, `edit_task`, `archive_task` and
`list_tasks`. Each turn is a fresh OS process; four conversation sessions share the disposable
board. Conversation history is cleared at session changes. Each create records its origin session;
corrections preserve it. All examples belong to one synthetic owner and agent. This board is **not**
an authorization boundary, and no DM transcript is sent to a group.

Creation uses Hermes `goal_mode=True`, but no dispatcher, continuation loop, gateway, schedule,
external tool or deliverable production is started. The model is called directly through the
OpenAI-compatible SDK, not through Hermes's agent loop or native tool registration. The experiment
isolates capture semantics and actual SQLite persistence. Mapping stop to archive is deliberately
provisional; `boundaries.py` proves why it must not be shipped as full goal cancellation.

`boundaries.py` uses two fresh processes and native goal/Kanban APIs to reproduce replacement,
explicit migration, pause persistence, duplicate delivery, archive dependency release and replay
after archive. Assertions that expose gaps are **expected observations**, not desired product behavior.
`verify.py` independently checks effects in saved evidence: stopped tasks remain archived, unrelated
tasks stay identical, provenance stays stable, new tasks are ready, and process IDs differ.

## Known results and limits

See [the audit](../../../docs/research/nma-002-goal-capture-spike.md). Recorded model cases: 16/16;
native boundary observations: 15/15. Upstream: 223 passed, 1 skipped, 1 failed on macOS (systemd
branch test lacks Linux simulation). The suite therefore exits nonzero; this is recorded, not suppressed.

There is no claim of native automatic multi-goal capture, production reliability, private Muse
algorithm reconstruction, multi-user isolation, group coordination, or scheduler integration.
The MIT notice is retained in the evidence directory; runtime dependencies/notices are inventoried
by NMA-001 and must be reassessed for production distribution.
