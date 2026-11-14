from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from services.control_state import get_frozen
from services.freeze import do_freeze, do_resume

router = APIRouter()


@router.post("/freeze")
async def freeze(db: AsyncSession = Depends(get_db)):
    return await do_freeze(db)


@router.post("/resume")
async def resume(db: AsyncSession = Depends(get_db)):
    return await do_resume(db)


@router.get("/status")
async def status(db: AsyncSession = Depends(get_db)):
    return {"frozen": await get_frozen(db)}
