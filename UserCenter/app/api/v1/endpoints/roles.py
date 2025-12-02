"""Role management endpoints."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.database import get_db
from app.core.exceptions import NotFoundException, ConflictException, BadRequestException
from app.models.account import Account
from app.models.role import Role, AccountRole
from app.schemas.role import (
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    AccountRoleAssign,
    AccountRoleRevoke,
    AccountRoleResponse,
)
from app.schemas.common import MessageResponse
from app.api.deps import get_current_account, require_super_admin, require_brand_admin

router = APIRouter()


@router.get("", response_model=List[RoleResponse])
async def list_roles(
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """List all roles."""
    result = await db.execute(select(Role).order_by(Role.level))
    roles = result.scalars().all()
    return [RoleResponse.model_validate(r) for r in roles]


@router.post("", response_model=RoleResponse)
async def create_role(
    data: RoleCreate,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_super_admin),
):
    """Create a new role (non-system only)."""
    # Check duplicate code
    existing = await db.execute(select(Role).where(Role.code == data.code))
    if existing.scalar_one_or_none():
        raise ConflictException(detail="Role code already exists")

    role = Role(**data.model_dump())
    db.add(role)
    await db.flush()
    await db.refresh(role)

    return RoleResponse.model_validate(role)


@router.get("/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """Get role by ID."""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()

    if not role:
        raise NotFoundException(detail="Role not found")

    return RoleResponse.model_validate(role)


@router.patch("/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: UUID,
    data: RoleUpdate,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_super_admin),
):
    """Update role (non-system roles only)."""
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()

    if not role:
        raise NotFoundException(detail="Role not found")

    if role.is_system:
        raise BadRequestException(detail="Cannot modify system role")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(role, field, value)

    await db.flush()
    await db.refresh(role)

    return RoleResponse.model_validate(role)


# ============ Account Role Assignment ============
@router.post("/assign", response_model=AccountRoleResponse)
async def assign_role_to_account(
    data: AccountRoleAssign,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_brand_admin),
):
    """Assign a role to an account."""
    # Verify account exists
    account_result = await db.execute(select(Account).where(Account.id == data.account_id))
    if not account_result.scalar_one_or_none():
        raise NotFoundException(detail="Account not found")

    # Verify role exists
    role_result = await db.execute(select(Role).where(Role.id == data.role_id))
    role = role_result.scalar_one_or_none()
    if not role:
        raise NotFoundException(detail="Role not found")

    # Check if already assigned
    existing = await db.execute(
        select(AccountRole).where(
            AccountRole.account_id == data.account_id,
            AccountRole.role_id == data.role_id,
        )
    )
    existing_ar = existing.scalar_one_or_none()

    if existing_ar:
        # Reactivate if inactive
        if not existing_ar.is_active:
            existing_ar.is_active = True
            await db.flush()
            await db.refresh(existing_ar)

        response = AccountRoleResponse.model_validate(existing_ar)
        response.role_code = role.code
        response.role_name = role.name
        return response

    # Create new assignment
    account_role = AccountRole(
        account_id=data.account_id,
        role_id=data.role_id,
        granted_by=current_account.id,
    )
    db.add(account_role)
    await db.flush()
    await db.refresh(account_role)

    response = AccountRoleResponse.model_validate(account_role)
    response.role_code = role.code
    response.role_name = role.name
    return response


@router.post("/revoke", response_model=MessageResponse)
async def revoke_role_from_account(
    data: AccountRoleRevoke,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_brand_admin),
):
    """Revoke a role from an account."""
    result = await db.execute(
        select(AccountRole).where(
            AccountRole.account_id == data.account_id,
            AccountRole.role_id == data.role_id,
        )
    )
    account_role = result.scalar_one_or_none()

    if not account_role:
        raise NotFoundException(detail="Role assignment not found")

    account_role.is_active = False

    return MessageResponse(message="Role revoked successfully")


@router.get("/account/{account_id}", response_model=List[AccountRoleResponse])
async def get_account_roles(
    account_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """Get all roles for an account."""
    result = await db.execute(
        select(AccountRole, Role.code, Role.name)
        .join(Role, AccountRole.role_id == Role.id)
        .where(AccountRole.account_id == account_id, AccountRole.is_active == True)
    )
    rows = result.all()

    responses = []
    for row in rows:
        ar = AccountRoleResponse.model_validate(row.AccountRole)
        ar.role_code = row.code
        ar.role_name = row.name
        responses.append(ar)

    return responses
