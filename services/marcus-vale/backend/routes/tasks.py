import logging
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from database import get_db
from models import Approval, Task
from schemas import Method, TaskCreate
from services.control_state import FROZEN_MESSAGE, get_frozen
from services.hashing import iso_utc, task_hash
from services.lane_router import classify_lane
from services.trust import is_trusted, record_clean_approval

log = logging.getLogger("marcus.tasks")
router = APIRouter()


async def needs_approval(db: AsyncSession, task: Task) -> bool:
    """False only for a trusted Lane 1 action. ECHELON handoffs always carry a real approval."""
    if task.sensitivity != "standard" or task.lane in ("lane2", "lane3"):
        return True
    return not await is_trusted("lane1_action", db)


@router.post("/")
async def create_task(task: TaskCreate, db: AsyncSession = Depends(get_db)):
    if await get_frozen(db):
        raise HTTPException(status_code=503, detail=FROZEN_MESSAGE)
    try:
        lane = await classify_lane(task.goal)  # Marcus decides; the client's lane is ignored
    except Exception as e:
        log.warning("lane classification failed (%s); defaulting to lane3", type(e).__name__)
        lane = "lane3"

    new_task = Task(
        title=task.title,
        goal=task.goal,
        lane=lane,
        status="pending",
        sensitivity=task.sensitivity,
        directorate=task.directorate,
        deadline=task.deadline,
        deadline_str=iso_utc(task.deadline) if task.deadline else None,
    )
    db.add(new_task)
    await db.commit()
    await db.refresh(new_task)
    return {
        "task": new_task,
        "lane": lane,
        "requires_approval": await needs_approval(db, new_task),
        "echelon_connected": settings.echelon_enabled,
    }


@router.get("/")
async def list_tasks(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task))
    return {"tasks": result.scalars().all()}


@router.post("/{task_id}/approve")
async def approve_task(task_id: UUID, method: Method = "voice", db: AsyncSession = Depends(get_db)):
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")

    unused = await db.execute(
        select(Approval.id).where(
            Approval.task_id == task_id, Approval.status == "approved", Approval.used == False  # noqa: E712
        )
    )
    if unused.first() is not None:
        raise HTTPException(status_code=409, detail="Task already has an unused approval")

    content_hash = task_hash(task)
    approval = Approval(
        task_id=task_id,
        content_hash=content_hash,
        method=method,
        status="approved",
        used=False,
        approved_at=datetime.now(timezone.utc),
    )
    db.add(approval)
    await db.commit()
    await db.refresh(approval)
    if task.lane == "lane1":
        await record_clean_approval("lane1_action", db)
    return {"approval": approval, "content_hash": content_hash}
