"""Organization models: Enterprise, Brand, Region, City, Store (5-level hierarchy)."""

import uuid
from datetime import date
from typing import List, Optional

from sqlalchemy import String, Integer, Date, ForeignKey, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import BaseModel, SoftDeleteMixin, AuditMixin


class Enterprise(BaseModel, SoftDeleteMixin):
    """L1: Enterprise (top level, single record)."""

    __tablename__ = "enterprise"

    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    # Status constraint
    __table_args__ = (
        CheckConstraint("status IN ('active', 'closed')", name="ck_enterprise_status"),
    )

    # Relationships
    brands: Mapped[List["Brand"]] = relationship(
        "Brand", back_populates="enterprise", cascade="all, delete-orphan"
    )


class Brand(BaseModel, SoftDeleteMixin, AuditMixin):
    """L2: Brand."""

    __tablename__ = "brands"

    enterprise_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.enterprise.id", ondelete="RESTRICT"),
        nullable=False,
    )

    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    short_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    logo_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        CheckConstraint("status IN ('active', 'closed')", name="ck_brands_status"),
    )

    # Relationships
    enterprise: Mapped["Enterprise"] = relationship("Enterprise", back_populates="brands")
    regions: Mapped[List["Region"]] = relationship(
        "Region", back_populates="brand", cascade="all, delete-orphan"
    )


class Region(BaseModel, SoftDeleteMixin, AuditMixin):
    """L3: Region."""

    __tablename__ = "regions"

    brand_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.brands.id", ondelete="RESTRICT"),
        nullable=False,
    )

    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        CheckConstraint("status IN ('active', 'closed')", name="ck_regions_status"),
    )

    # Relationships
    brand: Mapped["Brand"] = relationship("Brand", back_populates="regions")
    cities: Mapped[List["City"]] = relationship(
        "City", back_populates="region", cascade="all, delete-orphan"
    )


class City(BaseModel, SoftDeleteMixin, AuditMixin):
    """L4: City."""

    __tablename__ = "cities"

    region_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.regions.id", ondelete="RESTRICT"),
        nullable=False,
    )

    code: Mapped[str] = mapped_column(String(50), nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    province: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        CheckConstraint("status IN ('active', 'closed')", name="ck_cities_status"),
    )

    # Relationships
    region: Mapped["Region"] = relationship("Region", back_populates="cities")
    stores: Mapped[List["Store"]] = relationship(
        "Store", back_populates="city", cascade="all, delete-orphan"
    )


class Store(BaseModel, SoftDeleteMixin, AuditMixin):
    """L5: Store."""

    __tablename__ = "stores"

    city_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("usercenter.cities.id", ondelete="RESTRICT"),
        nullable=False,
    )

    code: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    # Store specific fields
    address: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    opening_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    ownership_type: Mapped[str] = mapped_column(
        String(20), default="direct", nullable=False
    )

    # Business info
    business_hours: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    seating_capacity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    sort_order: Mapped[int] = mapped_column(Integer, default=0)

    __table_args__ = (
        CheckConstraint(
            "status IN ('active', 'preparing', 'closed')", name="ck_stores_status"
        ),
        CheckConstraint(
            "ownership_type IN ('direct', 'franchise')", name="ck_stores_ownership"
        ),
    )

    # Relationships
    city: Mapped["City"] = relationship("City", back_populates="stores")
    employees: Mapped[List["Employee"]] = relationship(
        "Employee", back_populates="store"
    )


# Import Employee for type hints (circular import handled by string reference above)
from app.models.employee import Employee
