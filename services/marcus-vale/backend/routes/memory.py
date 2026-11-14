from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from database import get_db
from models import Memory
from schemas import MemoryCreate
from services.embeddings import embed
from services.never_store import check
from services.spend import SpendCapReached

router = APIRouter()


def out(m: Memory) -> dict:
    """Embeddings are numpy arrays and never leave the server."""
    return {
        "id": m.id,
        "layer": m.layer,
        "content": m.content,
        "source": m.source,
        "provenance": m.provenance,
        "timestamp": m.timestamp,
    }


@router.post("/")
async def create_memory(memory: MemoryCreate, db: AsyncSession = Depends(get_db)):
    category = check(memory.content)
    if category:
        # Usable in the moment, never saved.
        raise HTTPException(status_code=422, detail=f"Not saved: contains {category} information")
    try:
        vector = await embed(memory.content)
    except SpendCapReached:
        raise HTTPException(status_code=402, detail="Spend cap reached")
    new_memory = Memory(
        content=memory.content,
        layer=memory.layer,
        source=memory.source,
        provenance=memory.provenance,
        timestamp=datetime.now(timezone.utc),
        embedding=vector,
    )
    db.add(new_memory)
    await db.commit()
    await db.refresh(new_memory)
    return {"memory": out(new_memory)}


@router.get("/")
async def list_memories(layer: Optional[str] = None, source: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    query = select(Memory)
    if layer:
        query = query.where(Memory.layer == layer)
    if source:
        query = query.where(Memory.source == source)
    result = await db.execute(query)
    return {"memories": [out(m) for m in result.scalars().all()]}


@router.get("/search")
async def search_memory(query: str, limit: int = 10, db: AsyncSession = Depends(get_db)):
    try:
        query_vector = await embed(query)
    except SpendCapReached:
        raise HTTPException(status_code=402, detail="Spend cap reached")
    result = await db.execute(
        select(Memory).order_by(Memory.embedding.cosine_distance(query_vector)).limit(min(max(limit, 1), 50))
    )
    return {"memories": [out(m) for m in result.scalars().all()]}
