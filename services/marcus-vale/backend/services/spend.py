"""Spend cap. Every OmniRoute call is recorded. Warn at the warning percentage, stop at the cap."""
import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

import database
from config import settings
from models import Briefing, SpendLog

log = logging.getLogger("marcus.spend")


class SpendCapReached(Exception):
    pass


def _month_start() -> datetime:
    now = datetime.now(timezone.utc)
    return now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)


async def get_status(db: AsyncSession) -> dict:
    result = await db.execute(select(func.sum(SpendLog.amount_usd)).where(SpendLog.created_at >= _month_start()))
    total = float(result.scalar_one_or_none() or 0.0)
    cap = settings.MARCUS_SPEND_CAP_USD
    warn_at = cap * (settings.MARCUS_SPEND_WARNING_PCT / 100)
    return {
        "total_spend": total,
        "cap": cap,
        "warning_threshold": warn_at,
        "is_warning": total >= warn_at,
        "is_blocked": total >= cap,
    }


async def ensure_budget() -> None:
    """Call before every OmniRoute request."""
    async with database.AsyncSessionLocal() as db:
        if (await get_status(db))["is_blocked"]:
            raise SpendCapReached("Monthly spend cap reached")


def estimate_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def llm_cost(usage: Optional[dict], prompt_text: str, reply_text: str) -> tuple[float, str]:
    """Cost in USD and a note on how it was worked out."""
    usage = usage or {}
    if isinstance(usage.get("cost"), (int, float)):
        return float(usage["cost"]), "reported cost"
    tin, tout = usage.get("prompt_tokens"), usage.get("completion_tokens")
    note = "token usage"
    if tin is None or tout is None:
        tin, tout = estimate_tokens(prompt_text), estimate_tokens(reply_text)
        note = "estimated tokens"
    cost = (tin * settings.OMNIROUTE_PRICE_IN_PER_1M + tout * settings.OMNIROUTE_PRICE_OUT_PER_1M) / 1_000_000
    return cost, note


def embed_cost(usage: Optional[dict], text: str) -> tuple[float, str]:
    usage = usage or {}
    if isinstance(usage.get("cost"), (int, float)):
        return float(usage["cost"]), "reported cost"
    tokens = usage.get("total_tokens") or usage.get("prompt_tokens")
    note = "token usage"
    if tokens is None:
        tokens, note = estimate_tokens(text), "estimated tokens"
    return tokens * settings.OMNIROUTE_EMBED_PRICE_PER_1M / 1_000_000, note


async def _alert_once(db: AsyncSession, key: str, text: str) -> None:
    existing = await db.execute(select(Briefing.id).where(Briefing.key == key))
    if existing.first() is None:
        db.add(Briefing(kind="alert", key=key, text=text))
        await db.commit()


async def record_cost(amount: float, description: str, category: str = "llm") -> None:
    async with database.AsyncSessionLocal() as db:
        db.add(SpendLog(amount_usd=amount, description=description, category=category))
        await db.commit()
        st = await get_status(db)
        month = _month_start().strftime("%Y-%m")
        if st["is_blocked"]:
            await _alert_once(
                db,
                f"spend_blocked:{month}",
                f"Spend cap reached: ${st['total_spend']:.2f} of ${st['cap']:.2f} this month. "
                "Marcus has stopped using the language model.",
            )
        elif st["is_warning"]:
            await _alert_once(
                db,
                f"spend_warning:{month}",
                f"Spend warning: ${st['total_spend']:.2f} of ${st['cap']:.2f} used this month "
                f"({settings.MARCUS_SPEND_WARNING_PCT:.0f}% reached).",
            )
