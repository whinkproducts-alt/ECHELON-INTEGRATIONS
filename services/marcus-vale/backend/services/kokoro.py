"""Text to speech through the local Kokoro-FastAPI container (OpenAI style /v1/audio/speech)."""
import httpx

from config import settings

_TIMEOUT = httpx.Timeout(60.0, connect=5.0)

CONTENT_TYPES = {"mp3": "audio/mpeg", "wav": "audio/wav", "opus": "audio/ogg", "flac": "audio/flac", "aac": "audio/aac"}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=_TIMEOUT)


def content_type() -> str:
    return CONTENT_TYPES.get(settings.KOKORO_FORMAT, "application/octet-stream")


async def synthesize(text: str, language: str = "en") -> bytes:
    """Returns raw audio bytes in settings.KOKORO_FORMAT. Kokoro picks the language from the voice."""
    async with _client() as client:
        response = await client.post(
            f"{settings.KOKORO_URL}/v1/audio/speech",
            json={
                "model": "kokoro",
                "input": text,
                "voice": settings.KOKORO_VOICE,
                "response_format": settings.KOKORO_FORMAT,
                "speed": 1.0,
            },
        )
    response.raise_for_status()
    return response.content
