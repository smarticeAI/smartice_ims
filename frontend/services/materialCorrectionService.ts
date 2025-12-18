/**
 * Material Name Correction Service
 * v1.1 - AI二次纠偏层：基于文字图像相似性纠正OCR识别错误
 *
 * 功能：
 * 1. 比对识别结果与数据库物料名称（name + aliases）
 * 2. 找出不匹配的物料名
 * 3. 使用 Gemini API 基于"文字图像相似性"纠偏（如"天蒜"→"大蒜"）
 * 4. 返回纠偏映射表
 *
 * v1.1 更新：
 * - 增加 max_tokens 至 4096 防止 JSON 响应被截断
 * - 改进 parseJsonResponse 函数，支持处理截断的 JSON
 * - 添加截断检测和警告日志
 */

import { Product } from './supabaseService';

// Husanai OpenAI 兼容 API 配置（与 receiptRecognitionService 共享）
const HUSANAI_API_KEY = import.meta.env.VITE_HUSANAI_API_KEY || '';
const HUSANAI_API_URL = 'https://husanai.com/v1/chat/completions';
const GEMINI_MODEL = 'gemini-2.5-flash'; // 纯文本任务使用 flash 模型

/**
 * 纠偏结果映射
 */
export interface CorrectionMap {
  [ocrName: string]: string; // OCR识别名 -> 数据库正确名
}

/**
 * 纠偏服务结果
 * v6.3: 添加 allOcrNames 用于 UI 显示完整信息
 */
export interface CorrectionResult {
  corrections: CorrectionMap; // 纠偏映射表
  hasCorrections: boolean;    // 是否有纠偏
  allOcrNames: string[];      // 所有 OCR 识别的物料名（用于 UI 显示）
}

/**
 * 文字图像相似性纠偏提示词
 */
function buildCorrectionPrompt(unmatched: string[], allMaterialNames: string[]): string {
  return `你是一个专业的OCR纠错助手。收货单上手写或打印的文字可能被OCR识别错误。

【任务】
以下是OCR识别出的物料名称，但在数据库中找不到匹配项。请根据**文字图像相似性**（笔画、字形、手写体易混淆字）纠正识别错误。

【OCR识别出的物料名（可能有误）】
${unmatched.map((name, i) => `${i + 1}. ${name}`).join('\n')}

【数据库中的正确物料名（完整列表）】
${allMaterialNames.join('、')}

【纠错规则】
1. **重点关注文字图像相似性**：
   - 手写体易混淆字：天/大、土/士、未/末、己/已、刀/力、戈/戊
   - 笔画相似字：蒜/算、椒/焦、葱/聪、姜/美、瓜/爪
   - 偏旁误识：萝/罗、芹/折、菇/茹、菜/彩
   - 模糊字迹：0/O、1/l/I、5/S、8/B

2. **纠错优先级**：
   - 第一优先：字形图像相似（如"天蒜"→"大蒜"，因为手写"天"和"大"极易混淆）
   - 第二优先：发音相似但字形也接近（如"土豆"→"土豆"，但如果写成"士豆"则纠正）
   - 不要仅根据语义猜测（如"红色蔬菜"不应直接推断为"番茄"）

3. **关键要求 - 无法纠正时返回空字符串**：
   - 如果某个名称在数据库中完全找不到相近字形的物料，**必须**返回空字符串 ""
   - 只有当你确信能找到字形相似的物料时，才返回纠正后的名称
   - 数据库中的别名也是有效匹配（例如"西红柿"="番茄"）
   - **严格判断**：对于完全陌生、找不到任何字形相似物料的名称（如"火星特产"），直接返回 ""

【输出格式】
严格按照以下JSON格式输出，不要包含任何其他文字：

{
  "corrections": {
    "OCR识别名1": "数据库正确名",
    "OCR识别名2": "数据库正确名",
    "完全无法纠正的名称": ""
  }
}

【示例1 - 有相近物料】
输入OCR名：["天蒜", "青角", "土豆"]
数据库名：["大蒜", "青椒", "土豆", "番茄", "黄瓜"]
输出：
{
  "corrections": {
    "天蒜": "大蒜",
    "青角": "青椒",
    "土豆": "土豆"
  }
}

【示例2 - 包含无法纠正的】
输入OCR名：["天蒜", "火星特产", "土豆"]
数据库名：["大蒜", "青椒", "土豆", "番茄", "黄瓜"]
输出：
{
  "corrections": {
    "天蒜": "大蒜",
    "火星特产": "",
    "土豆": "土豆"
  }
}

现在请开始纠错：`;
}

/**
 * 检查物料名是否在数据库中存在（支持 name + aliases 匹配）
 */
