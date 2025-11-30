# 野百灵库存录入系统 - Redis 队列服务
# v1.0 - 异步任务队列，支持 API 调用限流和任务管理
# 功能: 管理讯飞 ASR 和 Qwen 的 API 调用队列

import asyncio
import json
import uuid
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, Callable, Awaitable
from dataclasses import dataclass, asdict
import os

import redis.asyncio as redis
from pydantic import BaseModel


class TaskStatus(str, Enum):
    """任务状态"""
    PENDING = "pending"      # 等待处理
    PROCESSING = "processing"  # 处理中
    COMPLETED = "completed"  # 完成
    FAILED = "failed"        # 失败


class TaskType(str, Enum):
    """任务类型"""
    VOICE_ASR = "voice_asr"      # 语音识别
    TEXT_EXTRACT = "text_extract"  # 文本提取
    IMAGE_RECOGNIZE = "image_recognize"  # 图片识别


@dataclass
class Task:
    """任务对象"""
    id: str
    type: TaskType
    status: TaskStatus
    payload: Dict[str, Any]
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: str = ""
    updated_at: str = ""

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.utcnow().isoformat()
        if not self.updated_at:
            self.updated_at = self.created_at

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "Task":
        return cls(
            id=data["id"],
            type=TaskType(data["type"]),
            status=TaskStatus(data["status"]),
            payload=data["payload"],
            result=data.get("result"),
            error=data.get("error"),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", "")
        )


