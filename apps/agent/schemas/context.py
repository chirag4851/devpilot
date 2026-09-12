from typing import Optional
from pydantic import BaseModel


class ContextRequest(BaseModel):
    projectId: str
    query: str
    limit: Optional[int] = None