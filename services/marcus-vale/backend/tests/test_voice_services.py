"""Request shapes for Whisper and Kokoro, checked against a fake server."""
import base64
import json

import httpx
import pytest
from unittest.mock import patch

from config import settings
from services import kokoro, whisper

REAL = httpx.AsyncClient


def fake(handler):
    return lambda: REAL(transport=httpx.MockTransport(handler))


async def test_whisper_sends_multipart_to_v1():
    seen = {}

    def handler(req):
        seen["url"] = str(req.url)
        seen["ctype"] = req.headers["content-type"]
        seen["body"] = req.content
        return httpx.Response(200, json={"text": " hello there "})

    wav = b"RIFF" + b"\x00" * 40
    with patch.object(whisper, "_client", fake(handler)):
        out = await whisper.transcribe(base64.b64encode(wav).decode(), "en")
    assert out == "hello there"
    assert seen["url"].endswith("/v1/audio/transcriptions")
    assert seen["ctype"].startswith("multipart/form-data")
    assert b'name="file"; filename="audio.wav"' in seen["body"]
    assert settings.WHISPER_MODEL.encode() in seen["body"]
    assert b'name="language"' in seen["body"]


@pytest.mark.parametrize("head,name", [(b"\x1a\x45\xdf\xa3", "audio.webm"), (b"OggS", "audio.ogg"), (b"\x00\x00\x00\x18ftyp", "audio.m4a")])
def test_sniff(head, name):
    assert whisper.sniff_audio(head + b"\x00" * 20)[0] == name


async def test_whisper_rejects_bad_input():
    with pytest.raises(ValueError):
        await whisper.transcribe("not base64 !!!")
    with pytest.raises(ValueError):
        await whisper.transcribe("")


async def test_kokoro_request_shape():
    seen = {}

    def handler(req):
        seen["url"] = str(req.url)
        seen["json"] = json.loads(req.content)
        return httpx.Response(200, content=b"ID3audio")

    with patch.object(kokoro, "_client", fake(handler)):
        audio = await kokoro.synthesize("Good morning")
    assert audio == b"ID3audio"
    assert seen["url"].endswith("/v1/audio/speech")
    assert seen["json"] == {
        "model": "kokoro",
        "input": "Good morning",
        "voice": settings.KOKORO_VOICE,
        "response_format": settings.KOKORO_FORMAT,
        "speed": 1.0,
    }


async def test_voice_routes(client):
    def ok(req):
        return httpx.Response(200, json={"text": "hi"}) if "transcriptions" in str(req.url) else httpx.Response(200, content=b"x")

    with patch.object(whisper, "_client", fake(ok)), patch.object(kokoro, "_client", fake(ok)):
        wav = base64.b64encode(b"RIFF" + b"\x00" * 20).decode()
        assert (await client.post("/voice/transcribe", json={"audio": wav})).json() == {"text": "hi"}
        r = (await client.post("/voice/synthesize", json={"text": "yo"})).json()
        assert r["content_type"] == "audio/mpeg" and base64.b64decode(r["audio"]) == b"x"
        assert (await client.post("/voice/transcribe", json={"audio": "???"})).status_code == 422

    def down(req):
        raise httpx.ConnectError("refused")

    with patch.object(kokoro, "_client", fake(down)):
        r = await client.post("/voice/synthesize", json={"text": "yo"})
        assert r.status_code == 502 and "refused" not in r.text
