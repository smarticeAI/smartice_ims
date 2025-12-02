"""Admin schemas for account review and management."""

from datetime import datetime
from typing import List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, field_validator


class PendingAccountResponse(BaseModel):
    """Pending account response with employee and invitation info."""

    model_config = ConfigDict(from_attributes=True)

    account_id: UUID
    phone: Optional[str] = None
    username: Optional[str] = None
    status: str
    created_at: datetime

    # Employee info
    employee_id: UUID
    employee_name: str

    # Invitation code info
    invitation_code: Optional[str] = None
    store_id: UUID
    store_name: str


class ReviewRequest(BaseModel):
    """Single account review request."""

    action: Literal["approve", "reject"]
    reason: Optional[str] = None

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: Optional[str], info) -> Optional[str]:
        if info.data.get("action") == "reject" and not v:
            raise ValueError("拒绝审核时必须填写原因")
        return v


class BatchReviewRequest(BaseModel):
    """Batch account review request."""

    account_ids: List[UUID]
    action: Literal["approve", "reject"]
    reason: Optional[str] = None

    @field_validator("account_ids")
    @classmethod
    def validate_account_ids(cls, v: List[UUID]) -> List[UUID]:
        if not v:
            raise ValueError("账号ID列表不能为空")
        if len(v) > 100:
            raise ValueError("单次批量审核最多100个账号")
        return v

    @field_validator("reason")
    @classmethod
    def validate_reason(cls, v: Optional[str], info) -> Optional[str]:
        if info.data.get("action") == "reject" and not v:
            raise ValueError("拒绝审核时必须填写原因")
        return v


class ReviewResponse(BaseModel):
    """Review action response."""

    success: bool = True
    message: str
    account_id: UUID


class BatchReviewResponse(BaseModel):
    """Batch review action response."""

    success: bool = True
    message: str
    processed: int
    failed: int = 0
    details: Optional[List[dict]] = None
