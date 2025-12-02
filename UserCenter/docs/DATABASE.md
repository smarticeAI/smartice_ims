# UserCenter 数据库设计

## 概述

统一用户中心数据库，采用严格第三范式 (3NF) 设计，所有表位于 `usercenter` schema 下。

## ER 图

```
                              ┌─────────────┐
                              │ enterprise  │
                              │   (L1 集团)  │
                              └──────┬──────┘
                                     │ 1:N
                              ┌──────▼──────┐
                              │   brands    │
                              │   (L2 品牌)  │
                              └──────┬──────┘
                                     │ 1:N
                              ┌──────▼──────┐
                              │   regions   │
                              │   (L3 区域)  │
                              └──────┬──────┘
                                     │ 1:N
                              ┌──────▼──────┐
                              │   cities    │
                              │   (L4 城市)  │
                              └──────┬──────┘
                                     │ 1:N
                              ┌──────▼──────┐
                              │   stores    │
                              │   (L5 门店)  │
                              └──────┬──────┘
                                     │ 1:N
┌─────────────┐               ┌──────▼──────┐
│   roles     │◄──────────────│  employees  │
│   (角色)    │    N:M        │   (员工)    │
└──────┬──────┘               └──────┬──────┘
       │                             │ 1:1
       │ N:M                  ┌──────▼──────┐
       └─────────────────────►│  accounts   │
         account_roles        │   (账号)    │
                              └─────────────┘
```

## 表结构

### 1. enterprise (集团)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| code | VARCHAR(50) | 集团编码 (唯一) |
| name | VARCHAR(100) | 集团名称 |
| short_name | VARCHAR(50) | 简称 |
| logo_url | VARCHAR(500) | Logo URL |
| status | VARCHAR(20) | active / closed |
| created_at | TIMESTAMPTZ | 创建时间 |
| updated_at | TIMESTAMPTZ | 更新时间 |

### 2. brands (品牌)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| enterprise_id | UUID | FK → enterprise |
| code | VARCHAR(50) | 品牌编码 (唯一) |
| name | VARCHAR(100) | 品牌名称 |
| short_name | VARCHAR(50) | 简称 |
| logo_url | VARCHAR(500) | Logo URL |
| description | TEXT | 描述 |
| sort_order | INTEGER | 排序 |
| status | VARCHAR(20) | active / closed |

### 3. regions (区域)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| brand_id | UUID | FK → brands |
| code | VARCHAR(50) | 区域编码 |
| name | VARCHAR(100) | 区域名称 |
| sort_order | INTEGER | 排序 |
| status | VARCHAR(20) | active / closed |

### 4. cities (城市)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| region_id | UUID | FK → regions |
| code | VARCHAR(50) | 城市编码 |
| name | VARCHAR(100) | 城市名称 |
| province | VARCHAR(50) | 省份 |
| sort_order | INTEGER | 排序 |
| status | VARCHAR(20) | active / closed |

### 5. stores (门店)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| city_id | UUID | FK → cities |
| code | VARCHAR(50) | 门店编码 (唯一) |
| name | VARCHAR(100) | 门店名称 |
| address | VARCHAR(500) | 地址 |
| phone | VARCHAR(20) | 电话 |
| opening_date | DATE | 开业日期 |
| ownership_type | VARCHAR(20) | direct / franchise |
| business_hours | VARCHAR(100) | 营业时间 |
| seating_capacity | INTEGER | 座位数 |
| status | VARCHAR(20) | active / preparing / closed |

### 6. employees (员工)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| employee_no | VARCHAR(20) | 工号 (唯一) |
| name | VARCHAR(50) | 姓名 |
| phone | VARCHAR(20) | 手机 |
| email | VARCHAR(100) | 邮箱 |
| store_id | UUID | FK → stores |
| employment_status | VARCHAR(20) | active / probation / resigned / terminated |
| employment_type | VARCHAR(20) | full_time / part_time / intern |
| hire_date | DATE | 入职日期 |
| position_code | VARCHAR(30) | 职位编码 |
| level_code | VARCHAR(10) | 职级编码 |
| mentor_id | UUID | FK → employees (自引用) |

### 7. accounts (账号)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| account_type | VARCHAR(20) | human / system / device |
| username | VARCHAR(50) | 用户名 (唯一) |
| phone | VARCHAR(20) | 手机 (唯一) |
| email | VARCHAR(100) | 邮箱 |
| password_hash | VARCHAR(255) | 密码哈希 |
| employee_id | UUID | FK → employees (唯一) |
| status | VARCHAR(20) | active / frozen / disabled |
| last_login_at | TIMESTAMPTZ | 最后登录时间 |
| failed_login_count | SMALLINT | 失败次数 |

### 8. roles (角色)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| code | VARCHAR(30) | 角色编码 (唯一) |
| name | VARCHAR(50) | 角色名称 |
| description | TEXT | 描述 |
| scope | VARCHAR(20) | global / brand / region / city / store / self |
| level | SMALLINT | 层级 (0-6) |
| is_system | BOOLEAN | 是否系统角色 |
| is_active | BOOLEAN | 是否启用 |

### 9. account_roles (账号角色关联)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| account_id | UUID | FK → accounts |
| role_id | UUID | FK → roles |
| is_active | BOOLEAN | 是否启用 |
| granted_by | UUID | 授权人 |

### 10. legacy_user_mapping (迁移映射)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| legacy_system | VARCHAR(20) | 来源系统 (ims / lms) |
| legacy_table | VARCHAR(50) | 来源表名 |
| legacy_id | VARCHAR(100) | 来源ID |
| employee_id | UUID | FK → employees |
| account_id | UUID | FK → accounts |
| migrated_at | TIMESTAMPTZ | 迁移时间 |

## 预置角色

| code | name | scope | level |
|------|------|-------|-------|
| super_admin | 超级管理员 | global | 0 |
| brand_admin | 品牌管理员 | brand | 1 |
| region_manager | 区域经理 | region | 2 |
| city_manager | 城市经理 | city | 3 |
| store_manager | 店长 | store | 4 |
| supervisor | 主管 | store | 5 |
| trainer | 培训师 | store | 5 |
| employee | 员工 | self | 6 |

## 外键约束

所有组织层级表使用 `ON DELETE RESTRICT` 防止误删：
- brands.enterprise_id → enterprise.id
- regions.brand_id → brands.id
- cities.region_id → regions.id
- stores.city_id → cities.id
- employees.store_id → stores.id
- accounts.employee_id → employees.id

## 索引

主要索引：
- `ix_employees_store_id` - 员工按门店查询
- `ix_employees_employment_status` - 员工状态筛选
- `ix_accounts_phone` - 手机号登录 (唯一)
- `ix_accounts_employee_id` - 员工账号关联 (唯一)
- `ix_account_roles_account_id` - 账号角色查询
