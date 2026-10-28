#!/bin/sh
# Run from repository root. State and native workers are disposable.
export HERMES_SOURCE="$PWD/.dev/nma-001/source"
export PYTHONPATH="$PWD/apps/engine/src:$HERMES_SOURCE"
export NMA_TEST_RUNTIME_PYTHON="$PWD/.dev/nma-033/production/bin/python"
export NMA_TEST_NATIVE_IMAGE=sha256:6580374cc2db359e4db9723c7a1c679a6b609d1a0fa91b1432cd3df9096adb6d
export NMA_TEST_BROWSER=1
uv run --python "$NMA_TEST_RUNTIME_PYTHON" --with pytest --with pytest-asyncio \
  python -m pytest \
  apps/engine/tests/test_automation_recovery.py \
  apps/engine/tests/test_goal_delegation.py \
  apps/engine/tests/test_delegation.py \
  apps/engine/tests/test_collaboration.py \
  apps/engine/tests/test_goal_lifecycle.py \
  apps/engine/tests/test_goal_review.py \
  apps/engine/tests/test_calendar_wakes.py \
  apps/engine/tests/test_automation.py \
  apps/engine/tests/test_wakes.py \
  apps/engine/tests/test_webhooks.py \
  apps/engine/tests/test_wakes_browser.py \
  apps/engine/tests/test_collaboration_migration.py \
  apps/engine/tests/test_provider_transport.py \
  apps/engine/tests/test_provider_responses.py \
  apps/engine/tests/test_provider_anthropic.py \
  apps/engine/tests/test_connections.py -q -ra
