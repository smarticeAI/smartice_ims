// 收货单图片识别服务
// v2.0 - 统一使用 husanai OpenAI 兼容 API + gemini-2.5-flash-image 模型
// v1.1 - 将 Gemini API Key 改为环境变量
// v1.0 - 使用 Gemini 2.0 Flash 识别收货单/送货单图片，提取结构化采购数据
// 返回与语音录入相同的 VoiceEntryResult 格式，复用表单填充逻辑

import { ProcurementItem } from '../types';

// Husanai OpenAI 兼容 API 配置
const HUSANAI_API_KEY = import.meta.env.VITE_HUSANAI_API_KEY || '';
const HUSANAI_API_URL = 'https://husanai.com/v1/chat/completions';
const VISION_MODEL = 'gemini-2.5-flash-image';

// 识别结果 - 与 VoiceEntryResult 结构一致，复用表单填充逻辑
export interface ReceiptRecognitionResult {
  supplier: string;
  notes: string;
  items: ProcurementItem[];
}

// 收货单识别提示词 - 针对中文收货单/送货单优化
const RECEIPT_RECOGNITION_PROMPT = `你是一个专业的收货单/送货单识别助手。请仔细分析这张图片，提取采购信息。

【任务】
从图片中识别并提取以下信息：
1. 供应商名称（收货单上的送货方/供货方）
2. 所有采购物品的详细信息

【物品字段说明】
每个物品需要提取：
- name: 商品名称（如：五花肉、青椒、雪花啤酒）
- specification: 规格/包装（如：带皮、500ml*12、25kg/袋）
- quantity: 数量（数字）
- unit: 计量单位（如：斤、公斤、箱、袋、瓶、桶）
- unitPrice: 单价（每个采购单位的价格，数字）
- total: 小计金额（= quantity × unitPrice）

【单价计算规则】
- unitPrice 是每个采购单位（unit）的价格
- 例如：10箱啤酒，每箱38元，则 quantity=10, unit=箱, unitPrice=38, total=380
- 如果单价缺失但有总价，请反算：unitPrice = total / quantity

【输出格式】
请严格按照以下 JSON 格式输出，不要包含任何其他文字：

{
  "supplier": "供应商名称",
  "notes": "备注信息（如有质量问题或特殊说明）",
  "items": [
    {
      "name": "商品名称",
      "specification": "规格",
      "quantity": 数量,
      "unit": "单位",
      "unitPrice": 单价,
      "total": 小计
    }
  ]
}

【注意事项】
1. 如果图片模糊或无法识别某些字段，请尽量推测合理值
2. 金额请使用数字，不要包含货币符号
3. 如果无法识别供应商，返回空字符串
4. 确保 total = quantity × unitPrice 计算正确
5. 如果是手写单据，请仔细辨认字迹`;

/**
 * 识别收货单图片
 * @param imageBase64 - 图片的 base64 编码（不包含 data:image/xxx;base64, 前缀）
 * @param mimeType - 图片 MIME 类型（如 image/jpeg, image/png）
 * @returns 识别结果或 null（失败时）
 */
export async function recognizeReceipt(
  imageBase64: string,
  mimeType: string
): Promise<ReceiptRecognitionResult | null> {
  // v2.0: 检查 Husanai API Key 是否配置
  if (!HUSANAI_API_KEY) {
    console.error('[收货单识别] 错误: 未配置 VITE_HUSANAI_API_KEY 环境变量');
    throw new Error('收货单识别服务未配置，请联系管理员');
  }

  console.log('[收货单识别] 开始识别，图片大小:', Math.round(imageBase64.length * 0.75 / 1024), 'KB');
  console.log('[收货单识别] 使用模型:', VISION_MODEL);

  try {
    // 构建 OpenAI 兼容格式请求
    const requestBody = {
      model: VISION_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`
              }
            },
            {
              type: 'text',
              text: RECEIPT_RECOGNITION_PROMPT
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 4096
    };

    // 调用 Husanai OpenAI 兼容 API
    const response = await fetch(HUSANAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUSANAI_API_KEY}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[收货单识别] API 错误:', response.status, errorText);
      throw new Error(`API 错误: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    console.log('[收货单识别] API 响应:', data);

    // 提取生成的文本（OpenAI 格式）
    const generatedText = data.choices?.[0]?.message?.content;
    if (!generatedText) {
      console.error('[收货单识别] 无法提取响应文本');
      return null;
    }

    console.log('[收货单识别] 原始响应文本:', generatedText);

    // 解析 JSON
    const result = parseJsonResponse(generatedText);
    if (!result) {
      console.error('[收货单识别] JSON 解析失败');
      return null;
    }

    // 验证和修正数据
    const validated = validateAndFixResult(result);
    console.log('[收货单识别] 识别完成:', validated);

    return validated;

  } catch (error) {
    console.error('[收货单识别] 识别失败:', error);
    // 重新抛出错误以便调用方处理
    throw error;
  }
}

/**
 * 解析 JSON 响应
 * 处理 Gemini 可能返回的各种格式（纯 JSON、markdown 代码块等）
 */
function parseJsonResponse(text: string): ReceiptRecognitionResult | null {
  try {
    // 尝试直接解析
    return JSON.parse(text);
  } catch {
    // 尝试提取 markdown 代码块中的 JSON
    const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch {
        console.error('[收货单识别] 代码块 JSON 解析失败');
      }
    }

    // 尝试提取花括号包裹的 JSON
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch {
        console.error('[收货单识别] 花括号 JSON 解析失败');
      }
    }

    return null;
  }
}

/**
 * 验证和修正识别结果
 * 确保所有字段存在且格式正确
 */
function validateAndFixResult(result: any): ReceiptRecognitionResult {
  const validated: ReceiptRecognitionResult = {
    supplier: result.supplier || '',
    notes: result.notes || '',
    items: []
  };

  if (Array.isArray(result.items)) {
    validated.items = result.items.map((item: any) => {
      const quantity = parseFloat(item.quantity) || 0;
      const unitPrice = parseFloat(item.unitPrice) || 0;
      let total = parseFloat(item.total) || 0;

      // 如果有数量和单价但没有总价，计算总价
      if (quantity > 0 && unitPrice > 0 && total === 0) {
        total = quantity * unitPrice;
      }
      // 如果有数量和总价但没有单价，反算单价
      else if (quantity > 0 && total > 0 && unitPrice === 0) {
        const calculatedUnitPrice = total / quantity;
        return {
          name: String(item.name || ''),
          specification: String(item.specification || ''),
          quantity,
          unit: String(item.unit || ''),
          unitPrice: Math.round(calculatedUnitPrice * 100) / 100,
          total
        };
      }

      return {
        name: String(item.name || ''),
        specification: String(item.specification || ''),
        quantity,
        unit: String(item.unit || ''),
        unitPrice,
        total: Math.round(total * 100) / 100
      };
    });
  }

  return validated;
}

/**
 * 检查图片识别 API 是否可用
 */
export async function checkVisionApiHealth(): Promise<boolean> {
  if (!HUSANAI_API_KEY) {
    console.warn('[收货单识别] API Key 未配置');
    return false;
  }

  try {
    // 发送一个简单的文本请求来检查 API
    const response = await fetch(HUSANAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUSANAI_API_KEY}`
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        messages: [{ role: 'user', content: 'Hello' }],
        max_tokens: 10
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}

// 兼容旧函数名
export const checkGeminiHealth = checkVisionApiHealth;
