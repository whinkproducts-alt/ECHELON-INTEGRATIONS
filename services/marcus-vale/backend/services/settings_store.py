from typing import Optional

from sqlalchemy.ext.asyncio import AsyncSession

from models import Setting


async def get_setting(db: AsyncSession, key: str, default: Optional[str] = None) -> Optional[str]:
    row = await db.get(Setting, key)
    return row.value if row and row.value is not None else default


async def set_setting(db: AsyncSession, key: str, value: str) -> None:
    row = await db.get(Setting, key)
    if row is None:
        db.add(Setting(key=key, value=value))
    else:
        row.value = value
    await db.commit()
