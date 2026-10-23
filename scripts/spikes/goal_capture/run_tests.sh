#!/usr/bin/env bash
set -euo pipefail
spike_dir="${1:?Usage: run_tests.sh HERMES_SPIKE_DIRECTORY}"
spike_dir="$(cd "$spike_dir" && pwd)"
cd "$spike_dir/source"
HERMES_PYTHON="$spike_dir/runtime/bin/python" scripts/run_tests.sh -j 4 \
  tests/hermes_cli/test_goals.py \
  tests/hermes_cli/test_goal_dispatch.py \
  tests/hermes_cli/test_kanban_db.py \
  tests/tools/test_kanban_tools.py
