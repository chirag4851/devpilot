from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status

from clients.express_client import proxy_to_express
from schemas.context import ContextRequest

router = APIRouter()


@router.post("/context")
async def context(payload: ContextRequest, authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required",
        )

    return await proxy_to_express(
        "/api/context",
        payload.model_dump(exclude_none=True),
        authorization=authorization,
        timeout=30.0,
    )