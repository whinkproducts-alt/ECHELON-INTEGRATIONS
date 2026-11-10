"""Speech-only loopback adapter. Never handles chat, approval or tools."""
import asyncio
import hmac
import io
import os
import wave
from pathlib import Path
from contextlib import asynccontextmanager

import array
import math
import sys
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

MAX_BODY = 10 * 1024 * 1024
MAX_SECONDS = 60
VOICES = ('af_heart', 'af_bella', 'af_sky', 'af_nova', 'am_adam', 'am_michael')


def decode_wav(data: bytes) -> array.array:
    """Strict PCM16 mono 16kHz browser contract; no external decoders or URLs."""
    try:
        with wave.open(io.BytesIO(data), 'rb') as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 16000, 'NONE'):
                raise ValueError('Expected mono PCM16 16kHz WAV')
            frames = audio.getnframes()
            if not 0 < frames <= MAX_SECONDS * 16000:
                raise ValueError('Recording must be between 0 and 60 seconds')
            raw = audio.readframes(frames)
            if len(raw) != frames * 2:
                raise ValueError('Truncated WAV')
    except (wave.Error, EOFError) as exc:
        raise ValueError('Invalid WAV') from exc
    samples = array.array('h'); samples.frombytes(raw)
    if sys.byteorder != 'little': samples.byteswap()
    return array.array('f', (sample / 32768.0 for sample in samples))


def encode_wav(samples, sample_rate: int = 24000) -> bytes:
    samples = list(samples)
    if not 0 < len(samples) <= sample_rate * 180 or not all(math.isfinite(sample) for sample in samples):
        raise ValueError('Invalid generated audio')
    output = io.BytesIO()
    pcm = array.array('h', (int(max(-1, min(1, sample)) * 32767) for sample in samples))
    if sys.byteorder != 'little': pcm.byteswap()
    with wave.open(output, 'wb') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(sample_rate)
        audio.writeframes(pcm.tobytes())
    return output.getvalue()


class LocalEngine:
    """Loads existing cached assets only. Downloads belong to separate setup."""
    def __init__(self):
        self.ready = False
        self.error = 'Models not loaded'

    def load(self):
        # No network access even when a cache entry or voice is missing.
        os.environ['HF_HUB_OFFLINE'] = '1'
        os.environ['TRANSFORMERS_OFFLINE'] = '1'
        os.environ['DO_NOT_TRACK'] = '1'
        try:
            from prepare_models import verify_assets
            verify_assets(Path('/models'))
            from faster_whisper import WhisperModel
            from kokoro import KPipeline
            import torch
            import spacy
            if not spacy.util.is_package('en_core_web_sm'):
                raise ValueError('English pronunciation model missing; explicit setup required')
            torch.set_num_threads(int(os.getenv('LOCAL_SPEECH_THREADS', '2')))
            model_path = Path(os.getenv('WHISPER_MODEL_PATH', '/models/whisper-small.en'))
            if not model_path.is_dir():
                raise ValueError('Whisper model missing')
            self.whisper = WhisperModel(str(model_path), device='cpu', compute_type='int8', cpu_threads=2, num_workers=1, local_files_only=True)
            self.kokoro = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M', device='cpu')
            # Preload allowlisted voices; fail closed if any expected asset is missing.
            for voice in VOICES:
                self.kokoro.load_voice(voice)
            self.ready = True
            self.error = None
        except Exception:
            # Do not log model text, filesystem paths or credentials.
            self.error = 'Speech assets or runtime unavailable; run approved local setup'

    def transcribe(self, samples):
        import numpy as np
        samples = np.asarray(samples, dtype=np.float32)
        segments, _ = self.whisper.transcribe(samples, language='en', beam_size=1, condition_on_previous_text=False, vad_filter=False)
        return ''.join(segment.text for segment in segments).strip()

    def speak(self, text, voice):
        import numpy as np
        parts = []
        frames = 0
        for _, _, audio in self.kokoro(text, voice=voice, speed=1):
            part = audio.detach().cpu().numpy() if hasattr(audio, 'detach') else np.asarray(audio)
            frames += part.size
            if frames > 24000 * 180:
                raise ValueError('Generated audio too long')
            parts.append(part)
        return encode_wav(np.concatenate(parts))


