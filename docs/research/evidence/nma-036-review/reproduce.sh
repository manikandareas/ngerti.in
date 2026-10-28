#!/bin/sh
# Run from the repository root. Each test uses disposable gateway state.
export HERMES_SOURCE="$PWD/.dev/nma-001/source"
export PYTHONPATH="$PWD/apps/engine/src:$PWD/apps/engine/tests:$HERMES_SOURCE"
export NMA_TEST_RUNTIME_PYTHON="$PWD/.dev/nma-033/production/bin/python"
export NMA_TEST_NATIVE_IMAGE=sha256:6580374cc2db359e4db9723c7a1c679a6b609d1a0fa91b1432cd3df9096adb6d
uv run --python "$NMA_TEST_RUNTIME_PYTHON" --with pytest --with pytest-asyncio \
  python -m pytest \
  docs/research/evidence/nma-036-review/test_job_continuation.py \
  docs/research/evidence/nma-036-review/test_silent_restart.py -q -ra
