from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status

from clients.express_client import proxy_to_express, proxy_get_with_auth
from schemas.auth import LoginRequest, SignupRequest

router = APIRouter(prefix="/users")


@router.post("/login")
async def login(payload: LoginRequest):
    return await proxy_to_express("/users/login", payload.model_dump())


@router.post("")
async def signup(payload: SignupRequest):
    return await proxy_to_express("/users", payload.model_dump())


@router.get("/me")
async def me(authorization: Optional[str] = Header(None)):
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header is required")
    return await proxy_get_with_auth("/users/me", {}, authorization)