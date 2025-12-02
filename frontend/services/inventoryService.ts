/**
 * 库存提交服务
 * v1.0 - 将采购数据提交到 Supabase 数据库
 * 修复黄睿 PR #4 遗漏的文件
 */

import { DailyLog, ProcurementItem } from '../types';
import {
  createPurchasePrices,
  matchSupplier,
  matchProduct,
  matchUnit,
  getProductSkus,
  StorePurchasePrice,
} from './supabaseService';

/**
 * 提交结果类型
 */
export interface SubmitResult {
  success: boolean;
  totalItems: number;
  successCount: number;
  errors: string[];
}

/**
 * 提交采购数据到数据库
 * @param logData 采购日志数据
 * @param storeId 门店ID
 * @param employeeId 员工ID
 * @returns 提交结果
 */
export async function submitProcurement(
  logData: Omit<DailyLog, 'id'>,
  storeId: string,
  employeeId: string
): Promise<SubmitResult> {
  const errors: string[] = [];
  const priceRecords: StorePurchasePrice[] = [];

  // 1. 匹配供应商
  let supplierId: number | undefined;
  if (logData.supplier) {
    try {
      const supplier = await matchSupplier(logData.supplier);
      if (supplier) {
        supplierId = supplier.supplier_id;
      } else {
        console.warn(`[inventoryService] 未找到供应商: ${logData.supplier}`);
      }
    } catch (err) {
      console.error('[inventoryService] 匹配供应商失败:', err);
    }
  }

  // 2. 处理每个物品
  for (const item of logData.items) {
    try {
      // 匹配产品
      const products = await matchProduct(item.name);
      if (!products || products.length === 0) {
        errors.push(`未找到产品: ${item.name}`);
        continue;
      }

      const product = products[0];

      // 获取产品的默认 SKU
      const skus = await getProductSkus(product.product_id);
      if (!skus || skus.length === 0) {
        errors.push(`产品 ${item.name} 没有 SKU`);
        continue;
      }

      const defaultSku = skus.find(s => s.is_default) || skus[0];

      // 匹配单位
      let unitId: number | undefined;
      if (item.unit) {
        const unit = await matchUnit(item.unit);
        if (unit) {
          unitId = unit.unit_id;
        }
      }

      // 如果没有匹配到单位，使用产品的采购单位
      if (!unitId && product.purchase_unit_id) {
        unitId = product.purchase_unit_id;
      }

      // 如果仍然没有单位，跳过
      if (!unitId) {
        errors.push(`产品 ${item.name} 无法确定单位`);
        continue;
      }

      // 构建价格记录
      const priceRecord: StorePurchasePrice = {
        store_id: storeId,
        sku_id: defaultSku.sku_id,
        supplier_id: supplierId,
        price_date: logData.date.split('T')[0], // YYYY-MM-DD
        purchase_price: item.unitPrice,
        purchase_unit_id: unitId,
        purchase_quantity: item.quantity,
        source_type: 'manual_input',
        status: 'pending',
        notes: logData.notes || undefined,
        created_by: employeeId,
      };

      priceRecords.push(priceRecord);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      errors.push(`处理 ${item.name} 失败: ${errorMessage}`);
    }
  }

  // 3. 批量提交
  let successCount = 0;
  if (priceRecords.length > 0) {
    try {
      const results = await createPurchasePrices(priceRecords);
      successCount = results.length;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '数据库错误';
      errors.push(`批量提交失败: ${errorMessage}`);
    }
  }

  return {
    success: successCount > 0 && errors.length === 0,
    totalItems: logData.items.length,
    successCount,
    errors,
  };
}

/**
 * 格式化提交结果为用户友好的消息
 * @param result 提交结果
 * @returns 格式化后的消息
 */
export function formatSubmitResult(result: SubmitResult): string {
  if (result.success) {
    return `成功提交 ${result.successCount}/${result.totalItems} 项`;
  }

  if (result.successCount > 0) {
    return `部分成功：${result.successCount}/${result.totalItems} 项\n问题：${result.errors.join('、')}`;
  }

  return `提交失败：${result.errors.join('、')}`;
}
