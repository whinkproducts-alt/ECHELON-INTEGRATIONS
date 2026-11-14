from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models import ActionTrust

TRUST_THRESHOLD = 20  # Clean approvals before an action type counts as trusted


async def record_clean_approval(action_type: str, db: AsyncSession):
    result = await db.execute(select(ActionTrust).where(ActionTrust.action_type == action_type))
    record = result.scalar_one_or_none()
    if not record:
        record = ActionTrust(action_type=action_type, clean_count=1, trusted=False)
        db.add(record)
    else:
        record.clean_count = (record.clean_count or 0) + 1
    # Revoking resets the count, so trust is re-earned from zero.
    if record.clean_count >= TRUST_THRESHOLD:
        record.trusted = True
        record.revoked_at = None
    await db.commit()


async def is_trusted(action_type: str, db: AsyncSession) -> bool:
    result = await db.execute(select(ActionTrust).where(ActionTrust.action_type == action_type))
    record = result.scalar_one_or_none()
    if not record:
        return False
    return bool(record.trusted) and record.revoked_at is None


async def revoke_trust(action_type: str, db: AsyncSession):
    result = await db.execute(select(ActionTrust).where(ActionTrust.action_type == action_type))
    record = result.scalar_one_or_none()
    if record:
        record.trusted = False
        record.clean_count = 0
        record.revoked_at = datetime.now(timezone.utc)
        await db.commit()
