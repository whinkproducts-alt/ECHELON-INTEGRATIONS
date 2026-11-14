import logging
from typing import Optional

import pytz
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

import database
from config import settings
from services.briefing import create_briefing
from services.settings_store import get_setting, set_setting

log = logging.getLogger("marcus.scheduler")
scheduler = AsyncIOScheduler()
TZ_KEY = "timezone"


def _hm(value: str) -> tuple[int, int]:
    h, m = value.split(":")
    return int(h), int(m)


def _job(kind: str):
    async def run():
        async with database.AsyncSessionLocal() as db:
            row = await create_briefing(db, kind)
            log.info("briefing stored: %s (%s)", kind, row.id)

    run.__name__ = f"briefing_{kind}"
    return run


def configure_jobs(sched: AsyncIOScheduler, tz_name: str) -> None:
    """(Re)build all jobs in the given time zone. Safe to call repeatedly."""
    tz = pytz.timezone(tz_name)
    for job in list(sched.get_jobs()):
        sched.remove_job(job.id)
    plan = [
        ("morning", settings.MORNING_BRIEFING_TIME, "mon-fri"),
        ("evening", settings.EVENING_BRIEFING_TIME, "mon-fri"),
        ("weekend", settings.WEEKEND_CHECKIN_TIME, "sat,sun"),
        ("memory_review", settings.MEMORY_REVIEW_TIME, "sun"),
    ]
    for kind, hhmm, days in plan:
        hour, minute = _hm(hhmm)
        sched.add_job(
            _job(kind),
            CronTrigger(hour=hour, minute=minute, day_of_week=days, timezone=tz),
            id=kind,
            replace_existing=True,
            misfire_grace_time=3600,
        )


async def current_timezone(db) -> str:
    name = await get_setting(db, TZ_KEY, settings.DEFAULT_TIMEZONE)
    return name if name in pytz.all_timezones_set else settings.DEFAULT_TIMEZONE


async def change_timezone(db, tz_name: str) -> None:
    if tz_name not in pytz.all_timezones_set:
        raise ValueError("unknown time zone")
    await set_setting(db, TZ_KEY, tz_name)
    configure_jobs(scheduler, tz_name)


async def start_scheduler() -> None:
    async with database.AsyncSessionLocal() as db:
        tz_name = await current_timezone(db)
    configure_jobs(scheduler, tz_name)
    if not scheduler.running:
        scheduler.start()


def resolve_timezone(text: str) -> Optional[str]:
    """Match an IANA name or a unique city name ('Lagos' -> Africa/Lagos). None if unclear."""
    wanted = text.strip().strip(".!?").replace(" ", "_").lower()
    if not wanted:
        return None
    for name in pytz.all_timezones:
        if name.lower() == wanted:
            return name
    matches = [n for n in pytz.all_timezones if n.split("/")[-1].lower() == wanted]
    return matches[0] if len(matches) == 1 else None
