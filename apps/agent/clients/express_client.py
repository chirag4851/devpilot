from typing import Optional
from fastapi.responses import RedirectResponse
import httpx
from fastapi import HTTPException, status
from fastapi.responses import Response

from config import EXPRESS_API_URL


async def proxy_to_express(
    path: str,
    json: dict,
    authorization: Optional[str] = None,
    timeout: float = 10.0,
) -> Response:
    """Forward a POST request to Express and pass its response straight
    through, unchanged. Every FastAPI route that talks to Express should
    go through this instead of building its own httpx client."""
    headers = {"Authorization": authorization} if authorization else {}

    async with httpx.AsyncClient() as client:
        try:
            response = await client.post(
                f"{EXPRESS_API_URL}{path}",
                json=json,
                headers=headers,
                timeout=timeout,
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not reach Express API: {exc}",
            )

    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type="application/json",
    )





async def proxy_get_with_redirect(
    path: str,
    params: dict,
) -> Response:
    """For GET endpoints where Express may respond with a redirect
    (browser-driven OAuth flows) rather than JSON. Forwards the request
    without following redirects itself, then re-issues whatever Express
    returned — a redirect straight to the frontend, or a JSON error
    passed through unchanged."""
    async with httpx.AsyncClient(follow_redirects=False) as client:
        try:
            response = await client.get(
                f"{EXPRESS_API_URL}{path}",
                params=params,
                timeout=10.0,
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not reach Express API: {exc}",
            )

    if response.status_code in (301, 302, 303, 307, 308):
        location = response.headers.get("location", "/")
        return RedirectResponse(url=location, status_code=response.status_code)

    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type="application/json",
    )


async def proxy_get_with_auth(
    path: str,
    params: dict,
    authorization: str,
    timeout: float = 10.0,
) -> Response:
    """Authenticated GET proxy — forwards query params and the
    Authorization header, returns Express's JSON response unchanged."""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{EXPRESS_API_URL}{path}",
                params=params,
                headers={"Authorization": authorization},
                timeout=timeout,
            )
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not reach Express API: {exc}",
            )

    return Response(
        content=response.content,
        status_code=response.status_code,
        media_type="application/json",
    )

async def proxy_delete_with_auth(path: str, authorization: str, timeout: float = 10.0) -> Response:
    async with httpx.AsyncClient() as client:
        try:
            response = await client.delete(
                f"{EXPRESS_API_URL}{path}",
                headers={"Authorization": authorization},
                timeout=timeout,
            )
        except httpx.RequestError as exc:
            raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not reach Express API: {exc}")

    return Response(content=response.content, status_code=response.status_code, media_type="application/json")