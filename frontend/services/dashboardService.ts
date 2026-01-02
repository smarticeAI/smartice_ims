/**
 * 仪表板数据服务
 * v5.0 - 修复品类筛选：通过 ims_material 表关联 category_id（JOIN查询）
 * v4.0 - 统计卡片/供应商支持品类筛选，物品列表支持模糊搜索+最近采购优先
 * v3.0 - 新增品类趋势、供应商统计、物品单价追踪、采购量趋势 API
 * v2.0 - 使用 restaurant_id 替代 store_id
 */

import { supabase } from './supabaseClient';
import { DailyLog, ProcurementItem } from '../types';

// ============ 类型定义 ============

export interface DashboardStats {
  totalSpend: number;
  totalItems: number;
  supplierCount: number;
}

export interface DailyTrend {
  date: string;
  cost: number;
}

export interface Category {
  id: number;
  name: string;
}

export interface SupplierStats {
  supplier: string;
  total: number;
}

export interface ItemPriceTrend {
  date: string;
  price: number;
  quantity: number;
}

export interface QuantityTrend {
  date: string;
  quantity: number;
}

export interface ItemInfo {
  name: string;
  unit: string;
  lastPurchaseDate: string;
}

// ============ 数据获取 API ============

/**
 * 获取仪表板统计数据（支持品类筛选）
 */
export async function getDashboardStats(
  restaurantId?: string,
  categoryId?: number,
  days: number = 30
): Promise<DashboardStats> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('total_amount, quantity, supplier_id, supplier_name, material_id, ims_material!inner(category_id)')
    .gte('price_date', startDateStr);

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (categoryId) query = query.eq('ims_material.category_id', categoryId);

  const { data, error } = await query;

  if (error) {
    console.error('获取仪表板统计失败:', error);
    throw error;
  }

  const totalSpend = data?.reduce((sum, row) => sum + (Number(row.total_amount) || 0), 0) || 0;
  const totalItems = data?.reduce((sum, row) => sum + (Number(row.quantity) || 0), 0) || 0;

  const suppliers = new Set<string>();
  data?.forEach(row => {
    if (row.supplier_id) suppliers.add(`id:${row.supplier_id}`);
    else if (row.supplier_name) suppliers.add(`name:${row.supplier_name}`);
  });

  return { totalSpend, totalItems, supplierCount: suppliers.size };
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

// ============ 新增 API v3.0 ============

/**
 * 获取所有品类列表
 */
export async function getCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('ims_category')
    .select('id, name')
    .eq('is_active', true)
    .eq('category_type', 'material')
    .order('sort_order');

  if (error) {
    console.error('获取品类列表失败:', error);
    return [];
  }

  return data?.map(row => ({ id: row.id, name: row.name })) || [];
}

/**
 * 按品类获取每日采购趋势
 */
export async function getCategoryTrend(
  restaurantId?: string,
  categoryId?: number,
  days: number = 30
): Promise<DailyTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('price_date, total_amount, material_id, ims_material!inner(category_id)')
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: true });

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (categoryId) query = query.eq('ims_material.category_id', categoryId);

  const { data, error } = await query;
  if (error) {
    console.error('获取品类趋势失败:', error);
    return [];
  }

  const dailyMap = new Map<string, number>();
  data?.forEach(row => {
    const date = row.price_date;
    dailyMap.set(date, (dailyMap.get(date) || 0) + (Number(row.total_amount) || 0));
  });

  return Array.from(dailyMap.entries()).map(([date, cost]) => ({ date, cost }));
}

/**
 * 获取供应商采购统计（支持品类筛选）
 */
export async function getSupplierStats(
  restaurantId?: string,
  categoryId?: number,
  days: number = 30
): Promise<SupplierStats[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('supplier_name, total_amount, material_id, ims_material!inner(category_id)')
    .gte('price_date', startDateStr);

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (categoryId) query = query.eq('ims_material.category_id', categoryId);

  const { data, error } = await query;
  if (error) {
    console.error('获取供应商统计失败:', error);
    return [];
  }

  const supplierMap = new Map<string, number>();
  data?.forEach(row => {
    const supplier = row.supplier_name || '未知供应商';
    supplierMap.set(supplier, (supplierMap.get(supplier) || 0) + (Number(row.total_amount) || 0));
  });

  return Array.from(supplierMap.entries())
    .map(([supplier, total]) => ({ supplier, total }))
    .sort((a, b) => b.total - a.total);
}

/**
 * 获取物品单价趋势
 */
export async function getItemPriceTrend(
  itemName: string,
  restaurantId?: string,
  days: number = 30
): Promise<ItemPriceTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('price_date, unit_price, quantity')
    .eq('item_name', itemName)
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: true });

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);

  const { data, error } = await query;
  if (error) {
    console.error('获取物品单价趋势失败:', error);
    return [];
  }

  return data?.map(row => ({
    date: row.price_date,
    price: Number(row.unit_price) || 0,
    quantity: Number(row.quantity) || 0,
  })) || [];
}

/**
 * 获取采购量趋势
 */
export async function getQuantityTrend(
  restaurantId?: string,
  categoryId?: number,
  days: number = 30
): Promise<QuantityTrend[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('price_date, quantity, material_id, ims_material!inner(category_id)')
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: true });

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);
  if (categoryId) query = query.eq('ims_material.category_id', categoryId);

  const { data, error } = await query;
  if (error) {
    console.error('获取采购量趋势失败:', error);
    return [];
  }

  const dailyMap = new Map<string, number>();
  data?.forEach(row => {
    const date = row.price_date;
    dailyMap.set(date, (dailyMap.get(date) || 0) + (Number(row.quantity) || 0));
  });

  return Array.from(dailyMap.entries()).map(([date, quantity]) => ({ date, quantity }));
}

/**
 * 获取所有物品名称列表（模糊搜索+最近采购优先）
 */
export async function getItemNames(
  restaurantId?: string,
  days: number = 30
): Promise<ItemInfo[]> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  let query = supabase
    .from('ims_material_price')
    .select('item_name, unit, price_date')
    .gte('price_date', startDateStr)
    .order('price_date', { ascending: false });

  if (restaurantId) query = query.eq('restaurant_id', restaurantId);

  const { data, error } = await query;
  if (error) {
    console.error('获取物品列表失败:', error);
    return [];
  }

  // 按物品名去重，保留最近采购日期和单位
  const itemMap = new Map<string, ItemInfo>();
  data?.forEach(row => {
    if (row.item_name && !itemMap.has(row.item_name)) {
      itemMap.set(row.item_name, {
        name: row.item_name,
        unit: row.unit || '',
        lastPurchaseDate: row.price_date
      });
    }
  });

  // 按最近采购日期排序（已经是降序了）
  return Array.from(itemMap.values());
}
