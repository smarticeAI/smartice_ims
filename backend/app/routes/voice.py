# 语音录入 API 路由
# v2.7 - /extract 支持传入当前表单数据，实现修改/删除/添加功能
# v2.6 - 语音识别与结构化提取分离：WebSocket 仅返回识别文本，用户确认后再调用 /extract
# v2.5: 添加 Redis 队列状态端点
# v2.4: 添加文件上传验证 (大小限制、格式检查)
# v2.3: 切换到 Qwen (通义千问) 替代 Gemini 作为结构化提取服务
# v2.2: 添加 stop_recording 信号，通知前端停止发送音频
# v2.1: 支持连续录音会话，收到识别结果后不关闭 WebSocket
# 支持 WebM -> PCM 音频格式转换，实时返回部分识别结果

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import base64
import json
import asyncio
import subprocess
import tempfile
import os
from typing import Optional

from app.models.voice_entry import VoiceEntryResult, VoiceMessage, ASRStatus
from app.services.xunfei_asr import xunfei_asr
# v2.3: 切换到 Qwen (通义千问) 作为结构化提取服务
from app.services.qwen_extractor import qwen_extractor
# v2.5: 添加队列服务
from app.services.queue_service import queue_service


async def convert_audio_to_pcm(audio_data: bytes, input_format: str = "webm") -> bytes:
    """
    使用 ffmpeg 将音频转换为 PCM 格式 (16kHz, 16bit, mono)

    Args:
        audio_data: 原始音频数据
        input_format: 输入格式 (webm, mp3, wav 等)

    Returns:
        PCM 音频数据
    """
    with tempfile.NamedTemporaryFile(suffix=f".{input_format}", delete=False) as input_file:
        input_file.write(audio_data)
        input_path = input_file.name

    output_path = input_path + ".pcm"

    try:
        # 使用 ffmpeg 转换
        cmd = [
            "ffmpeg", "-y",
            "-i", input_path,
            "-ar", "16000",      # 采样率 16kHz
            "-ac", "1",          # 单声道
            "-f", "s16le",       # 16-bit signed little-endian PCM
            output_path
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=30
        )

        if result.returncode != 0:
            print(f"[AudioConvert] ffmpeg 错误: {result.stderr.decode()}")
            raise Exception(f"音频转换失败: {result.stderr.decode()}")

        # 读取转换后的 PCM 数据
        with open(output_path, "rb") as f:
            pcm_data = f.read()

        print(f"[AudioConvert] 转换成功: {len(audio_data)} -> {len(pcm_data)} bytes")
        return pcm_data

    finally:
        # 清理临时文件
        if os.path.exists(input_path):
            os.remove(input_path)
        if os.path.exists(output_path):
            os.remove(output_path)


# 文件上传限制
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB
ALLOWED_AUDIO_TYPES = {
    "audio/webm", "audio/wav", "audio/wave", "audio/x-wav",
    "audio/mpeg", "audio/mp3", "audio/ogg", "application/octet-stream"
}
ALLOWED_EXTENSIONS = {".webm", ".wav", ".mp3", ".ogg", ".pcm"}

router = APIRouter(prefix="/api/voice", tags=["语音录入"])


