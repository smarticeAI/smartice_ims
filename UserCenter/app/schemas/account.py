"""Account schemas."""

from datetime import datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class AccountBase(BaseModel):
    """Account base schema."""

    account_type: str = "human"
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    phone: Optional[str] = Field(None, pattern=r"^1[3-9]\d{9}$")
    email: Optional[str] = Field(None, max_length=100)


class AccountCreate(AccountBase):
    """Account create schema."""

    employee_id: Optional[UUID] = None
    password: str = Field(..., min_length=6)


class AccountUpdate(BaseModel):
    """Account update schema."""

    username: Optional[str] = Field(None, min_length=3, max_length=50)
    phone: Optional[str] = Field(None, pattern=r"^1[3-9]\d{9}$")
    email: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = None
    status_reason: Optional[str] = Field(None, max_length=200)


class AccountPasswordUpdate(BaseModel):
    """Password update schema."""

    old_password: str = Field(..., min_length=6)
    new_password: str = Field(..., min_length=6)


class AccountPasswordReset(BaseModel):
    """Admin password reset schema."""

    new_password: str = Field(..., min_length=6)


class AccountResponse(AccountBase):
    """Account response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    employee_id: Optional[UUID] = None
    status: str
    last_login_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class AccountWithRolesResponse(AccountResponse):
    """Account response with roles."""

    roles: List[str] = []
