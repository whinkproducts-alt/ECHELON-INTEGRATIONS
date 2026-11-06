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
trap 'rmdir "$lock" 2>/dev/null || true' EXIT
runtime="$state/releases/$release"
if [ ! -f "$runtime/package.json" ]; then
  mkdir -p "$runtime"
  tar -xzf "$resources/source.tar.gz" -C "$runtime"
fi
if [ ! -f "$WHINK_RUNTIME_ENV" ]; then
  printf '\nWHINK local system setup\nCreates a separate persistent database; your existing checkout/data is untouched.\n'
  read -r -p 'Owner email (use this exact email when creating your account): ' owner
  [[ "$owner" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]] || fail 'Enter a valid owner email; configuration has not been created.'
  db_password="$(openssl rand -hex 32)"
  auth_secret="$(openssl rand -hex 32)"
  encryption_key="$(openssl rand -hex 32)"
  setup_token="$(openssl rand -hex 32)"
  # Values are generated hex or the validated email; no shell code is evaluated.
  cat > "$WHINK_RUNTIME_ENV.tmp" <<EOF
WHINK_DB_PASSWORD=$db_password
DATABASE_URL=postgresql://whink:$db_password@postgres:5432/whink
DIRECT_URL=postgresql://whink:$db_password@postgres:5432/whink
AUTH_SECRET=$auth_secret
NEXTAUTH_SECRET=$auth_secret
AUTH_URL=http://localhost:3211
NEXTAUTH_URL=http://localhost:3211
AUTH_TRUST_HOST=true
ENCRYPTION_KEY=$encryption_key
WHINK_OWNER_EMAILS=$owner
SIGNUP_BOOTSTRAP_TOKEN=$setup_token
SIGNUP_ENABLED=
WEBAUTHN_RP_ID=localhost
WEBAUTHN_ORIGIN=http://localhost:3211
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
EOF
  mv "$WHINK_RUNTIME_ENV.tmp" "$WHINK_RUNTIME_ENV"
  printf 'First account setup token (private; enter in the signup form):\n%s\n' "$setup_token" > "$state/Setup-token.txt"
fi
chmod 600 "$WHINK_RUNTIME_ENV"
cd "$runtime"
compose=(docker compose --env-file "$WHINK_RUNTIME_ENV" -f packaging/local/compose.yaml)
if [ "${1:-}" = '--stop' ]; then
  "${compose[@]}" stop
  printf 'Stopped the installed stack; database volume preserved.\n'
  exit 0
fi
printf '\nBuilding and starting web, worker and Postgres. First setup downloads pinned dependencies/images.\nLocal Ollama and its configured models must already be available; no model or paid service is provisioned.\n'
"${compose[@]}" up --build -d || fail 'Setup did not complete. Review the Docker output above. Existing database/configuration are preserved.'
for ((attempt=0; attempt<60; attempt++)); do
  if curl --fail --silent --max-time 3 http://localhost:3211/login >/dev/null; then
    # Verify Compose identifies its own web service as healthy; an unrelated port listener is insufficient.
    web_id="$("${compose[@]}" ps -q web)"
    if [ -n "$web_id" ] && [ "$(docker inspect --format '{{.State.Health.Status}}' "$web_id")" = healthy ]; then
      printf '\nWeb ready at http://localhost:3211. Worker process status (not model/service integration proof):\n'
      "${compose[@]}" ps
      [ ! -f "$state/Setup-token.txt" ] || open -t "$state/Setup-token.txt"
      open http://localhost:3211
      exit 0
    fi
  fi
  sleep 2
done
fail 'Readiness timed out. Open Docker to inspect the installed services. No database reset or automatic retry of user actions was performed.'
