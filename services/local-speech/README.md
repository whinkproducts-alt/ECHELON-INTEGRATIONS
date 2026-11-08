# Local speech adapter

Speech-only loopback API; no chat, tool, memory, upload or approval endpoint. Web routes retain account authentication, lockdown, admission and ledger. Local ASR returns text without confidence and cannot authorize protected actions.

## Contracts

Bind 127.0.0.1:8765 only. Every request needs bearer LOCAL_SPEECH_TOKEN (at least 32 random characters). Browser Origin/Fetch requests denied. Never publish the speech port.

- GET /health: authenticated 200 only after both engines and all allowlisted voices load; otherwise 503.
- POST /audio/transcriptions: multipart file, PCM16 mono 16kHz WAV, max60sec /10MiB. Returns text only.
- POST /audio/speech or /tts: JSON model=kokoro,input (max2000 chars),voice=af_heart,response_format=wav. Returns PCM16 mono24kHz audio/wav. Six American English voices allowlisted in app.py.
- One active inference at a time; competing calls429. No request content/access logging. Runtime loads cached assets offline; no automatic download or cloud fallback.

Echelon config: STT_PROVIDER=local-whisper, TTS_PROVIDER=local-kokoro, STT_URL and TTS_URL=http://127.0.0.1:8765, TTS_VOICE=af_heart, identical server-only LOCAL_SPEECH_TOKEN. Native web+speech share loopback; Docker speech must share web's network namespace. Do not permit host.docker.internal through Local-Only.

## License and readiness gate

The API-only Dockerfile intentionally installs no inference runtime. Proposed runtime requirements are NOT approved for installation under CLAUDE.md's MIT/Apache/BSD/ISC rule: faster-whisper uses PyAV (BSD wrapper with LGPL FFmpeg), Kokoro official misaki[en] pulls GPL phonemizer/espeak and LGPL num2words. Owner approval of exceptions, or a reviewed replacement preserving functionality, is required before installation. Do not silently strip pronunciation features.

Verified official Kokoro KPipeline API and24kHz output via https://github.com/hexgrad/kokoro and pipeline source (2026-11-07). Kokoro code Apache2, upstream describes Apache-licensed weights. Each downloaded voice asset's provenance/license still requires separate review before distribution. Model license alone does not establish all voice terms. See https://github.com/hexgrad/misaki/blob/main/pyproject.toml and https://github.com/SYSTRAN/faster-whisper.

After explicit license approval, separate setup installs proposed runtimes, downloads a pinned Systran/faster-whisper-small.en snapshot to WHISPER_MODEL_PATH (default /models/whisper-small.en), caches pinned hexgrad/Kokoro-82M config/model and all six allowlisted voices, and installs Misaki's required spaCy English model. Start never downloads; missing assets return503. Runtime cache read-only. Docker profile is CPU compatibility only, without GPU/MLX latency claims.

Run python -m unittest discover -s tests -v for contract tests with fake engines. Mac inference, pronunciation, performance and actual voice asset acceptance remain unverified.
