"""Account model for authentication."""

import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, SmallInteger, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID, INET, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel

if TYPE_CHECKING:
    from app.models.employee import Employee
    from app.models.role import AccountRole
    from app.models.invitation import InvitationCode


class Account(BaseModel):
    """Account table for authentication, separated from employee."""

    __tablename__ = "accounts"

    # Account type
    account_type: Mapped[str] = mapped_column(
        String(20), default="human", nullable=False
    )

    # Login credentials
    username: Mapped[Optional[str]] = mapped_column(
        String(50), unique=True, nullable=True
    )
    phone: Mapped[Optional[str]] = mapped_column(
        String(20), unique=True, nullable=True, index=True
    )
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    password_hash: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Employee relationship (1:1)
    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.employees.id", ondelete="RESTRICT"),
        unique=True,
        nullable=True,
        index=True,
    )

    # Status management
    status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )
    status_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    frozen_until: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    # Security info
    last_login_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    last_login_ip: Mapped[Optional[str]] = mapped_column(INET, nullable=True)
    failed_login_count: Mapped[int] = mapped_column(SmallInteger, default=0)
    locked_until: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(
        TIMESTAMP(timezone=True), nullable=True
    )

    # Audit
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # Registration via invitation code (3NF: FK reference, not storing code string)
    invitation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.invitation_codes.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        CheckConstraint(
            "account_type IN ('human', 'system', 'device')",
            name="ck_accounts_type",
        ),
        CheckConstraint(
            "status IN ('active', 'frozen', 'disabled', 'pending')",
            name="ck_accounts_status",
        ),
        # Human accounts must have login method
        CheckConstraint(
            "account_type != 'human' OR phone IS NOT NULL OR username IS NOT NULL",
            name="ck_accounts_human_login",
        ),
    )

    # Relationships
    employee: Mapped[Optional["Employee"]] = relationship(
        "Employee", back_populates="account"
    )
    account_roles: Mapped[List["AccountRole"]] = relationship(
        "AccountRole", back_populates="account", cascade="all, delete-orphan"
    )
    invitation: Mapped[Optional["InvitationCode"]] = relationship(
        "InvitationCode", foreign_keys=[invitation_id]
    )
