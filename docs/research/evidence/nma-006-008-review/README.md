# MCP discovery credential persistence reproduction

The disposable connector fixture places its synthetic bearer token verbatim in the
`proof` tool description. No production credentials are used. The test is a copy of
the capability suite and imports the repository's shared real-runtime fixture.
Only the session-scoped MCP scenario is selected.

From the repository root, with the pinned Hermes source and the NMA-008 runtime
installed at their documented local paths:

```sh
HERMES_SOURCE="$PWD/.dev/nma-001/source" \
PYTHONPATH="$PWD/apps/engine/src:$PWD/apps/engine/tests" \
.dev/nma-008/runtime/bin/python -m pytest \
  docs/research/evidence/nma-006-008-review/test_schema_leak.py \
  -k session_scoped -q -x
```

If installed elsewhere, replace the Hermes source and runtime Python paths with
those installations. The fixture starts a local HTTP connector and a deterministic
local model provider against a disposable temporary engine partition.

Observed result: the test fails at the assertion that the SQLite database contains
no synthetic secret. The persisted native MCP policy schema contains the literal
token in its tool description. Earlier tool-result redaction assertions pass.
`schema-leak.log` records the original run from the temporary reproduction path.

Review severity: P2. The reproduction demonstrates a metadata persistence gap;
it does not claim leakage of production secrets or successful exploitation of an
external connector.
