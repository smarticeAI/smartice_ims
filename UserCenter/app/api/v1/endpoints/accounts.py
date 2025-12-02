"""Account management endpoints."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.database import get_db
from app.core.security import get_password_hash, verify_password
from app.core.exceptions import (
    NotFoundException,
    ConflictException,
    BadRequestException,
    ForbiddenException,
)
from app.models.account import Account
from app.models.role import AccountRole, Role
from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountWithRolesResponse,
    AccountPasswordUpdate,
    AccountPasswordReset,
)
from app.schemas.common import PaginatedResponse, MessageResponse
from app.api.deps import get_current_account, require_brand_admin

router = APIRouter()


@router.get("", response_model=PaginatedResponse[AccountResponse])
async def list_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_brand_admin),
):
    """List all accounts with pagination."""
    query = select(Account)

    if status:
        query = query.where(Account.status == status)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar()

    # Paginate
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    accounts = result.scalars().all()

    return PaginatedResponse(
        data=[AccountResponse.model_validate(a) for a in accounts],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size,
    )


@router.post("", response_model=AccountResponse)
async def create_account(
    data: AccountCreate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_brand_admin),
):
    """Create a new account."""
    # Check for duplicates
    if data.username:
        existing = await db.execute(
            select(Account).where(Account.username == data.username)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(detail="Username already exists")

    if data.phone:
        existing = await db.execute(
            select(Account).where(Account.phone == data.phone)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(detail="Phone already exists")

    account = Account(
        account_type=data.account_type,
        username=data.username,
        phone=data.phone,
        email=data.email,
        employee_id=data.employee_id,
        password_hash=get_password_hash(data.password),
        created_by=current_account.id,
    )

    db.add(account)
    await db.flush()
    await db.refresh(account)

    return AccountResponse.model_validate(account)


@router.get("/{account_id}", response_model=AccountWithRolesResponse)
async def get_account(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_brand_admin),
):
    """Get account by ID with roles."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()

    if not account:
        raise NotFoundException(detail="Account not found")

    # Get roles
    roles_result = await db.execute(
        select(Role.code)
        .join(AccountRole, Role.id == AccountRole.role_id)
        .where(AccountRole.account_id == account_id, AccountRole.is_active == True)
    )
    roles = [r[0] for r in roles_result.all()]

    response = AccountWithRolesResponse.model_validate(account)
    response.roles = roles
    return response


@router.patch("/{account_id}", response_model=AccountResponse)
async def update_account(
    account_id: UUID,
    data: AccountUpdate,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_brand_admin),
):
    """Update account."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()

    if not account:
        raise NotFoundException(detail="Account not found")

    # Check for duplicates
    if data.username and data.username != account.username:
        existing = await db.execute(
            select(Account).where(Account.username == data.username)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(detail="Username already exists")

    if data.phone and data.phone != account.phone:
        existing = await db.execute(
            select(Account).where(Account.phone == data.phone)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(detail="Phone already exists")

    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(account, field, value)

    await db.flush()
    await db.refresh(account)

    return AccountResponse.model_validate(account)


@router.post("/{account_id}/reset-password", response_model=MessageResponse)
async def reset_account_password(
    account_id: UUID,
    data: AccountPasswordReset,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_brand_admin),
):
    """Admin reset account password."""
    result = await db.execute(select(Account).where(Account.id == account_id))
    account = result.scalar_one_or_none()

    if not account:
        raise NotFoundException(detail="Account not found")

    account.password_hash = get_password_hash(data.new_password)

    return MessageResponse(message="Password reset successfully")


@router.post("/me/change-password", response_model=MessageResponse)
async def change_own_password(
    data: AccountPasswordUpdate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
):
    """Change own password."""
    if not current_account.password_hash:
        raise BadRequestException(detail="No password set")

    if not verify_password(data.old_password, current_account.password_hash):
        raise BadRequestException(detail="Invalid old password")

    current_account.password_hash = get_password_hash(data.new_password)

    return MessageResponse(message="Password changed successfully")
