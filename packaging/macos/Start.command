#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
umask 077
resources="$(cd "$(dirname "$0")" && pwd)"
state="$HOME/Library/Application Support/Whink Ultimate"
mkdir -p "$state"
chmod 700 "$state"
fail() { printf '\n%s\n' "$1"; read -r -p 'Press Return to close.' _; exit 1; }
command -v docker >/dev/null || fail 'Install and start Docker Desktop or OrbStack first, then reopen Whink Ultimate. No dependencies were installed.'
docker info >/dev/null 2>&1 || fail 'Docker is unavailable. Start Docker Desktop or OrbStack and grant this app access, then reopen.'
docker compose version >/dev/null 2>&1 || fail 'Docker Compose v2 is required.'
release="$(cat "$resources/release-id.txt")"
[[ "$release" =~ ^[a-f0-9]{12,64}$ ]] || fail 'Invalid release identifier.'
export WHINK_RELEASE_ID="$release"
export WHINK_RUNTIME_ENV="$state/runtime.env"
lock="$state/install.lock"
if ! mkdir "$lock" 2>/dev/null; then
  fail 'Another setup may be running. If it was interrupted, close its Terminal window, remove install.lock from the Whink Ultimate support folder, and reopen. No running process was stopped.'
fi
candidate=''
cleanup() {
  if [ -n "$candidate" ] && [[ "$candidate" == "$state/releases/.$release."* ]]; then
    rm -rf "$candidate"
  fi
  rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT
runtime="$state/releases/$release"
if [ ! -f "$runtime/.source-ready" ]; then
  mkdir -p "$state/releases"
  candidate="$(mktemp -d "$state/releases/.$release.XXXXXX")"
  tar -xzf "$resources/source.tar.gz" -C "$candidate"
  touch "$candidate/.source-ready"
  # Retain any interrupted/older source copy; DB and private configuration live elsewhere.
  if [ -d "$runtime" ]; then
    mv "$runtime" "$runtime.incomplete.$(date +%s).$RANDOM"
  fi
  mv "$candidate" "$runtime"
  candidate=''
fi
if [ ! -f "$WHINK_RUNTIME_ENV" ]; then
  printf '\nWHINK local system setup\nCreates a separate persistent database; your existing checkout/data is untouched.\n'
  read -r -p 'Owner email (use this exact email when creating your account): ' owner
  [[ "$owner" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail 'Enter a valid owner email; configuration has not been created.'
  db_password="$(openssl rand -hex 32)"
  auth_secret="$(openssl rand -hex 32)"
  encryption_key="$(openssl rand -hex 32)"
  setup_token="$(openssl rand -hex 32)"
  http_port=3211
  # First installation only: preserve existing origins/passkeys on later starts.
  if /usr/sbin/lsof -nP -iTCP:"$http_port" -sTCP:LISTEN >/dev/null 2>&1; then
    for ((candidate=0; candidate<30; candidate++)); do
      http_port=$((49152 + RANDOM % 16384))
      /usr/sbin/lsof -nP -iTCP:"$http_port" -sTCP:LISTEN >/dev/null 2>&1 || break
    done
  fi
  # Values are generated hex or the validated email; no shell code is evaluated.
  cat > "$WHINK_RUNTIME_ENV.tmp" <<EOF
WHINK_DB_PASSWORD=$db_password
WHINK_HTTP_PORT=$http_port
DATABASE_URL=postgresql://whink:$db_password@postgres:5432/whink
DIRECT_URL=postgresql://whink:$db_password@postgres:5432/whink
AUTH_SECRET=$auth_secret
NEXTAUTH_SECRET=$auth_secret
AUTH_URL=http://localhost:$http_port
NEXTAUTH_URL=http://localhost:$http_port
AUTH_TRUST_HOST=true
ENCRYPTION_KEY=$encryption_key
WHINK_OWNER_EMAILS=$owner
SIGNUP_BOOTSTRAP_TOKEN=$setup_token
SIGNUP_ENABLED=
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:$http_port
WORKER_ENABLED=true
WORKER_CONCURRENCY=1
DEFAULT_MODEL=wink-qwen3.5-9b-8k
SWARM_MODEL=wink-qwen3.5-9b-8k
EXTRACTION_MODEL=wink-qwen3.5-9b-8k
OLLAMA_URL=http://host.docker.internal:11434
OPENAI_COMPATIBLE_BASE_URL=http://host.docker.internal:11434/v1
EMBEDDING_MODEL=ollama/nomic-embed-text
NVIDIA_TRIAL_ENABLED=false
STT_PROVIDER=
TTS_PROVIDER=
SPEECH_SELECTION_ENABLED=true
LOCAL_SPEECH_URL=http://127.0.0.1:8765
LOCAL_SPEECH_TOKEN=
VOICESTUDIO_URL=http://127.0.0.1:8766
VOICESTUDIO_API_KEY=
VOICESTUDIO_ACCOUNT_USER_ID=
VOICESTUDIO_HOST_PORT=3900
HIGGSFIELD_ENABLED=false
HIGGSFIELD_ACCOUNT_USER_ID=
HIGGSFIELD_KEY_ID=
HIGGSFIELD_KEY_SECRET=
EOF
  mv "$WHINK_RUNTIME_ENV.tmp" "$WHINK_RUNTIME_ENV"
  printf 'First account setup token (private; enter in the signup form):\n%s\n' "$setup_token" > "$state/Setup-token.txt"
fi
chmod 600 "$WHINK_RUNTIME_ENV"
# Add safe, inert upgrade defaults without changing any existing configuration.
append_default() {
  if ! awk -F= -v key="$1" '$1 == key { found=1 } END { exit !found }' "$WHINK_RUNTIME_ENV"; then
    printf '\n%s=%s\n' "$1" "$2" >> "$WHINK_RUNTIME_ENV"
  fi
}
append_default SPEECH_SELECTION_ENABLED true
append_default LOCAL_SPEECH_URL http://127.0.0.1:8765
append_default VOICESTUDIO_URL http://127.0.0.1:8766
append_default VOICESTUDIO_ACCOUNT_USER_ID ''
# Parse only this numeric key; never source/evaluate the private dotenv file.
http_port="$(awk -F= '$1 == "WHINK_HTTP_PORT" { value=$2 } END { print value }' "$WHINK_RUNTIME_ENV")"
http_port="${http_port:-3211}"
[[ "$http_port" =~ ^[0-9]{4,5}$ ]] && ((http_port >= 1024 && http_port <= 65535)) || fail 'Invalid configured local HTTP port.'
export WHINK_HTTP_PORT="$http_port"
studio_url="http://localhost:$http_port"
cd "$runtime"
compose=(docker compose --env-file "$WHINK_RUNTIME_ENV" -f packaging/local/compose.yaml)
# Optional local services receive only their own credentials, never the web env file.
if awk -F= '$1 == "LOCAL_SPEECH_TOKEN" && length($2) >= 32 { found=1 } END { exit !found }' "$WHINK_RUNTIME_ENV"; then
  compose+=(--profile speech)
fi
if awk -F= '$1 == "VOICESTUDIO_API_KEY" && length($2) >= 16 { found=1 } END { exit !found }' "$WHINK_RUNTIME_ENV"; then
  compose+=(--profile voicestudio)
fi
if [ "${1:-}" = '--stop' ]; then
  "${compose[@]}" stop
  printf 'Stopped the installed stack; database volume preserved.\n'
  exit 0
fi
printf '\nBuilding and starting web, worker and Postgres. First setup downloads pinned dependencies/images.\nLocal Ollama and its configured models must already be available; no model or paid service is provisioned.\n'
df -h "$state"
"${compose[@]}" up --build -d || fail 'Setup did not complete. Review the Docker output above. Existing database/configuration are preserved.'
for ((attempt=0; attempt<60; attempt++)); do
  if curl --fail --silent --max-time 3 "$studio_url/login" >/dev/null; then
    # Verify Compose identifies its own web service as healthy; an unrelated port listener is insufficient.
    web_id="$("${compose[@]}" ps -q web)"
    if [ -n "$web_id" ] && [ "$(docker inspect --format '{{.State.Health.Status}}' "$web_id")" = healthy ]; then
      printf '\nWeb ready at %s. Worker process status (not model/service integration proof):\n' "$studio_url"
      "${compose[@]}" ps
      [ ! -f "$state/Setup-token.txt" ] || open -t "$state/Setup-token.txt"
      open "$studio_url"
      exit 0
    fi
  fi
  sleep 2
done
fail 'Readiness timed out. Open Docker to inspect the installed services. No database reset or automatic retry of user actions was performed.'
