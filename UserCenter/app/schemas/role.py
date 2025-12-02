"""Role schemas."""

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class RoleBase(BaseModel):
    """Role base schema."""

    code: str = Field(..., max_length=30)
    name: str = Field(..., max_length=50)
    description: Optional[str] = None
    scope: str = Field(..., pattern="^(global|brand|region|city|store|self)$")
    level: int = 0


class RoleCreate(RoleBase):
    """Role create schema."""

    is_system: bool = False


class RoleUpdate(BaseModel):
    """Role update schema."""

    name: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    level: Optional[int] = None
    is_active: Optional[bool] = None


class RoleResponse(RoleBase):
    """Role response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    is_system: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ============ AccountRole ============
class AccountRoleAssign(BaseModel):
    """Assign role to account."""

    account_id: UUID
    role_id: UUID


class AccountRoleRevoke(BaseModel):
    """Revoke role from account."""

    account_id: UUID
    role_id: UUID


class AccountRoleResponse(BaseModel):
    """Account role response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    account_id: UUID
    role_id: UUID
    role_code: Optional[str] = None
    role_name: Optional[str] = None
    is_active: bool
    created_at: datetime
