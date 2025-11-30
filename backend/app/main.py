# 野百灵库存录入系统 - 语音识别后端
# v1.2 - FastAPI 应用入口
# v1.2: 添加 Redis 队列支持，CORS 环境变量配置
# v1.1: 切换 Gemini → Qwen (通义千问)
# 功能: 语音录入 → 讯飞ASR → Qwen结构化提取 → JSON

import asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# 加载环境变量 (override=True 确保 .env 文件优先于系统环境变量)
load_dotenv(override=True)

# 导入队列服务
from app.services.queue_service import queue_service, TaskType


# 应用生命周期管理
@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用启动和关闭时的生命周期管理"""
    # 启动时
    print("=" * 50)
    print("野百灵语音录入服务启动")
    print("=" * 50)

    # 检查环境变量配置
    xunfei_configured = bool(os.getenv("XUNFEI_APP_ID")) and bool(os.getenv("XUNFEI_API_KEY"))
    qwen_configured = bool(os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY"))
    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")

    print(f"讯飞 ASR: {'已配置' if xunfei_configured else '未配置'}")
    print(f"Qwen:     {'已配置' if qwen_configured else '未配置'}")
    print(f"Redis:    {redis_url}")

    # 连接 Redis 队列
    redis_connected = await queue_service.connect()
    if redis_connected:
        # 注册任务处理器
        from app.services.qwen_extractor import qwen_extractor
        queue_service.register_handler(
            TaskType.TEXT_EXTRACT,
            lambda payload: qwen_extractor.extract(payload.get("text", ""))
        )
        # 启动队列工作进程
        worker_task = asyncio.create_task(queue_service.start_worker())
        print("[队列服务] 工作进程已启动")
    else:
        print("[队列服务] Redis 未连接，使用直接调用模式")
        worker_task = None

    print("=" * 50)

    yield

    # 关闭时
    if worker_task:
        worker_task.cancel()
        try:
            await worker_task
        except asyncio.CancelledError:
            pass
    await queue_service.disconnect()
    print("服务已关闭")


# 创建 FastAPI 应用
app = FastAPI(
    title="野百灵语音录入服务",
    description="库存采购语音录入后端 - 支持四川方言/普通话",
    version="1.2.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS 配置 - 支持环境变量配置生产域名
# 开发环境默认域名
DEFAULT_ORIGINS = [
    "http://localhost:3000",      # Vite 开发服务器
    "http://localhost:5173",      # Vite 默认端口
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
]

# 从环境变量读取生产域名（逗号分隔）
# 例如: CORS_ORIGINS=https://app.example.com,https://www.example.com
extra_origins = os.getenv("CORS_ORIGINS", "")
if extra_origins:
    ALLOWED_ORIGINS = DEFAULT_ORIGINS + [origin.strip() for origin in extra_origins.split(",") if origin.strip()]
else:
    ALLOWED_ORIGINS = DEFAULT_ORIGINS

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With"],
)

# 注册路由
from app.routes.voice import router as voice_router
app.include_router(voice_router)


@app.get("/")
async def root():
    """
    根路由 - 服务信息
    """
    queue_stats = await queue_service.get_queue_stats()
    return {
        "service": "野百灵语音录入服务",
        "version": "1.2.0",
        "status": "running",
        "queue": queue_stats,
        "endpoints": {
            "websocket": "/api/voice/ws",
            "transcribe": "/api/voice/transcribe",
            "extract": "/api/voice/extract",
            "health": "/api/voice/health",
            "queue_stats": "/api/voice/queue/stats",
            "docs": "/docs"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
