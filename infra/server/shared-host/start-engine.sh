#!/usr/bin/env bash
set -euo pipefail
umask 077

# A dedicated child inherits this service's mount/network namespaces. Never adopt host containerd.
address=/run/ngertiin-docker/containerd.sock
env -u NOTIFY_SOCKET /usr/bin/containerd --config /etc/ngertiin/containerd.toml \
  --root /srv/ngertiin/containerd --state /run/ngertiin-docker/containerd \
  --address "$address" &
runtime=$!
ready=false
for attempt in $(seq 1 100); do
  kill -0 "$runtime"
  if /usr/bin/ctr --address "$address" --timeout 1s version >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 0.1
done
[[ $ready == true ]]
exec /usr/bin/dockerd --config-file=/etc/ngertiin/docker.json
