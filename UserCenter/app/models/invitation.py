"""Invitation code model for user registration."""

import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, SmallInteger, Boolean, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP, INET
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.organization import Store
    from app.models.account import Account


class InvitationCode(BaseModel):
    """Invitation code table for controlled user registration."""

    __tablename__ = "invitation_codes"

    # Invitation code (business key, e.g., YBL-DY-001)
    code: Mapped[str] = mapped_column(
        String(20), unique=True, nullable=False, index=True
    )

    # Associated store (3NF: FK reference)
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.stores.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Creator (optional, for audit)
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.accounts.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Usage limits
    max_uses: Mapped[int] = mapped_column(SmallInteger, default=10, nullable=False)
    used_count: Mapped[int] = mapped_column(SmallInteger, default=0, nullable=False)

    # Validity
    expires_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        CheckConstraint(
            "used_count >= 0 AND used_count <= max_uses",
            name="ck_invitation_codes_uses",
        ),
        CheckConstraint(
            "max_uses > 0 AND max_uses <= 1000",
            name="ck_invitation_codes_max_uses",
        ),
    )

    # Relationships
    store: Mapped["Store"] = relationship("Store")
    creator: Mapped[Optional["Account"]] = relationship(
        "Account", foreign_keys=[created_by]
    )
    usages: Mapped[List["InvitationUsage"]] = relationship(
        "InvitationUsage", back_populates="invitation"
    )


class InvitationUsage(BaseModel):
    """Audit table for invitation code usage tracking."""

    __tablename__ = "invitation_usages"

    # References
    invitation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.invitation_codes.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.accounts.id", ondelete="RESTRICT"),
        nullable=False,
        unique=True,  # One account can only use one invitation code
    )

    # Usage metadata
    used_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        default=datetime.utcnow,
        nullable=False,
    )
    ip_address: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Relationships
    invitation: Mapped["InvitationCode"] = relationship(
        "InvitationCode", back_populates="usages"
    )
    account: Mapped["Account"] = relationship("Account")