class SpeechInput(BaseModel):
    model_config = ConfigDict(extra='forbid')
    input: str = Field(min_length=1, max_length=2000)
    voice: str = 'af_heart'
    model: str = 'kokoro'
    response_format: str = 'wav'


def create_app(engine=None, token=None):
    engine = engine or LocalEngine()
    token = token if token is not None else os.getenv('LOCAL_SPEECH_TOKEN', '')
    if len(token) < 32:
        raise RuntimeError('LOCAL_SPEECH_TOKEN must contain at least 32 characters')
    lock = asyncio.Lock()

    @asynccontextmanager
    async def lifespan(_app):
        if hasattr(engine, 'load'):
            await run_in_threadpool(engine.load)
        yield

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None, openapi_url=None)

    @app.middleware('http')
    async def guard(request: Request, call_next):
        # Browser pages cannot address this service directly; Echelon owns session auth.
        if request.headers.get('origin') or request.headers.get('sec-fetch-site'):
            return JSONResponse({'error': 'Browser access forbidden'}, status_code=403)
        if not hmac.compare_digest(request.headers.get('authorization', ''), 'Bearer ' + token):
            return JSONResponse({'error': 'Unauthorized'}, status_code=401)
        # Bound the actual streamed body before multipart/JSON parsing (not just a claimed size).
        body = bytearray()
        async for chunk in request.stream():
            body.extend(chunk)
            if len(body) > MAX_BODY:
                return JSONResponse({'error': 'Body too large'}, status_code=413)
        request._body = bytes(body)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    def ready():
        if not engine.ready:
            raise HTTPException(503, 'Speech models unavailable')

    @app.get('/health')
    async def health():
        return JSONResponse({'ready': bool(engine.ready), 'stt': 'whisper', 'tts': 'kokoro', 'input': 'audio/wav;pcm16;mono;16000', 'output': 'audio/wav;pcm16;mono;24000'}, status_code=200 if engine.ready else 503)

    @app.post('/audio/transcriptions')
    async def transcribe(request: Request):
        ready()
        async with request.form(max_files=1, max_fields=2) as form:
            upload = form.get('file')
            if not hasattr(upload, 'read'):
                raise HTTPException(400, 'Missing file')
            data = await upload.read(MAX_BODY + 1)
        try:
            samples = decode_wav(data)
        except ValueError as exc:
            raise HTTPException(415, str(exc)) from exc
        if lock.locked():
            raise HTTPException(429, 'Speech service busy')
        async with lock:
            try:
                text = await run_in_threadpool(engine.transcribe, samples)
            except Exception as exc:
                raise HTTPException(503, 'Transcription unavailable') from exc
        # No fabricated confidence: this output cannot authorize a protected action.
        return {'text': text}

    @app.post('/audio/speech')
    @app.post('/tts')
    async def speech(body: SpeechInput):
        ready()
        if not body.input.strip() or body.voice not in VOICES or body.model != 'kokoro' or body.response_format != 'wav':
            raise HTTPException(400, 'Unsupported speech request')
        if lock.locked():
            raise HTTPException(429, 'Speech service busy')
        async with lock:
            try:
                data = await run_in_threadpool(engine.speak, body.input, body.voice)
            except Exception as exc:
                raise HTTPException(503, 'Speech synthesis unavailable') from exc
        return Response(data, media_type='audio/wav')
    return app


def main():
    import uvicorn
    # This bind must remain loopback, including inside a shared web network namespace.
    uvicorn.run(create_app(), host='127.0.0.1', port=8765, access_log=False)


if __name__ == '__main__':
    main()
