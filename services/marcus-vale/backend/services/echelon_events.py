"""Listens to ECHELON's status feed and keeps handoff and task rows current."""
import asyncio
import logging
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

import database
from models import Briefing, EchelonHandoff, Task
from services import echelon_client as ec
from services.settings_store import get_setting, set_setting
from services.task_status import task_status_for

log = logging.getLogger("marcus.echelon_events")
LAST_EVENT_KEY = "echelon_last_event_id"


async def _alert_once(db: AsyncSession, key: str, text: str) -> None:
    if (await db.execute(select(Briefing.id).where(Briefing.key == key))).first() is None:
        db.add(Briefing(kind="alert", key=key, text=text))


async def apply_event(db: AsyncSession, data: dict) -> bool:
    """Apply one feed event. Returns False if the event is not about a task Marcus knows."""
    echelon_id = data.get("task_id")
    status = data.get("status")
    if not echelon_id or not status:
        return False
    handoff = (
        await db.execute(
            select(EchelonHandoff)
            .where(EchelonHandoff.echelon_task_id == str(echelon_id))
            .order_by(EchelonHandoff.created_at.desc())
        )
    ).scalars().first()
    if handoff is None:
        return False
    handoff.status = status
    task = await db.get(Task, handoff.task_id)
    if task is not None:
        task.status = task_status_for(status)
        if status == "blocked":
            await _alert_once(db, f"blocked:{echelon_id}", f"ECHELON is blocked on '{task.title}' and needs your answer.")
        elif status == "reconfirmation_required":
            await _alert_once(
                db, f"reconfirm:{echelon_id}", f"'{task.title}' needs your second approval before ECHELON starts."
            )
    await db.commit()
    return True


async def run_listener() -> None:
    backoff = 1
    while True:
        try:
            async with database.AsyncSessionLocal() as db:
                last: Optional[str] = await get_setting(db, LAST_EVENT_KEY)
            async for event_id, _etype, data in ec.stream_events(last):
                async with database.AsyncSessionLocal() as db:
                    await apply_event(db, data)
                    if event_id:
                        await set_setting(db, LAST_EVENT_KEY, event_id)
                backoff = 1
            await asyncio.sleep(backoff)
        except asyncio.CancelledError:
            raise
        except Exception as e:  # keep listening whatever happens
            log.warning("ECHELON event stream down (%s), retrying in %ss", type(e).__name__, backoff)
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 60)
