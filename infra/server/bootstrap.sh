#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run on a new declared host after installing the pinned binaries and Docker Engine.
# Existing configuration, keys and release bindings are never replaced by bootstrap.
if [[ $(id -u) != 0 || ! $(uname -m) =~ ^(aarch64|x86_64)$ ]]; then
  echo 'Bootstrap requires root on the declared Ubuntu ARM64 or AMD64 host.' >&2
  exit 1
fi
release=$(realpath "${1:?Supply the verified release directory}")
hostname=${2:?Supply the certificate hostname}
if [[ ! $hostname =~ ^[a-zA-Z0-9][a-zA-Z0-9.-]+$ || ! -f $release/bun.lock ]]; then
  echo 'Invalid hostname or release directory.' >&2
  exit 1
fi
if [[ -L /opt/ngertiin/current && $(realpath /opt/ngertiin/current) != "$release" ]]; then
  echo 'An installation already selects another release; use the upgrade runbook.' >&2
  exit 1
fi
getent group docker >/dev/null
install -d -m 755 /opt/ngertiin/machine-assets
for asset in ngertiin-browser.desktop chromium-policy.json start-browser.sh; do
  if [[ -e /opt/ngertiin/machine-assets/$asset ]]; then
    cmp -s "$release/infra/machine/$asset" "/opt/ngertiin/machine-assets/$asset" || {
      echo 'Machine assets changed; explicitly recreate retained domains during a coordinated upgrade.' >&2
      exit 1
    }
  else
    install -m 644 "$release/infra/machine/$asset" "/opt/ngertiin/machine-assets/$asset"
  fi
done
id ngertiin >/dev/null 2>&1 || useradd --system --user-group --home-dir /srv/ngertiin --shell /usr/sbin/nologin ngertiin
usermod -aG docker ngertiin
install -d -m 700 -o ngertiin -g ngertiin /etc/ngertiin /srv/ngertiin /srv/ngertiin/state /srv/ngertiin/trust /srv/ngertiin/trust/revocations /srv/ngertiin/backups /srv/ngertiin/postgres /srv/ngertiin/tls
[[ -e /opt/ngertiin/current ]] || ln -s "$release" /opt/ngertiin/current
if [[ ! -e /etc/ngertiin/server.env ]]; then
  admin_password=$(openssl rand -hex 32)
  client_password=$(openssl rand -hex 32)
  auth_secret=$(openssl rand -hex 48)
  sed -e "0,/REPLACE_WITH_URL_ENCODED_PASSWORD/s//${admin_password}/" \
    -e "s/REPLACE_WITH_URL_ENCODED_PASSWORD/${client_password}/" \
    -e "s/REPLACE_WITH_HOSTNAME/${hostname}/" \
    -e "s/REPLACE_WITH_48_RANDOM_BYTES_AS_HEX/${auth_secret}/" \
    "$release/infra/server/server.env.example" > /etc/ngertiin/server.env
  sed -e "s/REPLACE_WITH_RANDOM_DATABASE_PASSWORD/${admin_password}/" \
    -e "s/REPLACE_WITH_HOSTNAME/${hostname}/" \
    "$release/infra/server/compose.env.example" > /etc/ngertiin/compose.env
fi
[[ -e /etc/ngertiin/operations.json ]] || cp "$release/infra/server/operations.example.json" /etc/ngertiin/operations.json
[[ -e /srv/ngertiin/trust/provider.key ]] || openssl rand -out /srv/ngertiin/trust/provider.key 32
[[ -e /etc/ngertiin/backup.key ]] || openssl rand -out /etc/ngertiin/backup.key 32
if [[ ! -e /srv/ngertiin/state/execution-domains.json ]]; then
  echo '{"version":1,"max_domains":1,"memory_mib":1024,"cpus":1,"pids":512}' > /srv/ngertiin/state/execution-domains.json
fi
chown ngertiin:ngertiin /etc/ngertiin/server.env /etc/ngertiin/compose.env /etc/ngertiin/operations.json /srv/ngertiin/trust/provider.key /srv/ngertiin/state/execution-domains.json
chmod 600 /etc/ngertiin/*.env /etc/ngertiin/*.json /etc/ngertiin/backup.key /srv/ngertiin/trust/provider.key /srv/ngertiin/state/execution-domains.json
chown root:root /srv/ngertiin/tls
# The pinned Alpine PostgreSQL image runs initdb as uid/gid 70 and needs the versioned parent.
chown 70:70 /srv/ngertiin/postgres
install -m 644 "$release/infra/server/ngertiin.service" /etc/systemd/system/ngertiin.service
systemctl daemon-reload
echo 'Private configuration prepared. Complete email settings and verified encryption attestation before starting.'
