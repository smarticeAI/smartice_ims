"""Organization management endpoints."""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config.database import get_db
from app.core.exceptions import NotFoundException, ConflictException
from app.models.account import Account
from app.models.organization import Enterprise, Brand, Region, City, Store
from app.schemas.organization import (
    EnterpriseCreate,
    EnterpriseUpdate,
    EnterpriseResponse,
    BrandCreate,
    BrandUpdate,
    BrandResponse,
    RegionCreate,
    RegionUpdate,
    RegionResponse,
    CityCreate,
    CityUpdate,
    CityResponse,
    StoreCreate,
    StoreUpdate,
    StoreResponse,
    StoreFullPathResponse,
)
from app.api.deps import get_current_account, require_super_admin, require_brand_admin

router = APIRouter()


# ============ Enterprise ============
@router.get("/enterprise", response_model=EnterpriseResponse)
async def get_enterprise(
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """Get enterprise info (single record)."""
    result = await db.execute(select(Enterprise).limit(1))
    enterprise = result.scalar_one_or_none()

    if not enterprise:
        raise NotFoundException(detail="Enterprise not configured")

    return EnterpriseResponse.model_validate(enterprise)


@router.patch("/enterprise", response_model=EnterpriseResponse)
async def update_enterprise(
    data: EnterpriseUpdate,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(require_super_admin),
):
    """Update enterprise info."""
    result = await db.execute(select(Enterprise).limit(1))
    enterprise = result.scalar_one_or_none()

    if not enterprise:
        raise NotFoundException(detail="Enterprise not configured")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(enterprise, field, value)

    await db.flush()
    await db.refresh(enterprise)

    return EnterpriseResponse.model_validate(enterprise)


# ============ Brands ============
@router.get("/brands", response_model=List[BrandResponse])
async def list_brands(
    include_closed: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """List all brands."""
    query = select(Brand).order_by(Brand.sort_order)
    if not include_closed:
        query = query.where(Brand.status == "active")

    result = await db.execute(query)
    brands = result.scalars().all()

    return [BrandResponse.model_validate(b) for b in brands]


@router.post("/brands", response_model=BrandResponse)
async def create_brand(
    data: BrandCreate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_super_admin),
):
    """Create a new brand."""
    # Check duplicate code
    existing = await db.execute(select(Brand).where(Brand.code == data.code))
    if existing.scalar_one_or_none():
        raise ConflictException(detail="Brand code already exists")

    brand = Brand(**data.model_dump(), created_by=current_account.id)
    db.add(brand)
    await db.flush()
    await db.refresh(brand)

    return BrandResponse.model_validate(brand)


@router.get("/brands/{brand_id}", response_model=BrandResponse)
async def get_brand(
    brand_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """Get brand by ID."""
    result = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = result.scalar_one_or_none()

    if not brand:
        raise NotFoundException(detail="Brand not found")

    return BrandResponse.model_validate(brand)


@router.patch("/brands/{brand_id}", response_model=BrandResponse)
async def update_brand(
    brand_id: UUID,
    data: BrandUpdate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_super_admin),
):
    """Update brand."""
    result = await db.execute(select(Brand).where(Brand.id == brand_id))
    brand = result.scalar_one_or_none()

    if not brand:
        raise NotFoundException(detail="Brand not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(brand, field, value)
    brand.updated_by = current_account.id

    await db.flush()
    await db.refresh(brand)

    return BrandResponse.model_validate(brand)


# ============ Regions ============
@router.get("/regions", response_model=List[RegionResponse])
async def list_regions(
    brand_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """List regions, optionally filtered by brand."""
    query = select(Region).where(Region.status == "active").order_by(Region.sort_order)
    if brand_id:
        query = query.where(Region.brand_id == brand_id)

    result = await db.execute(query)
    return [RegionResponse.model_validate(r) for r in result.scalars().all()]


@router.post("/regions", response_model=RegionResponse)
async def create_region(
    data: RegionCreate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_brand_admin),
):
    """Create a new region."""
    region = Region(**data.model_dump(), created_by=current_account.id)
    db.add(region)
    await db.flush()
    await db.refresh(region)
    return RegionResponse.model_validate(region)


# ============ Cities ============
@router.get("/cities", response_model=List[CityResponse])
async def list_cities(
    region_id: Optional[UUID] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """List cities, optionally filtered by region."""
    query = select(City).where(City.status == "active").order_by(City.sort_order)
    if region_id:
        query = query.where(City.region_id == region_id)

    result = await db.execute(query)
    return [CityResponse.model_validate(c) for c in result.scalars().all()]


@router.post("/cities", response_model=CityResponse)
async def create_city(
    data: CityCreate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_brand_admin),
):
    """Create a new city."""
    city = City(**data.model_dump(), created_by=current_account.id)
    db.add(city)
    await db.flush()
    await db.refresh(city)
    return CityResponse.model_validate(city)


# ============ Stores ============
@router.get("/stores", response_model=List[StoreResponse])
async def list_stores(
    city_id: Optional[UUID] = Query(None),
    brand_id: Optional[UUID] = Query(None),
    status: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """List stores with filters."""
    query = select(Store).order_by(Store.sort_order)

    if city_id:
        query = query.where(Store.city_id == city_id)
    if status:
        query = query.where(Store.status == status)
    if brand_id:
        query = (
            query.join(City, Store.city_id == City.id)
            .join(Region, City.region_id == Region.id)
            .where(Region.brand_id == brand_id)
        )

    result = await db.execute(query)
    return [StoreResponse.model_validate(s) for s in result.scalars().all()]


@router.post("/stores", response_model=StoreResponse)
async def create_store(
    data: StoreCreate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_brand_admin),
):
    """Create a new store."""
    # Check duplicate code
    existing = await db.execute(select(Store).where(Store.code == data.code))
    if existing.scalar_one_or_none():
        raise ConflictException(detail="Store code already exists")

    store = Store(**data.model_dump(), created_by=current_account.id)
    db.add(store)
    await db.flush()
    await db.refresh(store)
    return StoreResponse.model_validate(store)


@router.get("/stores/{store_id}", response_model=StoreResponse)
async def get_store(
    store_id: UUID,
    db: AsyncSession = Depends(get_db),
    _: Account = Depends(get_current_account),
):
    """Get store by ID."""
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()

    if not store:
        raise NotFoundException(detail="Store not found")

    return StoreResponse.model_validate(store)


@router.patch("/stores/{store_id}", response_model=StoreResponse)
async def update_store(
    store_id: UUID,
    data: StoreUpdate,
    db: AsyncSession = Depends(get_db),
    current_account: Account = Depends(require_brand_admin),
):
    """Update store."""
    result = await db.execute(select(Store).where(Store.id == store_id))
    store = result.scalar_one_or_none()

    if not store:
        raise NotFoundException(detail="Store not found")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(store, field, value)
    store.updated_by = current_account.id

    await db.flush()
    await db.refresh(store)

    return StoreResponse.model_validate(store)
