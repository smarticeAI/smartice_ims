"""Authentication schemas."""

from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class LoginRequest(BaseModel):
    """Login request schema."""

    username: Optional[str] = Field(None, min_length=3, max_length=50)
    phone: Optional[str] = Field(None, pattern=r"^1[3-9]\d{9}$")
    password: str = Field(..., min_length=6)

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "phone": "13800138000",
                "password": "password123"
            }
        }
    )


class Token(BaseModel):
    """JWT token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshTokenRequest(BaseModel):
    """Refresh token request."""

    refresh_token: str


class CurrentUserResponse(BaseModel):
    """Current user info response."""

    model_config = ConfigDict(from_attributes=True)

    account_id: UUID
    username: Optional[str] = None
    phone: Optional[str] = None
    status: str

    # Employee info
    employee_id: Optional[UUID] = None
    employee_no: Optional[str] = None
    name: Optional[str] = None
    employment_status: Optional[str] = None
    position_code: Optional[str] = None

    # Organization info
    store_id: Optional[UUID] = None
    store_name: Optional[str] = None
    brand_id: Optional[UUID] = None
    brand_name: Optional[str] = None


class RegisterRequest(BaseModel):
    """User registration request schema."""

    username: str = Field(..., min_length=2, max_length=50, description="Real name")
    phone: str = Field(..., pattern=r"^1[3-9]\d{9}$", description="Phone number")
    password: str = Field(..., min_length=6, description="Password")
    invitation_code: str = Field(..., min_length=3, max_length=20, description="Invitation code")

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "username": "张三",
                "phone": "13800138000",
                "password": "password123",
                "invitation_code": "YBL-DY-001"
            }
        }
    )


class RegisterResponse(BaseModel):
    """User registration response schema."""

    success: bool
    message: str
    account_id: Optional[UUID] = None
