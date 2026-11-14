import asyncio
import logging

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import init_db
from routes import approvals, briefings, control, echelon, memory, spend, tasks, voice
from routes import settings as settings_routes
from services.auth import require_api_key
from services.echelon_events import run_listener
from services.never_store import install_log_filter
from services.scheduler import scheduler, start_scheduler

install_log_filter()
log = logging.getLogger("marcus")

app = FastAPI(title="Marcus Vale API", docs_url=None, redoc_url=None, openapi_url=None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:7000", "http://127.0.0.1:7000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_listener_task = None


@app.on_event("startup")
async def startup():
    global _listener_task
    await init_db()
    await start_scheduler()
    if settings.echelon_enabled:
        _listener_task = asyncio.create_task(run_listener())
    else:
        log.info("ECHELON not configured: running standalone")


@app.on_event("shutdown")
async def shutdown():
    if _listener_task:
        _listener_task.cancel()
    if scheduler.running:
        scheduler.shutdown(wait=False)


_auth = [Depends(require_api_key)]
app.include_router(voice.router, prefix="/voice", tags=["voice"], dependencies=_auth)
app.include_router(tasks.router, prefix="/tasks", tags=["tasks"], dependencies=_auth)
app.include_router(approvals.router, prefix="/approvals", tags=["approvals"], dependencies=_auth)
app.include_router(memory.router, prefix="/memory", tags=["memory"], dependencies=_auth)
app.include_router(echelon.router, prefix="/echelon", tags=["echelon"], dependencies=_auth)
app.include_router(spend.router, prefix="/spend", tags=["spend"], dependencies=_auth)
app.include_router(control.router, prefix="/control", tags=["control"], dependencies=_auth)
app.include_router(briefings.router, prefix="/briefings", tags=["briefings"], dependencies=_auth)
app.include_router(settings_routes.router, prefix="/settings", tags=["settings"], dependencies=_auth)


@app.get("/health")
async def health():
    return {"status": "ok", "app": "marcus-vale", "env": settings.MARCUS_ENV}
