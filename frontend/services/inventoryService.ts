/**
 * 入库数据提交服务
 * 处理采购数据从前端到数据库的完整流程
 * v1.1 - 合并 PR #6 完整实现
 */

import { DailyLog, ProcurementItem } from '../types';
import {
  matchProduct,
  matchSupplier,
  matchUnit,
  getProductSkus,
  createPurchasePrices,
  StorePurchasePrice,
  Product,
  ProductSku,
} from './supabaseService';

// ============ 类型定义 ============

export interface SubmitResult {
  success: boolean;
  insertedCount: number;
  pendingMatches: PendingMatch[];
  errors: string[];
}

export interface PendingMatch {
  itemName: string;
  matchType: 'product' | 'supplier' | 'unit';
  candidates: Array<{ id: number; name: string; similarity?: number }>;
}

interface ItemMatchResult {
  productId: number | null;
  skuId: number | null;
  unitId: number | null;
  matchStatus: 'matched' | 'product_only' | 'pending' | 'unmatched';
  rawProductName: string;
}

// ============ 分类映射 ============

/**
 * 前端分类到后端分类代码映射
 */
const CATEGORY_MAPPING: Record<string, string> = {
  'Meat': 'MEAT',
  'Vegetables': 'VEGETABLE',
  'Dry Goods': 'DRY_GOODS',
  'Alcohol': 'BEVERAGE',
  'Consumables': 'CONSUMABLE',
  'Other': 'OTHER',
};

// ============ 匹配函数 ============

/**
 * 匹配单个物品（产品 + SKU + 单位）
 */
async function matchItem(item: ProcurementItem): Promise<ItemMatchResult> {
  const result: ItemMatchResult = {
    productId: null,
    skuId: null,
    unitId: null,
    matchStatus: 'unmatched',
    rawProductName: item.name,
  };

  // 1. 匹配产品
  const products = await matchProduct(item.name);

  if (products.length === 0) {
    console.log(`[匹配] 产品未找到: ${item.name}`);
    return result;
  }

  // 取第一个匹配结果（最相关）
  const matchedProduct: Product = products[0];
  result.productId = matchedProduct.product_id;
  result.matchStatus = 'product_only';

  console.log(`[匹配] 产品匹配: ${item.name} -> ${matchedProduct.product_name} (ID: ${matchedProduct.product_id})`);

  // 2. 获取产品的 SKU
  try {
    const skus = await getProductSkus(matchedProduct.product_id);
    if (skus.length > 0) {
      // 优先选择默认 SKU，否则取第一个
      const defaultSku = skus.find(s => s.is_default) || skus[0];
      result.skuId = defaultSku.sku_id;
      result.matchStatus = 'matched';
      console.log(`[匹配] SKU 匹配: ${defaultSku.sku_name} (ID: ${defaultSku.sku_id})`);
    } else {
      console.log(`[匹配] 产品无 SKU: ${matchedProduct.product_name}`);
    }
  } catch (err) {
    console.warn(`[匹配] 获取 SKU 失败:`, err);
  }

  // 3. 匹配单位
  if (item.unit) {
    const unit = await matchUnit(item.unit);
    if (unit) {
      result.unitId = unit.unit_id;
      console.log(`[匹配] 单位匹配: ${item.unit} -> ${unit.unit_name} (ID: ${unit.unit_id})`);
    } else {
      console.log(`[匹配] 单位未找到: ${item.unit}`);
    }
  }

  return result;
}

// ============ 主提交函数 ============

/**
 * 提交采购数据到数据库
 *
 * @param dailyLog - 前端录入的日志数据
 * @param storeId - UserCenter 门店 UUID
 * @param employeeId - UserCenter 员工 UUID
 * @returns 提交结果
 */
