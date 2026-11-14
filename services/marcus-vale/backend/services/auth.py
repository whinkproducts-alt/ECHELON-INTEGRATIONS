import hmac
from typing import Optional

from fastapi import Header, HTTPException

from config import settings


async def require_api_key(x_api_key: Optional[str] = Header(default=None)) -> None:
    if not x_api_key or not hmac.compare_digest(x_api_key.encode(), settings.API_KEY.encode()):
        raise HTTPException(status_code=401, detail="Missing or invalid API key")
