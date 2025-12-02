# Cloudflare Workers 迁移指南

**项目**：野百灵语音录入后端
**源框架**：FastAPI (Python 3.11+)
**目标平台**：Cloudflare Workers (TypeScript)
**版本**：v2.6 (2024)

本文档提供将 FastAPI 后端重写为 Cloudflare Workers 所需的完整技术细节。

---

## 目录

1. [系统架构概览](#1-系统架构概览)
2. [WebSocket 协议详解](#2-websocket-协议详解)
3. [讯飞 ASR 集成细节](#3-讯飞-asr-集成细节)
4. [Qwen API 集成细节](#4-qwen-api-集成细节)
5. [数据模型](#5-数据模型)
6. [Cloudflare Workers 迁移注意事项](#6-cloudflare-workers-迁移注意事项)
7. [测试检查清单](#7-测试检查清单)
8. [环境变量配置](#8-环境变量配置)

---

## 1. 系统架构概览

### 1.1 整体数据流图

```
┌─────────────────────────────────────────────────────────────────────┐
│                          前端 (React)                                │
│  ┌─────────────────┐                                                │
│  │ VoiceEntry UI   │                                                │
│  │ - 录音按钮      │                                                │
│  │ - 实时文本显示  │                                                │
│  │ - 可编辑文本框  │                                                │
│  └────────┬────────┘                                                │
└───────────┼─────────────────────────────────────────────────────────┘
            │ WebSocket (ws://backend/api/voice/ws)
            │ + PCM 音频流 (Base64)
            ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    FastAPI 后端 (待迁移)                             │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ WebSocket 路由 (/api/voice/ws)                                  ││
│  │ - 接收客户端消息 (start/audio/end)                              ││
│  │ - 管理双向通信（前端 ↔ 讯飞）                                   ││
│  └───────────┬─────────────────────────────────────────────────────┘│
│              │                                                        │
│              ↓ PCM 音频 + 首帧参数                                    │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 讯飞 ASR 服务 (xunfei_asr.py)                                   ││
│  │ - 生成鉴权 URL (HMAC-SHA256)                                     ││
│  │ - WebSocket 连接到 wss://iat-api.xfyun.cn/v2/iat                ││
│  │ - 发送首帧 (业务参数: vad_eos=60s, dwa=wpgs)                    ││
│  │ - 流式发送音频帧 (1280 bytes/40ms)                              ││
│  │ - 接收实时识别结果 (pgs/rg 动态修正)                            ││
│  └───────────┬─────────────────────────────────────────────────────┘│
│              │                                                        │
│              ↓ 完整识别文本                                           │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ 前端展示可编辑文本，用户点击"发送解析"                          ││
│  └───────────┬─────────────────────────────────────────────────────┘│
│              │ POST /api/voice/extract { text: "..." }               │
│              ↓                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐│
│  │ Qwen 提取服务 (qwen_extractor.py)                               ││
│  │ - 调用通义千问 API (qwen-plus)                                  ││
│  │ - Prompt: 将语音文本转为采购清单 JSON                            ││
│  │ - 返回结构化数据 (supplier, items[])                            ││
│  └───────────┬─────────────────────────────────────────────────────┘│
│              │                                                        │
└──────────────┼─────────────────────────────────────────────────────┘
               ↓ JSON 结果
         ┌──────────────┐
         │   前端填充   │
         │   表单字段   │
         └──────────────┘
```

### 1.2 组件职责

| 组件 | 文件 | 职责 |
|------|------|------|
| **WebSocket 路由** | `app/routes/voice.py` | 管理前端 ↔ 讯飞的双向 WebSocket 代理 |
| **讯飞 ASR 服务** | `app/services/xunfei_asr.py` | WebSocket 连接讯飞 API，实时识别语音 |
| **Qwen 提取服务** | `app/services/qwen_extractor.py` | 调用通义千问 API 将文本转为结构化 JSON |
| **队列服务** | `app/services/queue_service.py` | Redis 任务队列（可选，用于限流） |
| **数据模型** | `app/models/voice_entry.py` | Pydantic 数据模型定义 |
| **REST 端点** | `app/routes/voice.py` | `/extract`, `/transcribe`, `/health` |

### 1.3 关键特性

- **流式实时识别**：前端边录音边显示识别文本（部分结果）
- **动态修正**：讯飞 `dwa=wpgs` 参数支持逐字修正（`pgs=rpl` 替换机制）
- **识别与解析分离** (v2.6)：识别完成后返回可编辑文本，用户确认后才调用 Qwen
- **音频格式转换**：支持 WebM 自动转 PCM（通过 ffmpeg）
- **错误重试**：Qwen API 速率限制时指数退避重试

---

## 2. WebSocket 协议详解

### 2.1 消息格式定义

#### 客户端 → 服务端消息

```typescript
type ClientMessageType = 'start' | 'audio' | 'end' | 'cancel' | 'close';

interface ClientMessage {
  type: ClientMessageType;
  data?: string; // Base64 编码的 PCM 音频（仅 type=audio 时）
}
```

**示例**：

```json
// 开始录音
{ "type": "start" }

// 音频数据（每 ~32ms 发送一次）
{
  "type": "audio",
  "data": "AQABAAIAAQACAAMA..." // Base64 PCM (512 samples = 1024 bytes)
}

// 结束录音
{ "type": "end" }

// 取消录音
{ "type": "cancel" }

// 关闭连接
{ "type": "close" }
```

#### 服务端 → 客户端消息

```typescript
type ServerMessageType = 'status' | 'partial' | 'text_final' | 'stop_recording' | 'result' | 'error';

interface ServerMessage {
  type: ServerMessageType;
  status?: 'listening' | 'processing' | 'completed' | 'error';
  message?: string;           // 状态描述
  text?: string;              // 实时/最终识别文本
  raw_text?: string;          // 原始识别文本（已废弃，用 text 代替）
  result?: VoiceEntryResult;  // 结构化结果（已废弃，v2.6 不再使用）
  error?: string;             // 错误信息
}
```

**示例**：

```json
// 状态更新
{
  "type": "status",
  "status": "listening",
  "message": "开始录音..."
}

// 实时部分识别结果（逐字更新）
{
  "type": "partial",
  "text": "永辉超市农夫"
}

// 识别完成信号（通知前端停止发送音频）
{
  "type": "stop_recording",
  "message": "识别完成"
}

// 最终识别文本（可编辑）
{
  "type": "text_final",
  "status": "completed",
  "text": "永辉超市农夫山泉三箱每箱二十四瓶二十八块一箱"
}

// 错误
{
  "type": "error",
  "status": "error",
  "error": "讯飞 ASR 错误 10114: appid 不存在"
}
```

### 2.2 完整消息交互时序图

```
前端                 后端路由                讯飞ASR                 Qwen API
 │                      │                      │                        │
 │──────start──────────>│                      │                        │
 │                      │──创建讯飞WebSocket──>│                        │
 │                      │<──────连接成功───────│                        │
 │                      │                      │                        │
 │                      │────发送首帧参数─────>│                        │
 │<───status:listening──│                      │                        │
 │                      │                      │                        │
 │───audio(PCM chunk)──>│────转发音频帧───────>│                        │
 │───audio(PCM chunk)──>│────转发音频帧───────>│                        │
 │                      │<──partial(sn=0)──────│                        │
 │<──partial:"永辉"─────│                      │                        │
 │───audio(PCM chunk)──>│────转发音频帧───────>│                        │
 │                      │<──partial(sn=1)──────│                        │
 │<──partial:"永辉超市"─│                      │                        │
 │                      │<──rpl(sn=0-1)────────│ (动态修正)             │
 │<──partial:"永辉超市"─│                      │                        │
 │───audio(PCM chunk)──>│────转发音频帧───────>│                        │
 │      ...              │       ...            │                        │
 │                      │                      │                        │
 │───────end───────────>│────发送结束帧───────>│                        │
 │                      │<──status=2(完成)─────│                        │
 │<──stop_recording─────│                      │                        │
 │<──text_final─────────│                      │                        │
 │ (显示可编辑文本)      │                      │                        │
 │                      │                      │                        │
 │ (用户点击"发送解析")  │                      │                        │
 │─POST /extract────────>│                      │                        │
 │                      │──────────────────────────────────>│            │
 │                      │                 调用 Qwen API     │            │
 │                      │<─────────────────────────────────│            │
 │<──result (JSON)──────│                      │                        │
 │                      │                      │                        │
```

### 2.3 WebSocket 生命周期管理

#### 连接保活策略

- **连续录音支持**：WebSocket 在识别完成后不关闭，允许多次录音会话
- **错误恢复**：出错后保持连接，前端可继续录音或重试
- **关闭触发条件**：
  - 客户端发送 `close` 消息
  - 网络异常导致的 `WebSocketDisconnect`
  - 致命错误（如鉴权失败）

#### 资源清理

```python
# Python 原实现 (voice.py:175-186)
except WebSocketDisconnect:
    print("[VoiceWS] 客户端断开连接")
except Exception as e:
    print(f"[VoiceWS] 连接错误: {e}")
    try:
        await websocket.send_json({"type": "error", "error": str(e)})
    except:
        pass
```

---

## 3. 讯飞 ASR 集成细节

### 3.1 鉴权 URL 生成算法（HMAC-SHA256）

#### 3.1.1 鉴权原理

讯飞 IAT API 使用 HMAC-SHA256 签名验证请求合法性。

**参考代码** (`xunfei_asr.py:58-91`)：

```python
def _create_auth_url(self) -> str:
    now = datetime.now()
    date = format_date_time(mktime(now.timetuple()))  # RFC 1123 格式

    # 步骤 1: 构造签名原文
    signature_origin = f"host: {self.HOST}\n"
    signature_origin += f"date: {date}\n"
    signature_origin += "GET /v2/iat HTTP/1.1"

    # 步骤 2: HMAC-SHA256 签名
    signature_sha = hmac.new(
        self.api_secret.encode('utf-8'),
        signature_origin.encode('utf-8'),
        digestmod=hashlib.sha256
    ).digest()
    signature_sha_base64 = base64.b64encode(signature_sha).decode('utf-8')

    # 步骤 3: 构造 Authorization 头
    authorization_origin = (
        f'api_key="{self.api_key}", '
        f'algorithm="hmac-sha256", '
        f'headers="host date request-line", '
        f'signature="{signature_sha_base64}"'
    )
    authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode('utf-8')

    # 步骤 4: 拼接 WebSocket URL
    params = {
        "authorization": authorization,
        "date": date,
        "host": self.HOST
    }
    return f"{self.IAT_URL}?{urlencode(params)}"
```

#### 3.1.2 TypeScript 实现示例

```typescript
import crypto from 'crypto';

function createXunfeiAuthUrl(
  appId: string,
  apiKey: string,
  apiSecret: string
): string {
  const HOST = 'iat-api.xfyun.cn';
  const IAT_URL = 'wss://iat-api.xfyun.cn/v2/iat';

  // 步骤 1: 生成 RFC 1123 日期
  const date = new Date().toUTCString();

  // 步骤 2: 构造签名原文
  const signatureOrigin = [
    `host: ${HOST}`,
    `date: ${date}`,
    'GET /v2/iat HTTP/1.1'
  ].join('\n');

  // 步骤 3: HMAC-SHA256 签名
  const signatureSha = crypto
    .createHmac('sha256', apiSecret)
    .update(signatureOrigin)
    .digest('base64');

  // 步骤 4: 构造 Authorization
  const authorizationOrigin = [
    `api_key="${apiKey}"`,
    'algorithm="hmac-sha256"',
    'headers="host date request-line"',
    `signature="${signatureSha}"`
  ].join(', ');

  const authorization = Buffer.from(authorizationOrigin).toString('base64');

  // 步骤 5: URL 参数拼接
  const params = new URLSearchParams({
    authorization,
    date,
    host: HOST
  });

  return `${IAT_URL}?${params.toString()}`;
}
```

### 3.2 首帧数据格式

#### 3.2.1 业务参数配置

**参考代码** (`xunfei_asr.py:93-122`)：

```python
{
  "common": {
    "app_id": "xxxxxxxx"  # 讯飞应用 APPID
  },
  "business": {
    "language": "zh_cn",       # 语言：中文
    "domain": "iat",           # 领域：语音听写
    "accent": "mandarin",      # 口音：普通话
    "vad_eos": 60000,          # 静音超时：60秒 (最大值，用户手动控制)
    "dwa": "wpgs",             # 动态修正：开启逐字修正
    "ptt": 1,                  # 标点符号：开启
    "nunum": 1                 # 数字：转阿拉伯数字
  },
  "data": {
    "status": 0,               # 首帧标记
    "format": "audio/L16;rate=16000",  # 音频格式
    "encoding": "raw",         # 编码方式：原始 PCM
    "audio": ""                # 首帧不包含音频数据
  }
}
```

#### 3.2.2 重要参数说明

| 参数 | 值 | 说明 |
|------|-----|------|
| `vad_eos` | 60000 | 静音超时（毫秒），设为最大值让用户手动停止 |
| `dwa` | `"wpgs"` | 启用动态修正，支持 `pgs=rpl` 替换逻辑 |
| `ptt` | 1 | 自动添加标点符号 |
| `nunum` | 1 | 数字转阿拉伯数字（"三十" → "30"） |
| `accent` | `"mandarin"` | 普通话（可选 `"sichuan"` 四川话） |

### 3.3 音频帧数据格式

#### 3.3.1 音频格式要求

| 参数 | 要求 |
|------|------|
| 采样率 | 16kHz |
| 位深度 | 16-bit signed PCM |
| 声道 | 单声道 (Mono) |
| 字节序 | Little-Endian |

#### 3.3.2 音频帧消息格式

```json
{
  "data": {
    "status": 1,              // 1=中间帧, 2=最后一帧
    "format": "audio/L16;rate=16000",
    "encoding": "raw",
    "audio": "<Base64 PCM>"   // 1280 bytes = 640 samples ≈ 40ms
  }
}
```

#### 3.3.3 发送频率

**参考代码** (`xunfei_asr.py:165-173`)：

```python
chunk_size = 1280  # bytes
for i in range(0, len(audio_data), chunk_size):
    chunk = audio_data[i:i + chunk_size]
    is_last = (i + chunk_size >= len(audio_data))

    audio_base64 = base64.b64encode(chunk).decode('utf-8')
    frame = self._create_audio_frame(audio_base64, is_last)
    await ws.send(json.dumps(frame))

    await asyncio.sleep(0.04)  # 40ms 间隔
```

**注意**：前端实际使用 512 samples (~32ms) 以优化延迟。

### 3.4 响应解析逻辑（pgs/rg 动态修正机制）

#### 3.4.1 响应数据结构

```json
{
  "code": 0,
  "message": "success",
  "sid": "xxx@dx001...",
  "data": {
    "status": 1,  // 0=首次, 1=中间, 2=最后
    "result": {
      "sn": 0,             // 句子序号
      "pgs": "apd",        // 操作类型: apd=追加, rpl=替换
      "rg": [0, 1],        // 替换范围（仅 pgs=rpl 时）
      "ws": [              // 词列表
        {
          "bg": 0,         // 词开始位置（毫秒）
          "cw": [          // 候选词
            {
              "w": "永",   // 词内容
              "wp": "n"    // 词性标注
            }
          ]
        },
        {
          "bg": 200,
          "cw": [{"w": "辉"}]
        }
      ]
    }
  }
}
```

#### 3.4.2 动态修正算法

**参考代码** (`xunfei_asr.py:278-316`)：

```python
rec_text: dict[int, str] = {}  # sn → 识别文本

def get_current_text() -> str:
    sorted_keys = sorted(rec_text.keys())
    return "".join(rec_text[k] for k in sorted_keys)

# 处理每个响应
pgs = result_obj.get("pgs", "apd")
rg = result_obj.get("rg", [])
sn = result_obj.get("sn", 0)
ws_list = result_obj.get("ws", [])

# 提取词
partial_text = "".join(
    cw.get("w", "")
    for ws_item in ws_list
    for cw in ws_item.get("cw", [])
)

if pgs == "rpl" and rg and len(rg) >= 2:
    # 替换模式：清除 rg[0] 到 rg[1] 的旧文本
    rec_text[rg[0]] = partial_text
    for i in range(rg[0] + 1, rg[1] + 1):
        rec_text.pop(i, None)
else:
    # 追加模式
    rec_text[sn] = partial_text

full_text = get_current_text()
```

#### 3.4.3 动态修正示例

**场景**：识别 "永辉超市" 时的动态修正

```
1. 首次识别 (sn=0, pgs=apd): "永"
   rec_text = {0: "永"}

2. 追加 (sn=1, pgs=apd): "辉"
   rec_text = {0: "永", 1: "辉"}

3. 追加 (sn=2, pgs=apd): "超"
   rec_text = {0: "永", 1: "辉", 2: "超"}

4. 替换 (sn=0, pgs=rpl, rg=[0,2]): "永辉超市"
   rec_text = {0: "永辉超市"}  // 清除了 sn=1,2
```

### 3.5 错误处理

#### 3.5.1 常见错误码

| 错误码 | 说明 | 处理方式 |
|--------|------|----------|
| 10114 | appid 不存在 | 检查 `XUNFEI_APP_ID` |
| 10700 | 授权错误 | 检查 API Key/Secret |
| 11200 | 请求超时 | 重试或增加超时时间 |
| 11201 | 引擎错误 | 联系讯飞技术支持 |

#### 3.5.2 超时处理

```python
# 接收超时 (xunfei_asr.py:262)
response = await asyncio.wait_for(ws.recv(), timeout=30)
```

#### 3.5.3 连接失败处理

```python
# xunfei_asr.py:384-389
except websockets.exceptions.WebSocketException as e:
    raise ConnectionError(f"讯飞 WebSocket 连接失败: {e}") from e
```

---

## 4. Qwen API 集成细节

### 4.1 API 端点和认证

#### 4.1.1 API 配置

```python
# qwen_extractor.py:55-56
BASE_URL_CHINA = "https://dashscope.aliyuncs.com/compatible-mode/v1"
BASE_URL_INTL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
```

#### 4.1.2 认证方式

```python
client = OpenAI(
    api_key="sk-xxx",  # 从 QWEN_API_KEY 环境变量读取
    base_url="https://dashscope.aliyuncs.com/compatible-mode/v1"
)
```

**使用 OpenAI SDK**：Qwen 提供 OpenAI 兼容接口。

### 4.2 请求格式

#### 4.2.1 完整 Prompt

**参考代码** (`qwen_extractor.py:36-52`)：

```python
EXTRACTION_PROMPT = """将采购语音转为JSON。输出格式：
{{"supplier":"供应商","notes":"备注","items":[{{"name":"商品名","specification":"规格","quantity":数量,"unit":"单位","unitPrice":单价,"total":小计}}]}}

规则：
- total = quantity × unitPrice（自动计算）
- specification：包装商品用"最小单位/采购单位"格式（如"24瓶/箱"、"5L/桶"），散装用属性（如"去皮"），无则留空
- 无供应商时supplier为空字符串

示例：
输入: "永辉超市，农夫山泉3箱每箱24瓶28块一箱，可口可乐2箱35一箱"
输出: {{"supplier":"永辉超市","notes":"","items":[{{"name":"农夫山泉","specification":"24瓶/箱","quantity":3,"unit":"箱","unitPrice":28,"total":84}},{{"name":"可口可乐","specification":"","quantity":2,"unit":"箱","unitPrice":35,"total":70}}]}}

输入: "双汇直供，去皮五花肉30斤68一斤，带骨排骨20斤45一斤，肉质不错"
输出: {{"supplier":"双汇直供","notes":"肉质不错","items":[{{"name":"去皮五花肉","specification":"去皮","quantity":30,"unit":"斤","unitPrice":68,"total":2040}},{{"name":"带骨排骨","specification":"带骨","quantity":20,"unit":"斤","unitPrice":45,"total":900}}]}}

语音输入: {text}
直接输出JSON："""
```

#### 4.2.2 API 调用

```python
response = await asyncio.to_thread(
    client.chat.completions.create,
    model="qwen-plus",
    messages=[
        {
            "role": "system",
            "content": "你是一个专业的采购清单解析助手。请输出 JSON 格式的结构化数据。"
        },
        {"role": "user", "content": prompt}
    ],
    response_format={"type": "json_object"},  # 强制 JSON 输出
    temperature=0.1,  # 降低随机性，提高稳定性
)
```

### 4.3 响应解析

#### 4.3.1 JSON 提取

```python
def _extract_json_from_response(self, text: str) -> dict:
    # 1. 尝试直接解析
    try:
        return json.loads(text)
    except:
        pass

    # 2. 提取 ```json ... ``` 代码块
    json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
    if json_match:
        try:
            return json.loads(json_match.group(1).strip())
        except:
            pass

    # 3. 提取 { ... } 结构
    brace_match = re.search(r'\{.*\}', text, re.DOTALL)
    if brace_match:
        try:
            return json.loads(brace_match.group(0))
        except:
            pass

    raise json.JSONDecodeError("无法从响应中提取 JSON", text, 0)
```

### 4.4 速率限制与重试

#### 4.4.1 指数退避策略

```python
for attempt in range(max_retries):
    try:
        response = await asyncio.to_thread(...)
        break
    except RateLimitError as e:
        wait_time = (2 ** attempt) * 5  # 5s, 10s, 20s
        print(f"429 速率限制，等待 {wait_time}s 后重试")
        if attempt < max_retries - 1:
            await asyncio.sleep(wait_time)
        else:
            raise
```

#### 4.4.2 错误类型

| 错误类型 | 说明 | 处理 |
|----------|------|------|
| `RateLimitError` | 429 速率限制 | 指数退避重试 |
| `APIError` | API 调用失败 | 直接抛出 |
| `JSONDecodeError` | JSON 解析失败 | 尝试多种提取方式 |

---

## 5. 数据模型

### 5.1 VoiceEntryResult 结构

```typescript
interface VoiceEntryResult {
  supplier: string;     // 供应商全称
  notes: string;        // 备注信息
  items: ProcurementItem[];
}
```

**JSON 示例**：

```json
{
  "supplier": "永辉超市",
  "notes": "",
  "items": [
    {
      "name": "农夫山泉",
      "specification": "24瓶/箱",
      "quantity": 3,
      "unit": "箱",
      "unitPrice": 28,
      "total": 84
    }
  ]
}
```

### 5.2 ProcurementItem 结构

```typescript
interface ProcurementItem {
  name: string;           // 商品名称
  specification: string;  // 包装规格（如 "24瓶/箱", "去皮"）
  quantity: number;       // 数量（采购单位数量）
  unit: string;           // 采购单位（箱/斤/袋/桶）
  unitPrice: number;      // 采购单位价格（注意：非最小单位价格）
  total: number;          // 小计 = quantity × unitPrice
}
```

#### 5.2.1 unitPrice 语义说明

**关键点**：`unitPrice` 始终表示采购单位的价格，而非最小单位。

**示例**：

| specification | unit | unitPrice 含义 |
|---------------|------|----------------|
| "24瓶/箱" | "箱" | 每箱价格（如 28元/箱） |
| "500ml/瓶" | "瓶" | 每瓶价格（如 5元/瓶） |
| "去皮" | "斤" | 每斤价格（如 68元/斤） |

### 5.3 WebSocket 消息模型

```typescript
enum ASRStatus {
  LISTENING = "listening",
  PROCESSING = "processing",
  COMPLETED = "completed",
  ERROR = "error"
}

interface VoiceMessage {
  type: 'status' | 'partial' | 'text_final' | 'stop_recording' | 'result' | 'error';
  status?: ASRStatus;
  message?: string;
  text?: string;
  raw_text?: string;
  result?: VoiceEntryResult;
  error?: string;
}
```

---

## 6. Cloudflare Workers 迁移注意事项

### 6.1 Durable Objects 使用场景

#### 6.1.1 必须使用 DO 的场景

1. **WebSocket 会话管理**
   - 维护前端 ↔ 讯飞的双向 WebSocket 代理
   - 存储 `rec_text` 字典（动态修正逻辑）
   - 管理连接状态（录音会话）

2. **状态持久化**
   - 跨多次 API 调用的会话状态
   - 用户录音历史（可选）

#### 6.1.2 DO 实现建议

```typescript
export class VoiceSessionDO {
  state: DurableObjectState;
  env: Env;

  private clientWs?: WebSocket;
  private xunfeiWs?: WebSocket;
  private recText: Map<number, string> = new Map();

  constructor(state: DurableObjectState, env: Env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    // 处理 WebSocket 升级请求
    const upgradeHeader = request.headers.get('Upgrade');
    if (upgradeHeader !== 'websocket') {
      return new Response('Expected Upgrade: websocket', { status: 426 });
    }

    const [client, server] = Object.values(new WebSocketPair());
    await this.handleSession(server);

    return new Response(null, {
      status: 101,
      webSocket: client,
    });
  }

  async handleSession(ws: WebSocket): Promise<void> {
    this.clientWs = ws;
    ws.accept();

    ws.addEventListener('message', async (event) => {
      const message = JSON.parse(event.data as string);
      await this.handleClientMessage(message);
    });
  }

  async handleClientMessage(message: ClientMessage): Promise<void> {
    // 实现消息路由逻辑
  }
}
```

### 6.2 WebSocket 处理差异

#### 6.2.1 Python (FastAPI) vs Workers

| 特性 | FastAPI | Cloudflare Workers |
|------|---------|-------------------|
| WebSocket API | `websockets` 库 | 标准 Web API + DO |
| 连接管理 | 自动管理 | 需在 DO 中手动维护 |
| 并发控制 | `asyncio` | DO 自动序列化请求 |
| 状态存储 | 内存变量 | DO state / KV |

#### 6.2.2 WebSocket 发送示例

```typescript
// Python: await websocket.send_json({...})
// Workers:
this.clientWs?.send(JSON.stringify({
  type: 'partial',
  text: currentText
}));
```

### 6.3 音频处理

#### 6.3.1 ffmpeg 替代方案

**问题**：Workers 不支持 subprocess（无法调用 ffmpeg）

**解决方案**：

1. **前端转码**：使用 Web Audio API 直接生成 PCM
2. **Workers 库**：使用 `@ffmpeg/ffmpeg` WASM 版本（注意大小限制）
3. **外部服务**：通过 Service Binding 调用专用转码服务

#### 6.3.2 推荐方案：前端直接生成 PCM

```typescript
// 前端 (voiceEntryService.ts:186)
this.audioProcessor = this.audioContext.createScriptProcessor(512, 1, 1);
this.audioProcessor.onaudioprocess = (e) => {
  const inputData = e.inputBuffer.getChannelData(0);
  const pcmData = this.float32ToPCM16(inputData);  // 已实现
  const base64Data = this.arrayBufferToBase64(pcmData);

  this.ws.send(JSON.stringify({
    type: 'audio',
    data: base64Data
  }));
};
```

**结论**：前端已经直接发送 PCM Base64，无需后端转换。

### 6.4 环境变量

#### 6.4.1 Workers 环境变量配置

```toml
# wrangler.toml
[env.production]
vars = { }

[env.production.secrets]
XUNFEI_APP_ID = "..."
XUNFEI_API_KEY = "..."
XUNFEI_API_SECRET = "..."
QWEN_API_KEY = "..."
```

**设置方式**：

```bash
wrangler secret put XUNFEI_APP_ID
wrangler secret put XUNFEI_API_KEY
wrangler secret put XUNFEI_API_SECRET
wrangler secret put QWEN_API_KEY
```

#### 6.4.2 TypeScript 类型定义

```typescript
interface Env {
  XUNFEI_APP_ID: string;
  XUNFEI_API_KEY: string;
  XUNFEI_API_SECRET: string;
  QWEN_API_KEY: string;

  // Durable Object 绑定
  VOICE_SESSION: DurableObjectNamespace;

  // KV 存储（可选，用于缓存）
  VOICE_CACHE?: KVNamespace;
}
```

### 6.5 限制与优化

#### 6.5.1 Workers 限制

| 限制 | 值 | 影响 |
|------|-----|------|
| CPU 时间 | 50ms (免费) / 30s (付费) | Qwen API 调用需使用 Durable Alarms |
| 内存 | 128MB | 音频数据需流式处理 |
| 请求大小 | 100MB | 音频文件上传限制 |
| WebSocket 消息 | 1MB/消息 | PCM 分块发送 |

#### 6.5.2 优化建议

1. **流式处理**：不要缓存完整音频，实时转发
2. **Durable Alarms**：长时间 API 调用（Qwen）使用 Alarms
3. **KV 缓存**：缓存识别结果（可选）
4. **错误重试**：Workers 自动重试，需处理幂等性

### 6.6 Redis 队列替代

#### 6.6.1 原实现

Python 后端使用 Redis 队列进行：
- 任务入队/出队
- 并发限制（最大 3 个）
- 结果缓存（1 小时 TTL）

#### 6.6.2 Workers 替代方案

**方案 1：Durable Objects 队列**

```typescript
export class TaskQueueDO {
  private queue: Task[] = [];
  private processing = 0;
  private maxConcurrent = 3;

  async enqueue(task: Task): Promise<string> {
    this.queue.push(task);
    await this.processNext();
    return task.id;
  }

  async processNext(): Promise<void> {
    if (this.processing >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift()!;
    this.processing++;

    try {
      await this.handleTask(task);
    } finally {
      this.processing--;
      await this.processNext();
    }
  }
}
```

**方案 2：Queues (Beta)**

使用 Cloudflare Queues (目前仍在 Beta)：

```typescript
await env.VOICE_QUEUE.send({
  type: 'TEXT_EXTRACT',
  payload: { text }
});
```

**推荐**：DO 队列（稳定可用）

---

## 7. 测试检查清单

### 7.1 WebSocket 端点测试

#### 7.1.1 正常流程

```bash
# 工具：wscat
npm install -g wscat
wscat -c ws://localhost:8787/api/voice/ws

# 测试步骤
> {"type":"start"}
< {"type":"status","status":"listening","message":"开始录音..."}

> {"type":"audio","data":"<Base64 PCM>"}
< {"type":"partial","text":"永辉"}

> {"type":"audio","data":"<Base64 PCM>"}
< {"type":"partial","text":"永辉超市"}

> {"type":"end"}
< {"type":"stop_recording","message":"识别完成"}
< {"type":"text_final","status":"completed","text":"永辉超市农夫山泉三箱"}
```

#### 7.1.2 错误场景

```bash
# 1. 无效 APPID
预期: {"type":"error","error":"讯飞 ASR 错误 10114: appid 不存在"}

# 2. 超时
> {"type":"start"}
# 等待 30 秒不发送音频
预期: {"type":"error","error":"讯飞 ASR 接收超时"}

# 3. 取消录音
> {"type":"cancel"}
预期: 连接关闭
```

### 7.2 REST 端点测试

#### 7.2.1 POST /api/voice/extract

```bash
curl -X POST http://localhost:8787/api/voice/extract \
  -H "Content-Type: application/json" \
  -d '{"text":"永辉超市农夫山泉三箱每箱二十四瓶二十八块一箱"}'

# 预期响应
{
  "success": true,
  "result": {
    "supplier": "永辉超市",
    "notes": "",
    "items": [
      {
        "name": "农夫山泉",
        "specification": "24瓶/箱",
        "quantity": 3,
        "unit": "箱",
        "unitPrice": 28,
        "total": 84
      }
    ]
  }
}
```

#### 7.2.2 POST /api/voice/transcribe

```bash
# 上传音频文件
curl -X POST http://localhost:8787/api/voice/transcribe \
  -F "audio=@recording.webm"

# 预期响应
{
  "success": true,
  "raw_text": "永辉超市农夫山泉三箱每箱二十四瓶二十八块一箱",
  "result": {
    "supplier": "永辉超市",
    "notes": "",
    "items": [...]
  }
}
```

#### 7.2.3 GET /api/voice/health

```bash
curl http://localhost:8787/api/voice/health

# 预期响应
{
  "status": "ok",
  "services": {
    "xunfei_asr": "available",
    "qwen_extractor": "available"
  },
  "queue": {
    "connected": true,
    "queue_length": 0,
    "processing": 0,
    "max_concurrent": 3
  }
}
```

### 7.3 集成测试

#### 7.3.1 前端集成测试

```typescript
// 测试脚本
import { voiceEntryService } from './services/voiceEntryService';

voiceEntryService.setCallbacks({
  onStatusChange: (status, message) => {
    console.log('[Status]', status, message);
  },
  onPartialText: (text) => {
    console.log('[Partial]', text);
  },
  onTextFinal: (text) => {
    console.log('[Final]', text);
  },
  onError: (error) => {
    console.error('[Error]', error);
  }
});

await voiceEntryService.startRecording();
// 录音 5 秒后
voiceEntryService.stopRecording();
```

#### 7.3.2 压力测试

```bash
# 使用 k6 进行 WebSocket 压力测试
k6 run --vus 10 --duration 30s websocket-test.js

# 检查指标
# - 并发连接数: 10
# - 平均延迟: <500ms
# - 错误率: <1%
```

### 7.4 性能指标

| 指标 | 目标 | 说明 |
|------|------|------|
| WebSocket 连接延迟 | <200ms | 从 start 到 listening |
| 首次部分结果延迟 | <500ms | 从发送首个音频到收到 partial |
| 识别完成延迟 | <2s | 从 end 到 text_final |
| Qwen 提取延迟 | <3s | 从 /extract 调用到返回结果 |
| 错误恢复时间 | <5s | 从错误到可重新录音 |

---

## 8. 环境变量配置

### 8.1 必需变量

| 变量 | 说明 | 示例 |
|------|------|------|
| `XUNFEI_APP_ID` | 讯飞应用 ID | `12345678` |
| `XUNFEI_API_KEY` | 讯飞 API Key | `abcdefghijklmnop` |
| `XUNFEI_API_SECRET` | 讯飞 API Secret | `YourSecretKeyHere` |
| `QWEN_API_KEY` | 通义千问 API Key | `sk-xxx` |

### 8.2 可选变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `QWEN_BASE_URL` | Qwen API 端点 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |
| `QWEN_MODEL` | Qwen 模型名称 | `qwen-plus` |
| `CORS_ORIGINS` | 允许的前端域名 | `https://inv.smartice.ai` |

### 8.3 获取凭证

#### 8.3.1 讯飞凭证

1. 访问 [讯飞开放平台](https://www.xfyun.cn/)
2. 注册/登录账号
3. 创建应用（选择"语音听写"服务）
4. 在控制台获取 APPID、API Key、API Secret

#### 8.3.2 Qwen 凭证

1. 访问 [阿里云模型服务平台](https://dashscope.aliyun.com/)
2. 注册/登录阿里云账号
3. 开通通义千问服务
4. 创建 API Key

### 8.4 开发环境配置

```bash
# .dev.vars (Wrangler 本地开发)
XUNFEI_APP_ID=12345678
XUNFEI_API_KEY=abcdefghijklmnop
XUNFEI_API_SECRET=YourSecretKeyHere
QWEN_API_KEY=sk-xxx
```

### 8.5 生产环境配置

```bash
# 使用 wrangler secret
wrangler secret put XUNFEI_APP_ID --env production
wrangler secret put XUNFEI_API_KEY --env production
wrangler secret put XUNFEI_API_SECRET --env production
wrangler secret put QWEN_API_KEY --env production
```

---

## 附录 A：关键代码片段索引

| 功能 | 原文件 | 行号 |
|------|--------|------|
| WebSocket 路由 | `app/routes/voice.py` | 93-186 |
| 讯飞鉴权 URL 生成 | `app/services/xunfei_asr.py` | 58-91 |
| 讯飞首帧创建 | `app/services/xunfei_asr.py` | 93-122 |
| 动态修正算法 | `app/services/xunfei_asr.py` | 278-316 |
| Qwen Prompt | `app/services/qwen_extractor.py` | 36-52 |
| Qwen API 调用 | `app/services/qwen_extractor.py` | 148-160 |
| JSON 提取 | `app/services/qwen_extractor.py` | 90-118 |
| 数据模型 | `app/models/voice_entry.py` | 10-38 |

---

## 附录 B：参考资源

### 官方文档

- [讯飞 IAT API 文档](https://www.xfyun.cn/doc/asr/voicedictation/API.html)
- [通义千问 API 文档](https://help.aliyun.com/zh/dashscope/developer-reference/api-details)
- [Cloudflare Workers 文档](https://developers.cloudflare.com/workers/)
- [Durable Objects 文档](https://developers.cloudflare.com/workers/runtime-apis/durable-objects/)

### 关键技术点

1. **HMAC-SHA256 签名**：RFC 2104 标准
2. **WebSocket 协议**：RFC 6455
3. **PCM 音频格式**：Linear PCM (L16)
4. **Base64 编码**：RFC 4648

---

## 附录 C：已知问题与解决方案

### C.1 前端音频处理

**问题**：`ScriptProcessorNode` 已废弃

**解决方案**：使用 `AudioWorklet` 替代

```typescript
// 现代方案 (需迁移)
await audioContext.audioWorklet.addModule('audio-processor.js');
const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
```

### C.2 讯飞识别延迟

**问题**：静音检测超时导致识别完成缓慢

**解决方案**：
- 已设置 `vad_eos=60000ms`（最大值）
- 用户手动点击"停止"控制录音结束

### C.3 Qwen 速率限制

**问题**：高频请求触发 429 错误

**解决方案**：
- 已实现指数退避重试（5s, 10s, 20s）
- 考虑使用 DO 队列限流

---

## 附录 D：迁移检查清单

### D.1 核心功能

- [ ] WebSocket 连接管理（DO 实现）
- [ ] 讯飞 ASR 集成（鉴权 + 动态修正）
- [ ] Qwen API 集成（提取逻辑）
- [ ] 音频格式处理（前端已处理）
- [ ] 错误处理与重试

### D.2 API 端点

- [ ] `ws://.../api/voice/ws` (WebSocket)
- [ ] `POST /api/voice/extract` (文本 → JSON)
- [ ] `POST /api/voice/transcribe` (音频 → JSON)
- [ ] `GET /api/voice/health` (健康检查)

### D.3 配置与部署

- [ ] 环境变量配置（Secrets）
- [ ] CORS 策略（支持前端域名）
- [ ] 日志记录（console.log → Workers Analytics）
- [ ] 监控与告警（Workers Logpush）

### D.4 测试覆盖

- [ ] WebSocket 正常流程
- [ ] WebSocket 错误处理
- [ ] REST API 端点
- [ ] 前端集成测试
- [ ] 性能压力测试

---

**文档版本**：v1.0
**最后更新**：2024-12-01
**作者**：Claude (Anthropic)
**源项目版本**：v2.6
