#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
umask 077
resources="$(cd "$(dirname "$0")" && pwd)"
if [ "${WHINK_INSTALL_KIND:-}" = sandbox ]; then
  config="$HOME/Library/Application Support/ECHELON Integrations Sandbox/runtime.env"
  lock="$HOME/Library/Application Support/ECHELON Integrations Sandbox/install.lock"
else
  config="$HOME/Library/Application Support/Whink Ultimate/runtime.env"
  lock="$HOME/Library/Application Support/Whink Ultimate/install.lock"
fi
fail() { printf '\n%s\n' "$1"; read -r -p 'Press Return to close.' _; exit 1; }
[[ -f "$config" ]] || fail 'Start this app once to create its private configuration, then reopen this helper.'
mkdir "$lock" 2>/dev/null || fail 'Another setup is running. Close it before configuring speech.'
trap 'rmdir "$lock" 2>/dev/null || true' EXIT
printf '\nConnect an existing VoiceStudio installation on this Mac.\nThis does not download engines, models or voices, or change your selected speech service.\n'
read -r -p 'Echelon account ID (shown in Speech Services settings): ' account
[[ "$account" =~ ^[A-Za-z0-9_-]{1,128}$ ]] || fail 'Invalid account ID. No settings changed.'
read -r -p 'VoiceStudio local API port [3900]: ' port
port="${port:-3900}"
[[ "$port" =~ ^[0-9]{4,5}$ ]] && ((port >= 1024 && port <= 65535)) || fail 'Invalid port. No settings changed.'
read -r -s -p 'VoiceStudio API token (input hidden): ' token
printf '\n'
[[ "$token" =~ ^[A-Za-z0-9._:/+=-]{16,1024}$ ]] || fail 'Use an ASCII API token of at least 16 characters. No settings changed.'
temporary="$(mktemp "${config}.XXXXXX")"
trap 'rm -f "${temporary:-}"; rmdir "$lock" 2>/dev/null || true' EXIT
awk -F= '$1 != "SPEECH_SELECTION_ENABLED" && $1 != "VOICESTUDIO_URL" && $1 != "VOICESTUDIO_API_KEY" && $1 != "VOICESTUDIO_ACCOUNT_USER_ID" && $1 != "VOICESTUDIO_HOST_PORT"' "$config" > "$temporary"
printf '\nSPEECH_SELECTION_ENABLED=true\nVOICESTUDIO_URL=http://127.0.0.1:8766\nVOICESTUDIO_HOST_PORT=%s\nVOICESTUDIO_ACCOUNT_USER_ID=%s\nVOICESTUDIO_API_KEY=%s\n' "$port" "$account" "$token" >> "$temporary"
chmod 600 "$temporary"
mv "$temporary" "$config"
unset token
rmdir "$lock"
trap - EXIT
printf '\nSaved privately. VoiceStudio must listen for authenticated requests on the configured local port.\nThe Docker bridge uses the Mac host gateway; keep the VoiceStudio listener private to this Mac/Docker network.\nRestarting Echelon. In Speech Services, run Check now before selecting VoiceStudio or Auto.\n'
exec bash "$resources/Start.command"
