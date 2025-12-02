"""Employee model."""

import uuid
from datetime import date
from typing import Optional, List, TYPE_CHECKING

from sqlalchemy import String, Integer, Date, ForeignKey, LargeBinary, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, AuditMixin

if TYPE_CHECKING:
    from app.models.organization import Store
    from app.models.account import Account


class Employee(BaseModel, AuditMixin):
    """Employee profile table."""

    __tablename__ = "employees"

    # Basic info
    employee_no: Mapped[Optional[str]] = mapped_column(String(20), unique=True, nullable=True)
    name: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    name_pinyin: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    gender: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    birth_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, index=True)
    email: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    photo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Encrypted ID card
    id_card_encrypted: Mapped[Optional[bytes]] = mapped_column(LargeBinary, nullable=True)

    # Employment status
    employment_status: Mapped[str] = mapped_column(
        String(20), default="active", nullable=False, index=True
    )
    employment_type: Mapped[str] = mapped_column(
        String(20), default="full_time", nullable=False
    )
    hire_date: Mapped[date] = mapped_column(Date, nullable=False)
    probation_end_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    resign_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    resign_reason: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)

    # Current store (3NF: direct reference to stores)
    store_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.stores.id", ondelete="RESTRICT"),
        nullable=False,
        index=True,
    )

    # Position info (MVP: stored directly, Phase 3: migrate to employee_org_positions)
    position_code: Mapped[Optional[str]] = mapped_column(String(30), nullable=True)
    level_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # Mentor relationship
    mentor_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.employees.id", ondelete="SET NULL"),
        nullable=True,
    )

    __table_args__ = (
        CheckConstraint(
            "employment_status IN ('active', 'probation', 'resigned', 'terminated', 'suspended', 'pending')",
            name="ck_employees_status",
        ),
        CheckConstraint(
            "employment_type IN ('full_time', 'part_time', 'intern', 'contractor')",
            name="ck_employees_type",
        ),
        CheckConstraint(
            "gender IN ('male', 'female') OR gender IS NULL",
            name="ck_employees_gender",
        ),
    )

    # Relationships
    store: Mapped["Store"] = relationship("Store", back_populates="employees")
    mentor: Mapped[Optional["Employee"]] = relationship(
        "Employee", remote_side="Employee.id", backref="mentees"
    )
    account: Mapped[Optional["Account"]] = relationship(
        "Account", back_populates="employee", uselist=False
    )
