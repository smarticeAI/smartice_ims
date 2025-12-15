/**
 * 仪表板数据服务
 * v2.0 - 使用 restaurant_id 替代 store_id
 * v1.0 - 从 ims_material_price 表获取采购统计数据
 */

import { supabase } from './supabaseClient';
import { DailyLog, ProcurementItem } from '../types';

// ============ 类型定义 ============

export interface DashboardStats {
  totalSpend: number;      // 总采购额
  totalItems: number;      // 入库数量
  supplierCount: number;   // 供应商数
}

export interface DailyTrend {
  date: string;
  cost: number;
}

// ============ 数据获取 API ============

/**
 * 获取仪表板统计数据
 * @param restaurantId 餐厅 ID（可选，不传则获取全部）
 * @param days 最近天数，默认 30 天
 */
export async function getDashboardStats(
  restaurantId?: string,
  days: number = 30
): Promise<DashboardStats> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('total_amount, quantity, supplier_id, supplier_name')
    .gte('price_date', startDateStr);

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('获取仪表板统计失败:', error);
    throw error;
  }

  // 计算统计数据
  const totalSpend = data?.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0) || 0;
  const totalItems = data?.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0) || 0;

  // 统计供应商数（supplier_id 或 supplier_name 去重）
  const suppliers = new Set<string>();
  data?.forEach(row => {
    if (row.supplier_id) {
      suppliers.add(`id:${row.supplier_id}`);
    } else if (row.supplier_name) {
      suppliers.add(`name:${row.supplier_name}`);
    }
  });

  return {
    totalSpend,
    totalItems,
    supplierCount: suppliers.size,
  };
}

/**
 * 获取每日采购趋势
 * @param restaurantId 餐厅 ID（可选）
 * @param days 最近天数，默认 30 天
 */
export async function getDailyTrend(
  restaurantId?: string,
  days: number = 30
): Promise<DailyTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('price_date, total_amount')
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: true });

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('获取每日趋势失败:', error);
    throw error;
  }

  // 按日期聚合
  const dailyMap = new Map<string, number>();
  data?.forEach(row => {
    const date = row.price_date;
    const amount = Number(row.total_amount) || 0;
    dailyMap.set(date, (dailyMap.get(date) || 0) + amount);
  });

  // 转换为数组
  return Array.from(dailyMap.entries()).map(([date, cost]) => ({
    date,
    cost,
  }));
}

/**
 * 获取采购记录列表（转换为 DailyLog 格式供 Dashboard 使用）
 * @param restaurantId 餐厅 ID（可选）
 * @param days 最近天数，默认 30 天
 */
export async function getPurchaseLogs(
  restaurantId?: string,
  days: number = 30
): Promise<DailyLog[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select(`
      id,
      item_name,
      quantity,
      unit,
      unit_price,
      total_amount,
      price_date,
      supplier_id,
      supplier_name,
      notes,
      status
    `)
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: false });

  if (restaurantId) {
    query = query.eq('restaurant_id', restaurantId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('获取采购记录失败:', error);
    throw error;
  }

  if (!data || data.length === 0) {
    return [];
  }

  // 按日期+供应商分组，转换为 DailyLog 格式
  const logsMap = new Map<string, DailyLog>();

  data.forEach((row, index) => {
    const supplier = row.supplier_name || `供应商#${row.supplier_id || '未知'}`;
    const key = `${row.price_date}-${supplier}`;

    if (!logsMap.has(key)) {
      logsMap.set(key, {
        id: `log-${index}`,
        date: row.price_date,
        category: 'Dry Goods', // 默认分类
        supplier: supplier,
        items: [],
        totalCost: 0,
        notes: '',
        status: row.status === 'approved' ? 'Stocked' : 'Pending',
      });
    }

    const log = logsMap.get(key)!;

    // 添加物品
    const item: ProcurementItem = {
      name: row.item_name,
      specification: row.notes || '',
      quantity: Number(row.quantity) || 0,
      unit: row.unit || '',
      unitPrice: Number(row.unit_price) || 0,
      total: Number(row.total_amount) || 0,
    };

    log.items.push(item);
    log.totalCost += item.total;
  });

  return Array.from(logsMap.values());
}
