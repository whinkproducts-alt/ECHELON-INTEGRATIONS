import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Approval, EchelonHandoff, Task
from schemas import EchelonApproval, EchelonHandoffCreate, ResumeRequest
from services import echelon_client as ec
from services.control_state import FROZEN_MESSAGE, get_frozen
from services.hashing import as_utc, task_deadline_str, task_hash
from services.task_status import DEAD_HANDOFF, task_status_for
from services.trust import record_clean_approval

log = logging.getLogger("marcus.echelon")
router = APIRouter()


def _check_approval(task: Task, approval: Approval) -> None:
    if approval.task_id != task.id:
        raise HTTPException(status_code=400, detail="Approval does not belong to this task")
    if approval.used:
        raise HTTPException(status_code=400, detail="Approval already used")
    if approval.status != "approved":
        raise HTTPException(status_code=400, detail="Approval not granted")
    if approval.approved_at is None:
        raise HTTPException(status_code=400, detail="Approval has no approval time")
    if task_hash(task) != approval.content_hash:
        raise HTTPException(status_code=400, detail="Task content has changed since approval")


def _approval_payload(approval: Approval) -> dict:
    try:
        model = EchelonApproval(
            approval_id=approval.id,
            approved_at=as_utc(approval.approved_at),
            method=approval.method,
            content_hash=approval.content_hash,
        )
    except ValidationError:
        raise HTTPException(status_code=400, detail="Approval method must be voice or tap")
    return model.model_dump(mode="json")


async def _load(db: AsyncSession, task_id: UUID, approval_id: UUID) -> tuple[Task, Approval]:
    task = await db.get(Task, task_id)
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    approval = await db.get(Approval, approval_id)
    if not approval:
        raise HTTPException(status_code=404, detail="Approval not found")
    return task, approval


async def _latest_handoff(db: AsyncSession, task_id: UUID) -> EchelonHandoff | None:
    result = await db.execute(
        select(EchelonHandoff).where(EchelonHandoff.task_id == task_id).order_by(EchelonHandoff.created_at.desc())
    )
    return result.scalars().first()


def _need_echelon() -> None:
    if not ec.enabled():
        raise HTTPException(status_code=503, detail="ECHELON is not connected")


def _refused(e: ec.EchelonError) -> HTTPException:
    return HTTPException(status_code=502, detail=e.public_message())


@router.post("/handoff")
async def create_handoff(task_id: UUID, approval_id: UUID, db: AsyncSession = Depends(get_db)):
    _need_echelon()
    if await get_frozen(db):
        raise HTTPException(status_code=503, detail=FROZEN_MESSAGE)
    task, approval = await _load(db, task_id, approval_id)
    _check_approval(task, approval)

    existing = await _latest_handoff(db, task_id)
    if existing is not None and existing.status not in DEAD_HANDOFF:
        raise HTTPException(status_code=409, detail="Task is already with ECHELON")

    handoff = EchelonHandoffCreate(
        client_operation_id=task.client_operation_id or task.id,
        title=task.title,
        goal=task.goal,
        deadline=task_deadline_str(task),
        approval=_approval_payload(approval),
        sensitivity=task.sensitivity,
        directorate=task.directorate,
    )
    payload = ec.seal_payload(handoff.model_dump(mode="json"))

    try:
        response = await ec.send_task(payload)
    except ec.EchelonError as e:
        log.warning("handoff failed: %s", e.public_message())
        raise _refused(e)

    # Only now is the approval spent.
    status = response.get("status") or "received"
    approval.used = True
    db.add(
        EchelonHandoff(
            task_id=task.id,
            approval_id=approval.id,
            echelon_task_id=str(response["task_id"]),
            status=status,
            response=response,
        )
    )
    task.status = task_status_for(status)
    await db.commit()
    await record_clean_approval("echelon_handoff", db)
    return {"echelon_response": response, "status": status, "task_status": task.status}


@router.post("/confirm")
async def confirm_handoff(task_id: UUID, approval_id: UUID, db: AsyncSession = Depends(get_db)):
    """Second yes for money or proprietary work held by ECHELON."""
    _need_echelon()
    if await get_frozen(db):
        raise HTTPException(status_code=503, detail=FROZEN_MESSAGE)
    task, approval = await _load(db, task_id, approval_id)
    handoff = await _latest_handoff(db, task_id)
    if handoff is None or handoff.status != "reconfirmation_required":
        raise HTTPException(status_code=409, detail="Task is not waiting for a second approval")
    if handoff.approval_id == approval.id:
        raise HTTPException(status_code=400, detail="The second approval must be a new one")
    _check_approval(task, approval)

    try:
        response = await ec.confirm_task(handoff.echelon_task_id, _approval_payload(approval))
    except ec.EchelonError as e:
        log.warning("confirm failed: %s", e.public_message())
        raise _refused(e)

    status = response.get("status") or "received"
    approval.used = True
    handoff.status = status
    handoff.response = response
    task.status = task_status_for(status)
    await db.commit()
    return {"echelon_response": response, "status": status, "task_status": task.status}


@router.post("/resume")
async def resume_blocked(task_id: UUID, body: ResumeRequest, db: AsyncSession = Depends(get_db)):
    """Send Victor's answer to a blocked ECHELON task."""
    _need_echelon()
    if await get_frozen(db):
        raise HTTPException(status_code=503, detail=FROZEN_MESSAGE)
    task = await db.get(Task, task_id)
    handoff = await _latest_handoff(db, task_id)
    if task is None or handoff is None:
        raise HTTPException(status_code=404, detail="Handoff not found")
    if handoff.status not in ("blocked", "paused"):
        raise HTTPException(status_code=409, detail="Task is not waiting for an answer")
    try:
        response = await ec.resume_task(handoff.echelon_task_id, body.note)
    except ec.EchelonError as e:
        raise _refused(e)
    handoff.status = response.get("status") or "in_progress"
    task.status = task_status_for(handoff.status)
    await db.commit()
    return {"status": handoff.status, "task_status": task.status}


@router.get("/status/{task_id}")
async def get_handoff_status(task_id: UUID, db: AsyncSession = Depends(get_db)):
    handoff = await _latest_handoff(db, task_id)
    if not handoff:
        raise HTTPException(status_code=404, detail="Handoff not found")
    stale = False
    result_summary = None
    try:
        data = await ec.get_task(handoff.echelon_task_id)
        handoff.status = data.get("status", handoff.status)
        result_summary = data.get("result_summary")
        task = await db.get(Task, task_id)
        if task is not None:
            task.status = task_status_for(handoff.status)
        await db.commit()
    except ec.EchelonError as e:
        stale = True  # say so; never pass stored status off as live
        log.warning("status refresh failed: %s", e.public_message())
    return {"handoff": handoff, "result_summary": result_summary, "stale": stale}
