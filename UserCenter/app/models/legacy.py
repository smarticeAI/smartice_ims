"""Legacy user mapping for migration."""

import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import String, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, TIMESTAMP
from sqlalchemy.orm import Mapped, mapped_column

from app.config.database import Base


class LegacyUserMapping(Base):
    """Legacy system user mapping table for migration."""

    __tablename__ = "legacy_user_mapping"
    __table_args__ = (
        UniqueConstraint(
            "legacy_system", "legacy_table", "legacy_id",
            name="uq_legacy_mapping_source"
        ),
        {"schema": "usercenter"},
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    # Legacy system info
    legacy_system: Mapped[str] = mapped_column(String(20), nullable=False)  # 'LMS' / 'DATABASE'
    legacy_table: Mapped[str] = mapped_column(String(50), nullable=False)
    legacy_id: Mapped[str] = mapped_column(String(100), nullable=False)

    # New system references
    employee_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.employees.id", ondelete="CASCADE"),
        nullable=True,
    )
    account_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.accounts.id", ondelete="CASCADE"),
        nullable=True,
    )

    migrated_at: Mapped[datetime] = mapped_column(
        TIMESTAMP(timezone=True),
        server_default="NOW()",
        nullable=False,
    )
