"""Briefings are built from real rows. The language model is not involved, so nothing can be invented."""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import Approval, Briefing, EchelonHandoff, Task

CLOSED = ("done", "failed", "cancelled")
NEEDS_VICTOR = ("blocked", "awaiting_confirmation")


async def gather(db: AsyncSession) -> dict:
    tasks = (await db.execute(select(Task).where(Task.status.notin_(CLOSED)))).scalars().all()
    approvals = (
        await db.execute(select(Approval).where(Approval.status == "pending"))
    ).scalars().all()
    handoffs = (
        await db.execute(select(EchelonHandoff).where(EchelonHandoff.status.notin_(("done", "failed", "cancelled", "rejected"))))
    ).scalars().all()
    return {
        "echelon_enabled": settings.echelon_enabled,
        "open_tasks": [(t.title, t.status, t.lane) for t in tasks],
        "needs_victor": [t.title for t in tasks if t.status in NEEDS_VICTOR],
        "awaiting_approval": [t.title for t in tasks if t.status == "pending" and t.lane == "lane2"],
        "pending_approvals": len(approvals),
        "echelon_active": [h.status for h in handoffs],
    }


def _count_phrase(n: int, singular: str) -> str:
    return f"{n} {singular}" if n == 1 else f"{n} {singular}s"


def compose(kind: str, d: dict) -> str:
    open_tasks, needs = d["open_tasks"], d["needs_victor"]
    if kind == "weekend":
        if not needs and not d["pending_approvals"]:
            return "Weekend wrap-up. Nothing needs you."
        parts = []
        if needs:
            parts.append(f"{_count_phrase(len(needs), 'task')} need your input: " + "; ".join(needs))
        if d["pending_approvals"]:
            parts.append(f"{_count_phrase(d['pending_approvals'], 'approval')} waiting for you")
        return "Weekend wrap-up. " + ". ".join(parts) + "."

    if kind == "memory_review":
        return "It is time for the weekly memory review. Should I call you, or send it to you to read?"

    greeting = "Good morning." if kind == "morning" else "Good evening."
    on = d.get("echelon_enabled", True)
    if not open_tasks and not d["pending_approvals"] and not d["echelon_active"]:
        tail = ", and nothing running in ECHELON" if on else ""
        return f"{greeting} You have no open tasks, nothing waiting for your approval{tail}."

    parts = [f"You have {_count_phrase(len(open_tasks), 'open task')}"]
    if open_tasks:
        parts[0] += ": " + "; ".join(f"{title} ({status})" for title, status, _lane in open_tasks)
    if needs:
        parts.append(f"{_count_phrase(len(needs), 'task')} need your input")
    if d["pending_approvals"]:
        parts.append(f"{_count_phrase(d['pending_approvals'], 'approval')} waiting")
    if on:
        active = len(d["echelon_active"])
        parts.append(f"ECHELON has {active} active" if active else "Nothing is running in ECHELON")
    return f"{greeting} " + ". ".join(parts) + "."


async def create_briefing(db: AsyncSession, kind: str) -> Briefing:
    text = compose(kind, await gather(db))
    row = Briefing(kind=kind, text=text)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row