@router.websocket("/ws")
async def voice_entry_websocket(websocket: WebSocket):
    """
    WebSocket 实时流式语音录入接口

    协议说明 (实时模式):
    - 客户端发送: { "type": "start" } 开始录音
    - 客户端发送: { "type": "audio", "data": "<base64 encoded PCM>" } 音频块
    - 客户端发送: { "type": "end" } 结束录音
    - 服务端返回: { "type": "status", "status": "listening", "message": "..." }
    - 服务端返回: { "type": "partial", "text": "实时识别文本..." }
    - 服务端返回: { "type": "result", "raw_text": "完整文本", "result": {...} }

    音频格式要求:
    - PCM: 16kHz, 16bit, 单声道
    - 建议每 40ms 发送一次音频块 (1280 bytes)

    v2.1: 支持连续录音会话 - 不在收到结果后关闭连接
    """
    await websocket.accept()
    print("[VoiceWS] 客户端已连接")

    try:
        while True:
            # 接收开始信号
            raw_message = await websocket.receive_text()
            message = json.loads(raw_message)
            msg_type = message.get("type", "")

            if msg_type == "start":
                # 发送状态确认
                await websocket.send_json({
                    "type": "status",
                    "status": ASRStatus.LISTENING.value,
                    "message": "开始录音..."
                })
                print("[VoiceWS] 开始实时识别")

                try:
                    # 使用实时流式识别
                    print("[VoiceWS] >>> 开始实时识别...")
                    raw_text = await xunfei_asr.transcribe_realtime(
                        client_ws=websocket
                    )
                    print(f"[VoiceWS] >>> 讯飞识别完成，文本: {raw_text}")

                    # v2.6: 仅返回识别文本，不自动调用 Qwen 提取
                    # 用户可编辑文本后手动点击发送，调用 /api/voice/extract
                    print("[VoiceWS] >>> 发送 stop_recording 信号...")
                    await websocket.send_json({
                        "type": "stop_recording",
                        "message": "识别完成"
                    })

                    # 发送识别文本（不再包含结构化结果）
                    print(f"[VoiceWS] >>> 发送 text_final (不调用 Qwen!)，文本: {raw_text}")
                    await websocket.send_json({
                        "type": "text_final",
                        "status": ASRStatus.COMPLETED.value,
                        "text": raw_text
                    })

                    # 不关闭连接，等待下一次录音
                    print("[VoiceWS] >>> 等待用户编辑/继续录音/发送解析...")

                except Exception as e:
                    print(f"[VoiceWS] 处理错误: {e}")
                    await websocket.send_json({
                        "type": "error",
                        "status": ASRStatus.ERROR.value,
                        "error": str(e)
                    })
                    # 出错后继续保持连接

            elif msg_type == "cancel":
                print("[VoiceWS] 客户端取消录音")
                break

            elif msg_type == "close":
                print("[VoiceWS] 客户端请求关闭连接")
                break

    except WebSocketDisconnect:
        print("[VoiceWS] 客户端断开连接")
    except Exception as e:
        print(f"[VoiceWS] 连接错误: {e}")
        try:
            await websocket.send_json({
                "type": "error",
                "error": str(e)
            })
        except:
            pass


