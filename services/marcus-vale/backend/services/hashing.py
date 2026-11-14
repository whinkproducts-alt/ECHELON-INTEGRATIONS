"""The one place a content hash is made. ECHELON computes the same bytes with canonicalJson."""
import hashlib
import json
from datetime import datetime, timezone
from typing import Optional


def content_hash(title: str, goal: str, deadline_str: Optional[str]) -> str:
    """deadline_str is the exact ISO string sent to ECHELON, or None."""
    payload = json.dumps(
        {"title": title, "goal": goal, "deadline": deadline_str},
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def as_utc(dt: datetime) -> datetime:
    """SQLite returns naive datetimes. Treat naive as UTC."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def iso_utc(dt: datetime) -> str:
    return as_utc(dt).isoformat()


def task_deadline_str(task) -> Optional[str]:
    """The stored string, or one derived once for rows made before deadline_str existed."""
    if task.deadline_str is not None:
        return task.deadline_str
    if task.deadline is not None:
        return iso_utc(task.deadline)
    return None


def task_hash(task) -> str:
    return content_hash(task.title, task.goal, task_deadline_str(task))
