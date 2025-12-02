"""Admin endpoints for account review and management."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload

from app.config.database import get_db
from app.core.exceptions import NotFoundException, BadRequestException, ForbiddenException
from app.models.account import Account
from app.models.employee import Employee
from app.models.role import AccountRole, Role
from app.models.organization import Store, City, Region, Brand
from app.models.invitation import InvitationCode
from app.schemas.admin import (
    PendingAccountResponse,
    ReviewRequest,
    BatchReviewRequest,
    ReviewResponse,
    BatchReviewResponse,
)
from app.schemas.common import PaginatedResponse
from app.api.deps import get_current_account, require_store_manager

router = APIRouter()


async def get_user_role_and_scope(account: Account, db: AsyncSession) -> tuple[str, Optional[UUID]]:
    """Get user's highest role and associated scope ID."""
    result = await db.execute(
        select(Role.code, Role.level)
        .join(AccountRole, Role.id == AccountRole.role_id)
        .where(
            AccountRole.account_id == account.id,
            AccountRole.is_active == True,
            Role.is_active == True,
        )
        .order_by(Role.level.asc())  # Lower level = higher privilege
    )
    roles = result.all()

    if not roles:
        return ("employee", None)

    highest_role = roles[0][0]  # role code

    # Get scope based on role
    if highest_role == "super_admin":
        return (highest_role, None)  # No scope limit
    elif highest_role == "brand_admin":
        # Get brand_id from employee's store
        if account.employee:
            store_result = await db.execute(
                select(Brand.id)
                .join(Region, Brand.id == Region.brand_id)
                .join(City, Region.id == City.region_id)
                .join(Store, City.id == Store.city_id)
                .where(Store.id == account.employee.store_id)
            )
            brand_id = store_result.scalar_one_or_none()
            return (highest_role, brand_id)
    elif highest_role == "region_manager":
        if account.employee:
            store_result = await db.execute(
                select(Region.id)
                .join(City, Region.id == City.region_id)
                .join(Store, City.id == Store.city_id)
                .where(Store.id == account.employee.store_id)
            )
            region_id = store_result.scalar_one_or_none()
            return (highest_role, region_id)
    elif highest_role == "city_manager":
        if account.employee:
            store_result = await db.execute(
                select(City.id)
                .join(Store, City.id == Store.city_id)
                .where(Store.id == account.employee.store_id)
            )
            city_id = store_result.scalar_one_or_none()
            return (highest_role, city_id)
    elif highest_role == "store_manager":
        if account.employee:
            return (highest_role, account.employee.store_id)

    return ("employee", None)


async def filter_by_scope(
    query,
    role: str,
    scope_id: Optional[UUID],
    db: AsyncSession,
):
    """Apply scope filter to query based on user's role."""
    if role == "super_admin":
        return query  # No filter

    if role == "brand_admin" and scope_id:
        # Filter by brand
        store_ids_query = (
            select(Store.id)
            .join(City, Store.city_id == City.id)
            .join(Region, City.region_id == Region.id)
            .where(Region.brand_id == scope_id)
        )
        store_ids_result = await db.execute(store_ids_query)
        store_ids = [r[0] for r in store_ids_result.all()]
        return query.where(Employee.store_id.in_(store_ids))

    if role == "region_manager" and scope_id:
        store_ids_query = (
            select(Store.id)
            .join(City, Store.city_id == City.id)
            .where(City.region_id == scope_id)
        )
        store_ids_result = await db.execute(store_ids_query)
        store_ids = [r[0] for r in store_ids_result.all()]
        return query.where(Employee.store_id.in_(store_ids))

    if role == "city_manager" and scope_id:
        store_ids_query = select(Store.id).where(Store.city_id == scope_id)
        store_ids_result = await db.execute(store_ids_query)
        store_ids = [r[0] for r in store_ids_result.all()]
        return query.where(Employee.store_id.in_(store_ids))

    if role == "store_manager" and scope_id:
        return query.where(Employee.store_id == scope_id)

    # Default: no access
    return query.where(False)


@router.get("/accounts/pending", response_model=PaginatedResponse[PendingAccountResponse])
async def list_pending_accounts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_store_manager),
):
    """
    Get list of pending accounts awaiting review.

    Results are filtered based on the reviewer's role and organizational scope.
    """
    # Get current user's role and scope
    role, scope_id = await get_user_role_and_scope(current_account, db)

    # Base query: pending accounts with employee info
    query = (
        select(Account)
        .options(
            selectinload(Account.employee).selectinload(Employee.store),
            selectinload(Account.invitation),
        )
        .join(Employee, Account.employee_id == Employee.id)
        .where(Account.status == "pending")
    )

    # Apply scope filter
    query = await filter_by_scope(query, role, scope_id, db)

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    # Paginate
    query = query.order_by(Account.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)

    result = await db.execute(query)
    accounts = result.scalars().all()

    # Build response
    data = []
    for account in accounts:
        data.append(
            PendingAccountResponse(
                account_id=account.id,
                phone=account.phone,
                username=account.username,
                status=account.status,
                created_at=account.created_at,
                employee_id=account.employee.id,
                employee_name=account.employee.name,
                invitation_code=account.invitation.code if account.invitation else None,
                store_id=account.employee.store_id,
                store_name=account.employee.store.name if account.employee.store else "Unknown",
            )
        )

    return PaginatedResponse(
        data=data,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=(total + page_size - 1) // page_size if total > 0 else 0,
    )


