import os

# Test secrets. Set before anything imports config.
os.environ["DATABASE_URL"] = "sqlite+aiosqlite://"
os.environ["API_KEY"] = "test-api-key-0123456789"
os.environ["OMNIROUTE_API_KEY"] = "test-omniroute-key"
os.environ["ECHELON_API_KEY"] = "test-echelon-key"

import types
from unittest.mock import AsyncMock, patch

import httpx
import pytest
import pytest_asyncio
from pgvector.sqlalchemy import Vector
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import database
from database import Base, get_db
from main import app

API_KEY = os.environ["API_KEY"]
REAL_CLIENT = httpx.AsyncClient


@compiles(Vector, "sqlite")
def _vector_sqlite(type_, compiler, **kw):
    return "TEXT"


@pytest_asyncio.fixture
async def maker():
    engine = create_async_engine("sqlite+aiosqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    m = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    with patch.object(database, "AsyncSessionLocal", m):
        yield m
    await engine.dispose()


@pytest_asyncio.fixture
async def client(maker):
    async def override_get_db():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = override_get_db
    async with REAL_CLIENT(app=app, base_url="http://test", headers={"X-API-Key": API_KEY}) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def anon(maker):
    async def override_get_db():
        async with maker() as s:
            yield s

    app.dependency_overrides[get_db] = override_get_db
    async with REAL_CLIENT(app=app, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def lane():
    with patch("routes.tasks.classify_lane", new_callable=AsyncMock) as m:
        m.return_value = "lane2"
        yield m


class Echelon:
    """Fake ECHELON. Set .handler(request) -> httpx.Response. Every request is kept in .requests."""

    def __init__(self):
        self.requests = []
        self.handler = lambda req: httpx.Response(202, json={"task_id": "e-1", "status": "received"})

    def _route(self, request):
        self.requests.append(request)
        return self.handler(request)

    def paths(self):
        return [(r.method, r.url.path.replace("/api/integrations/marcus", "")) for r in self.requests]


@pytest.fixture
def echelon():
    fake = Echelon()

    def factory(timeout=20):
        return REAL_CLIENT(transport=httpx.MockTransport(fake._route), timeout=timeout)

    with patch("services.echelon_client.make_client", factory):
        yield fake


class Llm:
    def __init__(self):
        self.requests = []
        self.usage = {"prompt_tokens": 10, "completion_tokens": 10}
        self.reply = "ok"

    def _route(self, request):
        import json

        self.requests.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": self.reply}}], "usage": self.usage})


@pytest.fixture
def llm():
    fake = Llm()
    ns = types.SimpleNamespace(
        AsyncClient=lambda **kw: REAL_CLIENT(transport=httpx.MockTransport(fake._route), **kw)
    )
    with patch("services.omniroute.httpx", ns):
        yield fake
