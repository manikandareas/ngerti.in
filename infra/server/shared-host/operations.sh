#!/usr/bin/env bash
set -euo pipefail
[[ $(id -u) == 0 ]]
cd /opt/ngertiin/current
exec ip netns exec ngertiin /opt/ngertiin/bin/bun --env-file=/etc/ngertiin/server.env \
  apps/server/src/operations/cli.ts "$@"
