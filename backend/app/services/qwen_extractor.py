# Qwen 结构化提取服务
# v1.6 - 支持传入当前表单数据，实现修改/删除/添加功能
# v1.5 - 使用阿里云通义千问 API 将语音识别文本转换为采购清单 JSON
# v1.1: 优化 specification 字段格式，使用斜杠分隔包装规格（用于最小单位计算）
# v1.2: 精简 prompt，移除方言处理（由讯飞 ASR 处理）
# v1.3: 移除 Mock 模式，API 错误时抛出异常
# v1.4: 延迟凭证验证，避免应用启动崩溃
# v1.5: 添加 unitPrice 语义说明注释
# 替代 Gemini 的中国本土化方案，使用 OpenAI 兼容接口

import os
import json
import asyncio
from openai import OpenAI, APIError, RateLimitError
from typing import Optional

from app.models.voice_entry import VoiceEntryResult, ProcurementItem


class QwenExtractorService:
    """
    通义千问结构化数据提取服务
    将语音识别的自然语言文本转换为结构化的采购清单 JSON
    使用 Alibaba Cloud Model Studio (DashScope) API
    """

    # 提取提示词模板 (精简版)
    # 注意: JSON 中的花括号需要双写 {{ }} 以转义 Python str.format()
    #
    # 【unitPrice 语义说明】
    # unitPrice 始终表示「采购单位」的价格，即 specification 中的分母单位：
    # - specification="24瓶/箱", unit="箱" → unitPrice 是每箱价格（如 28元/箱）
    # - specification="500ml/瓶", unit="瓶" → unitPrice 是每瓶价格（如 5元/瓶）
    # - specification="5L/桶", unit="桶" → unitPrice 是每桶价格（如 80元/桶）
    # 计算：total = quantity × unitPrice（基于采购单位，非最小单位）
    #
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

    # v1.6: 修改模式提示词 - 支持在现有数据基础上修改/删除/添加
    MODIFICATION_PROMPT = """你是采购清单编辑助手。用户已有一份采购清单，现在要通过语音指令进行修改。

【当前清单】
{current_json}

【用户指令】
{text}

【任务】
根据用户指令修改清单，返回完整的更新后JSON。

【指令类型识别】
1. 修改：用户说"XX写错了是YY"、"把XX改成YY"、"XX的数量改成N"等 → 修改对应字段
2. 删除：用户说"删除XX"、"XX不要了"、"去掉XX" → 从items中移除该项
3. 添加：用户说"加一个XX"、"再来个XX"、"帮我加XX" → 在items末尾添加新项
4. 混合：用户可能同时有多个操作，全部执行

【输出格式】
{{"supplier":"供应商","notes":"备注","items":[{{"name":"商品名","specification":"规格","quantity":数量,"unit":"单位","unitPrice":单价,"total":小计}}]}}

【规则】
- total = quantity × unitPrice（自动计算）
- 保留未被修改的项目不变
- 如果用户只说"加XX"没说价格数量，合理推测或留空让用户补充
- 删除时用商品名模糊匹配（如"运费"匹配"快运费"）
- 修改名称时保留其他字段不变

【示例】
当前: {{"supplier":"","notes":"","items":[{{"name":"豆腐园子","specification":"规格","quantity":20,"unit":"斤","unitPrice":9,"total":180}},{{"name":"快运费","specification":"规格","quantity":1,"unit":"元","unitPrice":44,"total":44}}]}}

指令: "豆腐园子写错了是圆子"
输出: {{"supplier":"","notes":"","items":[{{"name":"圆子","specification":"规格","quantity":20,"unit":"斤","unitPrice":9,"total":180}},{{"name":"快运费","specification":"规格","quantity":1,"unit":"元","unitPrice":44,"total":44}}]}}

指令: "运费要删除"
输出: {{"supplier":"","notes":"","items":[{{"name":"豆腐园子","specification":"规格","quantity":20,"unit":"斤","unitPrice":9,"total":180}}]}}

指令: "加一个西冷牛排3斤22元一斤"
输出: {{"supplier":"","notes":"","items":[{{"name":"豆腐园子","specification":"规格","quantity":20,"unit":"斤","unitPrice":9,"total":180}},{{"name":"快运费","specification":"规格","quantity":1,"unit":"元","unitPrice":44,"total":44}},{{"name":"西冷牛排","specification":"","quantity":3,"unit":"斤","unitPrice":22,"total":66}}]}}

直接输出更新后的完整JSON："""

    # API 端点配置
    BASE_URL_INTL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    BASE_URL_CHINA = "https://dashscope.aliyuncs.com/compatible-mode/v1"

    def __init__(self):
        """
        初始化 Qwen 服务
        环境变量:
        - QWEN_API_KEY 或 DASHSCOPE_API_KEY: API 密钥
        - QWEN_BASE_URL: 可选，自定义端点
        v1.4: 延迟验证凭证，不在启动时崩溃
        """
        api_key = os.getenv("QWEN_API_KEY") or os.getenv("DASHSCOPE_API_KEY", "")
        base_url = os.getenv("QWEN_BASE_URL", self.BASE_URL_CHINA)
        self.model = os.getenv("QWEN_MODEL", "qwen-plus")

        # 检查配置状态但不抛出异常
        self.available = bool(api_key)
        self.client = None

        if self.available:
            self.client = OpenAI(
                api_key=api_key,
                base_url=base_url,
            )
            print(f"[QwenExtractor] 已配置 Qwen API ({self.model}) - {base_url}")
        else:
            print("[QwenExtractor] 警告: 未配置 QWEN_API_KEY，服务不可用")

    def _check_available(self):
        """检查服务是否可用，不可用时抛出异常"""
        if not self.available or not self.client:
            raise RuntimeError(
                "Qwen 结构化提取服务未配置。请设置环境变量: QWEN_API_KEY"
            )

    def _extract_json_from_response(self, text: str) -> dict:
        """
        从响应中提取 JSON，处理可能的 markdown 代码块
        """
        import re

        # 尝试直接解析
        try:
            return json.loads(text)
        except:
            pass

        # 尝试提取 ```json ... ``` 代码块
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', text, re.DOTALL)
        if json_match:
            try:
                return json.loads(json_match.group(1).strip())
            except:
                pass

        # 尝试找到 { ... } 结构
        brace_match = re.search(r'\{.*\}', text, re.DOTALL)
        if brace_match:
            try:
                return json.loads(brace_match.group(0))
            except:
                pass

        raise json.JSONDecodeError("无法从响应中提取 JSON", text, 0)

    async def extract(
        self,
        text: str,
        current_data: Optional[dict] = None,
        max_retries: int = 3
    ) -> VoiceEntryResult:
        """
        从语音识别文本提取结构化数据（带重试机制）

        Args:
            text: ASR 识别的原始文本
            current_data: v1.6 可选，当前表单数据（用于修改/删除/添加模式）
            max_retries: 速率限制错误最大重试次数

        Returns:
            VoiceEntryResult: 结构化的采购清单

        Raises:
            RuntimeError: 服务未配置
            ValueError: 输入文本为空
            APIError: API 调用失败
            json.JSONDecodeError: JSON 解析失败
        """
        self._check_available()

        if not text.strip():
            raise ValueError("输入文本为空")

        # v1.6: 如果提供了当前数据，使用修改模式
        if current_data and current_data.get("items"):
            current_json = json.dumps(current_data, ensure_ascii=False)
            prompt = self.MODIFICATION_PROMPT.format(
                current_json=current_json,
                text=text
            )
            print(f"[QwenExtractor] 使用修改模式，当前 {len(current_data.get('items', []))} 项")
        else:
            prompt = self.EXTRACTION_PROMPT.format(text=text)
            print("[QwenExtractor] 使用新建模式")
        response = None

        # 带重试的 API 调用
        for attempt in range(max_retries):
            try:
                response = await asyncio.to_thread(
                    self.client.chat.completions.create,
                    model=self.model,
                    messages=[
                        {
                            "role": "system",
                            "content": "你是一个专业的采购清单解析助手。请输出 JSON 格式的结构化数据。"
                        },
                        {"role": "user", "content": prompt}
                    ],
                    response_format={"type": "json_object"},
                    temperature=0.1,
                )
                break

            except RateLimitError as e:
                wait_time = (2 ** attempt) * 5
                print(f"[QwenExtractor] 429 速率限制，等待 {wait_time}s 后重试 ({attempt + 1}/{max_retries})")
                if attempt < max_retries - 1:
                    await asyncio.sleep(wait_time)
                else:
                    raise APIError(f"速率限制，重试 {max_retries} 次后仍失败") from e

            except APIError as e:
                print(f"[QwenExtractor] API 错误: {e}")
                raise

            except Exception as e:
                print(f"[QwenExtractor] 调用错误: {type(e).__name__}: {e}")
                raise

        # 解析响应
        response_text = response.choices[0].message.content
        if not response_text:
            raise ValueError("Qwen API 返回空响应")

        result_json = self._extract_json_from_response(response_text)

        # 转换为 Pydantic 模型
        items = [
            ProcurementItem(
                name=item.get("name", ""),
                specification=item.get("specification", ""),
                quantity=float(item.get("quantity", 0)),
                unit=item.get("unit", ""),
                unitPrice=float(item.get("unitPrice", 0)),
                total=float(item.get("total", 0))
            )
            for item in result_json.get("items", [])
        ]

        print(f"[QwenExtractor] 提取成功: {result_json.get('supplier')}, {len(items)} 项")
        return VoiceEntryResult(
            supplier=result_json.get("supplier", ""),
            notes=result_json.get("notes", ""),
            items=items
        )


# 单例实例
qwen_extractor = QwenExtractorService()