async def check_review_permission(
    account_to_review: Account,
    current_account: Account,
    db: AsyncSession,
) -> bool:
    """Check if current user has permission to review the target account."""
    role, scope_id = await get_user_role_and_scope(current_account, db)

    if role == "super_admin":
        return True

    if not account_to_review.employee:
        return False

    target_store_id = account_to_review.employee.store_id

    if role == "brand_admin" and scope_id:
        # Check if target store belongs to the brand
        result = await db.execute(
            select(Store.id)
            .join(City, Store.city_id == City.id)
            .join(Region, City.region_id == Region.id)
            .where(Region.brand_id == scope_id, Store.id == target_store_id)
        )
        return result.scalar_one_or_none() is not None

    if role == "region_manager" and scope_id:
        result = await db.execute(
            select(Store.id)
            .join(City, Store.city_id == City.id)
            .where(City.region_id == scope_id, Store.id == target_store_id)
        )
        return result.scalar_one_or_none() is not None

    if role == "city_manager" and scope_id:
        result = await db.execute(
            select(Store.id).where(Store.city_id == scope_id, Store.id == target_store_id)
        )
        return result.scalar_one_or_none() is not None

    if role == "store_manager" and scope_id:
        return target_store_id == scope_id

    return False


@router.post("/accounts/{account_id}/review", response_model=ReviewResponse)
async def review_account(
    account_id: UUID,
    data: ReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_store_manager),
):
    """
    Review a pending account (approve or reject).

    - **approve**: Sets account status to 'active' and employee status to 'active'
    - **reject**: Sets account status to 'disabled' and employee status to 'terminated'
    """
    # Get account with employee
    result = await db.execute(
        select(Account)
        .options(selectinload(Account.employee))
        .where(Account.id == account_id)
    )
    account = result.scalar_one_or_none()

    if not account:
        raise NotFoundException(detail="账号不存在")

    if account.status != "pending":
        raise BadRequestException(detail="该账号非待审核状态")

    # Check permission
    has_permission = await check_review_permission(account, current_account, db)
    if not has_permission:
        raise ForbiddenException(detail="无权审核该账号")

    # Process review
    if data.action == "approve":
        account.status = "active"
        if account.employee:
            account.employee.employment_status = "active"
        message = "审核通过"
    else:
        account.status = "disabled"
        account.status_reason = data.reason
        if account.employee:
            account.employee.employment_status = "terminated"
            account.employee.resign_reason = data.reason
        message = "审核已拒绝"

    await db.commit()

    return ReviewResponse(
        success=True,
        message=message,
        account_id=account_id,
    )


@router.post("/accounts/batch-review", response_model=BatchReviewResponse)
async def batch_review_accounts(
    data: BatchReviewRequest,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_store_manager),
):
    """
    Batch review multiple pending accounts.

    All accounts must be in 'pending' status and within reviewer's scope.
    """
    processed = 0
    failed = 0
    details = []

    for account_id in data.account_ids:
        try:
            # Get account
            result = await db.execute(
                select(Account)
                .options(selectinload(Account.employee))
                .where(Account.id == account_id)
            )
            account = result.scalar_one_or_none()

            if not account:
                failed += 1
                details.append({"account_id": str(account_id), "error": "账号不存在"})
                continue

            if account.status != "pending":
                failed += 1
                details.append({"account_id": str(account_id), "error": "非待审核状态"})
                continue

            # Check permission
            has_permission = await check_review_permission(account, current_account, db)
            if not has_permission:
                failed += 1
                details.append({"account_id": str(account_id), "error": "无权审核"})
                continue

            # Process
            if data.action == "approve":
                account.status = "active"
                if account.employee:
                    account.employee.employment_status = "active"
            else:
                account.status = "disabled"
                account.status_reason = data.reason
                if account.employee:
                    account.employee.employment_status = "terminated"
                    account.employee.resign_reason = data.reason

            processed += 1

        except Exception as e:
            failed += 1
            details.append({"account_id": str(account_id), "error": str(e)})

    await db.commit()

    action_text = "通过" if data.action == "approve" else "拒绝"
    message = f"批量审核{action_text}完成：成功 {processed} 个"
    if failed > 0:
        message += f"，失败 {failed} 个"

    return BatchReviewResponse(
        success=failed == 0,
        message=message,
        processed=processed,
        failed=failed,
        details=details if failed > 0 else None,
    )
