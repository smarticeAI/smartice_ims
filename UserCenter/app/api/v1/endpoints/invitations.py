"""Invitation code management endpoints."""

from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config.database import get_db
from app.core.exceptions import NotFoundException
from app.models.account import Account
from app.models.invitation import InvitationCode
from app.models.organization import Store
from app.schemas.invitation import (
    InvitationCodeCreate,
    InvitationCodeResponse,
    InvitationCodeListResponse,
    InvitationCodeUpdate,
)
from app.api.deps import get_current_account

router = APIRouter()


@router.post("", response_model=InvitationCodeResponse)
async def create_invitation_code(
    request: InvitationCodeCreate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> InvitationCodeResponse:
    """Create a new invitation code (admin only)."""
    # Verify store exists
    result = await db.execute(
        select(Store).where(Store.id == request.store_id)
    )
    store = result.scalar_one_or_none()
    if not store:
        raise NotFoundException(detail="门店不存在")

    # Check if code already exists
    result = await db.execute(
        select(InvitationCode).where(InvitationCode.code == request.code)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="邀请码已存在")

    # Create invitation code
    invitation = InvitationCode(
        code=request.code,
        store_id=request.store_id,
        max_uses=request.max_uses,
        expires_at=request.expires_at,
        created_by=current_account.id,
    )
    db.add(invitation)
    await db.commit()
    await db.refresh(invitation)

    return InvitationCodeResponse(
        id=invitation.id,
        code=invitation.code,
        store_id=invitation.store_id,
        store_name=store.name,
        max_uses=invitation.max_uses,
        used_count=invitation.used_count,
        expires_at=invitation.expires_at,
        is_active=invitation.is_active,
        created_at=invitation.created_at,
        created_by=invitation.created_by,
    )


@router.get("", response_model=InvitationCodeListResponse)
async def list_invitation_codes(
    skip: int = 0,
    limit: int = 50,
    store_id: UUID = None,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> InvitationCodeListResponse:
    """List all invitation codes (admin only)."""
    query = select(InvitationCode).options(selectinload(InvitationCode.store))

    if store_id:
        query = query.where(InvitationCode.store_id == store_id)

    # Count total
    count_query = select(func.count()).select_from(InvitationCode)
    if store_id:
        count_query = count_query.where(InvitationCode.store_id == store_id)
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Get paginated results
    query = query.offset(skip).limit(limit).order_by(InvitationCode.created_at.desc())
    result = await db.execute(query)
    invitations = result.scalars().all()

    data = [
        InvitationCodeResponse(
            id=inv.id,
            code=inv.code,
            store_id=inv.store_id,
            store_name=inv.store.name if inv.store else None,
            max_uses=inv.max_uses,
            used_count=inv.used_count,
            expires_at=inv.expires_at,
            is_active=inv.is_active,
            created_at=inv.created_at,
            created_by=inv.created_by,
        )
        for inv in invitations
    ]

    return InvitationCodeListResponse(success=True, data=data, total=total)


@router.get("/{code_id}", response_model=InvitationCodeResponse)
async def get_invitation_code(
    code_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> InvitationCodeResponse:
    """Get a specific invitation code by ID."""
    result = await db.execute(
        select(InvitationCode)
        .options(selectinload(InvitationCode.store))
        .where(InvitationCode.id == code_id)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise NotFoundException(detail="邀请码不存在")

    return InvitationCodeResponse(
        id=invitation.id,
        code=invitation.code,
        store_id=invitation.store_id,
        store_name=invitation.store.name if invitation.store else None,
        max_uses=invitation.max_uses,
        used_count=invitation.used_count,
        expires_at=invitation.expires_at,
        is_active=invitation.is_active,
        created_at=invitation.created_at,
        created_by=invitation.created_by,
    )


@router.patch("/{code_id}", response_model=InvitationCodeResponse)
async def update_invitation_code(
    code_id: UUID,
    request: InvitationCodeUpdate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> InvitationCodeResponse:
    """Update an invitation code."""
    result = await db.execute(
        select(InvitationCode)
        .options(selectinload(InvitationCode.store))
        .where(InvitationCode.id == code_id)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise NotFoundException(detail="邀请码不存在")

    # Update fields
    if request.max_uses is not None:
        invitation.max_uses = request.max_uses
    if request.expires_at is not None:
        invitation.expires_at = request.expires_at
    if request.is_active is not None:
        invitation.is_active = request.is_active

    await db.commit()
    await db.refresh(invitation)

    return InvitationCodeResponse(
        id=invitation.id,
        code=invitation.code,
        store_id=invitation.store_id,
        store_name=invitation.store.name if invitation.store else None,
        max_uses=invitation.max_uses,
        used_count=invitation.used_count,
        expires_at=invitation.expires_at,
        is_active=invitation.is_active,
        created_at=invitation.created_at,
        created_by=invitation.created_by,
    )


@router.delete("/{code_id}")
async def delete_invitation_code(
    code_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(get_current_account),
) -> dict:
    """Delete an invitation code (soft delete by setting is_active=False)."""
    result = await db.execute(
        select(InvitationCode).where(InvitationCode.id == code_id)
    )
    invitation = result.scalar_one_or_none()

    if not invitation:
        raise NotFoundException(detail="邀请码不存在")

    # Soft delete
    invitation.is_active = False
    await db.commit()

    return {"success": True, "message": "邀请码已禁用"}
