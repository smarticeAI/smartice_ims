"""Seed data initialization script for UserCenter."""

import asyncio
import sys
from pathlib import Path

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import select
from app.config.database import AsyncSessionLocal
from app.core.security import get_password_hash
from app.models.organization import Enterprise, Brand, Region, City, Store
from app.models.employee import Employee
from app.models.account import Account
from app.models.role import Role, AccountRole


async def seed_enterprise():
    """Create enterprise (top level, single record)."""
    async with AsyncSessionLocal() as db:
        # Check if already exists
        result = await db.execute(select(Enterprise).limit(1))
        if result.scalar_one_or_none():
            print("Enterprise already exists, skipping...")
            return

        enterprise = Enterprise(
            code="YDDX",
            name="有点东西餐饮集团",
            short_name="有点东西",
            status="active",
        )
        db.add(enterprise)
        await db.commit()
        print("Created enterprise: 有点东西餐饮集团 (YDDX)")


async def seed_roles():
    """Create predefined system roles."""
    async with AsyncSessionLocal() as db:
        # Check if roles exist
        result = await db.execute(select(Role).limit(1))
        if result.scalar_one_or_none():
            print("Roles already exist, skipping...")
            return

        roles = [
            Role(code="super_admin", name="超级管理员", scope="global", level=0, is_system=True),
            Role(code="brand_admin", name="品牌管理员", scope="brand", level=1, is_system=True),
            Role(code="region_manager", name="区域经理", scope="region", level=2, is_system=True),
            Role(code="city_manager", name="城市经理", scope="city", level=3, is_system=True),
            Role(code="store_manager", name="店长", scope="store", level=4, is_system=True),
            Role(code="supervisor", name="主管", scope="store", level=5, is_system=True),
            Role(code="trainer", name="培训师", scope="store", level=5, is_system=True),
            Role(code="employee", name="员工", scope="self", level=6, is_system=True),
        ]

        db.add_all(roles)
        await db.commit()
        print(f"Created {len(roles)} system roles")


async def seed_organization():
    """Create brands, regions, cities, stores."""
    async with AsyncSessionLocal() as db:
        # Get enterprise
        result = await db.execute(select(Enterprise).limit(1))
        enterprise = result.scalar_one_or_none()
        if not enterprise:
            print("Enterprise not found, run seed_enterprise first")
            return

        # Check if brands exist
        result = await db.execute(select(Brand).limit(1))
        if result.scalar_one_or_none():
            print("Brands already exist, skipping...")
            return

        # Create brands
        brand_ybl = Brand(
            enterprise_id=enterprise.id,
            code="YBL",
            name="野百灵贵州酸汤火锅",
            short_name="野百灵",
            sort_order=1,
        )
        brand_njx = Brand(
            enterprise_id=enterprise.id,
            code="NJX",
            name="宁桂杏山野烤肉",
            short_name="宁桂杏",
            sort_order=2,
        )
        db.add_all([brand_ybl, brand_njx])
        await db.flush()

        # Create regions
        region_sc_ybl = Region(brand_id=brand_ybl.id, code="SC", name="四川区域", sort_order=1)
        region_sc_njx = Region(brand_id=brand_njx.id, code="SC", name="四川区域", sort_order=1)
        region_js_njx = Region(brand_id=brand_njx.id, code="JS", name="江苏区域", sort_order=2)
        db.add_all([region_sc_ybl, region_sc_njx, region_js_njx])
        await db.flush()

        # Create cities
        city_my_ybl = City(region_id=region_sc_ybl.id, code="MY", name="绵阳", province="四川省", sort_order=1)
        city_dy_ybl = City(region_id=region_sc_ybl.id, code="DY", name="德阳", province="四川省", sort_order=2)
        city_my_njx = City(region_id=region_sc_njx.id, code="MY", name="绵阳", province="四川省", sort_order=1)
        city_jy_njx = City(region_id=region_sc_njx.id, code="JY", name="江油", province="四川省", sort_order=2)
        city_cs_njx = City(region_id=region_js_njx.id, code="CS", name="常熟", province="江苏省", sort_order=1)
        db.add_all([city_my_ybl, city_dy_ybl, city_my_njx, city_jy_njx, city_cs_njx])
        await db.flush()

        # Create stores
        stores = [
            # 野百灵门店
            Store(city_id=city_my_ybl.id, code="YBL-MY-001", name="野百灵绵阳1958店", address="绵阳市涪城区", sort_order=1),
            Store(city_id=city_dy_ybl.id, code="YBL-DY-001", name="野百灵德阳首店", address="德阳市旌阳区", sort_order=2),
            # 宁桂杏门店
            Store(city_id=city_my_njx.id, code="NJX-MY-001", name="宁桂杏绵阳1958店", address="绵阳市涪城区", sort_order=1),
            Store(city_id=city_my_njx.id, code="NJX-MY-002", name="宁桂杏Young Park店", address="绵阳市涪城区", sort_order=2),
            Store(city_id=city_jy_njx.id, code="NJX-JY-001", name="宁桂杏江油首店", address="江油市", sort_order=3),
            Store(city_id=city_cs_njx.id, code="NJX-CS-001", name="宁桂杏常熟首店", address="常熟市", status="preparing", sort_order=4),
        ]
        db.add_all(stores)
        await db.commit()

        print(f"Created 2 brands, 3 regions, 5 cities, 6 stores")


async def seed_admin():
    """Create super admin account."""
    from datetime import date

    async with AsyncSessionLocal() as db:
        # Check if admin exists
        result = await db.execute(select(Account).where(Account.username == "admin"))
        if result.scalar_one_or_none():
            print("Admin account already exists, skipping...")
            return

        # Get first store
        result = await db.execute(select(Store).limit(1))
        store = result.scalar_one_or_none()
        if not store:
            print("No store found, run seed_organization first")
            return

        # Get super_admin role
        result = await db.execute(select(Role).where(Role.code == "super_admin"))
        role = result.scalar_one_or_none()
        if not role:
            print("Super admin role not found, run seed_roles first")
            return

        # Create employee
        employee = Employee(
            employee_no="EMP-ADMIN",
            name="系统管理员",
            phone="13800000000",
            employment_type="full_time",
            employment_status="active",
            hire_date=date.today(),
            store_id=store.id,
            position_code="admin",
            level_code="L0",
        )
        db.add(employee)
        await db.flush()

        # Create account
        account = Account(
            account_type="human",
            username="admin",
            phone="13800000000",
            password_hash=get_password_hash("admin123"),
            employee_id=employee.id,
            status="active",
        )
        db.add(account)
        await db.flush()

        # Assign role
        account_role = AccountRole(
            account_id=account.id,
            role_id=role.id,
        )
        db.add(account_role)
        await db.commit()

        print("Created admin account: admin / admin123")


async def main():
    """Run all seed functions."""
    print("=" * 50)
    print("UserCenter Seed Data Initialization")
    print("=" * 50)

    await seed_enterprise()
    await seed_roles()
    await seed_organization()
    await seed_admin()

    print("=" * 50)
    print("Seed data initialization completed!")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
