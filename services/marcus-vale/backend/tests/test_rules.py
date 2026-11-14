"""Freeze, never-store, trust, spend. Batch 2."""
import logging
import uuid

import httpx
import pytest
from sqlalchemy import select

from models import ChatMessage, Memory, SpendLog, Briefing, Task
from services.control_state import get_frozen
from services.trust import is_trusted, record_clean_approval, revoke_trust


async def mk(client, **kw):
    body = {"title": "T", "goal": "G"}
    body.update(kw)
    return (await client.post("/tasks/", json=body)).json()


async def test_freeze_survives_restart_and_blocks_tasks(client, echelon, maker):
    assert (await client.post("/control/freeze")).status_code == 200
    async with maker() as s:  # a brand new session stands in for a restart
        assert await get_frozen(s) is True
    assert (await client.get("/control/status")).json() == {"frozen": True}
    assert (await client.post("/tasks/", json={"title": "x", "goal": "y"})).status_code == 503
    assert ("POST", "/freeze") in echelon.paths()


async def test_chat_works_while_frozen(client, echelon, llm):
    await client.post("/control/freeze")
    llm.reply = "still here"
    r = await client.post("/voice/chat", json={"prompt": "What time is it?"})
    assert r.status_code == 200
    assert r.json()["response"] == "still here"


async def test_resume_restores_frozen_tasks(client, echelon, maker):
    t = await mk(client)
    tid = uuid.UUID(t["task"]["id"])
    await client.post("/control/freeze")
    async with maker() as s:
        assert (await s.get(Task, tid)).status == "frozen"
    r = await client.post("/control/resume")
    assert r.json()["frozen"] is False
    async with maker() as s:
        assert (await s.get(Task, tid)).status == "pending"
        assert await get_frozen(s) is False
    assert ("POST", "/unfreeze") in echelon.paths()


@pytest.mark.parametrize("phrase", ["Marcus, stop everything", "marcus stop everything!", "  MARCUS, STOP EVERYTHING. "])
async def test_kill_phrase_on_real_route(client, echelon, phrase):
    r = await client.post("/voice/chat", json={"prompt": phrase})
    assert r.status_code == 200
    assert "paused" in r.json()["response"].lower()
    assert (await client.get("/control/status")).json()["frozen"] is True
    r = await client.post("/voice/chat", json={"prompt": "Marcus, resume"})
    assert r.status_code == 200
    assert (await client.get("/control/status")).json()["frozen"] is False


async def test_echelon_down_is_reported_on_kill(client, echelon):
    echelon.handler = lambda req: httpx.Response(500, json={"error": "down"})
    r = await client.post("/voice/chat", json={"prompt": "Marcus, stop everything"})
    assert "could not pause echelon" in r.json()["response"].lower()
    assert (await client.get("/control/status")).json()["frozen"] is True


NEVER = [
    ("passwords", "my password is hunter2xyz"),
    ("cards_or_bank", "pay with card 4111 1111 1111 1111"),
    ("government_id", "my SSN is 123-45-6789"),
    ("health", "I was diagnosed with diabetes and take medication"),
]


@pytest.mark.parametrize("_cat,text", NEVER)
async def test_never_store_rejects_memory(client, maker, _cat, text):
    r = await client.post("/memory/", json={"content": text, "layer": "layer3", "source": "text"})
    assert r.status_code == 422
    async with maker() as s:
        assert (await s.execute(select(Memory))).scalars().all() == []


@pytest.mark.parametrize("_cat,text", NEVER)
async def test_never_store_not_logged(caplog, _cat, text):
    with caplog.at_level(logging.INFO):
        logging.getLogger("marcus.test").info("heard: %s", text)
    assert all(text not in r.getMessage() for r in caplog.records)


@pytest.mark.parametrize("_cat,text", NEVER)
async def test_never_store_chat_used_but_not_saved(client, llm, maker, _cat, text):
    r = await client.post("/voice/chat", json={"prompt": text, "session_id": "s1"})
    assert r.status_code == 200  # usable in the moment
    async with maker() as s:
        assert (await s.execute(select(ChatMessage))).scalars().all() == []


async def test_safe_memory_is_saved(client, maker):
    from unittest.mock import patch

    with patch("routes.memory.embed", return_value=[0.0] * 1536):
        r = await client.post("/memory/", json={"content": "Victor prefers short answers", "layer": "layer2"})
    assert r.status_code == 200, r.text


async def test_trust_becomes_true_at_20_via_real_flow(client, lane, maker):
    lane.return_value = "lane1"
    for i in range(19):
        t = await mk(client, title=f"t{i}")
        assert t["requires_approval"] is True
        await client.post(f"/tasks/{t['task']['id']}/approve")
    async with maker() as s:
        assert await is_trusted("lane1_action", s) is False
    t = await mk(client, title="t19")
    await client.post(f"/tasks/{t['task']['id']}/approve")
    async with maker() as s:
        assert await is_trusted("lane1_action", s) is True
    after = await mk(client, title="after")
    assert after["requires_approval"] is False
    fin = await mk(client, title="money", sensitivity="financial")
    assert fin["requires_approval"] is True  # trust never skips money


async def test_revoke_trust_resets(maker):
    async with maker() as s:
        for _ in range(20):
            await record_clean_approval("x", s)
        assert await is_trusted("x", s) is True
        await revoke_trust("x", s)
        assert await is_trusted("x", s) is False
        await record_clean_approval("x", s)
        assert await is_trusted("x", s) is False


async def test_second_approve_blocked_while_unused(client):
    t = await mk(client)
    tid = t["task"]["id"]
    assert (await client.post(f"/tasks/{tid}/approve")).status_code == 200
    assert (await client.post(f"/tasks/{tid}/approve")).status_code == 409


async def test_spend_warning_at_70_and_block_at_100(client, llm, maker):
    llm.usage = {"cost": 14.5}  # 72.5% of $20
    r = await client.post("/voice/chat", json={"prompt": "hello"})
    assert r.status_code == 200
    st = (await client.get("/spend/status")).json()
    assert st["is_warning"] is True and st["is_blocked"] is False
    async with maker() as s:
        keys = [b.key for b in (await s.execute(select(Briefing))).scalars().all()]
        assert any(k and k.startswith("spend_warning") for k in keys)
    llm.usage = {"cost": 6.0}
    assert (await client.post("/voice/chat", json={"prompt": "again"})).status_code == 200
    st = (await client.get("/spend/status")).json()
    assert st["is_blocked"] is True
    n = len(llm.requests)
    r = await client.post("/voice/chat", json={"prompt": "blocked now"})
    assert r.status_code == 402
    assert len(llm.requests) == n  # no call went out
    async with maker() as s:
        assert len((await s.execute(select(SpendLog))).scalars().all()) == 2


async def test_spend_recorded_from_token_usage(client, llm, maker):
    llm.usage = {"prompt_tokens": 1000, "completion_tokens": 1000}
    await client.post("/voice/chat", json={"prompt": "hi"})
    async with maker() as s:
        rows = (await s.execute(select(SpendLog))).scalars().all()
        assert len(rows) == 1 and rows[0].amount_usd == pytest.approx(0.00075)
