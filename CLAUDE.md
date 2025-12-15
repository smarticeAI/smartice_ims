# 野百灵数据录入系统

## 项目概述

"有点东西餐饮管理有限公司"数据录入系统，支持手动录入和语音录入。

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | React 19 + Vite 6 | TypeScript, Tailwind CSS v4 |
| **后端** | FastAPI + Python 3.11 | 语音录入 WebSocket 服务 |
| **数据库** | Supabase PostgreSQL | 业务数据 + 用户表 |
| **认证** | master_employee 表 | 用户名/密码登录（共享主表，跨项目） |
| **语音识别** | 讯飞 ASR | WebSocket 实时流式 |
| **AI 结构化** | 阿里云 Qwen | 语音文本 → JSON |

---

## 仓库结构

```
InventoryEntryOfSmartICE/
├── frontend/               # React + Vite 前端
│   ├── components/         # UI 组件
│   ├── services/           # API 服务
│   └── CLAUDE.md           # 前端详细文档
├── backend/                # FastAPI Python 后端（语音录入）
│   ├── app/routes/         # API 路由
│   ├── app/services/       # 业务服务
│   └── CLAUDE.md           # 后端详细文档
├── supabase/               # Supabase 数据库
│   ├── migrations/         # SQL 迁移文件
│   └── SCHEMA.md           # 数据库 Schema 文档
├── keep-alive-worker/      # Cloudflare Worker 保活服务
└── CLAUDE.md               # 本文件
```

---

## 核心功能

| 模块 | 功能 | 状态 |
|------|------|------|
| **用户认证** | 邮箱/密码登录注册 | 已完成 |
| **数据录入** | 手动填写采购清单 | 已完成 |
| | 语音录入（实时语音 → 结构化数据） | 已完成 |
| **仪表板** | 数据概览与图表 | 已完成 |
| **RBAC** | 4 角色权限管理 | 已完成 |

---

## Supabase 数据库表结构

### 共享主表（master_* 跨项目共用）

| 表名 | 说明 |
|------|------|
| `master_employee` | 员工表（用户名、密码哈希、姓名、角色、餐厅） |
| `master_restaurant` | 餐厅表（餐厅名、品牌ID、地址） |
| `master_brand` | 品牌表（品牌代码、名称） |
| `master_role` | 角色表 |

**用户角色**：`super_admin` / `store_manager` / `chef` / `employee`

**登录方式**：前端查询 `master_employee` 表验证用户名+密码，会话存 localStorage

**master_employee 主要字段**：
| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | uuid | 主键 |
| `username` | varchar | 用户名 |
| `password_hash` | varchar | 密码（明文存储，内部项目） |
| `employee_name` | varchar | 员工姓名 |
| `phone` | varchar | 手机号 |
| `restaurant_id` | uuid | 所属餐厅（外键） |
| `role_code` | varchar | 角色代码 |
| `is_active` | boolean | 是否启用 |
| `is_locked` | boolean | 是否锁定（登录失败5次） |
| `login_failed_count` | integer | 登录失败次数 |

**添加新用户**：
```sql
INSERT INTO master_employee (username, password_hash, employee_name, role_code, restaurant_id)
VALUES ('zhangsan', '123456', '张三', 'chef', 'restaurant-uuid');
```

### 业务数据表（ims_* 本项目专用）

| 表名 | 说明 |
|------|------|
| `ims_supplier` | 供应商表 |
| `ims_material` | 物料/产品表 |
| `ims_material_sku` | 物料 SKU 表 |
| `ims_unit` | 计量单位表 |
| `ims_material_price` | 采购价格记录表（restaurant_id 关联餐厅） |
| `ims_category` | 分类表 |
| `ims_brand` | 品牌表（本地副本） |

### Storage Bucket

| Bucket | 说明 |
|--------|------|
| `ims-receipts` | 采购凭证图片（收货单/货物照片） |

详细 Schema 见 `supabase/SCHEMA.md`

---

## 开发环境

### 前端启动

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

**环境变量** (`frontend/.env`)：
```bash
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_VOICE_BACKEND_URL=http://localhost:8000
```

### 后端启动（语音录入）

```bash
cd backend
uv sync
cp .env.example .env  # 填入 API Keys
uv run uvicorn app.main:app --reload --port 8000
```

**环境变量** (`backend/.env`)：
```bash
XUNFEI_APP_ID=xxx
XUNFEI_API_KEY=xxx
XUNFEI_API_SECRET=xxx
QWEN_API_KEY=xxx
CORS_ORIGINS=https://inv.smartice.ai
```

---

## 语音录入 API

| 接口 | 协议 | 说明 |
|------|------|------|
| `/api/voice/ws` | WebSocket | 实时语音录入 |
| `/api/voice/extract` | POST | 文本 → JSON |
| `/api/voice/transcribe` | POST | 音频文件识别 |
| `/api/voice/health` | GET | 服务健康检查 |

---

## 部署架构

### 生产环境

| 服务 | 平台 | URL |
|------|------|-----|
| **前端** | Cloudflare Pages | https://inv.smartice.ai |
| **后端** | Render Free Tier | https://inventoryentryofsmartice.onrender.com |
| **数据库** | Supabase | wdpeoyugsxqnpwwtkqsl.supabase.co |
| **保活** | Cloudflare Workers | 每 3 分钟 ping 后端 |

**注意**：Render Free Tier 有冷启动问题（15 分钟无请求后休眠），使用 Cloudflare Worker 保持唤醒。

### 架构图

```
┌─────────────────────────────────────────────────┐
│              Cloudflare                         │
│  ┌──────────────┐    ┌────────────────────┐    │
│  │ Pages (前端)  │    │ Worker (保活服务)  │    │
│  │ inv.smartice │    │ 每3分钟 ping 后端  │    │
│  └──────┬───────┘    └────────┬───────────┘    │
└─────────┼──────────────────────┼────────────────┘
          │                      │
          ↓                      ↓
   ┌──────────────┐      ┌──────────────┐
   │   Supabase   │      │ Render (后端) │
   │  PostgreSQL  │      │  WebSocket   │
   │ master_*     │      │ 语音录入服务   │
   │ ims_*        │      └──────────────┘
   └──────────────┘
```

---

## 文档索引

| 文档 | 说明 |
|------|------|
| `frontend/CLAUDE.md` | 前端架构、组件、样式规范 |
| `backend/CLAUDE.md` | 后端 API、语音识别服务 |
| `supabase/SCHEMA.md` | 数据库表结构与权限 |
| `supabase/QUICKSTART.md` | Supabase 快速部署指南 |

---

## 快速开始

### 1. 克隆仓库

```bash
git clone <repo-url>
cd InventoryEntryOfSmartICE
```

### 2. 配置 Supabase

1. 在 Supabase Dashboard 创建项目
2. 运行 `supabase/migrations/` 下的 SQL 文件
3. 配置环境变量（URL + Anon Key）

### 3. 启动前端

```bash
cd frontend
npm install
npm run dev
```

### 4. 启动后端（可选，用于语音录入）

```bash
cd backend
uv sync
uv run uvicorn app.main:app --reload
```

---

## UI 设计系统

**Storm Glass Glassmorphism** - 深色毛玻璃风格

- 深灰色玻璃背景 `rgba(25, 25, 30, 0.35-0.75)`
- 白色高光边框 `rgba(255, 255, 255, 0.1-0.2)`
- 模糊层级：24px / 40px / 56px
- 云海日落背景图

详见 `frontend/CLAUDE.md`
