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

The API-only Dockerfile remains useful for contract testing. The owner approved GPL/LGPL components in this separate private runtime on 2026-11-10, with license notices retained. `Dockerfile.runtime` installs CPU PyTorch, faster-whisper, Kokoro, English pronunciation dependencies and the pinned spaCy model. See LICENSES.md. This exception does not change the general repository dependency rule.

Verified official Kokoro KPipeline API and24kHz output via https://github.com/hexgrad/kokoro and pipeline source (2026-11-07). Kokoro code Apache2, upstream describes Apache-licensed weights. Each downloaded voice asset's provenance/license still requires separate review before distribution. Model license alone does not establish all voice terms. See https://github.com/hexgrad/misaki/blob/main/pyproject.toml and https://github.com/SYSTRAN/faster-whisper.

The Mac `Prepare Speech.command` helper explicitly builds this runtime and downloads immutable Systran/faster-whisper-small.en and hexgrad/Kokoro-82M snapshots. It records commit IDs and SHA-256 file hashes in a private model-volume manifest. Normal start never downloads; missing assets return503. The serving container mounts the cache read-only. Docker CPU operation is a compatibility route without GPU/MLX latency claims. Preparing models needs at least 3 GiB free after image build and access to official Hugging Face model hosts; no model files are included in the source archive.

Run python -m unittest discover -s tests -v for contract tests with fake engines. Mac inference, pronunciation, performance and actual voice asset acceptance remain unverified.
