from typing import Optional

from fastapi import APIRouter, Header, HTTPException, status

from clients.express_client import proxy_to_express, proxy_get_with_auth, proxy_delete_with_auth

router = APIRouter(prefix="/projects")


def require_auth(authorization: Optional[str]) -> str:
    if not authorization:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authorization header is required")
    return authorization


@router.post("")
async def create_project(payload: dict, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_to_express("/projects", payload, authorization=authorization)


@router.get("")
async def list_projects(authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_get_with_auth("/projects", {}, authorization)


@router.get("/{project_id}")
async def get_project(project_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_get_with_auth(f"/projects/{project_id}", {}, authorization)


@router.delete("/{project_id}")
async def delete_project(project_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_delete_with_auth(f"/projects/{project_id}", authorization)


@router.get("/{project_id}/repository")
async def get_repository(project_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_get_with_auth(f"/projects/{project_id}/repository", {}, authorization)


@router.post("/{project_id}/repository")
async def connect_repository(project_id: str, payload: dict, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_to_express(f"/projects/{project_id}/repository", payload, authorization=authorization)

@router.post("/{project_id}/repository/resync")
async def resync_repository(project_id: str, authorization: Optional[str] = Header(None)):
    require_auth(authorization)
    return await proxy_to_express(
        f"/projects/{project_id}/repository/resync",
        {},
        authorization=authorization,
        timeout=600.0,
    )