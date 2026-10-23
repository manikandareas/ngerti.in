# Pinned Hermes runtime audit

This is the reproducible harness for [NMA-001](https://app.notion.com/p/402abdd61873811295d3fddfc040d720).
The authoritative product and implementation decisions remain in
[Ngertiin Multi Agent](https://app.notion.com/p/402abdd6187381e3a720f4b01d824e1a).
The harness runs upstream in a disposable directory; it is not the Ngertiin production adapter.

## Requirements and setup

Run from the Ngertiin repository root on macOS or Linux, with `uv`, `curl`, and Bash available.
The recorded run used macOS arm64 and CPython 3.14.3. Hermes's lock targets Python 3.14;
the broader `requires-python` range includes updater compatibility and is not the runtime target.

```bash
bash scripts/spikes/hermes_runtime/setup.sh .dev/hermes-audit
bash scripts/spikes/hermes_runtime/run_tests.sh .dev/hermes-audit
.dev/hermes-audit/runtime/bin/python scripts/spikes/hermes_runtime/inventory.py \
  --source .dev/hermes-audit/source --output .dev/hermes-audit/inventory.json
```

Setup verifies the SHA-256 of the pinned source archive, then uses upstream `pm.build_env`
with the locked core and dev/test groups. It refuses to overwrite an existing directory.
Use a new directory for another clean reproduction. No optional runtime extra is requested.
`run_tests.sh` delegates to Hermes's own clean-environment, per-file subprocess runner.
Some upstream daemon tests intentionally kill their disposable gateway and wait for lease expiry.

## Real-model probe

The environment file must provide `OPENAI_API_KEY`, `OPENAI_MODEL`, and optionally
`OPENAI_BASE_URL`. This command makes real provider requests, using synthetic fleet facts.
It reads only these provider settings from the file; it does not load the application's other secrets.

```bash
.dev/hermes-audit/runtime/bin/python scripts/spikes/hermes_runtime/probe.py \
  --source .dev/hermes-audit/source \
  --output .dev/hermes-audit/live-01 \
  --env-file .env
```

The output directory must be new. The probe creates a default Researcher profile and a named
Writer profile through the upstream profile API. The profiles have distinct SOUL instructions.
The Writer uses upstream's standalone profile mode; each profile has exactly one gateway owner.
The room coordinator submits to the owning profile through native canonical transport.
No additional scheduler or product policy is installed.

The probe exercises `groups.create/send/state/log` over an authenticated local WebSocket.
It closes the initial client socket after admission, verifies two real model contributions,
kills/restarts the native gateway processes after settlement, checks transcript equality and
idempotent resend, and submits a follow-up in the same thread. Three model turns are expected.
Tools are empty for this text-only arithmetic/report scenario; tool/MCP/E2B behavior is not tested.

Credentials are written only into the disposable profile `.env` files with mode `0600` and
removed in the probe's cleanup. State, transcripts and raw daemon logs stay under `.dev/`.
Do not publish whole state directories or authentication tickets. The checked-in evidence is
selected and scanned for project credential values before publication.

The probe intentionally imports the pinned upstream test helpers
`tests/gateway/fixtures/local_recovery_probe.py` and
`tests/gateway/test_normal_runtime_boot.py` for daemon/bootstrap/socket operations. These launch
the ordinary `python -m gateway.run` process with `barrier=False`; they do not replace the model,
room driver or session authority. Their context manager uses `kill()` on exit, so the recorded
restart is an unclean process restart after settled work, not a graceful shutdown test.
The upstream fixture-backed tests use a loopback model instead; those are reported separately.

## Audit and provenance

See [the audit](../../../docs/research/nma-001-hermes-runtime-audit.md) for the acceptance matrix,
module boundaries, observed gaps, dependency/license inventory and integration alternatives.
The full [MIT notice](../../../docs/research/evidence/nma-001/HERMES-LICENSE.txt) is retained for
the upstream helpers. No Hermes engine module is vendored into Ngertiin's application source.
No local patch to upstream is required for the recorded successful run.
