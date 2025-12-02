"""Invitation code schemas."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class InvitationCodeCreate(BaseModel):
    """Schema for creating an invitation code."""

    code: str = Field(..., min_length=3, max_length=20, description="Invitation code")
    store_id: UUID = Field(..., description="Associated store ID")
    max_uses: int = Field(default=10, ge=1, le=1000, description="Maximum usage count")
    expires_at: Optional[datetime] = Field(None, description="Expiration time")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "code": "YBL-DY-001",
                "store_id": "e180d6ba-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
                "max_uses": 10,
                "expires_at": None
            }
        }
    )


class InvitationCodeResponse(BaseModel):
    """Response schema for invitation code."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    code: str
    store_id: UUID
    store_name: Optional[str] = None
    max_uses: int
    used_count: int
    expires_at: Optional[datetime] = None
    is_active: bool
    created_at: datetime
    created_by: Optional[UUID] = None


class InvitationCodeListResponse(BaseModel):
    """List response for invitation codes."""

    success: bool = True
    data: list[InvitationCodeResponse]
    total: int


class InvitationCodeUpdate(BaseModel):
    """Schema for updating an invitation code."""

    max_uses: Optional[int] = Field(None, ge=1, le=1000)
    expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None
