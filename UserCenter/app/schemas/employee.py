"""Employee schemas."""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


class EmployeeBase(BaseModel):
    """Employee base schema."""

    name: str = Field(..., max_length=50)
    employee_no: Optional[str] = Field(None, max_length=20)
    name_pinyin: Optional[str] = Field(None, max_length=100)
    gender: Optional[str] = Field(None, pattern="^(male|female)$")
    birth_date: Optional[date] = None
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)
    photo_url: Optional[str] = Field(None, max_length=500)

    employment_type: str = "full_time"
    hire_date: date
    probation_end_date: Optional[date] = None

    position_code: Optional[str] = Field(None, max_length=30)
    level_code: Optional[str] = Field(None, max_length=10)


class EmployeeCreate(EmployeeBase):
    """Employee create schema."""

    store_id: UUID
    mentor_id: Optional[UUID] = None


class EmployeeUpdate(BaseModel):
    """Employee update schema."""

    name: Optional[str] = Field(None, max_length=50)
    name_pinyin: Optional[str] = Field(None, max_length=100)
    gender: Optional[str] = Field(None, pattern="^(male|female)$")
    birth_date: Optional[date] = None
    phone: Optional[str] = Field(None, max_length=20)
    email: Optional[str] = Field(None, max_length=100)
    photo_url: Optional[str] = Field(None, max_length=500)

    employment_status: Optional[str] = None
    employment_type: Optional[str] = None
    probation_end_date: Optional[date] = None
    resign_date: Optional[date] = None
    resign_reason: Optional[str] = Field(None, max_length=200)

    store_id: Optional[UUID] = None
    position_code: Optional[str] = Field(None, max_length=30)
    level_code: Optional[str] = Field(None, max_length=10)
    mentor_id: Optional[UUID] = None


class EmployeeResponse(EmployeeBase):
    """Employee response schema."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    store_id: UUID
    mentor_id: Optional[UUID] = None
    employment_status: str
    resign_date: Optional[date] = None
    resign_reason: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class EmployeeWithStoreResponse(EmployeeResponse):
    """Employee response with store info."""

    store_name: Optional[str] = None
    brand_name: Optional[str] = None
