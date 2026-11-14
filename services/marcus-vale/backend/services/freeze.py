"""Kill switch. Stops queued tasks and ECHELON handoffs. Conversation, calls and reminders keep working."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import Task
from services import echelon_client as ec
from services.control_state import set_frozen


async def do_freeze(db: AsyncSession) -> dict:
    await set_frozen(db, True)  # local first, so nothing new starts while we call ECHELON
    pending = (await db.execute(select(Task).where(Task.status == "pending"))).scalars().all()
    for t in pending:
        t.prev_status = t.status
        t.status = "frozen"
    await db.commit()
    echelon = "ok" if ec.enabled() else "off"
    try:
        if ec.enabled():
            await ec.freeze_echelon()
    except ec.EchelonError as e:
        echelon = e.public_message()
    return {"frozen": True, "tasks_frozen": len(pending), "echelon": echelon}


async def do_resume(db: AsyncSession) -> dict:
    await set_frozen(db, False)
    frozen = (await db.execute(select(Task).where(Task.status == "frozen"))).scalars().all()
    for t in frozen:
        t.status = t.prev_status or "pending"
        t.prev_status = None
    await db.commit()
    echelon = "ok" if ec.enabled() else "off"
    try:
        if ec.enabled():
            await ec.unfreeze_echelon()
    except ec.EchelonError as e:
        echelon = e.public_message()
    return {"frozen": False, "tasks_resumed": len(frozen), "echelon": echelon}


def kill_message(result: dict) -> str:
    base = "Everything is paused. Calls and reminders are still running. Say 'Marcus, resume' when you're ready."
    if result["echelon"] not in ("ok", "off"):
        base = (
            "Marcus is paused, but I could not pause ECHELON: "
            f"{result['echelon']}. Work already inside ECHELON may continue."
        )
    return base


def resume_message(result: dict) -> str:
    if result["echelon"] not in ("ok", "off"):
        return f"Marcus is resumed, but ECHELON did not resume: {result['echelon']}."
    return "Resuming now."
