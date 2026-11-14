#!/bin/zsh
# Round trip test of the voice containers. Run from the repo root: ./scripts/voice_smoke.sh
# Kokoro speaks a sentence, Whisper listens to it. No Marcus code is involved.
set -e
WHISPER="${WHISPER_URL:-http://127.0.0.1:8767}"
KOKORO="${KOKORO_URL:-http://127.0.0.1:8768}"
MODEL="${WHISPER_MODEL:-Systran/faster-whisper-base}"
VOICE="${KOKORO_VOICE:-af_bella}"
TMP=$(mktemp -d)
echo "1. Kokoro voices (first 5):"
curl -sf "$KOKORO/v1/audio/voices" | head -c 300; echo
echo "2. Kokoro speaking..."
curl -sf -o "$TMP/say.mp3" -w "   http %{http_code}, %{size_download} bytes, %{time_total}s\n" \
  "$KOKORO/v1/audio/speech" -H 'Content-Type: application/json' \
  -d "{\"model\":\"kokoro\",\"input\":\"Good morning Victor. You have no open tasks.\",\"voice\":\"$VOICE\",\"response_format\":\"mp3\"}"
echo "3. Whisper models installed:"
curl -sf "$WHISPER/v1/models" | head -c 400; echo
echo "4. Whisper listening..."
curl -s "$WHISPER/v1/audio/transcriptions" -F "file=@$TMP/say.mp3" -F "model=$MODEL" -F "language=en" \
  -w "\n   http %{http_code}, %{time_total}s\n"
echo "Expected text: Good morning Victor. You have no open tasks."
echo "Audio kept at $TMP/say.mp3 (play with: afplay $TMP/say.mp3)"
