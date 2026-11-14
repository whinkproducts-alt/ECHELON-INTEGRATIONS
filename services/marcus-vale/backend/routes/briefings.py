from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Briefing

router = APIRouter()


@router.get("/")
async def list_briefings(undelivered: bool = False, limit: int = 20, db: AsyncSession = Depends(get_db)):
    q = select(Briefing).order_by(Briefing.created_at.desc()).limit(min(max(limit, 1), 100))
    if undelivered:
        q = q.where(Briefing.delivered == False)  # noqa: E712
    return {"briefings": (await db.execute(q)).scalars().all()}


@router.post("/{briefing_id}/delivered")
async def mark_delivered(briefing_id: UUID, db: AsyncSession = Depends(get_db)):
    row = await db.get(Briefing, briefing_id)
    if not row:
        raise HTTPException(status_code=404, detail="Briefing not found")
    row.delivered = True
    await db.commit()
    return {"briefing": row}
