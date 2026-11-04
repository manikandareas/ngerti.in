#!/usr/bin/env bash
set -euo pipefail

# This profile is owned exclusively by the installation's retained container.
# Container replacement can leave Chromium's old hostname/PID singleton links.
profile=/home/cua/.config/ngertiin-browser
if pgrep -u "$(id -u)" -f '^/usr/lib/chromium/chromium .*--user-data-dir=/home/cua/.config/ngertiin-browser' >/dev/null; then
  exit 0
fi
mkdir -p "$profile" /home/cua/workspace/downloads
rm -f "$profile/SingletonLock" "$profile/SingletonCookie" "$profile/SingletonSocket"
exec /opt/cua/bin/cua-chromium --user-data-dir="$profile" --remote-debugging-port=9222 --no-first-run --no-default-browser-check about:blank
