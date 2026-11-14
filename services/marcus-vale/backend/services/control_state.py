from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from models import ControlState

FROZEN_MESSAGE = "Marcus is frozen. Say 'Marcus, resume' to continue."


async def get_frozen(db: AsyncSession) -> bool:
    row = await db.get(ControlState, 1)
    return bool(row and row.frozen)


async def set_frozen(db: AsyncSession, value: bool) -> None:
    row = await db.get(ControlState, 1)
    if row is None:
        row = ControlState(id=1)
        db.add(row)
    row.frozen = value
    row.changed_at = datetime.now(timezone.utc)
    await db.commit()
