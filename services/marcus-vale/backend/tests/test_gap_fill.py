"""Handoff, approvals, hashing. Batch 1."""
import json
import uuid

import httpx
from sqlalchemy import select

from models import Approval, EchelonHandoff, Task
from services.hashing import content_hash
from services.echelon_client import ALLOWED_FIELDS

GOLDEN = "e5d9d6062ff9c3f0a3954f85755f8dd362cf4b386b62d1ea62a46c54f4ddd442"
DEADLINE = "2026-12-01T17:00:00+00:00"


async def make_task(client, **over):
    body = {"title": "Pay vendor", "goal": "Wire $500 to Acme", "deadline": DEADLINE}
    body.update(over)
    r = await client.post("/tasks/", json=body)
    assert r.status_code == 200, r.text
    return r.json()["task"]


async def approve(client, task_id):
    r = await client.post(f"/tasks/{task_id}/approve", params={"method": "voice"})
    assert r.status_code == 200, r.text
    return r.json()["approval"]


def test_golden_hash_vector():
    assert content_hash("Pay vendor", "Wire $500 to Acme", DEADLINE) == GOLDEN
    assert (
        content_hash("Café", "Réunion", None)
        == "a1149297178ccaafbb0e8c86f6f5a3ad12e193b1123f2758daf52da725510c7b"
    )


async def test_approval_hash_matches_golden(client):
    t = await make_task(client)
    a = await approve(client, t["id"])
    assert a["content_hash"] == GOLDEN


async def test_handoff_payload_serialization(client, echelon):
    t = await make_task(client, directorate="ops")
    a = await approve(client, t["id"])
    r = await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a["id"]})
    assert r.status_code == 200, r.text
    req = echelon.requests[0]
    body = json.loads(req.content)  # would fail if a UUID or datetime leaked through
    assert set(body) <= set(ALLOWED_FIELDS)
    assert body["requested_for"] == "victor"
    assert body["deadline"] == DEADLINE
    assert isinstance(body["client_operation_id"], str)
    ap = body["approval"]
    assert set(ap) == {"approval_id", "approved_at", "method", "content_hash"}
    assert ap["method"] in ("voice", "tap")
    assert isinstance(ap["approved_at"], str) and ap["approved_at"]
    assert ap["content_hash"] == content_hash(body["title"], body["goal"], body["deadline"])
    assert req.headers["authorization"] == "Bearer test-echelon-key"
    assert req.url.path == "/api/integrations/marcus/tasks"


async def test_no_deadline_hashes_null(client, echelon):
    t = await client.post("/tasks/", json={"title": "A", "goal": "B"})
    t = t.json()["task"]
    a = await approve(client, t["id"])
    assert a["content_hash"] == content_hash("A", "B", None)
    await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a["id"]})
    assert json.loads(echelon.requests[0].content)["deadline"] is None


async def test_failed_handoff_does_not_burn_approval(client, echelon, maker):
    t = await make_task(client)
    a = await approve(client, t["id"])
    echelon.handler = lambda req: httpx.Response(500, json={"error": "boom"})
    r = await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a["id"]})
    assert r.status_code == 502
    async with maker() as s:
        assert (await s.get(Approval, uuid.UUID(a["id"]))).used is False
        assert (await s.execute(select(EchelonHandoff))).scalars().all() == []
    echelon.handler = lambda req: httpx.Response(202, json={"task_id": "e-1", "status": "received"})
    r = await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a["id"]})
    assert r.status_code == 200
    async with maker() as s:
        assert (await s.get(Approval, uuid.UUID(a["id"]))).used is True


async def test_used_approval_cannot_be_reused(client, echelon):
    t = await make_task(client)
    a = await approve(client, t["id"])
    q = {"task_id": t["id"], "approval_id": a["id"]}
    assert (await client.post("/echelon/handoff", params=q)).status_code == 200
    echelon.handler = lambda req: httpx.Response(202, json={"task_id": "e-2", "status": "failed"})
    assert (await client.post("/echelon/handoff", params=q)).status_code == 400