export async function submitProcurement(
  dailyLog: Omit<DailyLog, 'id'>,
  storeId: string,
  employeeId: string
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

  // 匹配供应商
  let supplierId: number | null = null;
  if (dailyLog.supplier) {
    const supplier = await matchSupplier(dailyLog.supplier);
    if (supplier) {
      supplierId = supplier.supplier_id;
      console.log(`[提交] 供应商匹配: ${dailyLog.supplier} -> ${supplier.supplier_name} (ID: ${supplier.supplier_id})`);
    } else {
      console.log(`[提交] 供应商未找到: ${dailyLog.supplier}`);
      result.pendingMatches.push({
        itemName: dailyLog.supplier,
        matchType: 'supplier',
        candidates: [],
      });
    }
  }

  // 匹配每个物品并构建记录
  const records: StorePurchasePrice[] = [];
  const priceDate = new Date(dailyLog.date).toISOString().split('T')[0];

  for (const item of validItems) {
    const matchResult = await matchItem(item);

    // 如果没有匹配到产品，记录待处理
    if (matchResult.matchStatus === 'unmatched') {
      result.pendingMatches.push({
        itemName: item.name,
        matchType: 'product',
        candidates: [],
      });
      console.log(`[提交] 产品未找到，跳过: ${item.name}`);
      continue;
    }

    // 如果产品存在但没有 SKU，记录待处理
    if (matchResult.matchStatus === 'product_only' || !matchResult.skuId) {
      result.pendingMatches.push({
        itemName: `${item.name} (产品ID: ${matchResult.productId})`,
        matchType: 'product',
        candidates: [{
          id: matchResult.productId || 0,
          name: `产品存在但缺少 SKU 配置`
        }],
      });
      console.log(`[提交] 产品无SKU，跳过: ${item.name} (产品ID: ${matchResult.productId})`);
      continue;
    }

    // 如果没有匹配到单位，记录待处理
    if (!matchResult.unitId) {
      result.pendingMatches.push({
        itemName: item.unit || '未知单位',
        matchType: 'unit',
        candidates: [],
      });
      // 继续处理，使用默认单位 ID
    }

    // 验证价格必须大于 0
    if (!item.unitPrice || item.unitPrice <= 0) {
      result.pendingMatches.push({
        itemName: item.name,
        matchType: 'product',
        candidates: [{
          id: matchResult.productId || 0,
          name: `价格无效: ${item.unitPrice || 0}`,
        }],
      });
      console.log(`[提交] 价格无效，跳过: ${item.name} (价格: ${item.unitPrice})`);
      continue;
    }

    // 构建采购价格记录（走到这里说明已有 SKU）
    const record: StorePurchasePrice = {
      store_id: storeId, // 直接使用 UUID，数据库已支持
      sku_id: matchResult.skuId,
      supplier_id: supplierId || undefined,
      price_date: priceDate,
      purchase_price: item.unitPrice,
      purchase_unit_id: matchResult.unitId || 1, // 默认单位 ID
      purchase_quantity: item.quantity || 1,
      source_type: 'manual_input', // 必须是允许的值之一
      status: 'pending',
      notes: `${item.name}${item.specification ? ` - ${item.specification}` : ''} | 原始供应商: ${dailyLog.supplier}`,
      created_by: employeeId, // 直接使用 UUID，数据库已支持
    };

    records.push(record);
  }

  // 批量插入
  if (records.length > 0) {
    try {
      console.log(`[提交] 准备插入 ${records.length} 条记录`);
      const inserted = await createPurchasePrices(records);
      result.insertedCount = inserted.length;

      // 只有实际插入了数据才算成功
      if (inserted.length > 0) {
        result.success = true;
        console.log(`[提交] 成功插入 ${inserted.length} 条记录`);
      } else {
        result.success = false;
        result.errors.push('数据插入失败：未返回任何记录');
        console.error('[提交] 插入失败：数据库未返回记录');
      }
    } catch (err) {
      console.error('[提交] 批量插入失败:', err);
      result.errors.push(`数据库写入失败: ${err instanceof Error ? err.message : '未知错误'}`);
    }
  } else {
    // 没有可插入的记录
    if (result.pendingMatches.length > 0) {
      // 如果有待处理项，说明需要人工介入
      result.success = false;
      const skippedItems = validItems.length - records.length;
      result.errors.push(
        `${skippedItems} 条记录因缺少 SKU 数据而跳过。` +
        `可能原因：产品存在但未配置 SKU，需要先在数据库中添加 product_sku 记录。`
      );
      console.log(`[提交] 跳过了 ${skippedItems} 条记录（产品无 SKU）`);
    } else {
      // 没有待处理项也没有可插入的记录（不太可能发生）
      result.success = false;
      result.errors.push('没有可处理的有效记录');
    }
  }

  // 总结
  console.log(`[提交] 完成: 成功=${result.success}, 插入=${result.insertedCount}, 待处理=${result.pendingMatches.length}, 错误=${result.errors.length}`);

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
    const unitPending = result.pendingMatches.filter(p => p.matchType === 'unit').length;

    const pendingParts: string[] = [];
    if (productPending > 0) pendingParts.push(`${productPending} 个产品`);
    if (supplierPending > 0) pendingParts.push(`${supplierPending} 个供应商`);
    if (unitPending > 0) pendingParts.push(`${unitPending} 个单位`);

    message += `\n${pendingParts.join('、')} 待人工确认`;
  }

  return message;
}
