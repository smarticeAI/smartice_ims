# 讯飞语音听写服务 (IAT - Intelligent Audio Transcription)
# v3.5 - 实时流式语音识别，支持 WebSocket 双向通信
# v3.1: 优化 vad_eos 从 3000ms 降至 2000ms，减少静音检测延迟
# v3.2: 正确处理 pgs/rg 字段，实现逐字显示效果
# v3.3: 修复识别完成后继续发送音频导致的 timeout 错误
# v3.4: 移除 Mock 模式，API 错误时抛出异常
# v3.5: 延迟凭证验证，避免应用启动崩溃
# 文档: https://www.xfyun.cn/doc/asr/voicedictation/API.html

import websockets
import hashlib
import hmac
import base64
import json
import asyncio
from datetime import datetime
from time import mktime
from wsgiref.handlers import format_date_time
from urllib.parse import urlencode, quote
import os
from typing import AsyncGenerator, Callable, Optional


class XunfeiASRService:
    """
    讯飞语音听写服务 (IAT)
    支持 60 秒内实时语音识别
    """

    IAT_URL = "wss://iat-api.xfyun.cn/v2/iat"
    HOST = "iat-api.xfyun.cn"

    def __init__(self):
        """
        初始化讯飞 ASR 服务
        需要 APPID, APIKey, APISecret 三个凭证
        v3.5: 延迟验证凭证，不在启动时崩溃
        """
        self.app_id = os.getenv("XUNFEI_APP_ID", "")
        self.api_key = os.getenv("XUNFEI_API_KEY", "")
        self.api_secret = os.getenv("XUNFEI_API_SECRET", "")

        # 检查配置状态但不抛出异常
        self.available = bool(self.app_id and self.api_key and self.api_secret)

        if self.available:
            print(f"[XunfeiASR] 已配置 - APPID: {self.app_id[:4]}***")
        else:
            print("[XunfeiASR] 警告: 未完整配置讯飞凭证，服务不可用")

    def _check_available(self):
        """检查服务是否可用，不可用时抛出异常"""
        if not self.available:
            raise RuntimeError(
                "讯飞 ASR 服务未配置。请设置环境变量: "
                "XUNFEI_APP_ID, XUNFEI_API_KEY, XUNFEI_API_SECRET"
            )

    def _create_auth_url(self) -> str:
        """
        生成鉴权 URL (HMAC-SHA256 签名)
        """
        now = datetime.now()
        date = format_date_time(mktime(now.timetuple()))

        signature_origin = f"host: {self.HOST}\n"
        signature_origin += f"date: {date}\n"
        signature_origin += "GET /v2/iat HTTP/1.1"

        signature_sha = hmac.new(
            self.api_secret.encode('utf-8'),
            signature_origin.encode('utf-8'),
            digestmod=hashlib.sha256
        ).digest()

        signature_sha_base64 = base64.b64encode(signature_sha).decode('utf-8')

        authorization_origin = (
            f'api_key="{self.api_key}", '
            f'algorithm="hmac-sha256", '
            f'headers="host date request-line", '
            f'signature="{signature_sha_base64}"'
        )
        authorization = base64.b64encode(authorization_origin.encode('utf-8')).decode('utf-8')

        params = {
            "authorization": authorization,
            "date": date,
            "host": self.HOST
        }

        return f"{self.IAT_URL}?{urlencode(params)}"

    def _create_first_frame(self, language: str = "zh_cn") -> dict:
        """
        创建首帧数据 (包含业务参数)
        """
        business_params = {
            "language": language,
            "domain": "iat",
            "accent": "mandarin" if language == "zh_cn" else "mandarin",
            "vad_eos": 10000,
            "dwa": "wpgs",
            "ptt": 1,
            "nunum": 1,
        }

        print(f"[XunfeiASR] 业务参数: language={language}, vad_eos=10000ms, dwa=wpgs")

        return {
            "common": {
                "app_id": self.app_id
            },
            "business": business_params,
            "data": {
                "status": 0,
                "format": "audio/L16;rate=16000",
                "encoding": "raw",
                "audio": ""
            }
        }

    def _create_audio_frame(self, audio_base64: str, is_last: bool = False) -> dict:
        """
        创建音频帧数据
        """
        return {
            "data": {
                "status": 2 if is_last else 1,
                "format": "audio/L16;rate=16000",
                "encoding": "raw",
                "audio": audio_base64
            }
        }

    async def transcribe_audio_bytes(self, audio_data: bytes) -> str:
        """
        识别完整音频数据

        Args:
            audio_data: PCM 音频数据 (16kHz, 16bit, 单声道)

        Returns:
            识别文本

        Raises:
            RuntimeError: 服务未配置或识别过程中出错
            ConnectionError: 连接讯飞 API 失败
        """
        self._check_available()
        full_text = ""

        try:
            auth_url = self._create_auth_url()
            print(f"[XunfeiASR] 连接: {self.IAT_URL}")

            async with websockets.connect(auth_url) as ws:
                first_frame = self._create_first_frame()
                await ws.send(json.dumps(first_frame))

                chunk_size = 1280
                total_chunks = (len(audio_data) + chunk_size - 1) // chunk_size

                for i in range(0, len(audio_data), chunk_size):
                    chunk = audio_data[i:i + chunk_size]
                    is_last = (i + chunk_size >= len(audio_data))

                    audio_base64 = base64.b64encode(chunk).decode('utf-8')
                    frame = self._create_audio_frame(audio_base64, is_last)
                    await ws.send(json.dumps(frame))

                    await asyncio.sleep(0.04)

                while True:
                    try:
                        response = await asyncio.wait_for(ws.recv(), timeout=10)
                        result = json.loads(response)

                        code = result.get("code", -1)
                        if code != 0:
                            error_msg = result.get("message", "Unknown error")
                            raise RuntimeError(f"讯飞 ASR 错误 {code}: {error_msg}")

                        data = result.get("data", {})
                        if data:
                            result_obj = data.get("result", {})
                            ws_list = result_obj.get("ws", [])

                            for ws_item in ws_list:
                                cw_list = ws_item.get("cw", [])
                                for cw in cw_list:
                                    word = cw.get("w", "")
                                    full_text += word

                            status = data.get("status", 0)
                            if status == 2:
                                print(f"[XunfeiASR] 识别完成: {full_text}")
                                break

                    except asyncio.TimeoutError:
                        raise RuntimeError("讯飞 ASR 接收超时")

        except websockets.exceptions.WebSocketException as e:
            raise ConnectionError(f"讯飞 WebSocket 连接失败: {e}") from e
        except Exception as e:
            if isinstance(e, (ConnectionError, RuntimeError)):
                raise
            raise RuntimeError(f"讯飞 ASR 错误: {e}") from e

        return full_text

    async def transcribe_realtime(
        self,
        client_ws,
        on_partial: Optional[Callable[[str], None]] = None
    ) -> str:
        """
        实时流式语音识别

        Args:
            client_ws: 客户端 WebSocket 连接
            on_partial: 部分结果回调函数

        Returns:
            完整识别文本

        Raises:
            RuntimeError: 服务未配置或识别过程中出错
            ConnectionError: 连接讯飞 API 失败
        """
        self._check_available()
        full_text = ""
        xunfei_ws = None
        rec_text: dict[int, str] = {}
        recognition_done = asyncio.Event()

        def get_current_text() -> str:
            if not rec_text:
                return ""
            sorted_keys = sorted(rec_text.keys())
            return "".join(rec_text[k] for k in sorted_keys)

        try:
            auth_url = self._create_auth_url()
            print(f"[XunfeiASR] 实时连接: {self.IAT_URL}")

            xunfei_ws = await websockets.connect(auth_url)

            first_frame = self._create_first_frame()
            await xunfei_ws.send(json.dumps(first_frame))
            print("[XunfeiASR] 已发送首帧 (dwa=wpgs 动态修正已启用)")

            receive_task = None
            send_task = None

            async def receive_from_xunfei():
                nonlocal full_text

                try:
                    while True:
                        response = await asyncio.wait_for(xunfei_ws.recv(), timeout=30)
                        result = json.loads(response)

                        code = result.get("code", -1)
                        if code != 0:
                            error_msg = result.get("message", "Unknown error")
                            print(f"[XunfeiASR] 讯飞错误 {code}: {error_msg}")
                            await client_ws.send_json({
                                "type": "error",
                                "error": f"ASR Error: {error_msg}"
                            })
                            break

                        data = result.get("data", {})
                        if data:
                            result_obj = data.get("result", {})
                            ws_list = result_obj.get("ws", [])

                            pgs = result_obj.get("pgs", "apd")
                            rg = result_obj.get("rg", [])
                            sn = result_obj.get("sn", 0)
                            status = data.get("status", 0)

                            ws_words = []
                            for ws_item in ws_list:
                                for cw in ws_item.get("cw", []):
                                    ws_words.append(cw.get("w", ""))
                            print(f"[XunfeiASR] 收到响应: status={status}, sn={sn}, pgs={pgs}, rg={rg}, words={ws_words}")

                            partial_text = ""
                            for ws_item in ws_list:
                                cw_list = ws_item.get("cw", [])
                                for cw in cw_list:
                                    word = cw.get("w", "")
                                    partial_text += word

                            if partial_text or pgs == "rpl":
                                if pgs == "rpl" and rg and len(rg) >= 2:
                                    rec_text[rg[0]] = partial_text
                                    for i in range(rg[0] + 1, rg[1] + 1):
                                        rec_text.pop(i, None)
                                    print(f"[XunfeiASR] 替换 sn={rg[0]}-{rg[1]}: {partial_text}")
                                else:
                                    rec_text[sn] = partial_text
                                    print(f"[XunfeiASR] 追加 sn={sn}: {partial_text}")

                                full_text = get_current_text()

                                await client_ws.send_json({
                                    "type": "partial",
                                    "text": full_text
                                })

                                if on_partial:
                                    await on_partial(full_text)

                            if status == 2:
                                full_text = get_current_text()
                                print(f"[XunfeiASR] 识别完成: {full_text}")
                                recognition_done.set()
                                break

                except asyncio.TimeoutError:
                    print("[XunfeiASR] 接收超时")
                    recognition_done.set()
                except Exception as e:
                    print(f"[XunfeiASR] 接收错误: {e}")
                    recognition_done.set()

            async def send_to_xunfei():
                audio_frame_count = 0
                try:
                    while True:
                        if recognition_done.is_set():
                            print(f"[XunfeiASR] 识别已完成，停止接收音频 (共 {audio_frame_count} 帧)")
                            break

                        try:
                            raw_message = await asyncio.wait_for(
                                client_ws.receive_text(),
                                timeout=0.5
                            )
                        except asyncio.TimeoutError:
                            continue

                        message = json.loads(raw_message)
                        msg_type = message.get("type", "")

                        if msg_type == "audio":
                            if recognition_done.is_set():
                                continue

                            audio_base64 = message.get("data", "")
                            if audio_base64:
                                frame = self._create_audio_frame(audio_base64, is_last=False)
                                await xunfei_ws.send(json.dumps(frame))
                                audio_frame_count += 1
                                if audio_frame_count % 10 == 0:
                                    print(f"[XunfeiASR] 已发送 {audio_frame_count} 帧音频")

                        elif msg_type == "end":
                            if recognition_done.is_set():
                                print(f"[XunfeiASR] 识别已完成，跳过结束帧 (共 {audio_frame_count} 帧)")
                                break
                            print(f"[XunfeiASR] 共发送 {audio_frame_count} 帧音频，发送结束帧...")
                            end_frame = self._create_audio_frame("", is_last=True)
                            await xunfei_ws.send(json.dumps(end_frame))
                            print("[XunfeiASR] 已发送结束帧")
                            break

                        elif msg_type == "cancel":
                            print(f"[XunfeiASR] 客户端取消录音 (已发送 {audio_frame_count} 帧)")
                            break

                except Exception as e:
                    print(f"[XunfeiASR] 发送错误: {e}")

            receive_task = asyncio.create_task(receive_from_xunfei())
            send_task = asyncio.create_task(send_to_xunfei())

            await asyncio.gather(receive_task, send_task, return_exceptions=True)

        except websockets.exceptions.WebSocketException as e:
            raise ConnectionError(f"讯飞 WebSocket 连接失败: {e}") from e
        except Exception as e:
            if isinstance(e, (ConnectionError, RuntimeError)):
                raise
            raise RuntimeError(f"讯飞 ASR 实时识别错误: {e}") from e

        finally:
            if xunfei_ws:
                await xunfei_ws.close()

        return full_text


# 单例实例
xunfei_asr = XunfeiASRService()
