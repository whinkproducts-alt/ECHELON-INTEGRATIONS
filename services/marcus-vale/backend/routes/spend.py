from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import SpendLog
from schemas import SpendLogCreate
from services import spend as spend_svc

router = APIRouter()


@router.get("/status")
async def get_spend_status(db: AsyncSession = Depends(get_db)):
    return await spend_svc.get_status(db)


@router.post("/log")
async def log_spend(spend: SpendLogCreate, db: AsyncSession = Depends(get_db)):
    if (await spend_svc.get_status(db))["is_blocked"]:
        raise HTTPException(status_code=402, detail="Spend cap reached")
    row = SpendLog(amount_usd=spend.amount_usd, description=spend.description, category=spend.category)
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return {"spend": row}
