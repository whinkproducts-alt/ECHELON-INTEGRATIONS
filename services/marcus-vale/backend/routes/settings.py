from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from schemas import TimezoneUpdate
from services.scheduler import change_timezone, current_timezone

router = APIRouter()


@router.get("/timezone")
async def get_timezone(db: AsyncSession = Depends(get_db)):
    return {"timezone": await current_timezone(db)}


@router.put("/timezone")
async def put_timezone(body: TimezoneUpdate, db: AsyncSession = Depends(get_db)):
    try:
        await change_timezone(db, body.timezone)
    except ValueError:
        raise HTTPException(status_code=422, detail="Unknown time zone")
    return {"timezone": body.timezone}
