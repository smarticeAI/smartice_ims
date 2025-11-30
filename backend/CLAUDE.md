# 野百灵语音录入后端

## 项目概述

库存录入系统的语音识别后端服务，将语音输入转换为结构化的采购清单 JSON。

**核心流程**：语音 → 讯飞ASR → Qwen结构化提取 → JSON → 前端填充表单

---

## 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 框架 | FastAPI | 异步 Web 框架 |
| 语言 | Python 3.11+ | 类型注解 |
| 包管理 | uv | 快速依赖管理 |
| 语音识别 | 讯飞开放平台 | 支持四川方言/普通话 |
| 结构化提取 | 阿里云 Qwen | qwen-plus (通义千问) |
| 任务队列 | Redis | 可选，支持限流和异步处理 |
| 实时通信 | WebSocket | 流式音频传输 |

---

## 目录结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 应用入口 (v1.2)
│   ├── models/
│   │   └── voice_entry.py   # Pydantic 数据模型
│   ├── routes/
│   │   └── voice.py         # API 路由 (WebSocket + REST)
│   └── services/
│       ├── xunfei_asr.py    # 讯飞语音识别服务
│       ├── qwen_extractor.py    # Qwen 结构化提取
│       └── queue_service.py     # Redis 队列服务
├── pyproject.toml           # 项目配置 (uv)
├── .env                     # 环境变量 (gitignore)
└── .env.example             # 环境变量模板
```

---

## API 接口

### WebSocket: `/api/voice/ws`

实时语音录入接口

**客户端 → 服务端**:
```json
{ "type": "start" }                          // 开始录音
{ "type": "audio", "data": "<base64 PCM>" }  // 音频数据
{ "type": "end" }                            // 结束录音
{ "type": "cancel" }                         // 取消
```

**服务端 → 客户端**:
```json
{ "type": "status", "status": "listening" }  // 状态更新
{ "type": "partial", "text": "实时识别..." }  // 部分识别结果
{ "type": "result", "result": {...} }        // 结构化结果
{ "type": "error", "error": "错误信息" }      // 错误
```

### REST: `POST /api/voice/transcribe`

上传音频文件进行识别

### REST: `POST /api/voice/extract`

直接从文本提取结构化数据（测试用）

### REST: `GET /api/voice/health`

健康检查，返回服务和队列状态

### REST: `GET /api/voice/queue/stats`

获取 Redis 队列统计信息

---

## 数据模型

### VoiceEntryResult

```python
{
    "supplier": "供应商全称",
    "notes": "备注信息",
    "items": [
        {
            "name": "商品名称",
            "specification": "规格/包装",
            "quantity": 30,
            "unit": "斤",
            "unitPrice": 68,   # 采购单位价格
            "total": 2040
        }
    ]
}
```

---

## 开发环境

### 启动服务

```bash
cd backend

# 安装依赖
uv sync

# 复制环境变量
cp .env.example .env
# 编辑 .env 填入 API Key

# 启动服务
uv run uvicorn app.main:app --reload --port 8000
```

### API 文档

- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

---

## 环境变量

| 变量 | 说明 | 必需 |
|------|------|------|
| `XUNFEI_APP_ID` | 讯飞应用 ID | 是 |
| `XUNFEI_API_KEY` | 讯飞 API Key | 是 |
| `XUNFEI_API_SECRET` | 讯飞 API Secret | 是 |
| `QWEN_API_KEY` | 通义千问 API Key | 是 |
| `REDIS_URL` | Redis 连接 URL | 否 (无则直接调用) |
| `CORS_ORIGINS` | 生产环境前端域名 | 否 |

**注意**：未配置 Redis 时使用直接调用模式，无队列功能

---

## 音频格式要求

| 参数 | 值 |
|------|-----|
| 采样率 | 16kHz |
| 位深度 | 16bit |
| 声道 | 单声道 (Mono) |
| 格式 | PCM / WAV / WebM (自动转换) |

---

## 部署配置

### 生产环境 CORS

通过环境变量配置允许的前端域名：

```bash
CORS_ORIGINS=https://app.example.com,https://www.example.com
```

### Redis 队列

配置 Redis 启用任务队列和限流：

```bash
REDIS_URL=redis://:password@host:port/0
```

队列功能：
- 任务入队/出队管理
- 最大并发限制（默认 3）
- 任务状态追踪
- 结果缓存（1小时）

---

## 常见问题

### 1. Qwen API 限流

**症状**：返回 429 错误

**解决**：
- 检查 API 配额
- 启用 Redis 队列进行限流
- 使用指数退避重试（已内置）

### 2. Mock 模式触发

当以下情况发生时，自动 fallback 到 mock 模式：
- `QWEN_API_KEY` 未配置
- API 调用失败
- JSON 解析失败

---

## 关联项目

- 根目录: `../CLAUDE.md` (Monorepo 总览)
- 前端: `../frontend/`
- 前端 EntryForm: `../frontend/components/EntryForm.tsx`
