from typing import Optional

from fastapi import APIRouter, Header, HTTPException, Query, status

from clients.express_client import proxy_to_express, proxy_get_with_redirect, proxy_get_with_auth
router = APIRouter(prefix="/github")


def require_auth(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header is required",
        )
    return authorization


@router.get("/connect")
async def connect(
    returnTo: Optional[str] = Query(None),
    authorization: Optional[str] = Header(None),
):
    require_auth(authorization)
    return await proxy_get_with_auth("/github/connect", {"returnTo": returnTo} if returnTo else {}, authorization)


@router.get("/callback")
async def callback(code: Optional[str] = None, state: Optional[str] = None, error: Optional[str] = None):
    params = {k: v for k, v in {"code": code, "state": state, "error": error}.items() if v is not None}
    return await proxy_get_with_redirect("/github/callback", params)


@router.get("/repositories")
async def repositories(authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_get_with_auth("/github/repositories", {}, authorization)


@router.get("/status")
async def github_status(authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_get_with_auth("/github/status", {}, authorization)


@router.post("/ingest/{project_id}")
async def ingest(project_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_to_express(f"/github/ingest/{project_id}", {}, authorization=authorization, timeout=60.0)