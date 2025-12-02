# 野百灵数据录入系统 - Monorepo

## 项目概述

"有点东西餐饮管理有限公司"数据分析平台的数据录入系统，负责门店运营数据的采集与管理。

---

## 仓库结构

```
InventoryEntryOfSmartICE/
├── frontend/                 # React + Vite 前端
│   ├── components/           # UI 组件
│   ├── services/             # API 服务
│   ├── src/styles/           # Tailwind CSS 样式
│   └── CLAUDE.md             # 前端详细文档
│
├── backend/                  # FastAPI Python 后端
│   ├── app/
│   │   ├── routes/           # API 路由
│   │   ├── services/         # 业务服务
│   │   └── models/           # 数据模型
│   └── CLAUDE.md             # 后端详细文档
│
├── keep-alive-worker/        # Cloudflare Worker 保活服务
│   ├── index.js              # Worker 代码
│   └── wrangler.toml         # Wrangler 配置
│
├── render.yaml               # Render 部署配置 (后端)
├── .gitignore
└── CLAUDE.md                 # 本文件
```

---

## 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **前端** | React 19 + Vite 6 | TypeScript, Tailwind CSS v4 |
| **后端** | FastAPI + Python 3.11 | uv 包管理 |
| **语音识别** | 讯飞 ASR | WebSocket 实时流式 |
| **AI 结构化** | 阿里云 Qwen | 语音文本 → JSON 提取 |
| **任务队列** | Redis | 可选，支持限流 |

---

## 核心功能

| 功能 | 说明 | 状态 |
|------|------|------|
| 采购清单录入 | 手动填写表单 | 已完成 |
| 语音录入 | 实时语音 → 结构化数据 | 已完成 |
| 仪表板 | 数据概览与图表 | 已完成 |
| AI 图片识别 | 拍照/上传 → 自动填充 | 暂停（待后端API） |

---

## 开发环境

### 前端启动

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
```

### 后端启动

```bash
cd backend
uv sync
cp .env.example .env  # 填入 API Keys
uv run uvicorn app.main:app --reload --port 8000
```

### 环境变量

**backend/.env**:
```bash
XUNFEI_APP_ID=xxx
XUNFEI_API_KEY=xxx
XUNFEI_API_SECRET=xxx
QWEN_API_KEY=xxx              # 通义千问
REDIS_URL=redis://localhost:6379/0  # 可选
CORS_ORIGINS=https://your-domain.com  # 生产环境
```

**frontend/.env** (可选):
```bash
VITE_VOICE_BACKEND_URL=http://localhost:8000
```

**注意**：前端不存储 API Key，所有 AI 服务通过后端调用

---

## API 通信

| 接口 | 协议 | 说明 |
|------|------|------|
| `/api/voice/ws` | WebSocket | 实时语音录入 |
| `/api/voice/extract` | POST | 文本 → JSON |
| `/api/voice/transcribe` | POST | 音频文件识别 |
| `/api/voice/health` | GET | 服务健康检查 |
| `/api/voice/queue/stats` | GET | 队列统计信息 |

---

## UI 设计系统

**Storm Glass Glassmorphism** - 冷色调深灰毛玻璃风格

- 深灰色玻璃背景 `rgba(25, 25, 30, 0.35-0.75)`
- 白色边框高光 `rgba(255, 255, 255, 0.1-0.2)`
- 模糊层级 24px/40px/56px
- 云海日落背景图

详见 `frontend/CLAUDE.md` 设计规范部分。

---

## 文档索引

| 文档 | 说明 |
|------|------|
| `frontend/CLAUDE.md` | 前端架构、组件、样式规范 |
| `backend/CLAUDE.md` | 后端 API、服务、数据模型 |

---

## 部署

### 生产环境

| 服务 | 平台 | URL |
|------|------|-----|
| **前端** | Cloudflare Pages | https://inv.smartice.ai |
| **后端** | Render | https://inventoryentryofsmartice.onrender.com |
| **保活** | Cloudflare Workers | https://smartice-keep-alive.hengd2.workers.dev |

### 架构图

```
┌─────────────────────────────────────────────────────────┐
│                    Cloudflare                           │
│  ┌──────────────────┐    ┌──────────────────────────┐  │
│  │ Pages (前端)      │    │ Worker (保活)            │  │
│  │ inv.smartice.ai  │    │ 每 3 分钟 ping 后端      │  │
│  └────────┬─────────┘    └────────────┬─────────────┘  │
└───────────┼───────────────────────────┼────────────────┘
            │                           │
            └───────────┬───────────────┘
                        ↓
         ┌──────────────────────────────┐
         │        Render (后端)          │
         │ inventoryentryofsmartice     │
         │ .onrender.com                │
         └──────────────────────────────┘
```

### 部署命令

**前端** (Cloudflare Pages)：自动部署，推送 main 分支即可

**后端** (Render)：自动部署，推送 main 分支即可

**保活 Worker** (Cloudflare Workers)：
```bash
cd keep-alive-worker
wrangler deploy
```

### 环境变量配置

**Render 后端**：
- `XUNFEI_APP_ID`, `XUNFEI_API_KEY`, `XUNFEI_API_SECRET`
- `QWEN_API_KEY`
- `CORS_ORIGINS=https://inv.smartice.ai`

**Cloudflare Pages 前端**：
- `VITE_VOICE_BACKEND_URL=https://inventoryentryofsmartice.onrender.com`