function isNameInDatabase(name: string, materials: Product[]): boolean {
  const trimmedName = name.trim();

  for (const material of materials) {
    // 精确匹配 name
    if (material.name === trimmedName) {
      return true;
    }

    // 匹配 aliases（如果存在）
    if (material.aliases && material.aliases.includes(trimmedName)) {
      return true;
    }
  }

  return false;
}

/**
 * 二次纠偏：使用 Gemini 基于文字图像相似性纠正OCR错误
 *
 * @param ocrNames - OCR识别出的物料名称列表
 * @param databaseMaterials - 数据库中的完整物料列表
 * @returns 纠偏结果
 */
export async function correctMaterialNames(
  ocrNames: string[],
  databaseMaterials: Product[]
): Promise<CorrectionResult> {
  // 检查 API Key
  if (!HUSANAI_API_KEY) {
    console.warn('[物料纠偏] 未配置 VITE_HUSANAI_API_KEY，跳过纠偏');
    return { corrections: {}, hasCorrections: false, allOcrNames: ocrNames };
  }

  // 1. 找出不在数据库中的物料名
  const unmatchedNames = ocrNames.filter(name => !isNameInDatabase(name, databaseMaterials));

  if (unmatchedNames.length === 0) {
    console.log('[物料纠偏] 所有物料名均匹配数据库，无需纠偏');
    return { corrections: {}, hasCorrections: false, allOcrNames: ocrNames };
  }

  console.log('[物料纠偏] 发现不匹配的物料名:', unmatchedNames);

  // 2. 构建数据库物料名列表（包括 name 和 aliases）
  const allNames = new Set<string>();
  databaseMaterials.forEach(m => {
    allNames.add(m.name);
    if (m.aliases) {
      m.aliases.forEach(alias => allNames.add(alias));
    }
  });
  const allMaterialNames = Array.from(allNames);

  console.log(`[物料纠偏] 数据库物料总数: ${databaseMaterials.length}, 名称+别名总数: ${allMaterialNames.length}`);

  // 3. 调用 Gemini API 进行纠偏
  try {
    const prompt = buildCorrectionPrompt(unmatchedNames, allMaterialNames);

    const response = await fetch(HUSANAI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${HUSANAI_API_KEY}`
      },
      body: JSON.stringify({
        model: GEMINI_MODEL,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 4096, // v1.1: 从 2048 增加到 4096，防止物料数量多时 JSON 被截断
        response_format: { type: 'json_object' } // 强制 JSON 输出
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[物料纠偏] API 错误:', response.status, errorText);
      return { corrections: {}, hasCorrections: false, allOcrNames: ocrNames };
    }

    const data = await response.json();
    const generatedText = data.choices?.[0]?.message?.content;

    if (!generatedText) {
      console.error('[物料纠偏] 无法提取响应文本');
      return { corrections: {}, hasCorrections: false, allOcrNames: ocrNames };
    }

    console.log('[物料纠偏] AI 响应:', generatedText);

    // 4. 解析 JSON 响应
    const result = parseJsonResponse(generatedText);
    if (!result || !result.corrections) {
      console.error('[物料纠偏] JSON 解析失败');
      return { corrections: {}, hasCorrections: false, allOcrNames: ocrNames };
    }

    // 5. 保留所有纠偏结果（包括空字符串，表示无法纠正）
    // v6.3: 不再过滤空字符串，让 UI 能够显示"无法纠偏"的物料
    const allCorrections: CorrectionMap = {};
    let hasValidCorrections = false;

    for (const [ocrName, correctedName] of Object.entries(result.corrections)) {
      allCorrections[ocrName] = correctedName;
      if (correctedName && correctedName.trim() !== '') {
        hasValidCorrections = true;
      }
    }

    console.log('[物料纠偏] 纠偏结果:', allCorrections);

    return {
      corrections: allCorrections,
      hasCorrections: hasValidCorrections || Object.keys(allCorrections).length > 0, // 只要有纠偏尝试就返回 true
      allOcrNames: ocrNames
    };

  } catch (error) {
    console.error('[物料纠偏] 纠偏失败:', error);
    return { corrections: {}, hasCorrections: false, allOcrNames: ocrNames };
  }
}

/**
 * 解析 JSON 响应（处理可能的 markdown 代码块和截断的 JSON）
 * v1.1: 支持处理截断的 JSON 响应
 */
function parseJsonResponse(text: string): { corrections: CorrectionMap } | null {
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
        console.error('[物料纠偏] 代码块 JSON 解析失败');
      }
    }

    // 尝试提取花括号包裹的 JSON
    const braceMatch = text.match(/\{[\s\S]*\}/);
    if (braceMatch) {
      try {
        return JSON.parse(braceMatch[0]);
      } catch (error) {
        // v1.1: 尝试修复截断的 JSON
        const truncatedJson = braceMatch[0];
        const fixedJson = attemptFixTruncatedJson(truncatedJson);
        if (fixedJson) {
          console.warn('[物料纠偏] 检测到 JSON 响应被截断，已尝试修复');
          return fixedJson;
        }
        console.error('[物料纠偏] 花括号 JSON 解析失败:', error);
      }
    }

    return null;
  }
}

/**
 * 尝试修复截断的 JSON 响应
 * v1.1: 新增函数，处理 max_tokens 不足导致的 JSON 截断
 */
function attemptFixTruncatedJson(truncatedText: string): { corrections: CorrectionMap } | null {
  try {
    // 检测是否像是被截断的 JSON（以逗号或不完整的引号结尾）
    const trimmed = truncatedText.trim();

    // 检测常见的截断模式
    if (!trimmed.endsWith('}') && (
      trimmed.endsWith(',') ||
      trimmed.endsWith('"') ||
      trimmed.endsWith(':') ||
      /[,:][\s]*"[^"]*$/.test(trimmed) // 以未闭合的引号结尾
    )) {
      console.warn('[物料纠偏] 检测到可能被截断的 JSON，尝试补全...');

      // 尝试补全：移除末尾不完整的键值对，补齐闭合括号
      let fixed = trimmed;

      // 移除末尾不完整的键值对（从最后一个完整的 "key": "value" 之后截断）
      // 匹配模式：查找最后一个完整的 "key": "value" 对
      const lastCompleteMatch = fixed.lastIndexOf('",');
      if (lastCompleteMatch !== -1) {
        // 保留到最后一个完整的键值对
        fixed = fixed.substring(0, lastCompleteMatch + 1);
      } else {
        // 如果连一个完整的键值对都没有，尝试查找第一个逗号之前的内容
        const firstComma = fixed.indexOf(',');
        if (firstComma > 0) {
          fixed = fixed.substring(0, firstComma);
        }
      }

      // 补齐闭合括号
      const openBraces = (fixed.match(/\{/g) || []).length;
      const closeBraces = (fixed.match(/\}/g) || []).length;
      const missingBraces = openBraces - closeBraces;

      if (missingBraces > 0) {
        fixed += '\n' + '}'.repeat(missingBraces);
      }

      // 尝试解析修复后的 JSON
      try {
        const parsed = JSON.parse(fixed);
        console.warn('[物料纠偏] JSON 修复成功，已解析部分纠偏结果');
        return parsed;
      } catch (parseError) {
        console.error('[物料纠偏] JSON 修复失败:', parseError);
      }
    }

    return null;
  } catch (error) {
    console.error('[物料纠偏] 修复截断 JSON 时出错:', error);
    return null;
  }
}

/**
 * 应用纠偏映射到物料列表
 * v6.3: 跳过空字符串的纠偏（表示无法纠正）
 *
 * @param items - 待纠偏的物料列表（包含 name 字段）
 * @param corrections - 纠偏映射表
 * @returns 纠偏后的物料列表
 */
export function applyCorrections<T extends { name: string }>(
  items: T[],
  corrections: CorrectionMap
): T[] {
  return items.map(item => {
    const correctedName = corrections[item.name];
    // 只应用非空的纠偏结果
    if (correctedName && correctedName.trim() !== '') {
      console.log(`[物料纠偏] 应用纠偏: ${item.name} -> ${correctedName}`);
      return { ...item, name: correctedName };
    }
    return item;
  });
}

/**
 * 生成纠偏提示文本（用于 UI 弹框）
 * v6.3: 支持区分成功纠偏和无法纠偏的物料，改为换行显示
 *
 * @param corrections - 纠偏映射表（包含空字符串表示无法纠偏）
 * @param allOcrNames - 所有 OCR 识别的物料名（用于找出无法纠偏的）
 * @returns 格式化的提示文本
 */
export function formatCorrectionMessage(corrections: CorrectionMap, allOcrNames: string[]): string {
  const entries = Object.entries(corrections);
  if (entries.length === 0) {
    return '';
  }

  // 分离成功纠偏和无法纠偏的物料
  const successfulCorrections: [string, string][] = [];
  const failedCorrections: string[] = [];

  entries.forEach(([original, corrected]) => {
    if (corrected && corrected.trim() !== '') {
      successfulCorrections.push([original, corrected]);
    } else {
      failedCorrections.push(original);
    }
  });

  // 构建提示文本
  const messageParts: string[] = [];

  // 1. 成功纠偏的
  if (successfulCorrections.length > 0) {
    messageParts.push('以下物料名称已自动纠正：');
    successfulCorrections.forEach(([original, corrected]) => {
      messageParts.push(`  ${original} → ${corrected}`);
    });
  }

  // 2. 无法纠偏的
  if (failedCorrections.length > 0) {
    if (messageParts.length > 0) {
      messageParts.push(''); // 空行分隔
    }
    messageParts.push(`以下物料在数据库中不存在：`);
    messageParts.push(`  ${failedCorrections.join('、')}`);
  }

  return messageParts.join('\n');
}