async def test_content_hash_mismatch_blocks_handoff(client, echelon, maker):
    t = await make_task(client)
    a = await approve(client, t["id"])
    async with maker() as s:
        row = await s.get(Task, uuid.UUID(t["id"]))
        row.title = "Modified"
        await s.commit()
    r = await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a["id"]})
    assert r.status_code == 400
    assert "content has changed" in r.json()["detail"].lower()
    assert echelon.requests == []


async def test_null_approved_at_rejected_before_sending(client, echelon, maker):
    t = await make_task(client)
    async with maker() as s:
        ap = Approval(task_id=uuid.UUID(t["id"]), status="approved", content_hash=GOLDEN, method="voice", used=False)
        s.add(ap)
        await s.commit()
        aid = str(ap.id)
    r = await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": aid})
    assert r.status_code == 400
    assert echelon.requests == []


async def test_money_task_waits_for_confirm(client, echelon):
    t = await make_task(client, sensitivity="financial")
    a1 = await approve(client, t["id"])
    echelon.handler = lambda req: httpx.Response(
        202, json={"task_id": "e-9", "status": "reconfirmation_required"}
    )
    r = await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a1["id"]})
    assert r.status_code == 200
    assert r.json()["task_status"] == "awaiting_confirmation"
    assert echelon.paths() == [("POST", "/tasks")]  # nothing else happened yet

    # The same approval cannot be the second yes.
    bad = await client.post("/echelon/confirm", params={"task_id": t["id"], "approval_id": a1["id"]})
    assert bad.status_code in (400,)

    a2 = await approve(client, t["id"])
    echelon.handler = lambda req: httpx.Response(200, json={"task_id": "e-9", "status": "in_progress"})
    ok = await client.post("/echelon/confirm", params={"task_id": t["id"], "approval_id": a2["id"]})
    assert ok.status_code == 200, ok.text
    assert echelon.paths()[-1] == ("POST", "/tasks/e-9/confirm")
    assert ok.json()["task_status"] == "handed_off"
    body = json.loads(echelon.requests[-1].content)
    assert set(body) == {"approval"}


async def test_blocked_task_resume(client, echelon):
    t = await make_task(client)
    a = await approve(client, t["id"])
    echelon.handler = lambda req: httpx.Response(202, json={"task_id": "e-5", "status": "blocked"})
    await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a["id"]})
    echelon.handler = lambda req: httpx.Response(200, json={"task_id": "e-5", "status": "in_progress"})
    r = await client.post(f"/echelon/resume", params={"task_id": t["id"]}, json={"note": "use the blue one"})
    assert r.status_code == 200, r.text
    assert echelon.paths()[-1] == ("POST", "/tasks/e-5/resume")
    assert json.loads(echelon.requests[-1].content) == {"note": "use the blue one"}


async def test_status_marks_stale_when_echelon_down(client, echelon):
    t = await make_task(client)
    a = await approve(client, t["id"])
    await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a["id"]})
    echelon.handler = lambda req: httpx.Response(503, json={"error": "down"})
    r = await client.get(f"/echelon/status/{t['id']}")
    assert r.status_code == 200 and r.json()["stale"] is True
    echelon.handler = lambda req: httpx.Response(200, json={"task_id": "e-1", "status": "done", "result_summary": "ok"})
    r = await client.get(f"/echelon/status/{t['id']}")
    assert r.json()["stale"] is False and r.json()["handoff"]["status"] == "done"


async def test_sse_event_updates_handoff(client, echelon, maker):
    from services.echelon_events import apply_event

    t = await make_task(client)
    a = await approve(client, t["id"])
    await client.post("/echelon/handoff", params={"task_id": t["id"], "approval_id": a["id"]})
    async with maker() as s:
        assert await apply_event(s, {"task_id": "e-1", "status": "blocked"}) is True
    async with maker() as s:
        row = (await s.execute(select(Task))).scalars().first()
        assert row.status == "blocked"
