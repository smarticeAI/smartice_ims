#!/usr/bin/env python3
"""
直接使用 SQLAlchemy 创建数据库表
绕过 Supabase API 限制
"""

import asyncio
import sys
from pathlib import Path

# 添加项目根目录到路径
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config.settings import settings
from app.models.base import Base
from app.models.organization import Enterprise, Brand, Region, City, Store
from app.models.employee import Employee
from app.models.account import Account
from app.models.role import Role, AccountRole
from app.models.legacy import LegacyUserMapping


async def create_tables():
    """创建所有数据库表"""
    print(f"连接数据库: {settings.database_url[:50]}...")

    # Supabase uses PgBouncer which doesn't support prepared statements
    engine = create_async_engine(
        settings.database_url,
        echo=True,
        connect_args={
            "statement_cache_size": 0,
        },
    )

    async with engine.begin() as conn:
        # 1. 确保 schema 存在
        print("\n[1/3] 确保 usercenter schema 存在...")
        await conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {settings.database_schema}"))

        # 2. 确保 uuid-ossp 扩展存在
        print("\n[2/3] 确保 uuid-ossp 扩展存在...")
        await conn.execute(text("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\""))

        # 3. 创建所有表
        print("\n[3/3] 创建数据库表...")
        await conn.run_sync(Base.metadata.create_all)

    await engine.dispose()
    print("\n✅ 所有表创建成功！")


if __name__ == "__main__":
    asyncio.run(create_tables())
