from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker, declarative_base
from config import settings

engine = create_async_engine(settings.DATABASE_URL)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
Base = declarative_base()


async def get_db():
    async with AsyncSessionLocal() as session:
        yield session


# create_all() never alters an existing table, so older databases need these.
# Every statement is idempotent. Postgres only.
_PG_MIGRATIONS = [
    "CREATE EXTENSION IF NOT EXISTS vector",
]
_PG_ALTERS = [
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS deadline_str VARCHAR(64)",
    "ALTER TABLE tasks ADD COLUMN IF NOT EXISTS prev_status VARCHAR(32)",
    "ALTER TABLE tasks ALTER COLUMN status TYPE VARCHAR(32)",
    "ALTER TABLE approvals ADD COLUMN IF NOT EXISTS used BOOLEAN DEFAULT FALSE",
    "ALTER TABLE echelon_handoffs ADD COLUMN IF NOT EXISTS approval_id UUID",
    "ALTER TABLE echelon_handoffs ALTER COLUMN status TYPE VARCHAR(32)",
]


async def init_db():
    async with engine.begin() as conn:
        is_pg = conn.dialect.name == "postgresql"
        if is_pg:
            for stmt in _PG_MIGRATIONS:
                await conn.execute(text(stmt))
        await conn.run_sync(Base.metadata.create_all)
        if is_pg:
            for stmt in _PG_ALTERS:
                await conn.execute(text(stmt))
