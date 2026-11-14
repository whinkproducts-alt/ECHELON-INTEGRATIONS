"""Speech to text through the local faster-whisper (speaches) container. OpenAI style multipart upload."""
import base64
import binascii

import httpx

from config import settings

MAX_AUDIO_BYTES = 25 * 1024 * 1024
_TIMEOUT = httpx.Timeout(60.0, connect=5.0)


def sniff_audio(data: bytes) -> tuple[str, str]:
    """(filename, content type) from the file header. The server decodes by content, the name is a hint."""
    if data[:4] == b"RIFF":
        return "audio.wav", "audio/wav"
    if data[:4] == b"OggS":
        return "audio.ogg", "audio/ogg"
    if data[:4] == b"\x1a\x45\xdf\xa3":
        return "audio.webm", "audio/webm"
    if data[4:8] == b"ftyp":
        return "audio.m4a", "audio/mp4"
    if data[:3] == b"ID3" or data[:2] in (b"\xff\xfb", b"\xff\xf3"):
        return "audio.mp3", "audio/mpeg"
    if data[:4] == b"fLaC":
        return "audio.flac", "audio/flac"
    return "audio.wav", "application/octet-stream"


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=_TIMEOUT)


async def transcribe(audio_b64: str, language: str = "en") -> str:
    try:
        data = base64.b64decode(audio_b64, validate=True)
    except (binascii.Error, ValueError):
        raise ValueError("audio is not valid base64")
    if not data:
        raise ValueError("audio is empty")
    if len(data) > MAX_AUDIO_BYTES:
        raise ValueError("audio is too large")
    name, ctype = sniff_audio(data)
    async with _client() as client:
        response = await client.post(
            f"{settings.WHISPER_URL}/v1/audio/transcriptions",
            files={"file": (name, data, ctype)},
            data={"model": settings.WHISPER_MODEL, "language": language, "response_format": "json"},
        )
    response.raise_for_status()
    return response.json()["text"].strip()
