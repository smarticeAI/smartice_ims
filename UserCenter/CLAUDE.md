# UserCenter - 统一用户中心

## 项目概述

有点东西餐饮集团统一认证与组织管理系统，为 Database（进销存）、SmartIce LMS（培训）、营销板块提供统一的用户认证和组织架构服务。

## 技术栈

| 组件 | 技术选型 |
|------|----------|
| 后端框架 | Python 3.11+ / FastAPI |
| 数据库 | PostgreSQL 15+ (Supabase, usercenter schema) |
| ORM | SQLAlchemy 2.0 (异步) |
| 认证 | JWT Token (access + refresh) |
| 密码加密 | bcrypt |
| 迁移工具 | Alembic |

## 数据库架构（严格3NF）

### 12张核心表

| 层级 | 表名 | 说明 |
|-----|------|------|
| L1 | enterprise | 集团（顶层单条） |
| L2 | brands | 品牌（野百灵、宁桂杏） |
| L3 | regions | 区域（四川区域、江苏区域） |
| L4 | cities | 城市（成都、绵阳） |
| L5 | stores | 门店（春熙路店） |
| - | employees | 员工档案（store_id → stores） |
| - | accounts | 登录账号（1:1 employee） |
| - | roles | 角色（8个预置） |
| - | account_roles | N:M 桥接 |
| - | invitation_codes | 邀请码（关联门店，控制注册） |
| - | invitation_usages | 邀请码使用记录（审计） |
| - | legacy_user_mapping | 迁移映射 |

### 8个预置角色

| 角色 | scope | level |
|-----|-------|-------|
| super_admin | global | 0 |
| brand_admin | brand | 1 |
| region_manager | region | 2 |
| city_manager | city | 3 |
| store_manager | store | 4 |
| supervisor | store | 5 |
| trainer | store | 5 |
| employee | self | 6 |

## 目录结构

```
UserCenter/
├── app/
│   ├── api/
│   │   ├── deps.py              # 依赖注入（JWT验证、权限检查）
│   │   └── v1/endpoints/        # API 端点
│   ├── config/
│   │   ├── settings.py          # 配置管理
│   │   └── database.py          # 异步数据库连接
│   ├── core/
│   │   ├── security.py          # JWT + Bcrypt
│   │   └── exceptions.py        # 自定义异常
│   ├── models/                  # SQLAlchemy 模型
│   ├── schemas/                 # Pydantic 模型
│   └── main.py                  # FastAPI 入口
├── alembic/                     # 数据库迁移
├── scripts/
│   └── seed_data.py             # 初始化数据
├── pyproject.toml
└── .env.example
```

## 快速启动

```bash
# 1. 安装依赖
cd UserCenter
uv sync

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填入 Supabase 连接信息

# 3. 在 Supabase 中创建 schema（首次）
# 登录 Supabase Dashboard > SQL Editor，执行：
# CREATE SCHEMA IF NOT EXISTS usercenter;

# 4. 运行数据库迁移
uv run alembic upgrade head

# 5. 初始化种子数据
uv run python scripts/seed_data.py

# 6. 启动服务
uv run uvicorn app.main:app --reload --port 8001

# 访问
# API 文档: http://localhost:8001/api/v1/docs
# 健康检查: http://localhost:8001/health
```

## API 端点

| 模块 | 路径 | 说明 |
|------|------|------|
| 认证 | /api/v1/auth | 登录/登出/刷新Token/注册/当前用户 |
| 账号 | /api/v1/accounts | 账号CRUD、密码管理 |
| 员工 | /api/v1/employees | 员工CRUD、离职处理 |
| 组织 | /api/v1/orgs | 集团/品牌/区域/城市/门店管理 |
| 角色 | /api/v1/roles | 角色管理、角色分配 |
| 管理 | /api/v1/admin | 账号审核、批量审核 |

## 邀请码注册功能（2024-12-02）

### 注册流程
1. 用户填写：姓名 + 手机号 + 密码 + 邀请码
2. 系统验证邀请码有效性（存在、未过期、未达上限）
3. 创建 Employee (status=pending) + Account (status=pending)
4. 记录邀请码使用（invitation_usages）
5. 新账号无法登录，提示"账号正在审核中"
6. 管理员审核通过后更新 status='active'

### 测试邀请码
- 邀请码：`WELCOME2024`
- 关联门店：野百灵绵阳1958店
- 最大使用次数：100

### 审核方式

**API 审核（推荐）**：
```bash
# 获取待审核列表
GET /api/v1/admin/accounts/pending

# 单个审核
POST /api/v1/admin/accounts/{account_id}/review
{"action": "approve"}  # 或 {"action": "reject", "reason": "信息不符"}

# 批量审核
POST /api/v1/admin/accounts/batch-review
{"account_ids": ["uuid1", "uuid2"], "action": "approve"}
```

**权限**：店长及以上可审核（按组织层级过滤数据范围）

### 待开发
- [x] 管理端审核 API（/api/v1/admin/accounts/pending）
- [x] 邀请码管理 API（/api/v1/invitations）

## 默认账号

| 用户名 | 密码 | 角色 |
|-------|------|------|
| admin | admin123 | super_admin |

## 关键设计决策

1. **Schema 隔离**: 所有表在 `usercenter` schema 下，与 ims/lms 隔离
2. **数据范围控制**: 由应用层根据 `employees.store_id` 实现
3. **软删除**: 所有核心表使用 status 字段标记删除
4. **FK 约束**: 使用 RESTRICT 级联保护，防止误删

## 文档索引

| 文档 | 说明 |
|-----|------|
| docs/DATABASE.md | 完整数据库 Schema 设计、ER图、表结构 |
