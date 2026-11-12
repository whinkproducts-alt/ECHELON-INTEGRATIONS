#!/bin/bash
set -euo pipefail
umask 077
resources="$(cd "$(dirname "$0")" && pwd)"
expected='/Applications/ECHELON Integrations Sandbox.app/Contents/Resources'
state="$HOME/Library/Application Support/ECHELON Integrations Sandbox"
agents="$HOME/Library/LaunchAgents"
label='com.whink.echelon.integrations.sandbox'
awake_label='com.whink.echelon.integrations.sandbox.ac-awake'
fail() { printf '\n%s\n' "$1"; read -r -p 'Press Return to close.' _; exit 1; }
[ "$resources" = "$expected" ] || fail 'Move ECHELON Integrations Sandbox.app to Applications first, then open this helper inside its Contents/Resources folder.'
[ -f "$state/runtime.env" ] || fail 'Start the sandbox once before enabling automatic startup.'
[ -f "$state/releases/$(cat "$resources/release-id.txt")/.source-ready" ] || fail 'Start this sandbox release once before enabling automatic startup.'
mkdir -p "$agents"
watchdog="$agents/$label.plist"
awake="$agents/$awake_label.plist"
cat > "$watchdog.tmp" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.whink.echelon.integrations.sandbox</string>
  <key>ProgramArguments</key><array>
    <string>/bin/bash</string>
    <string>/Applications/ECHELON Integrations Sandbox.app/Contents/Resources/Keep Sandbox Running.command</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>120</integer>
</dict></plist>
EOF
cat > "$awake.tmp" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.whink.echelon.integrations.sandbox.ac-awake</string>
  <key>ProgramArguments</key><array><string>/usr/bin/caffeinate</string><string>-s</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
EOF
/usr/bin/plutil -lint "$watchdog.tmp" "$awake.tmp" >/dev/null || fail 'Could not validate automatic-start configuration.'
chmod 600 "$watchdog.tmp" "$awake.tmp"
mv "$watchdog.tmp" "$watchdog"
mv "$awake.tmp" "$awake"
domain="gui/$(id -u)"
/bin/launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
/bin/launchctl bootout "$domain/$awake_label" >/dev/null 2>&1 || true
/bin/launchctl bootstrap "$domain" "$watchdog" || fail 'Could not register sandbox recovery at login.'
if ! /bin/launchctl bootstrap "$domain" "$awake"; then
  /bin/launchctl bootout "$domain/$label" >/dev/null 2>&1 || true
  rm -f "$watchdog" "$awake"
  fail 'Could not register AC-power sleep prevention.'
fi
/bin/launchctl kickstart "$domain/$label" || fail 'Could not start sandbox recovery.'
printf '\nAutomatic sandbox startup is enabled. It checks every two minutes while you are logged in. On AC power, it prevents idle sleep; closing the lid or shutting down still stops access.\n'
read -r -p 'Press Return to close.' _
