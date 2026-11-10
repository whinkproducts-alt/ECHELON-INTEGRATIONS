#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
umask 077
resources="$(cd "$(dirname "$0")" && pwd)"
if [ "${WHINK_INSTALL_KIND:-}" = sandbox ]; then
  state="$HOME/Library/Application Support/ECHELON Integrations Sandbox"
  export WHINK_PROJECT_NAME=echelon-integrations-sandbox
  export WHINK_DB_VOLUME=echelon-integrations-sandbox-data
  export WHINK_SPEECH_VOLUME=echelon-integrations-sandbox-speech
else
  state="$HOME/Library/Application Support/Whink Ultimate"
  export WHINK_SPEECH_VOLUME=whink-personal-speech-models
fi
config="$state/runtime.env"
fail() { printf '\n%s\n' "$1"; read -r -p 'Press Return to close.' _; exit 1; }
[[ -f "$config" ]] || fail 'Start Whink Ultimate first to create its private configuration.'
release="$(cat "$resources/release-id.txt")"
[[ "$release" =~ ^[a-f0-9]{12,64}$ ]] || fail 'Invalid release identifier.'
runtime="$state/releases/$release"
[[ -f "$runtime/.source-ready" ]] || fail 'Start Whink Ultimate first to extract this release.'
docker info >/dev/null 2>&1 || fail 'Start Docker Desktop or OrbStack first.'
lock="$state/install.lock"
mkdir "$lock" 2>/dev/null || fail 'Another setup is running; close it first.'
temporary=''
cleanup() { [ -z "$temporary" ] || rm -f "$temporary"; rmdir "$lock" 2>/dev/null || true; }
trap cleanup EXIT
export WHINK_RUNTIME_ENV="$config" WHINK_RELEASE_ID="$release"
http_port="$(awk -F= '$1 == "WHINK_HTTP_PORT" { value=$2 } END { print value }' "$config")"
export WHINK_HTTP_PORT="${http_port:-3211}"
cd "$runtime"
compose=(docker compose --env-file "$config" -f packaging/local/compose.yaml --profile speech)
printf '\nPreparing the private Whisper + Kokoro speech runtime. This downloads official model files and preserves their license notices.\n'
df -h "$state"
"${compose[@]}" build local-speech || fail 'Speech runtime build failed; the existing web installation is unchanged.'
# The model volume is writable only for this explicit preparation command.
# The serving container subsequently mounts the same volume read-only.
docker volume create "$WHINK_SPEECH_VOLUME" >/dev/null
docker run --rm --read-only --tmpfs /tmp:rw,nosuid,nodev,size=128m \
  --cap-drop ALL --security-opt no-new-privileges --user 10001:10001 \
  --mount "type=volume,source=$WHINK_SPEECH_VOLUME,target=/models" \
  "whink-local-speech:$release" python prepare_models.py || fail 'Model preparation failed. Check storage and model-host access; no speech service was enabled.'
token="$(openssl rand -hex 32)"
temporary="$(mktemp "${config}.XXXXXX")"
awk -F= '$1 != "LOCAL_SPEECH_TOKEN"' "$config" > "$temporary"
printf '\nLOCAL_SPEECH_TOKEN=%s\n' "$token" >> "$temporary"
chmod 600 "$temporary"
mv "$temporary" "$config"
temporary=''
unset token
rmdir "$lock"
trap - EXIT
printf '\nSpeech assets are ready. Starting Echelon with the private speech adapter.\n'
exec bash "$resources/Start.command"
