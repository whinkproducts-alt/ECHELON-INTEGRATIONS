from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Approval
from schemas import ApprovalCreate

router = APIRouter()


@router.post("/")
async def create_approval(approval: ApprovalCreate, db: AsyncSession = Depends(get_db)):
    new_approval = Approval(
        task_id=approval.task_id,
        content_hash=approval.content_hash,
        method=approval.method,
        status="pending",
        used=False,
    )
    db.add(new_approval)
    await db.commit()
    await db.refresh(new_approval)
    return {"approval": new_approval}


@router.get("/{approval_id}")
async def get_approval(approval_id: UUID, db: AsyncSession = Depends(get_db)):
    approval = await db.get(Approval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    return {"approval": approval}


@router.post("/{approval_id}/approve")
async def approve(approval_id: UUID, db: AsyncSession = Depends(get_db)):
    approval = await db.get(Approval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    if approval.used:
        raise HTTPException(status_code=409, detail="Approval already used")
    approval.status = "approved"
    approval.approved_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(approval)
    return {"approval": approval}