@router.post("/transcribe")
async def transcribe_audio(
    audio: UploadFile = File(..., description="音频文件 (WebM/WAV/PCM, 自动转换)")
):
    """
    REST API: 上传音频文件进行识别

    支持格式:
    - WebM (推荐，浏览器默认格式，自动转换为 PCM)
    - WAV: 16kHz (自动跳过 WAV 头)
    - PCM: 16kHz, 16bit, 单声道

    限制:
    - 最大文件大小: 10MB
    - 最大音频时长: 60秒 (讯飞 ASR 限制)

    Returns:
        VoiceEntryResult: 结构化的采购清单
    """
    filename = audio.filename or "recording.webm"
    file_ext = os.path.splitext(filename)[1].lower()

    # 验证文件扩展名
    if file_ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"不支持的音频格式: {file_ext}。支持: {', '.join(ALLOWED_EXTENSIONS)}"
        )

    # 验证 Content-Type (允许 application/octet-stream 因为某些浏览器发送这个)
    if audio.content_type and audio.content_type not in ALLOWED_AUDIO_TYPES:
        print(f"[VoiceAPI] 警告: 非标准 Content-Type: {audio.content_type}")

    try:
        # 读取音频数据
        audio_data = await audio.read()

        # 验证文件大小
        if len(audio_data) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"文件过大: {len(audio_data) / 1024 / 1024:.1f}MB，最大允许 10MB"
            )

        if len(audio_data) == 0:
            raise HTTPException(status_code=400, detail="音频文件为空")

        print(f"[VoiceAPI] 收到音频文件: {filename}, 大小: {len(audio_data)} bytes")

        # 根据文件格式处理
        if filename.endswith(".webm") or audio.content_type == "audio/webm":
            # WebM -> PCM 转换
            print("[VoiceAPI] 检测到 WebM 格式，开始转换...")
            audio_data = await convert_audio_to_pcm(audio_data, "webm")
        elif filename.endswith(".wav"):
            # WAV 格式，跳过 44 字节的头
            audio_data = audio_data[44:]
        # 其他格式假设为 PCM

        # Step 1: 语音识别
        raw_text = await xunfei_asr.transcribe_audio_bytes(audio_data)
        print(f"[VoiceAPI] ASR 结果: {raw_text}")

        # Step 2: 结构化提取
        result = await qwen_extractor.extract(raw_text)

        return JSONResponse(content={
            "success": True,
            "raw_text": raw_text,
            "result": result.model_dump()
        })

    except HTTPException:
        # 重新抛出已处理的 HTTP 异常
        raise
    except RuntimeError as e:
        # 服务未配置
        print(f"[VoiceAPI] 服务未配置: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except ConnectionError as e:
        # 外部 API 连接失败
        print(f"[VoiceAPI] 连接错误: {e}")
        raise HTTPException(status_code=502, detail=f"外部服务连接失败: {e}")
    except ValueError as e:
        # 输入验证错误
        print(f"[VoiceAPI] 输入错误: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        print(f"[VoiceAPI] 处理错误: {e}")
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {e}")


class TextInput(BaseModel):
    """文本输入模型 - v2.7 支持传入当前表单数据"""
    text: str
    current_data: Optional[dict] = None  # v2.7: 当前表单数据（用于修改模式）


@router.post("/extract")
async def extract_from_text(input_data: TextInput):
    """
    REST API: 直接从文本提取结构化数据 (跳过 ASR)

    v2.7 新增：支持传入 current_data 实现修改/删除/添加功能
    - 如果 current_data 为空或无 items，使用新建模式
    - 如果 current_data 有 items，使用修改模式（AI 理解用户指令并更新）

    Args:
        input_data: 包含 text 和可选 current_data 字段的 JSON 请求体

    Returns:
        VoiceEntryResult: 结构化的采购清单（修改模式下返回完整更新后的数据）
    """
    has_current = bool(input_data.current_data and input_data.current_data.get("items"))
    mode = "修改" if has_current else "新建"
    print(f"[VoiceAPI] >>> /extract 被调用! 模式: {mode}, 文本: {input_data.text[:50]}...")

    try:
        print(f"[VoiceAPI] >>> 正在调用 Qwen 解析 ({mode}模式)...")
        result = await qwen_extractor.extract(
            input_data.text,
            current_data=input_data.current_data
        )
        print(f"[VoiceAPI] >>> Qwen 解析完成: {result}")
        return JSONResponse(content={
            "success": True,
            "result": result.model_dump()
        })
    except RuntimeError as e:
        # 服务未配置
        raise HTTPException(status_code=503, detail=str(e))
    except ValueError as e:
        # 输入验证错误 (空文本)
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"服务器内部错误: {e}")


@router.get("/health")
async def health_check():
    """
    健康检查接口 - 返回服务配置状态
    """
    xunfei_status = "available" if xunfei_asr.available else "not_configured"
    qwen_status = "available" if qwen_extractor.available else "not_configured"
    queue_stats = await queue_service.get_queue_stats()

    # 整体状态: 两个服务都可用才算 ok
    overall_status = "ok" if (xunfei_asr.available and qwen_extractor.available) else "degraded"

    return {
        "status": overall_status,
        "services": {
            "xunfei_asr": xunfei_status,
            "qwen_extractor": qwen_status
        },
        "queue": queue_stats
    }


@router.get("/queue/stats")
async def get_queue_stats():
    """
    获取队列统计信息

    返回:
    - connected: Redis 是否已连接
    - queue_length: 等待中的任务数
    - processing: 正在处理的任务数
    - max_concurrent: 最大并发数
    """
    return await queue_service.get_queue_stats()
