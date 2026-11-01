# Voice Service

This directory documents how to run local STT and TTS services for WHINK Ultimate in production or offline mode.

In development, the browser Web Speech API and SpeechSynthesis handle STT/TTS with zero dependencies. Set the env vars below to switch to server-side inference.

## STT — Whisper (OpenAI-compatible)

Run `faster-whisper-server` (https://github.com/fedirz/faster-whisper-server):

```bash
docker run --rm -p 8765:8000 \
  -e WHISPER__MODEL=Systran/faster-whisper-base.en \
  fedirz/faster-whisper-server:latest-cpu
```

Or with GPU:
```bash
docker run --rm --gpus all -p 8765:8000 \
  -e WHISPER__MODEL=Systran/faster-whisper-small \
  fedirz/faster-whisper-server:latest-cuda
```

Set in `.env`:
```
STT_URL=http://localhost:8765/v1
```

The WHINK STT route POSTs to `${STT_URL}/audio/transcriptions` with the same multipart format as OpenAI Whisper.

## TTS — Kokoro (OpenAI-compatible)

Run Kokoro FastAPI (https://github.com/remsky/Kokoro-FastAPI):

```bash
docker run --rm -p 8766:8880 ghcr.io/remsky/kokoro-fastapi-cpu:latest
```

Set in `.env`:
```
TTS_URL=http://localhost:8766/v1
TTS_VOICE=af_heart
```

The WHINK TTS route POSTs to `${TTS_URL}/audio/speech`.

## ADA V2

ADA V2 is WHINK Apps' internal voice service. When it is running:
```
STT_URL=http://ada-host:PORT/v1
TTS_URL=http://ada-host:PORT/v1
```
Both endpoints are OpenAI-compatible, so no other config changes are needed.

## Docker Compose snippet

Add to the root `docker-compose.yml`:

```yaml
services:
  whisper:
    image: fedirz/faster-whisper-server:latest-cpu
    ports:
      - "8765:8000"
    environment:
      WHISPER__MODEL: Systran/faster-whisper-base.en

  kokoro:
    image: ghcr.io/remsky/kokoro-fastapi-cpu:latest
    ports:
      - "8766:8880"
```
