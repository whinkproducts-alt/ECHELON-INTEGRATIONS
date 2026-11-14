"""Marcus runs without ECHELON when ECHELON_API_KEY is empty."""
import httpx
import pytest

from config import Settings, settings
from services.briefing import compose, gather


@pytest.fixture
def standalone(monkeypatch):
    monkeypatch.setattr(settings, "ECHELON_API_KEY", "")


def test_settings_load_without_echelon_key(monkeypatch):
    monkeypatch.delenv("ECHELON_API_KEY")
    s = Settings(_env_file=None)
    assert s.echelon_enabled is False


async def test_chat_tasks_and_approval_work(client, standalone, llm):
    llm.reply = "hello"
    assert (await client.post("/voice/chat", json={"prompt": "hi"})).json()["response"] == "hello"
    t = (await client.post("/tasks/", json={"title": "A", "goal": "B"})).json()
    assert t["echelon_connected"] is False
    assert (await client.post(f"/tasks/{t['task']['id']}/approve")).status_code == 200


async def test_handoff_routes_say_not_connected(client, standalone, echelon):
    t = (await client.post("/tasks/", json={"title": "A", "goal": "B"})).json()["task"]
    a = (await client.post(f"/tasks/{t['id']}/approve")).json()["approval"]
    for path, extra in (("/echelon/handoff", {}), ("/echelon/confirm", {}), ("/echelon/resume", {})):
        kw = {"json": {}} if path.endswith("resume") else {}
        r = await client.post(path, params={"task_id": t["id"], "approval_id": a["id"]}, **kw)
        assert r.status_code == 503 and "not connected" in r.json()["detail"].lower()
    assert echelon.requests == []


async def test_kill_switch_works_without_echelon(client, standalone, echelon):
    r = await client.post("/voice/chat", json={"prompt": "Marcus, stop everything"})
    assert "could not" not in r.json()["response"].lower()
    assert (await client.get("/control/status")).json()["frozen"] is True
    await client.post("/voice/chat", json={"prompt": "Marcus, resume"})
    assert (await client.get("/control/status")).json()["frozen"] is False
    assert echelon.requests == []


async def test_briefing_does_not_mention_echelon(client, standalone, maker):
    async with maker() as s:
        text = compose("morning", await gather(s))
    assert "echelon" not in text.lower()
    assert "no open tasks" in text.lower()
