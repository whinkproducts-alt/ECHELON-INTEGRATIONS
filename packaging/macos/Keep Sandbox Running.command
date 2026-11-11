#!/bin/bash
# Non-interactive launchd job. Never prompts, changes ports, builds images, or opens a browser.
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
umask 077
resources="$(cd "$(dirname "$0")" && pwd)"
state="$HOME/Library/Application Support/ECHELON Integrations Sandbox"
config="$state/runtime.env"
release="$(cat "$resources/release-id.txt" 2>/dev/null || true)"
[[ "$release" =~ ^[a-f0-9]{12,64}$ ]] || exit 0
runtime="$state/releases/$release"
[[ -f "$config" && -f "$runtime/.source-ready" ]] || exit 0
[[ ! -d "$state/install.lock" ]] || exit 0

if ! docker info >/dev/null 2>&1; then
  # Open only the engine selected by Docker's current context. launchd retries
  # on its next interval while the engine starts; never change the context.
  context="$(docker context show 2>/dev/null || true)"
  case "$context" in
    orbstack*) open -a OrbStack >/dev/null 2>&1 || true ;;
    desktop*) open -a Docker >/dev/null 2>&1 || true ;;
    default)
      if [ -d /Applications/Docker.app ] && [ ! -d /Applications/OrbStack.app ]; then
        open -a Docker >/dev/null 2>&1 || true
      elif [ -d /Applications/OrbStack.app ] && [ ! -d /Applications/Docker.app ]; then
        open -a OrbStack >/dev/null 2>&1 || true
      fi ;;
  esac
  exit 0
fi

export WHINK_PROJECT_NAME=echelon-integrations-sandbox
export WHINK_DB_VOLUME=echelon-integrations-sandbox-data
export WHINK_SPEECH_VOLUME=echelon-integrations-sandbox-speech
export WHINK_RUNTIME_ENV="$config" WHINK_RELEASE_ID="$release"
cd "$runtime"
compose=(docker compose --env-file "$config" -f packaging/local/compose.yaml)
speech_enabled=false
if awk -F= '$1 == "LOCAL_SPEECH_TOKEN" && length($2) >= 32 { found=1 } END { exit !found }' "$config"; then
  compose+=(--profile speech)
  speech_enabled=true
fi
studio_enabled=false
if awk -F= '$1 == "VOICESTUDIO_API_KEY" && length($2) >= 16 { found=1 } END { exit !found }' "$config"; then
  compose+=(--profile voicestudio)
  studio_enabled=true
fi

running() {
  local service="$1" id
  id="$("${compose[@]}" ps -q "$service" 2>/dev/null || true)"
  [ -n "$id" ] && [ "$(docker inspect --format '{{.State.Status}}' "$id" 2>/dev/null)" = running ]
}
healthy() {
  local service="$1" id
  id="$("${compose[@]}" ps -q "$service" 2>/dev/null || true)"
  [ -n "$id" ] && [ "$(docker inspect --format '{{.State.Health.Status}}' "$id" 2>/dev/null)" = healthy ]
}

if healthy postgres && healthy web && running worker; then
  if [ "$speech_enabled" = false ] || running local-speech; then
    if [ "$studio_enabled" = false ] || running voicestudio-bridge; then
      exit 0
    fi
  fi
fi

web_id="$("${compose[@]}" ps -q web 2>/dev/null || true)"
if [ -n "$web_id" ] && [ "$(docker inspect --format '{{.State.Health.Status}}' "$web_id" 2>/dev/null)" = unhealthy ]; then
  # A running but unhealthy web container is not restarted by Docker's policy.
  # Restart it before Compose waits on web:service_healthy for worker/adapters.
  "${compose[@]}" restart web >/dev/null 2>&1 || true
fi
if "${compose[@]}" up --no-build --pull never -d >/dev/null 2>&1; then
  printf '%s Sandbox services reconciled.\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
else
  printf '%s Sandbox recovery failed; check Docker and the sandbox launch log.\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" >&2
  exit 1
fi
