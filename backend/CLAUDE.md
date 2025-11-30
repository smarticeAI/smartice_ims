# 野百灵语音录入后端

## 项目概述

库存录入系统的语音识别后端服务，将语音输入转换为结构化的采购清单 JSON。

**核心流程**：语音 → 讯飞ASR → Gemini结构化提取 → JSON → 前端填充表单

---

## 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 框架 | FastAPI | 异步 Web 框架 |
| 语言 | Python 3.11+ | 类型注解 |
| 包管理 | uv | 快速依赖管理 |
| 语音识别 | 讯飞开放平台 | 支持四川方言/普通话 |
| 结构化提取 | Google Gemini | gemini-2.0-flash |
| 实时通信 | WebSocket | 流式音频传输 |

---

## 目录结构

```
backend/
├── app/
│   ├── main.py              # FastAPI 应用入口
│   ├── models/
│   │   └── voice_entry.py   # Pydantic 数据模型
│   ├── routes/
│   │   └── voice.py         # API 路由 (WebSocket + REST)
│   └── services/
│       ├── xunfei_asr.py    # 讯飞语音识别服务
│       └── gemini_extractor.py  # Gemini 结构化提取
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
{ "type": "text", "data": "识别文本" }        // 识别结果
{ "type": "result", "result": {...} }        // 结构化结果
{ "type": "error", "error": "错误信息" }      // 错误
```

### REST: `POST /api/voice/transcribe`

上传音频文件进行识别

### REST: `POST /api/voice/extract`

直接从文本提取结构化数据（测试用）

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
            "unitPrice": 68,
            "total": 2040
        }
    ]
}
```

---

## 开发环境

### 启动服务

```bash
cd inventory-entry-backend

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
| `XUNFEI_APP_ID` | 讯飞应用 ID | 否 (无则 Mock) |
| `XUNFEI_API_KEY` | 讯飞 API Key | 否 (无则 Mock) |
| `GEMINI_API_KEY` | Gemini API Key | 否 (无则 Mock) |

**注意**：未配置 API Key 时自动使用 Mock 模式进行演示

---

## 音频格式要求

| 参数 | 值 |
|------|-----|
| 采样率 | 16kHz |
| 位深度 | 16bit |
| 声道 | 单声道 (Mono) |
| 格式 | PCM / WAV |

---

## 常见问题与经验

### 1. Gemini API 429 错误排查

**症状**：Gemini 提取返回空 items，fallback 到 mock 模式

**排查步骤**：
1. 检查后端日志是否有 `ResourceExhausted: 429` 错误
2. 直接用 curl 测试 API Key 是否有效：
   ```bash
   curl -s "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=YOUR_KEY" \
     -H "Content-Type: application/json" \
     -d '{"contents":[{"parts":[{"text":"Hello"}]}]}'
   ```

**常见原因**：
- **系统环境变量覆盖**：`load_dotenv()` 默认不覆盖已存在的环境变量
  - 解决：使用 `load_dotenv(override=True)`
- **API Key 配额超限**：免费版每分钟 15 次请求限制
  - 解决：等待配额刷新 / 使用其他账号 Key
- **同账号多 Key 共享配额**：同一 Google 账号的所有 Key 共享配额

**验证环境变量**：
```bash
# 检查系统环境变量
echo $GEMINI_API_KEY

# 检查 .env 文件
cat .env | grep GEMINI
```

### 2. Mock 模式触发条件

当以下情况发生时，自动 fallback 到 mock 模式：
- `GEMINI_API_KEY` 未配置
- API 调用失败（429/网络错误等）
- JSON 解析失败

Mock 模式仅对包含特定关键词（"五花肉"、"土豆"）的文本返回预设数据。

---

## 关联项目

- 根目录: `../CLAUDE.md` (Monorepo 总览)
- 前端: `../frontend/`
- 前端 EntryForm: `../frontend/components/EntryForm.tsx`
