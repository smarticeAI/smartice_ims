"""Role and AccountRole models for RBAC."""

import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, SmallInteger, Boolean, ForeignKey, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, TimestampMixin
from app.config.database import Base

if TYPE_CHECKING:
    from app.models.account import Account


class Role(BaseModel):
    """Role definition table."""

    __tablename__ = "roles"

    code: Mapped[str] = mapped_column(String(30), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # Role attributes
    scope: Mapped[str] = mapped_column(String(20), nullable=False)
    level: Mapped[int] = mapped_column(SmallInteger, default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Relationships
    account_roles: Mapped[List["AccountRole"]] = relationship(
        "AccountRole", back_populates="role"
    )


class AccountRole(Base, TimestampMixin):
    """Account-Role association table (N:M)."""

    __tablename__ = "account_roles"
    __table_args__ = (
        UniqueConstraint("account_id", "role_id", name="uq_account_roles_account_role"),
        {"schema": "usercenter"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.accounts.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.roles.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    granted_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), nullable=True
    )

    # Relationships
    account: Mapped["Account"] = relationship("Account", back_populates="account_roles")
    role: Mapped["Role"] = relationship("Role", back_populates="account_roles")
