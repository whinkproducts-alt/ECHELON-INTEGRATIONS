#!/bin/bash
set -euo pipefail
agents="$HOME/Library/LaunchAgents"
domain="gui/$(id -u)"
for label in com.whink.echelon.integrations.sandbox com.whink.echelon.integrations.sandbox.ac-awake; do
  /bin/launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
  rm -f "$agents/$label.plist"
done
printf 'Automatic startup and AC-power sleep prevention are disabled. Running sandbox services were left untouched.\n'
read -r -p 'Press Return to close.' _
