# 野百灵库存录入系统 - 语音识别后端
# v1.1 - FastAPI 应用入口
# v1.1: 切换 Gemini → Qwen (通义千问)
# 功能: 语音录入 → 讯飞ASR → Qwen结构化提取 → JSON

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
import os

# 加载环境变量
load_dotenv()

# 创建 FastAPI 应用
app = FastAPI(
    title="野百灵语音录入服务",
    description="库存采购语音录入后端 - 支持四川方言/普通话",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS 配置 - 允许前端访问
# v1.2: 移除通配符'*'，仅允许明确的开发/生产域名
ALLOWED_ORIGINS = [
    "http://localhost:3000",      # Vite 开发服务器
    "http://localhost:5173",      # Vite 默认端口
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173",
    # 生产环境添加实际域名:
    # "https://your-production-domain.com",
]

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
    return {
        "service": "野百灵语音录入服务",
        "version": "1.0.0",
        "status": "running",
        "endpoints": {
            "websocket": "/api/voice/ws",
            "transcribe": "/api/voice/transcribe",
            "extract": "/api/voice/extract",
            "health": "/api/voice/health",
            "docs": "/docs"
        }
    }


@app.on_event("startup")
async def startup_event():
    """
    应用启动事件
    """
    print("=" * 50)
    print("野百灵语音录入服务启动")
    print("=" * 50)

    # 检查环境变量配置
    xunfei_configured = bool(os.getenv("XUNFEI_APP_ID")) and bool(os.getenv("XUNFEI_API_KEY"))
    qwen_configured = bool(os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY"))

    print(f"讯飞 ASR: {'已配置' if xunfei_configured else '未配置'}")
    print(f"Qwen:     {'已配置' if qwen_configured else '未配置'}")
    print("=" * 50)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )
