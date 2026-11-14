"""Auth, config, briefings, time zone, chat context. Batches 3 and 4."""
import uuid

import pytest
from pydantic import ValidationError
from sqlalchemy import select

from models import Briefing, ChatMessage, Memory, Task
from services.briefing import compose, gather
from services.scheduler import configure_jobs, scheduler

ROUTES = [
    ("GET", "/tasks/"),
    ("POST", "/tasks/"),
    ("GET", "/memory/"),
    ("GET", "/spend/status"),
    ("GET", "/control/status"),
    ("POST", "/control/freeze"),
    ("GET", "/briefings/"),
    ("GET", "/settings/timezone"),
    ("POST", "/voice/chat"),
    ("POST", "/echelon/handoff"),
    ("GET", "/approvals/" + str(uuid.uuid4())),
]


@pytest.mark.parametrize("method,path", ROUTES)
async def test_routes_need_api_key(anon, method, path):
    r = await anon.request(method, path, json={})
    assert r.status_code == 401


async def test_wrong_key_rejected(anon):
    r = await anon.get("/tasks/", headers={"X-API-Key": "nope-nope-nope-nope"})
    assert r.status_code == 401


async def test_health_is_open_and_docs_are_off(anon):
    assert (await anon.get("/health")).status_code == 200
    for p in ("/docs", "/redoc", "/openapi.json"):
        assert (await anon.get(p)).status_code == 404


def test_missing_secret_fails_startup(monkeypatch):
    from config import Settings

    monkeypatch.delenv("OMNIROUTE_API_KEY")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_placeholder_secret_rejected(monkeypatch):
    from config import Settings

    monkeypatch.setenv("API_KEY", "marcus-vale-secret-key")
    with pytest.raises(ValidationError):
        Settings(_env_file=None)


def test_config_defaults_match_compose():
    from config import settings

    assert ":8767" in settings.WHISPER_URL and ":8768" in settings.KOKORO_URL


async def test_chat_uses_configured_model(client, llm):
    from config import settings

    await client.post("/voice/chat", json={"prompt": "hi"})
    assert llm.requests[0]["model"] == settings.OMNIROUTE_MODEL


async def test_empty_briefing_says_so(client, maker):
    from services.briefing import create_briefing

    async with maker() as s:
        row = await create_briefing(s, "morning")
    assert "no open tasks" in row.text.lower()
    assert "nothing running in echelon" in row.text.lower()
    r = await client.get("/briefings/", params={"undelivered": True})
    assert len(r.json()["briefings"]) == 1


async def test_briefing_uses_real_tasks_only(client, maker):
    await client.post("/tasks/", json={"title": "Draft the pitch", "goal": "g"})
    async with maker() as s:
        text = compose("morning", await gather(s))
    assert "Draft the pitch" in text
    assert "1 open task" in text


async def test_mark_briefing_delivered(client, maker):
    from services.briefing import create_briefing

    async with maker() as s:
        row = await create_briefing(s, "evening")
    r = await client.post(f"/briefings/{row.id}/delivered")
    assert r.status_code == 200
    assert (await client.get("/briefings/", params={"undelivered": True})).json()["briefings"] == []


async def test_timezone_change_rebuilds_jobs(client):
    r = await client.put("/settings/timezone", json={"timezone": "Africa/Lagos"})
    assert r.status_code == 200
    assert (await client.get("/settings/timezone")).json() == {"timezone": "Africa/Lagos"}
    jobs = scheduler.get_jobs()
    assert {j.id for j in jobs} == {"morning", "evening", "weekend", "memory_review"}
    assert all(str(j.trigger.timezone) == "Africa/Lagos" for j in jobs)
    assert (await client.put("/settings/timezone", json={"timezone": "Mars/Base"})).status_code == 422


async def test_timezone_by_voice(client):
    r = await client.post("/voice/chat", json={"prompt": "Change my time zone to Lagos"})
    assert "Africa/Lagos" in r.json()["response"]
    assert (await client.get("/settings/timezone")).json()["timezone"] == "Africa/Lagos"


def test_schedule_times():
    configure_jobs(scheduler, "America/Edmonton")
    by = {j.id: j.trigger for j in scheduler.get_jobs()}
    assert "hour='9'" in str(by["morning"]) and "day_of_week='mon-fri'" in str(by["morning"])
    assert "hour='21'" in str(by["evening"])
    assert "hour='18'" in str(by["weekend"]) and "day_of_week='sat,sun'" in str(by["weekend"])
    assert "hour='16'" in str(by["memory_review"]) and "day_of_week='sun'" in str(by["memory_review"])


async def test_history_and_core_facts_reach_the_model(client, llm, maker):
    async with maker() as s:
        s.add(Memory(layer="layer2", content="Victor runs WHINK Group", source="text", provenance="t"))
        await s.commit()
    llm.reply = "first reply"
    await client.post("/voice/chat", json={"prompt": "first question", "session_id": "a"})
    await client.post("/voice/chat", json={"prompt": "second question", "session_id": "a"})
    second = llm.requests[1]["messages"]
    assert "Victor runs WHINK Group" in second[0]["content"]
    contents = [m["content"] for m in second]
    assert "first question" in contents and "first reply" in contents
    await client.post("/voice/chat", json={"prompt": "other session", "session_id": "b"})
    assert "first question" not in [m["content"] for m in llm.requests[2]["messages"]]


async def test_chat_errors_are_generic(client, llm):
    import httpx

    llm.reply = None  # make the fake break the response shape

    def boom(request):
        return httpx.Response(500, text="secret internal detail")

    llm._route = boom  # type: ignore
    r = await client.post("/voice/chat", json={"prompt": "hi"})
    assert r.status_code == 502
    assert "secret" not in r.text
