#!/usr/bin/env bash
# Prepare an isolated, pinned source and environment through upstream PM.
set -euo pipefail

spike_dir="${1:?Usage: setup.sh NEW_OUTPUT_DIRECTORY}"
if [[ -e "$spike_dir" ]]; then
  echo "Refusing to overwrite an existing directory: $spike_dir" >&2
  exit 1
fi
mkdir -p "$spike_dir"
spike_dir="$(cd "$spike_dir" && pwd)"
revision=7489b22af47ce91b366dde81d5831ea422577498
archive_sha256=8bb5bc691b509caa847b4e388258be2adec297f06b1ee01f56c9a742eb043d95
curl --fail --location --retry 2 --connect-timeout 15 --max-time 300 \
  "https://codeload.github.com/NousResearch/hermes-agent/tar.gz/$revision" \
  --output "$spike_dir/source.tar.gz"
uv python install 3.14.3
bootstrap_python="$(uv python find 3.14.3)"
"$bootstrap_python" - "$spike_dir" "$archive_sha256" <<'PY'
import hashlib
from pathlib import Path
import sys
import tarfile

root = Path(sys.argv[1])
archive = root / "source.tar.gz"
assert hashlib.sha256(archive.read_bytes()).hexdigest() == sys.argv[2], "Archive hash mismatch"
with tarfile.open(archive) as stream:
    stream.extractall(root / "unpack", filter="data")
sources = list((root / "unpack").iterdir())
assert len(sources) == 1
sources[0].rename(root / "source")
(root / "unpack").rmdir()
PY
cd "$spike_dir/source"
export HERMES_HOME="$spike_dir/setup-home"
export HERMES_RUNTIME_DIR="$spike_dir/pm-runtime"
"$bootstrap_python" -m pm.build_env --source . --out "$spike_dir/runtime" \
  --group dev --group test
echo "Source: $spike_dir/source"
echo "Interpreter: $spike_dir/runtime/bin/python"
