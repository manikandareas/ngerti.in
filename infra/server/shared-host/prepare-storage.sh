#!/usr/bin/env bash
set -euo pipefail
umask 077

# New installation only. The caller streams an independently escrowed 32-byte key over SSH.
[[ $(id -u) == 0 ]]
image=/var/lib/ngertiin-private.luks
if [[ -e $image || -e /dev/mapper/ngertiin-private ]] || mountpoint -q /srv/ngertiin; then
  echo 'Private storage already exists; use unlock-storage.sh or inspect the retained installation.' >&2
  exit 1
fi
for directory in /srv/ngertiin /etc/ngertiin; do
  if [[ -e $directory ]] && [[ ! -d $directory || -L $directory || -n $(ls -A "$directory") ]]; then
    echo 'Refusing an existing nonempty installation directory.' >&2
    exit 1
  fi
done
key=$(mktemp /run/ngertiin-storage-key.XXXXXX)
trap 'rm -f "$key"' EXIT
head -c 33 > "$key"
[[ $(stat -c %s "$key") == 32 ]]
available=$(df --output=avail -B1 /var/lib | tail -n 1)
(( available > 100 * 1024 * 1024 * 1024 ))
fallocate -l 64G "$image"
chmod 600 "$image"
cryptsetup luksFormat --type luks2 --batch-mode --key-file "$key" "$image"
cryptsetup open --type luks2 --key-file "$key" "$image" ngertiin-private
mkfs.ext4 -q -m 1 -L ngertiin-private /dev/mapper/ngertiin-private
install -d -m 700 /srv/ngertiin /etc/ngertiin
mount -o noatime /dev/mapper/ngertiin-private /srv/ngertiin
chmod 700 /srv/ngertiin
install -d -m 700 /srv/ngertiin/config
mount --bind /srv/ngertiin/config /etc/ngertiin
echo 'New 64-GiB LUKS2 storage mounted; no unlock key was persisted on the VPS.'
