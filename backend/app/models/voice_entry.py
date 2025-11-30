# 语音录入数据模型
# v1.1 - 定义采购清单的 JSON Schema，与前端 EntryForm 表单结构对应
# v1.1: 添加 unitPrice 语义说明（采购单位价格）

from pydantic import BaseModel, Field
from typing import Optional
from enum import Enum


class ProcurementItem(BaseModel):
    """
    采购物品 - 对应前端 ProcurementItem 类型
    与 EntryForm.tsx 中的物品清单字段一一对应

    【unitPrice 语义说明】
    unitPrice 始终表示「采购单位」的价格，即 specification 中的分母单位：
    - specification="24瓶/箱", unit="箱" → unitPrice 是每箱价格
    - specification="500ml/瓶", unit="瓶" → unitPrice 是每瓶价格
    - specification="5L/桶", unit="桶" → unitPrice 是每桶价格

    计算公式：total = quantity × unitPrice（基于采购单位）
    """
    name: str = Field(..., description="商品名称")
    specification: str = Field(default="", description="包装规格，格式：最小单位/采购单位（如 24瓶/箱、500ml/瓶）")
    quantity: float = Field(..., description="数量（采购单位数量）")
    unit: str = Field(..., description="采购单位 (斤/公斤/箱/袋/桶/瓶等)")
    unitPrice: float = Field(..., description="采购单位价格（对应 unit 字段，非最小单位价格）")
    total: float = Field(..., description="小计 = quantity × unitPrice")


class VoiceEntryResult(BaseModel):
    """
    语音录入结果 - LLM 结构化提取的输出
    对应前端 EntryForm 的表单字段
    """
    supplier: str = Field(default="", description="供应商全称")
    notes: str = Field(default="", description="备注信息")
    items: list[ProcurementItem] = Field(default_factory=list, description="物品清单")


class ASRStatus(str, Enum):
    """语音识别状态"""
    LISTENING = "listening"      # 正在录音
    PROCESSING = "processing"    # 处理中
    COMPLETED = "completed"      # 完成
    ERROR = "error"              # 错误


class VoiceMessage(BaseModel):
    """
    WebSocket 消息格式
    """
    type: str = Field(..., description="消息类型: audio/text/result/error")
    data: Optional[str] = Field(default=None, description="音频数据(base64)或文本")
    status: Optional[ASRStatus] = Field(default=None, description="当前状态")
    result: Optional[VoiceEntryResult] = Field(default=None, description="结构化结果")
    raw_text: Optional[str] = Field(default=None, description="ASR 原始识别文本")
    error: Optional[str] = Field(default=None, description="错误信息")


# JSON Schema 模板 - 用于 LLM 提示词
EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "supplier": {
            "type": "string",
            "description": "供应商全称"
        },
        "notes": {
            "type": "string",
            "description": "备注信息"
        },
        "items": {
            "type": "array",
            "description": "物品清单",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "商品名称"},
                    "specification": {"type": "string", "description": "包装规格"},
                    "quantity": {"type": "number", "description": "数量"},
                    "unit": {"type": "string", "description": "单位"},
                    "unitPrice": {"type": "number", "description": "单价"},
                    "total": {"type": "number", "description": "小计"}
                },
                "required": ["name", "quantity", "unit", "unitPrice", "total"]
            }
        }
    },
    "required": ["supplier", "items"]
}
