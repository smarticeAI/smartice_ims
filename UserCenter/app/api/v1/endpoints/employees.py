"""Employee management endpoints."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config.database import get_db
from app.core.exceptions import NotFoundException, ConflictException
from app.models.account import Account
from app.models.employee import Employee
from app.models.organization import Store, City, Region, Brand
from app.schemas.employee import (
    EmployeeCreate,
    EmployeeUpdate,
    EmployeeResponse,
    EmployeeWithStoreResponse,
)
from app.schemas.common import PaginatedResponse
from app.api.deps import get_current_account, require_store_manager

router = APIRouter()


@router.get("", response_model=PaginatedResponse[EmployeeWithStoreResponse])
async def list_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    store_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_store_manager),
):
    """List employees with pagination and filters."""
    query = (
        select(Employee, Store.name.label("store_name"), Brand.name.label("brand_name"))
        .join(Store, Employee.store_id == Store.id)
        .join(City, Store.city_id == City.id)
        .join(Region, City.region_id == Region.id)
        .join(Brand, Region.brand_id == Brand.id)
    )

    if store_id:
        query = query.where(Employee.store_id == store_id)
    if status:
        query = query.where(Employee.employment_status == status)
    if search:
        query = query.where(Employee.name.ilike(f"%{search}%"))

    # Count total
    count_query = select(func.count()).select_from(
        select(Employee)
        .where(
            (Employee.store_id == store_id) if store_id else True,
            (Employee.employment_status == status) if status else True,
        )
        .subquery()
    )
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    rows = result.all()

    employees = []
    for row in rows:
        emp = EmployeeWithStoreResponse.model_validate(row.Employee)
        emp.store_name = row.store_name
        emp.brand_name = row.brand_name
        employees.append(emp)

    return PaginatedResponse(
        data=employees,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


@router.post("", response_model=EmployeeResponse)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_store_manager),
):
    """Create a new employee."""
    # Check for duplicate employee_no
    if data.employee_no:
        existing = await db.execute(
            select(Employee).where(Employee.employee_no == data.employee_no)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(detail="Employee number already exists")

    # Verify store exists
    store_result = await db.execute(select(Store).where(Store.id == data.store_id))
    if not store_result.scalar_one_or_none():
        raise NotFoundException(detail="Store not found")

    employee = Employee(
        **data.model_dump(),
        created_by=current_account.id,
    )

    db.add(employee)
    await db.flush()
    await db.refresh(employee)

    return EmployeeResponse.model_validate(employee)


@router.get("/{employee_id}", response_model=EmployeeWithStoreResponse)
async def get_employee(
    employee_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_store_manager),
):
    """Get employee by ID."""
    result = await db.execute(
        select(Employee, Store.name.label("store_name"), Brand.name.label("brand_name"))
        .join(Store, Employee.store_id == Store.id)
        .join(City, Store.city_id == City.id)
        .join(Region, City.region_id == Region.id)
        .join(Brand, Region.brand_id == Brand.id)
        .where(Employee.id == employee_id)
    )
    row = result.first()

    if not row:
        raise NotFoundException(detail="Employee not found")

    emp = EmployeeWithStoreResponse.model_validate(row.Employee)
    emp.store_name = row.store_name
    emp.brand_name = row.brand_name
    return emp


@router.patch("/{employee_id}", response_model=EmployeeResponse)
async def update_employee(
    employee_id: UUID,
    data: EmployeeUpdate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_store_manager),
):
    """Update employee."""
    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()

    if not employee:
        raise NotFoundException(detail="Employee not found")

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(employee, field, value)

    employee.updated_by = current_account.id

    await db.flush()
    await db.refresh(employee)

    return EmployeeResponse.model_validate(employee)


@router.post("/{employee_id}/resign", response_model=EmployeeResponse)
async def resign_employee(
    employee_id: UUID,
    resign_reason: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_store_manager),
):
    """Mark employee as resigned."""
    from datetime import date

    result = await db.execute(select(Employee).where(Employee.id == employee_id))
    employee = result.scalar_one_or_none()

    if not employee:
        raise NotFoundException(detail="Employee not found")

    employee.employment_status = "resigned"
    employee.resign_date = date.today()
    employee.resign_reason = resign_reason
    employee.updated_by = current_account.id

    # Disable associated account
    if employee.account:
        employee.account.status = "disabled"
        employee.account.status_reason = "Employee resigned"

    await db.flush()
    await db.refresh(employee)

    return EmployeeResponse.model_validate(employee)
