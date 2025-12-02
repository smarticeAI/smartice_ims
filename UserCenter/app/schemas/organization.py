"""Organization schemas."""

from datetime import date, datetime
from typing import Optional, List
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


# ============ Enterprise ============
class EnterpriseBase(BaseModel):
    """Enterprise base schema."""

    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    short_name: Optional[str] = Field(None, max_length=50)
    logo_url: Optional[str] = Field(None, max_length=500)


class EnterpriseCreate(EnterpriseBase):
    """Enterprise create schema."""

    pass


class EnterpriseUpdate(BaseModel):
    """Enterprise update schema."""

    name: Optional[str] = Field(None, max_length=100)
    short_name: Optional[str] = Field(None, max_length=50)
    logo_url: Optional[str] = Field(None, max_length=500)
    status: Optional[str] = None


class EnterpriseResponse(EnterpriseBase):
    """Enterprise response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    status: str
    created_at: datetime
    updated_at: datetime


# ============ Brand ============
class BrandBase(BaseModel):
    """Brand base schema."""

    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    short_name: Optional[str] = Field(None, max_length=50)
    logo_url: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    sort_order: int = 0


class BrandCreate(BrandBase):
    """Brand create schema."""

    enterprise_id: UUID


class BrandUpdate(BaseModel):
    """Brand update schema."""

    name: Optional[str] = Field(None, max_length=100)
    short_name: Optional[str] = Field(None, max_length=50)
    logo_url: Optional[str] = Field(None, max_length=500)
    description: Optional[str] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None


class BrandResponse(BrandBase):
    """Brand response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    enterprise_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime


# ============ Region ============
class RegionBase(BaseModel):
    """Region base schema."""

    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    sort_order: int = 0


class RegionCreate(RegionBase):
    """Region create schema."""

    brand_id: UUID


class RegionUpdate(BaseModel):
    """Region update schema."""

    name: Optional[str] = Field(None, max_length=100)
    sort_order: Optional[int] = None
    status: Optional[str] = None


class RegionResponse(RegionBase):
    """Region response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    brand_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime


# ============ City ============
class CityBase(BaseModel):
    """City base schema."""

    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    province: Optional[str] = Field(None, max_length=50)
    sort_order: int = 0


class CityCreate(CityBase):
    """City create schema."""

    region_id: UUID


class CityUpdate(BaseModel):
    """City update schema."""

    name: Optional[str] = Field(None, max_length=100)
    province: Optional[str] = Field(None, max_length=50)
    sort_order: Optional[int] = None
    status: Optional[str] = None


class CityResponse(CityBase):
    """City response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    region_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime


# ============ Store ============
class StoreBase(BaseModel):
    """Store base schema."""

    code: str = Field(..., max_length=50)
    name: str = Field(..., max_length=100)
    address: Optional[str] = Field(None, max_length=500)
    phone: Optional[str] = Field(None, max_length=20)
    opening_date: Optional[date] = None
    ownership_type: str = "direct"
    business_hours: Optional[str] = Field(None, max_length=100)
    seating_capacity: Optional[int] = None
    sort_order: int = 0


class StoreCreate(StoreBase):
    """Store create schema."""

    city_id: UUID


class StoreUpdate(BaseModel):
    """Store update schema."""

    name: Optional[str] = Field(None, max_length=100)
    address: Optional[str] = Field(None, max_length=500)
    phone: Optional[str] = Field(None, max_length=20)
    opening_date: Optional[date] = None
    ownership_type: Optional[str] = None
    business_hours: Optional[str] = Field(None, max_length=100)
    seating_capacity: Optional[int] = None
    sort_order: Optional[int] = None
    status: Optional[str] = None


class StoreResponse(StoreBase):
    """Store response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    city_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime


# ============ Full Path View ============
class StoreFullPathResponse(BaseModel):
    """Store with full organization path."""

    model_config = ConfigDict(from_attributes=True)

    store_id: UUID
    store_code: str
    store_name: str
    store_status: str
    city_id: UUID
    city_name: str
    province: Optional[str] = None
    region_id: UUID
    region_name: str
    brand_id: UUID
    brand_code: str
    brand_name: str
    enterprise_id: UUID
    enterprise_name: str
