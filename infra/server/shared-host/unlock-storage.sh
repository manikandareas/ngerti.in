#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) == 0 ]]
key=$(mktemp /run/ngertiin-storage-key.XXXXXX)
trap 'rm -f "$key"' EXIT
head -c 33 > "$key"
[[ $(stat -c %s "$key") == 32 ]]
if [[ ! -e /dev/mapper/ngertiin-private ]]; then
  cryptsetup open --type luks2 --key-file "$key" /var/lib/ngertiin-private.luks ngertiin-private
fi
mountpoint -q /srv/ngertiin || mount -o noatime /dev/mapper/ngertiin-private /srv/ngertiin
mountpoint -q /etc/ngertiin || mount --bind /srv/ngertiin/config /etc/ngertiin
bash /opt/ngertiin/current/infra/server/shared-host/verify-storage.sh
echo 'Storage unlocked. Start the private engine and application after checking operator configuration.'
