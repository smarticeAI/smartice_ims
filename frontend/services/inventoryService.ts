/**
 * 入库数据提交服务
 * v4.2 - 直接使用 brand_id 外键，移除 brandCodeToId 映射
 * v4.0 - 新建供应商时绑定品牌ID
 * v3.9 - 产品匹配支持别名（如西红柿→番茄），使用 exactMatchProduct RPC
 *
 * 变更历史：
 * - v4.2: 移除 brandCodeToId 依赖，直接使用 brand_id 数字参数
 * - v4.0: 新建供应商绑定品牌，添加 brandId 参数
 * - v3.9: 产品匹配改用 exactMatchProduct，支持别名匹配
 * - v3.8: goodsImages 改为数组，支持批量上传多张货物图片
 * - v3.7: submitProcurement 新增 useAiPhoto/useAiVoice 参数
 * - v3.6: specification 字段独立存储，notes 字段用于整单备注
 * - v3.5: 选择"其他"并输入新供应商名称时，自动创建到数据库
 * - v3.4: 产品匹配严格模式，必须从下拉列表选择产品（有 productId）
 * - v3.3: receiptImages 改为数组，支持多张收货单上传
 * - v3.2: 添加 onProgress 回调函数，支持进度 UI 显示
 * - v3.1: 图片上传失败时立即返回错误，不继续插入数据
 * - v3.0: 移除 SKU 匹配，简化提交流程，支持图片分类
 * - v2.1: 添加 total_amount 采购总价字段
 * - v2.0: 单位改为直接使用 unitId
 */

import { DailyLog, ProcurementItem } from '../types';
import {
  matchProduct,
  exactMatchProduct,
  matchSupplier,
  createOrGetSupplier,
  createPurchasePrices,
  StorePurchasePrice,
  Product,
} from './supabaseService';
import { uploadImageToStorage } from './imageService';

// ============ 类型定义 ============

export interface SubmitResult {
  success: boolean;
  insertedCount: number;
  pendingMatches: PendingMatch[];
  errors: string[];
}

export interface PendingMatch {
  itemName: string;
  matchType: 'product' | 'supplier';
  rawValue: string;
}

// ============ 进度回调类型 ============

export type SubmitProgress =
  | 'uploading_receipt'   // 正在上传收货单图片
  | 'uploading_goods'     // 正在上传货物图片
  | 'saving_data'         // 正在保存数据
  | 'success';            // 提交成功

export type OnProgressCallback = (progress: SubmitProgress) => void;

// ============ 主提交函数 ============

/**
 * AI 使用统计参数
 * v3.7 - 新增
 */
export interface AiUsageStats {
  useAiPhoto?: number;   // AI 识图功能使用次数
  useAiVoice?: number;   // 语音识别功能使用次数
}

/**
 * 提交采购数据到数据库
 * v4.2 - 参数改为 brandId，直接使用外键
 * v3.7 - 添加 AI 使用统计参数
 *
 * @param dailyLog - 前端录入的日志数据
 * @param storeId - 门店 UUID
 * @param employeeId - 员工 UUID
 * @param onProgress - 进度回调函数（可选）
 * @param aiUsage - AI 使用统计（可选）
 * @param brandId - 品牌ID（可选），用于新建供应商时绑定品牌
 * @returns 提交结果
 */
