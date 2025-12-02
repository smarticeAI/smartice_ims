"""API dependencies for authentication and authorization."""

import uuid
from typing import List, Callable

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config.database import get_db
from app.core.security import verify_token
from app.core.exceptions import UnauthorizedException, ForbiddenException
from app.models.account import Account
from app.models.employee import Employee
from app.models.role import AccountRole, Role

security = HTTPBearer()


async def get_current_account(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Account:
    """Get current authenticated account from JWT token."""
    token = credentials.credentials
    payload = verify_token(token)

    if payload is None:
        raise UnauthorizedException(detail="Invalid or expired token")

    account_id = payload.get("sub")
    if not account_id:
        raise UnauthorizedException(detail="Invalid token payload")

    result = await db.execute(
        select(Account)
        .options(selectinload(Account.employee))
        .where(Account.id == uuid.UUID(account_id), Account.status == "active")
    )
    account = result.scalar_one_or_none()

    if not account:
        raise UnauthorizedException(detail="Account not found or disabled")

    return account


async def get_current_employee(
    account: Account = Depends(get_current_account),
) -> Employee:
    """Get current employee from authenticated account."""
    if not account.employee:
        raise ForbiddenException(detail="No employee profile linked to this account")
    return account.employee


def require_roles(allowed_roles: List[str]) -> Callable:
    """Factory for role-based access control dependency."""

    async def role_checker(
        account: Account = Depends(get_current_account),
        db: AsyncSession = Depends(get_db),
    ) -> Account:
        # Get user's roles
        result = await db.execute(
            select(Role.code)
            .join(AccountRole, Role.id == AccountRole.role_id)
            .where(
                AccountRole.account_id == account.id,
                AccountRole.is_active == True,
                Role.is_active == True,
            )
        )
        user_roles = [r[0] for r in result.all()]

        # Check if any role matches
        if not any(role in allowed_roles for role in user_roles):
            raise ForbiddenException(detail="Permission denied")

        return account

    return role_checker


# Predefined role checkers
require_super_admin = require_roles(["super_admin"])
require_brand_admin = require_roles(["super_admin", "brand_admin"])
require_region_manager = require_roles(["super_admin", "brand_admin", "region_manager"])
require_city_manager = require_roles(["super_admin", "brand_admin", "region_manager", "city_manager"])
require_store_manager = require_roles(["super_admin", "brand_admin", "region_manager", "city_manager", "store_manager"])
