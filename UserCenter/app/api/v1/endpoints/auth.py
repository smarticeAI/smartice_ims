"""Authentication endpoints."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config.database import get_db
from app.core.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    create_refresh_token,
    verify_token,
)
from app.core.exceptions import UnauthorizedException, NotFoundException
from app.models.account import Account
from app.models.employee import Employee
from app.models.organization import Store, City, Region, Brand
from app.models.invitation import InvitationCode, InvitationUsage
from app.schemas.auth import (
    LoginRequest,
    Token,
    RefreshTokenRequest,
    CurrentUserResponse,
    RegisterRequest,
    RegisterResponse,
)
from app.api.deps import get_current_account

router = APIRouter()


@router.post("/login", response_model=Token)
async def login(
    request: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """User login with username/phone and password."""
    # Build query based on provided credentials
    conditions = []
    if request.username:
        conditions.append(Account.username == request.username)
    if request.phone:
        conditions.append(Account.phone == request.phone)

    if not conditions:
        raise UnauthorizedException(detail="Username or phone is required")

    # Query account
    result = await db.execute(
        select(Account)
        .options(selectinload(Account.employee))
        .where(or_(*conditions))
    )
    account = result.scalar_one_or_none()

    # Verify credentials
    if not account or not account.password_hash:
        raise UnauthorizedException(detail="Invalid credentials")

    if not verify_password(request.password, account.password_hash):
        # Increment failed login count
        account.failed_login_count += 1
        await db.commit()
        raise UnauthorizedException(detail="Invalid credentials")

    # Check account status
    if account.status == "pending":
        raise UnauthorizedException(detail="账号正在审核中，请等待管理员审核通过后再登录")
    if account.status != "active":
        raise UnauthorizedException(detail=f"Account is {account.status}")

    # Update login info
    account.last_login_at = datetime.utcnow()
    account.failed_login_count = 0

    # Generate tokens
    access_token = create_access_token(subject=str(account.id))
    refresh_token = create_refresh_token(subject=str(account.id))

    return Token(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=Token)
async def refresh_token(
    request: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
) -> Token:
    """Refresh access token using refresh token."""
    payload = verify_token(request.refresh_token, token_type="refresh")

    if not payload:
        raise UnauthorizedException(detail="Invalid refresh token")

    account_id = payload.get("sub")

    # Verify account still exists and is active
    result = await db.execute(
        select(Account).where(Account.id == UUID(account_id), Account.status == "active")
    )
    account = result.scalar_one_or_none()

    if not account:
        raise UnauthorizedException(detail="Account not found or disabled")

    # Generate new tokens
    access_token = create_access_token(subject=str(account.id))
    new_refresh_token = create_refresh_token(subject=str(account.id))

    return Token(access_token=access_token, refresh_token=new_refresh_token)


@router.get("/me", response_model=CurrentUserResponse)
async def get_current_user_info(
    account: Account = Depends(get_current_account),
    db: AsyncSession = Depends(get_db),
) -> CurrentUserResponse:
    """Get current authenticated user information."""
    response = CurrentUserResponse(
        account_id=account.id,
        username=account.username,
        phone=account.phone,
        status=account.status,
    )

    # Add employee info if linked
    if account.employee:
        employee = account.employee
        response.employee_id = employee.id
        response.employee_no = employee.employee_no
        response.name = employee.name
        response.employment_status = employee.employment_status
        response.position_code = employee.position_code
        response.store_id = employee.store_id

        # Get store and brand info
        result = await db.execute(
            select(Store, Brand)
            .join(City, Store.city_id == City.id)
            .join(Region, City.region_id == Region.id)
            .join(Brand, Region.brand_id == Brand.id)
            .where(Store.id == employee.store_id)
        )
        row = result.first()
        if row:
            store, brand = row
            response.store_name = store.name
            response.brand_id = brand.id
            response.brand_name = brand.name

    return response


@router.post("/logout")
async def logout(
    account: Account = Depends(get_current_account),
) -> dict:
    """User logout (client should discard tokens)."""
    # In a stateless JWT system, logout is handled client-side
    # Here we just return success
    return {"success": True, "message": "Logged out successfully"}


@router.post("/register", response_model=RegisterResponse)
async def register(
    request: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> RegisterResponse:
    """User registration with invitation code.

    New accounts are created with status='pending' and require admin approval.
    """
    # 1. Validate invitation code
    result = await db.execute(
        select(InvitationCode)
        .options(selectinload(InvitationCode.store))
        .where(InvitationCode.code == request.invitation_code)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise HTTPException(status_code=400, detail="邀请码不存在")

    if not invitation.is_active:
        raise HTTPException(status_code=400, detail="邀请码已被禁用")

    if invitation.used_count >= invitation.max_uses:
        raise HTTPException(status_code=400, detail="邀请码已达到使用上限")

    if invitation.expires_at and invitation.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="邀请码已过期")

    # 2. Check if phone already registered
    result = await db.execute(
        select(Account).where(Account.phone == request.phone)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="该手机号已被注册")

    # 3. Create employee record (status=pending)
    employee = Employee(
        name=request.username,
        phone=request.phone,
        store_id=invitation.store_id,
        employment_status="pending",
        hire_date=datetime.utcnow().date(),
    )
    db.add(employee)
    await db.flush()  # Get employee.id

    # 4. Create account (status=pending, linked to employee)
    account = Account(
        phone=request.phone,
        password_hash=get_password_hash(request.password),
        employee_id=employee.id,
        invitation_id=invitation.id,
        status="pending",
    )
    db.add(account)
    await db.flush()  # Get account.id

    # 5. Update invitation usage count
    invitation.used_count += 1

    # 6. Record invitation usage for audit
    usage = InvitationUsage(
        invitation_id=invitation.id,
        account_id=account.id,
    )
    db.add(usage)

    await db.commit()

    return RegisterResponse(
        success=True,
        message="注册成功，请等待管理员审核",
        account_id=account.id,
    )
