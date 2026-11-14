"""Client for ECHELON's Marcus integration. Nothing here logs or returns task content."""
import json
from typing import Any, AsyncIterator, Dict, Optional, Tuple

import httpx

from config import settings

BASE = "/api/integrations/marcus"

# The only fields ECHELON accepts at intake. Anything else is dropped here.
ALLOWED_FIELDS = (
    "client_operation_id",
    "title",
    "goal",
    "deadline",
    "requested_for",
    "approval",
    "sensitivity",
    "directorate",
)


class EchelonError(Exception):
    """ECHELON refused, was unreachable, or answered with something unusable."""

    def __init__(self, status: Optional[int], code: str):
        super().__init__(f"{status}:{code}")
        self.status = status
        self.code = code

    def public_message(self) -> str:
        if self.code == "not_configured":
            return "ECHELON is not connected"
        if self.status is None:
            return f"ECHELON unreachable ({self.code})"
        return f"ECHELON refused ({self.status}: {self.code})"


def seal_payload(handoff_dict: dict) -> dict:
    """Allow-list the payload so private fields can never leave Marcus."""
    return {k: v for k, v in handoff_dict.items() if k in ALLOWED_FIELDS}


def make_client(timeout: Optional[float] = 20) -> httpx.AsyncClient:
    return httpx.AsyncClient(timeout=timeout)


def enabled() -> bool:
    return settings.echelon_enabled


def _headers(extra: Optional[dict] = None) -> dict:
    h = {"Authorization": f"Bearer {settings.ECHELON_API_KEY}"}
    if extra:
        h.update(extra)
    return h


def _url(path: str) -> str:
    return f"{settings.ECHELON_BASE_URL}{BASE}{path}"


def _error_code(resp: httpx.Response) -> str:
    try:
        body = resp.json()
        code = body.get("error") or body.get("code") or "unknown"
        return str(code)[:80]
    except Exception:
        return "unknown"


async def _call(method: str, path: str, ok: Tuple[int, ...], body: Optional[dict] = None) -> Dict[str, Any]:
    if not enabled():
        raise EchelonError(None, "not_configured")
    try:
        async with make_client() as client:
            resp = await client.request(
                method,
                _url(path),
                headers=_headers({"Content-Type": "application/json"} if body is not None else None),
                json=body,
            )
    except httpx.HTTPError as e:
        raise EchelonError(None, type(e).__name__)
    if resp.status_code not in ok:
        raise EchelonError(resp.status_code, _error_code(resp))
    try:
        data = resp.json()
    except Exception:
        raise EchelonError(resp.status_code, "bad_response")
    return data if isinstance(data, dict) else {}


async def send_task(payload: dict) -> Dict[str, Any]:
    """200 or 202 with a task_id means accepted. 200 is ECHELON's idempotent replay of a task it already holds."""
    data = await _call("POST", "/tasks", (200, 202), payload)
    if not data.get("task_id"):
        raise EchelonError(200, "missing_task_id")
    return data


async def confirm_task(echelon_task_id: str, approval: dict) -> Dict[str, Any]:
    return await _call("POST", f"/tasks/{echelon_task_id}/confirm", (200, 202), {"approval": approval})


async def resume_task(echelon_task_id: str, note: Optional[str]) -> Dict[str, Any]:
    return await _call("POST", f"/tasks/{echelon_task_id}/resume", (200, 202), {"note": note} if note else {})


async def get_task(echelon_task_id: str) -> Dict[str, Any]:
    return await _call("GET", f"/tasks/{echelon_task_id}", (200,))


async def freeze_echelon() -> Dict[str, Any]:
    return await _call("POST", "/freeze", (200, 202), {})


async def unfreeze_echelon() -> Dict[str, Any]:
    return await _call("POST", "/unfreeze", (200, 202), {})


async def iter_sse(lines: AsyncIterator[str]) -> AsyncIterator[Tuple[Optional[str], str, dict]]:
    """Parse server-sent events. Yields (event_id, event_type, data)."""
    eid: Optional[str] = None
    etype = "message"
    data_lines: list[str] = []
    async for line in lines:
        if line == "":
            if data_lines:
                try:
                    payload = json.loads("\n".join(data_lines))
                except json.JSONDecodeError:
                    payload = None
                if isinstance(payload, dict):
                    yield eid, etype, payload
            eid, etype, data_lines = None, "message", []
        elif line.startswith(":"):
            continue
        else:
            field, _, value = line.partition(":")
            value = value[1:] if value.startswith(" ") else value
            if field == "id":
                eid = value
            elif field == "event":
                etype = value
            elif field == "data":
                data_lines.append(value)


async def stream_events(last_event_id: Optional[str]) -> AsyncIterator[Tuple[Optional[str], str, dict]]:
    """Subscribe to ECHELON's status feed. Reconnect with the last id to replay what was missed."""
    headers = _headers({"Accept": "text/event-stream"})
    if last_event_id:
        headers["Last-Event-ID"] = last_event_id
    try:
        async with make_client(timeout=None) as client:
            async with client.stream("GET", _url("/events"), headers=headers) as resp:
                if resp.status_code != 200:
                    raise EchelonError(resp.status_code, "events_refused")
                async for item in iter_sse(resp.aiter_lines()):
                    yield item
    except httpx.HTTPError as e:
        raise EchelonError(None, type(e).__name__)
