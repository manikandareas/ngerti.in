#!/usr/bin/env bash
set -euo pipefail
[[ $(findmnt -n -o SOURCE --target /srv/ngertiin) == /dev/mapper/ngertiin-private ]]
[[ $(findmnt -n -o TARGET --target /srv/ngertiin) == /srv/ngertiin ]]
cryptsetup status ngertiin-private | grep -q 'type:.*LUKS2'
[[ $(stat -c %d /etc/ngertiin) == $(stat -c %d /srv/ngertiin) ]]
echo 'Private state, configuration and Docker storage use the declared LUKS2 filesystem.'