class QueueService:
    """
    Redis 队列服务

    提供任务队列管理功能：
    - 任务入队/出队
    - 任务状态管理
    - 并发限制
    - 结果缓存
    """

    # 队列键名
    QUEUE_KEY = "voice_entry:task_queue"
    TASK_PREFIX = "voice_entry:task:"
    RESULT_PREFIX = "voice_entry:result:"

    # 默认配置
    DEFAULT_REDIS_URL = "redis://localhost:6379/0"
    DEFAULT_TASK_TTL = 3600  # 任务结果保留 1 小时
    DEFAULT_MAX_CONCURRENT = 3  # 最大并发任务数

    def __init__(
        self,
        redis_url: Optional[str] = None,
        max_concurrent: int = DEFAULT_MAX_CONCURRENT,
        task_ttl: int = DEFAULT_TASK_TTL
    ):
        self.redis_url = redis_url or os.getenv("REDIS_URL", self.DEFAULT_REDIS_URL)
        self.max_concurrent = max_concurrent
        self.task_ttl = task_ttl
        self._redis: Optional[redis.Redis] = None
        self._processing_count = 0
        self._lock = asyncio.Lock()
        self._handlers: Dict[TaskType, Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]] = {}

    async def connect(self) -> bool:
        """连接 Redis"""
        try:
            self._redis = redis.from_url(
                self.redis_url,
                encoding="utf-8",
                decode_responses=True
            )
            # 测试连接
            await self._redis.ping()
            print(f"[队列服务] Redis 连接成功: {self.redis_url}")
            return True
        except Exception as e:
            print(f"[队列服务] Redis 连接失败: {e}")
            self._redis = None
            return False

    async def disconnect(self):
        """断开 Redis 连接"""
        if self._redis:
            await self._redis.close()
            self._redis = None
            print("[队列服务] Redis 连接已关闭")

    @property
    def is_connected(self) -> bool:
        """检查是否已连接"""
        return self._redis is not None

    def register_handler(
        self,
        task_type: TaskType,
        handler: Callable[[Dict[str, Any]], Awaitable[Dict[str, Any]]]
    ):
        """
        注册任务处理器

        Args:
            task_type: 任务类型
            handler: 异步处理函数，接收 payload 返回结果
        """
        self._handlers[task_type] = handler
        print(f"[队列服务] 注册处理器: {task_type.value}")

    async def enqueue(
        self,
        task_type: TaskType,
        payload: Dict[str, Any]
    ) -> str:
        """
        将任务加入队列

        Args:
            task_type: 任务类型
            payload: 任务数据

        Returns:
            任务 ID
        """
        task_id = str(uuid.uuid4())
        task = Task(
            id=task_id,
            type=task_type,
            status=TaskStatus.PENDING,
            payload=payload
        )

        if self._redis:
            # 存储任务详情
            await self._redis.setex(
                f"{self.TASK_PREFIX}{task_id}",
                self.task_ttl,
                json.dumps(task.to_dict())
            )
            # 加入队列
            await self._redis.lpush(self.QUEUE_KEY, task_id)
            print(f"[队列服务] 任务入队: {task_id} ({task_type.value})")
        else:
            # 无 Redis 时直接处理
            print(f"[队列服务] Redis 未连接，直接处理任务: {task_id}")
            asyncio.create_task(self._process_task_directly(task))

        return task_id

    async def get_task(self, task_id: str) -> Optional[Task]:
        """获取任务信息"""
        if not self._redis:
            return None

        data = await self._redis.get(f"{self.TASK_PREFIX}{task_id}")
        if data:
            return Task.from_dict(json.loads(data))
        return None

    async def get_result(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务结果"""
        task = await self.get_task(task_id)
        if task and task.status == TaskStatus.COMPLETED:
            return task.result
        return None

    async def _update_task(self, task: Task):
        """更新任务状态"""
        task.updated_at = datetime.utcnow().isoformat()
        if self._redis:
            await self._redis.setex(
                f"{self.TASK_PREFIX}{task.id}",
                self.task_ttl,
                json.dumps(task.to_dict())
            )

    async def _process_task_directly(self, task: Task):
        """直接处理任务（无 Redis 模式）"""
        handler = self._handlers.get(task.type)
        if not handler:
            print(f"[队列服务] 未找到处理器: {task.type.value}")
            return

        try:
            task.status = TaskStatus.PROCESSING
            result = await handler(task.payload)
            task.status = TaskStatus.COMPLETED
            task.result = result
        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            print(f"[队列服务] 任务处理失败: {task.id} - {e}")

    async def start_worker(self):
        """
        启动队列工作进程

        持续从队列中获取任务并处理
        """
        if not self._redis:
            print("[队列服务] Redis 未连接，工作进程未启动")
            return

        print(f"[队列服务] 工作进程启动，最大并发: {self.max_concurrent}")

        while True:
            try:
                # 检查并发限制
                async with self._lock:
                    if self._processing_count >= self.max_concurrent:
                        await asyncio.sleep(0.1)
                        continue

                # 从队列获取任务（阻塞等待，超时 1 秒）
                result = await self._redis.brpop(self.QUEUE_KEY, timeout=1)
                if not result:
                    continue

                _, task_id = result
                task = await self.get_task(task_id)
                if not task:
                    continue

                # 增加处理计数
                async with self._lock:
                    self._processing_count += 1

                # 异步处理任务
                asyncio.create_task(self._process_task(task))

            except asyncio.CancelledError:
                print("[队列服务] 工作进程停止")
                break
            except Exception as e:
                print(f"[队列服务] 工作进程错误: {e}")
                await asyncio.sleep(1)

    async def _process_task(self, task: Task):
        """处理单个任务"""
        try:
            handler = self._handlers.get(task.type)
            if not handler:
                task.status = TaskStatus.FAILED
                task.error = f"未找到处理器: {task.type.value}"
                await self._update_task(task)
                return

            # 更新状态为处理中
            task.status = TaskStatus.PROCESSING
            await self._update_task(task)

            print(f"[队列服务] 开始处理: {task.id} ({task.type.value})")

            # 执行处理器
            result = await handler(task.payload)

            # 更新为完成
            task.status = TaskStatus.COMPLETED
            task.result = result
            await self._update_task(task)

            print(f"[队列服务] 处理完成: {task.id}")

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            await self._update_task(task)
            print(f"[队列服务] 处理失败: {task.id} - {e}")

        finally:
            # 减少处理计数
            async with self._lock:
                self._processing_count -= 1

    async def get_queue_stats(self) -> Dict[str, Any]:
        """获取队列统计信息"""
        if not self._redis:
            return {
                "connected": False,
                "queue_length": 0,
                "processing": 0
            }

        queue_length = await self._redis.llen(self.QUEUE_KEY)
        return {
            "connected": True,
            "queue_length": queue_length,
            "processing": self._processing_count,
            "max_concurrent": self.max_concurrent
        }


# 全局队列服务实例
queue_service = QueueService()
