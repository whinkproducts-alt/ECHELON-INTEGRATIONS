import httpx

from config import settings
from services import spend


async def embed(text: str) -> list[float]:
    """Get a text embedding via OmniRoute. The cost is recorded."""
    await spend.ensure_budget()
    async with httpx.AsyncClient(timeout=30) as client:
        response = await client.post(
            f"{settings.OMNIROUTE_BASE_URL}/embeddings",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {settings.OMNIROUTE_API_KEY}",
            },
            json={"model": "text-embedding-3-small", "input": text},
        )
    response.raise_for_status()
    data = response.json()
    cost, note = spend.embed_cost(data.get("usage"), text)
    await spend.record_cost(cost, f"embedding ({note})", "embedding")
    return data["data"][0]["embedding"]
