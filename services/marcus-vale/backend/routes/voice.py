import base64
import logging
import re

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import ChatMessage, Memory
from schemas import ChatRequest, SynthesizeRequest, VoiceRequest
from services.control_state import FROZEN_MESSAGE, get_frozen
from services.freeze import do_freeze, do_resume, kill_message, resume_message
from services.kokoro import content_type, synthesize
from services.never_store import check
from services.omniroute import generate
from services.scheduler import change_timezone, resolve_timezone
from services.spend import SpendCapReached
from services.whisper import transcribe

log = logging.getLogger("marcus.voice")
router = APIRouter()

KILL_PHRASE = "marcus stop everything"
RESUME_PHRASE = "marcus resume"
HISTORY_LIMIT = 20
CORE_FACT_LIMIT = 25
_TZ_RE = re.compile(r"time ?zone to (.+)$", re.IGNORECASE)


def _norm(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9 ]", " ", text.lower())).strip()


@router.post("/transcribe")
async def transcribe_voice(request: VoiceRequest):
    try:
        return {"text": await transcribe(request.audio, request.language)}
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        log.warning("transcribe failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="Speech to text is unavailable")


@router.post("/synthesize")
async def synthesize_voice(body: SynthesizeRequest):
    try:
        audio = await synthesize(body.text, body.language)
        return {"audio": base64.b64encode(audio).decode("utf-8"), "content_type": content_type()}
    except Exception as e:
        log.warning("synthesize failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="Text to speech is unavailable")


async def _remember_turn(db: AsyncSession, session_id: str, prompt: str, reply: str) -> None:
    """Persist a turn only if neither side holds never-store content."""
    if check(prompt) or check(reply):
        return
    db.add(ChatMessage(session_id=session_id, role="user", content=prompt))
    db.add(ChatMessage(session_id=session_id, role="assistant", content=reply))
    await db.commit()


@router.post("/chat")
async def chat(request: ChatRequest, db: AsyncSession = Depends(get_db)):
    norm = _norm(request.prompt)

    # Kill switch and resume always work, frozen or not.
    if KILL_PHRASE in norm:
        return {"response": kill_message(await do_freeze(db))}
    if RESUME_PHRASE in norm:
        return {"response": resume_message(await do_resume(db))}

    # Time zone by voice.
    m = _TZ_RE.search(request.prompt.strip().rstrip(".!?"))
    if m:
        tz_name = resolve_timezone(m.group(1))
        if tz_name is None:
            return {"response": "I could not match that time zone. Say a city or a name like America/Edmonton."}
        await change_timezone(db, tz_name)
        return {"response": f"Time zone set to {tz_name}. My schedule now follows it."}

    # Conversation keeps working while frozen. Only tasks and handoffs are blocked.
    history_rows = (
        await db.execute(
            select(ChatMessage)
            .where(ChatMessage.session_id == request.session_id)
            .order_by(ChatMessage.created_at.desc())
            .limit(HISTORY_LIMIT)
        )
    ).scalars().all()
    history = [{"role": r.role, "content": r.content} for r in reversed(history_rows)]
    facts = (
        await db.execute(select(Memory.content).where(Memory.layer == "layer2").limit(CORE_FACT_LIMIT))
    ).scalars().all()

    try:
        reply = await generate(request.prompt, history=history, core_facts=list(facts))
    except SpendCapReached:
        raise HTTPException(status_code=402, detail="Monthly spend cap reached. Chat is paused until next month.")
    except Exception as e:
        log.warning("chat failed: %s", type(e).__name__)
        raise HTTPException(status_code=502, detail="Marcus could not reach the language model")

    await _remember_turn(db, request.session_id, request.prompt, reply)
    return {"response": reply}
