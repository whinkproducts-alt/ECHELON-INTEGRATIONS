"""
Real Marcus-to-ECHELON check over HTTP, using Marcus's own client (services.echelon_client, services.hashing). No mocks.

Needs a running ECHELON (web + worker, a local model, owner account) and the Marcus backend source. Use a disposable
test database, never a personal one. Set MARCUS_BACKEND_DIR to Marcus's backend folder and run with a Python that has
httpx and pydantic-settings:

  MARCUS_BACKEND_DIR=~/Developer/marcus-vale/backend ECHELON_BASE_URL=http://127.0.0.1:3213 ECHELON_API_KEY=<bearer token> \
  DATABASE_URL=sqlite+aiosqlite:///:memory: API_KEY=<any 32+ chars> OMNIROUTE_API_KEY=<any 32+ chars> python3 -u scripts/marcus-e2e.py

Covers: accept, idempotent replay, worker admission, real inference to done with an untrusted result, second approval once,
freeze blocking intake, tampered-hash refusal, and Marcus's own SSE parser seeing the status changes.
"""
import asyncio, json, os, sys, time, uuid
sys.path.insert(0, os.path.expanduser(os.environ["MARCUS_BACKEND_DIR"]))
from services import echelon_client as ec
from services.hashing import content_hash

def payload(title, goal, sensitivity="standard", op=None):
    h = content_hash(title, goal, None)
    return {"client_operation_id": op or str(uuid.uuid4()), "title": title, "goal": goal, "deadline": None,
            "requested_for": "victor", "sensitivity": sensitivity, "directorate": None,
            "approval": {"approval_id": str(uuid.uuid4()), "approved_at": "2026-11-15T00:00:00+00:00", "method": "voice", "content_hash": h}}, h

events = []
async def listen():
    try:
        async for eid, etype, data in ec.stream_events(None):
            events.append((etype, data.get("task_id"), data.get("status")))
    except asyncio.CancelledError:
        raise
    except Exception as e:
        events.append(("listener_error", None, repr(e)))

async def wait_status(task_id, want, secs):
    end = time.time() + secs
    last = None
    while time.time() < end:
        t = await ec.get_task(task_id)
        if t["status"] != last:
            print(f"   {time.strftime('%H:%M:%S')} status={t['status']}")
            last = t["status"]
        if t["status"] in want:
            return t
        await asyncio.sleep(3)
    raise SystemExit(f"timed out waiting for {want}, last={last}")

async def main():
    print("enabled:", ec.enabled(), "base:", ec.settings.ECHELON_BASE_URL)
    listener = asyncio.create_task(listen())
    await asyncio.sleep(2)

    print("1. standard task (Marcus -> ECHELON -> worker -> Ollama)")
    p, _ = payload("Weekly focus", "Think through what I should focus on this week as a founder with three products")
    r = await ec.send_task(ec.seal_payload(p))
    tid = r["task_id"]; print("   accepted:", r["status"], tid[:10])
    r2 = await ec.send_task(ec.seal_payload(p))
    print("   replay same operation id ->", "same task" if r2["task_id"] == tid else "DIFFERENT TASK")
    done = await wait_status(tid, {"done", "failed", "blocked", "cancelled"}, 420)
    res = done.get("result") or {}
    print("   final:", done["status"], "| untrusted:", res.get("untrusted"))
    for o in (res.get("outputs") or [])[:2]:
        print("   agent:", o["agent_id"].split(".")[-1], "|", o["text"][:240].replace("\n", " "))

    print("2. financial task needs a second approval")
    p2, h2 = payload("Review vendor payment plan", "Think through the risks of paying our vendors in advance next quarter", "financial")
    f = await ec.send_task(ec.seal_payload(p2)); print("   accepted:", f["status"])
    second = {"approval_id": str(uuid.uuid4()), "approved_at": "2026-11-15T00:01:00+00:00", "method": "voice", "content_hash": h2}
    c = await ec.confirm_task(f["task_id"], second); print("   after confirm:", c["status"])
    try:
        await ec.confirm_task(f["task_id"], {**second, "approval_id": str(uuid.uuid4())})
        print("   second confirm: ACCEPTED (unexpected)")
    except ec.EchelonError as e:
        print("   second confirm refused:", e.status, e.code)

    print("3. freeze / unfreeze through Marcus's client")
    print("   freeze:", await ec.freeze_echelon())
    try:
        px, _ = payload("While frozen", "This should be refused while ECHELON is frozen by Marcus")
        await ec.send_task(ec.seal_payload(px)); print("   intake while frozen: ACCEPTED (unexpected)")
    except ec.EchelonError as e:
        print("   intake while frozen refused:", e.status)
    print("   unfreeze:", await ec.unfreeze_echelon())

    print("4. tampered content hash is refused")
    pb, _ = payload("Tamper test", "Original goal text for the tamper test case")
    pb["goal"] = "Different goal after approval"
    try:
        await ec.send_task(ec.seal_payload(pb)); print("   ACCEPTED (unexpected)")
    except ec.EchelonError as e:
        print("   refused:", e.status, e.code)

    await asyncio.sleep(4)
    listener.cancel()
    mine = [e for e in events if e[1] == tid]
    print("5. Marcus's own SSE parser saw for task 1:", " -> ".join(s for _, _, s in mine))
    errs = [e for e in events if e[0] == "listener_error"]
    print("   listener errors:", errs or "none")

asyncio.run(main())
