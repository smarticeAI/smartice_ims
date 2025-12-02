"""Common schemas for API responses."""

from typing import Any, Generic, List, Optional, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict

DataT = TypeVar("DataT")


class ResponseBase(BaseModel):
    """Base response schema."""

    success: bool = True
    message: str = "Success"
    data: Optional[Any] = None


class PaginatedResponse(BaseModel, Generic[DataT]):
    """Paginated response schema."""

    success: bool = True
    data: List[DataT]
    total: int
    page: int
    page_size: int
    total_pages: int


class IDResponse(BaseModel):
    """Response with ID only."""

    id: UUID


class MessageResponse(BaseModel):
    """Response with message only."""

    success: bool = True
    message: str
