#!/usr/bin/env bash
# Use the upstream runner: process isolation, clean credentials and temporary homes.
set -euo pipefail
spike_dir="${1:?Usage: run_tests.sh SPIKE_DIRECTORY}"
spike_dir="$(cd "$spike_dir" && pwd)"
cd "$spike_dir/source"
HERMES_PYTHON="$spike_dir/runtime/bin/python" scripts/run_tests.sh -j 4 \
  tests/hermes_cli/test_profiles.py \
  tests/gateway/test_hosted_rooms.py \
  tests/gateway/test_hosted_room_driver.py \
  tests/gateway/test_hosted_room_discussion.py \
  tests/gateway/test_session_hosted_service.py \
  tests/gateway/test_session_hosted_daemon.py \
  tests/gateway/test_session_hosted_controls.py \
  tests/gateway/test_session_hosted_transport.py \
  tests/gateway/test_session_hosted_rpc.py \
  tests/tui_gateway/test_hosted_room_service.py