export async function submitProcurement(
  dailyLog: Omit<DailyLog, 'id'>,
  storeId: string,
  employeeId: string,
  onProgress?: OnProgressCallback,
  aiUsage?: AiUsageStats,
  brandId?: number | null
): Promise<SubmitResult> {
  const result: SubmitResult = {
    success: false,
    insertedCount: 0,
    pendingMatches: [],
    errors: [],
  };

  // 验证必要参数
  if (!storeId) {
    result.errors.push('缺少门店信息，请重新登录');
    return result;
  }

  if (!employeeId) {
    result.errors.push('缺少员工信息，请重新登录');
    return result;
  }

  // 过滤有效物品
  const validItems = dailyLog.items.filter(item => item.name.trim() !== '');
  if (validItems.length === 0) {
    result.errors.push('没有有效的物品记录');
    return result;
  }

  console.log(`[提交] 开始处理 ${validItems.length} 条采购记录`);
  console.log(`[提交] 门店: ${storeId}, 员工: ${employeeId}`);

  // 上传图片
  // v3.3: receiptImages 改为数组，支持多张收货单
  // v3.8: goodsImages 改为数组，支持多张货物照片
  let receiptImageUrls: string[] = [];
  let goodsImageUrls: string[] = [];

  // v3.1: 图片上传失败时立即返回错误，不继续插入数据
  // v3.2: 通过 onProgress 回调报告进度
  // v3.3: 循环上传多张收货单图片
  if (dailyLog.receiptImages && dailyLog.receiptImages.length > 0) {
    try {
      onProgress?.('uploading_receipt');
      console.log(`[提交] 上传 ${dailyLog.receiptImages.length} 张收货单图片...`);
      for (let i = 0; i < dailyLog.receiptImages.length; i++) {
        const img = dailyLog.receiptImages[i];
        const url = await uploadImageToStorage(
          img.data,
          img.mimeType,
          storeId,
          'receipt'
        );
        receiptImageUrls.push(url);
        console.log(`[提交] 收货单图片 ${i + 1}/${dailyLog.receiptImages.length} 上传成功`);
      }
    } catch (err) {
      console.error('[提交] 收货单图片上传失败:', err);
      result.errors.push(`收货单图片上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
      return result; // 立即返回，不继续提交
    }
  }

  // v3.8: 循环上传多张货物图片
  if (dailyLog.goodsImages && dailyLog.goodsImages.length > 0) {
    try {
      onProgress?.('uploading_goods');
      console.log(`[提交] 上传 ${dailyLog.goodsImages.length} 张货物图片...`);
      for (let i = 0; i < dailyLog.goodsImages.length; i++) {
        const img = dailyLog.goodsImages[i];
        const url = await uploadImageToStorage(
          img.data,
          img.mimeType,
          storeId,
          'goods'
        );
        goodsImageUrls.push(url);
        console.log(`[提交] 货物图片 ${i + 1}/${dailyLog.goodsImages.length} 上传成功`);
      }
    } catch (err) {
      console.error('[提交] 货物图片上传失败:', err);
      result.errors.push(`货物图片上传失败: ${err instanceof Error ? err.message : '未知错误'}`);
      return result; // 立即返回，不继续提交
    }
  }

  // 匹配供应商
  let supplierId: number | null = null;
  let supplierName: string | undefined;

  if (dailyLog.supplier && dailyLog.supplier !== '其他') {
    const supplier = await matchSupplier(dailyLog.supplier);
    if (supplier) {
      supplierId = supplier.id;
      console.log(`[提交] 供应商匹配: ${dailyLog.supplier} -> ID: ${supplier.id}`);
    } else {
      console.log(`[提交] 供应商未匹配: ${dailyLog.supplier}`);
      result.pendingMatches.push({
        itemName: dailyLog.supplier,
        matchType: 'supplier',
        rawValue: dailyLog.supplier,
      });
      // 保存原始名称
      supplierName = dailyLog.supplier;
    }
  } else if (dailyLog.supplierOther) {
    // v4.2: "其他"供应商 - 自动创建到数据库，绑定当前品牌（默认通用=3）
    try {
      const supplierBrandId = brandId ?? 3;  // 未指定时默认为通用
      const newSupplier = await createOrGetSupplier(dailyLog.supplierOther, supplierBrandId);
      supplierId = newSupplier.id;
      supplierName = newSupplier.name;
      console.log(`[提交] 其他供应商已入库: ${supplierName} (ID: ${supplierId}, brand_id: ${supplierBrandId})`);
    } catch (error) {
      console.error(`[提交] 创建供应商失败:`, error);
      // 降级：只保存名称，不关联 ID
      supplierName = dailyLog.supplierOther;
    }
  }

  // 构建记录
  const records: StorePurchasePrice[] = [];
  const priceDate = new Date(dailyLog.date).toISOString().split('T')[0];

  for (const item of validItems) {
    // 验证必填字段
    if (!item.unit || item.unit.trim() === '') {
      result.errors.push(`物品 "${item.name}" 缺少单位`);
      continue;
    }

    if (!item.unitPrice || item.unitPrice <= 0) {
      result.errors.push(`物品 "${item.name}" 价格无效`);
      continue;
    }

    // v3.4: 产品匹配严格模式 - 必须有 productId
    let materialId: number | undefined;

    // 优先使用前端传递的 productId（从下拉选择）
    if (item.productId) {
      materialId = item.productId;
      console.log(`[提交] 产品ID已选择: ${item.name} (ID: ${materialId})`);
    } else {
      // v3.9: 使用 exactMatchProduct 支持别名匹配（如西红柿→番茄）
      const product = await exactMatchProduct(item.name);
      if (product) {
        materialId = product.id;
        console.log(`[提交] 产品匹配: ${item.name} -> ${product.name} (ID: ${materialId})`);
      } else {
        // v3.4: 严格模式 - 未匹配产品直接报错，阻止提交
        console.error(`[提交] 产品未匹配（严格模式）: ${item.name}`);
        result.errors.push(`产品 "${item.name}" 未在系统中找到，请从下拉列表选择`);
        continue; // 跳过此物品，继续检查其他物品
      }
    }

    // 构建记录
    // v5.0: restaurant_id 替代 store_id
    // v3.7: 添加 AI 使用统计字段
    const record: StorePurchasePrice = {
      restaurant_id: storeId,
      created_by: employeeId,
      material_id: materialId,
      supplier_id: supplierId || undefined,
      item_name: item.name,
      quantity: item.quantity || 1,
      unit: item.unit,
      unit_price: item.unitPrice,
      total_amount: item.total || (item.quantity * item.unitPrice),
      // v3.3: 多张收货单图片存为 JSON 数组
      // v3.8: 多张货物图片存为 JSON 数组
      receipt_image: receiptImageUrls.length > 0 ? JSON.stringify(receiptImageUrls) : undefined,
      goods_image: goodsImageUrls.length > 0 ? JSON.stringify(goodsImageUrls) : undefined,
      price_date: priceDate,
      supplier_name: supplierName,
      specification: item.specification || undefined,  // v3.6: 物品规格
      notes: dailyLog.notes || undefined,              // v3.6: 整单备注
      status: 'pending',
      use_ai_photo: aiUsage?.useAiPhoto || 0,          // v3.7: AI 识图使用次数
      use_ai_voice: aiUsage?.useAiVoice || 0,          // v3.7: 语音识别使用次数
    };

    records.push(record);
  }

  // 批量插入
  if (records.length > 0) {
    try {
      onProgress?.('saving_data');
      console.log(`[提交] 准备插入 ${records.length} 条记录`);
      const inserted = await createPurchasePrices(records);
      result.insertedCount = inserted.length;

      if (inserted.length > 0) {
        result.success = true;
        onProgress?.('success');
        console.log(`[提交] 成功插入 ${inserted.length} 条记录`);
      } else {
        result.errors.push('数据插入失败：未返回任何记录');
      }
    } catch (err) {
      console.error('[提交] 批量插入失败:', err);
      result.errors.push(`数据库写入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  } else {
    result.errors.push('没有可提交的有效记录');
  }

  console.log(`[提交] 完成: 成功=${result.success}, 插入=${result.insertedCount}, 待匹配=${result.pendingMatches.length}, 错误=${result.errors.length}`);

  return result;
}

// ============ 辅助函数 ============

/**
 * 格式化提交结果为用户友好的消息
 */
export function formatSubmitResult(result: SubmitResult): string {
  if (!result.success && result.errors.length > 0) {
    return `提交失败: ${result.errors.join(', ')}`;
  }

  let message = `成功录入 ${result.insertedCount} 条采购记录`;

  if (result.pendingMatches.length > 0) {
    const productPending = result.pendingMatches.filter(p => p.matchType === 'product').length;
    const supplierPending = result.pendingMatches.filter(p => p.matchType === 'supplier').length;

    const pendingParts: string[] = [];
    if (productPending > 0) pendingParts.push(`${productPending} 个产品`);
    if (supplierPending > 0) pendingParts.push(`${supplierPending} 个供应商`);

    message += `（${pendingParts.join('、')} 待确认）`;
  }

  return message;
}
