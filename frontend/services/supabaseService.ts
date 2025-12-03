/**
 * Supabase 数据库服务
 * v3.1 - 添加获取全部产品/供应商函数（用于下拉选择器）
 *
 * 变更历史：
 * - v3.1: 新增 getAllProducts、getAllSuppliers 用于下拉列表展示全部选项
 * - v3.0: 简化 ims_material_price 表，移除 SKU，改为直接关联 material
 * - v2.3: 新增 searchUnits 函数用于单位自动完成输入
 * - v2.2: 更新表名映射（ims_product→ims_material, ims_unit_of_measure→ims_ref_unit等）
 * - v2.1: 添加 total_amount 字段支持采购总价
 * - v2.0: 使用 supabaseClient.ts 提供的单例客户端
 */

import { supabase } from './supabaseClient';
import { searchInList } from './pinyinSearch';

// 导出 supabase 客户端以保持向后兼容
export function getSupabaseClient() {
  return supabase;
}

// ============ 类型定义 ============

// v2.2 - 更新为实际数据库表结构（ims_ref_*, ims_material*）
export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  is_active: boolean;
}

export interface Product {
  id: number;
  code: string;
  name: string;
  category_id?: number;
  base_unit_id?: number;
  is_active: boolean;
}

export interface ProductSku {
  id: number;
  material_id: number;
  sku_code: string;
  package_spec?: string;
  base_qty_per_package?: number;
  package_unit_id?: number;
  is_default: boolean;
  is_active: boolean;
}

export interface UnitOfMeasure {
  id: number;
  code: string;
  name_cn: string;
  name_en?: string;
  unit_type?: string;
  dimension?: string;
}

// v3.0 - 简化的采购价格记录
export interface StorePurchasePrice {
  id?: number;
  store_id: string;           // UUID - 门店
  created_by: string;         // UUID - 录入人
  material_id?: number;       // 关联 ims_material（可为空）
  supplier_id?: number;       // 关联 ims_ref_supplier（可为空）
  item_name: string;          // 原始录入名称
  quantity: number;           // 数量
  unit: string;               // 单位（自由文本）
  unit_price: number;         // 单价
  total_amount?: number;      // 总金额
  receipt_image?: string;     // 收货单图片 URL
  goods_image?: string;       // 货物图片 URL
  price_date: string;         // 采购日期
  supplier_name?: string;     // "其他"供应商时的名称
  notes?: string;             // 备注
  status?: string;            // pending/approved/rejected
}

// ============ 供应商 API ============
// v2.2 - 使用 ims_ref_supplier 表

/**
 * 获取供应商列表
 */
export async function getSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('ims_ref_supplier')
    .select('id, name, contact_person, phone, is_active')
    .eq('is_active', true)
    .order('name');

  if (error) {
    console.error('获取供应商列表失败:', error);
    throw error;
  }

  return data || [];
}

/**
 * 模糊匹配供应商
 */
export async function matchSupplier(name: string): Promise<Supplier | null> {
  // 先精确匹配
  const { data: exactMatch } = await supabase
    .from('ims_ref_supplier')
    .select('*')
    .eq('name', name)
    .eq('is_active', true)
    .single();

  if (exactMatch) {
    return exactMatch;
  }

  // 模糊匹配
  const { data: fuzzyMatch } = await supabase
    .from('ims_ref_supplier')
    .select('*')
    .ilike('name', `%${name}%`)
    .eq('is_active', true)
    .limit(1);

  return fuzzyMatch?.[0] || null;
}

// ============ 产品 API ============
// v2.2 - 使用 ims_material 和 ims_material_sku 表

/**
 * 获取产品列表（按分类）
 */
export async function getProducts(categoryId?: number): Promise<Product[]> {
  let query = supabase
    .from('ims_material')
    .select('id, code, name, category_id, base_unit_id, is_active')
    .eq('is_active', true);

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query.order('name');

  if (error) {
    console.error('获取产品列表失败:', error);
    throw error;
  }

  return data || [];
}

/**
 * 模糊匹配产品
 */
export async function matchProduct(name: string): Promise<Product[]> {
  // 使用 ILIKE 进行模糊匹配
  const { data, error } = await supabase
    .from('ims_material')
    .select('*')
    .or(`name.ilike.%${name}%,code.ilike.%${name}%`)
    .eq('is_active', true)
    .limit(10);

  if (error) {
    console.error('产品匹配失败:', error);
    throw error;
  }

  return data || [];
}

/**
 * 获取产品的 SKU 列表
 */
export async function getProductSkus(materialId: number): Promise<ProductSku[]> {
  const { data, error } = await supabase
    .from('ims_material_sku')
    .select('*')
    .eq('material_id', materialId)
    .eq('is_active', true)
    .order('is_default', { ascending: false });

  if (error) {
    console.error('获取 SKU 列表失败:', error);
    throw error;
  }

  return data || [];
}

// ============ 单位 API ============
// v2.2 - 使用 ims_ref_unit 表

/**
 * 获取计量单位列表
 */
export async function getUnits(): Promise<UnitOfMeasure[]> {
  const { data, error } = await supabase
    .from('ims_ref_unit')
    .select('*')
    .eq('is_active', true)
    .order('unit_type');

  if (error) {
    console.error('获取单位列表失败:', error);
    throw error;
  }

  return data || [];
}

/**
 * 获取所有单位列表（用于下拉选择）
 * v2.2 - 使用 ims_ref_unit 表
 */
export async function getAllUnits(): Promise<Array<{id: number, code: string, name: string}>> {
  const { data, error } = await supabase
    .from('ims_ref_unit')
    .select('id, code, name_cn')
    .eq('is_active', true)
    .order('name_cn');

  if (error) {
    console.error('获取单位列表失败:', error);
    throw error;
  }

  return data?.map(u => ({
    id: u.id,
    code: u.code,
    name: u.name_cn
  })) || [];
}

/**
 * 匹配单位
 * v2.2 - 使用 ims_ref_unit 表
 */
export async function matchUnit(unitName: string): Promise<UnitOfMeasure | null> {
  // 直接精确匹配或模糊匹配
  const { data } = await supabase
    .from('ims_ref_unit')
    .select('*')
    .or(`code.eq.${unitName},name_cn.eq.${unitName}`)
    .eq('is_active', true)
    .single();

  return data;
}

// ============ 采购价格 API ============
// v3.0 - 简化版，移除 SKU 依赖

/**
 * 创建采购价格记录
 */
export async function createPurchasePrice(data: StorePurchasePrice): Promise<StorePurchasePrice> {
  const { data: result, error } = await supabase
    .from('ims_material_price')
    .insert({
      store_id: data.store_id,
      created_by: data.created_by,
      material_id: data.material_id || null,
      supplier_id: data.supplier_id || null,
      item_name: data.item_name,
      quantity: data.quantity,
      unit: data.unit,
      unit_price: data.unit_price,
      total_amount: data.total_amount,
      receipt_image: data.receipt_image || null,
      goods_image: data.goods_image || null,
      price_date: data.price_date,
      supplier_name: data.supplier_name || null,
      notes: data.notes || null,
      status: data.status || 'pending',
    })
    .select()
    .single();

  if (error) {
    console.error('创建采购价格记录失败:', error);
    throw error;
  }

  return result;
}

/**
 * 批量创建采购价格记录
 */
export async function createPurchasePrices(records: StorePurchasePrice[]): Promise<StorePurchasePrice[]> {
  const { data: results, error } = await supabase
    .from('ims_material_price')
    .insert(records.map(r => ({
      store_id: r.store_id,
      created_by: r.created_by,
      material_id: r.material_id || null,
      supplier_id: r.supplier_id || null,
      item_name: r.item_name,
      quantity: r.quantity,
      unit: r.unit,
      unit_price: r.unit_price,
      total_amount: r.total_amount,
      receipt_image: r.receipt_image || null,
      goods_image: r.goods_image || null,
      price_date: r.price_date,
      supplier_name: r.supplier_name || null,
      notes: r.notes || null,
      status: r.status || 'pending',
    })))
    .select();

  if (error) {
    console.error('批量创建采购价格记录失败:', error);
    throw error;
  }

  return results || [];
}

// ============ 连接测试 ============

/**
 * 测试 Supabase 连接
 * v2.2 - 使用 ims_ref_supplier 表
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('ims_ref_supplier').select('id').limit(1);
    return !error;
  } catch {
    return false;
  }
}

// ============ 自动完成搜索 API ============

/**
 * 自动完成选项类型
 */
export interface AutocompleteOption {
  id: string | number;
  label: string;
  value: string;
  sublabel?: string;
}

// 数据缓存
let suppliersCache: Supplier[] | null = null;
let productsCache: Product[] | null = null;
let unitsCache: Array<{id: number, code: string, name: string}> | null = null;

/**
 * 搜索供应商（支持汉字 + 拼音首字母）
 * v2.2 - 更新为使用 id/name 字段
 * @param query 搜索关键词
 * @returns 匹配的供应商选项列表（最多10条）
 */
export async function searchSuppliers(query: string): Promise<AutocompleteOption[]> {
  if (!query || query.length < 1) return [];

  // 首次调用时加载全部数据
  if (!suppliersCache) {
    suppliersCache = await getSuppliers();
  }

  // 本地搜索（汉字 + 拼音匹配）
  const matched = searchInList(
    suppliersCache,
    query,
    (s) => s.name,
    10
  );

  return matched.map(s => ({
    id: s.id,
    label: s.name,
    value: s.name,
    sublabel: s.contact_person || undefined,
  }));
}

/**
 * 搜索产品（支持汉字 + 拼音首字母）
 * v2.2 - 更新为使用 id/name 字段
 * @param query 搜索关键词
 * @returns 匹配的产品选项列表（最多10条）
 */
export async function searchProducts(query: string): Promise<AutocompleteOption[]> {
  if (!query || query.length < 1) return [];

  // 首次调用时加载全部数据
  if (!productsCache) {
    productsCache = await getProducts();
  }

  // 本地搜索（汉字 + 拼音匹配）
  const matched = searchInList(
    productsCache,
    query,
    (p) => p.name,
    10
  );

  return matched.map(p => ({
    id: p.id,
    label: p.name,
    value: p.name,
    sublabel: p.code || undefined,
  }));
}

/**
 * 搜索单位（支持汉字 + 拼音首字母）
 * v2.3 - 新增：用于单位自动完成输入
 * @param query 搜索关键词
 * @returns 匹配的单位选项列表（最多10条）
 */
export async function searchUnits(query: string): Promise<AutocompleteOption[]> {
  if (!query || query.length < 1) return [];

  // 首次调用时加载全部数据
  if (!unitsCache) {
    unitsCache = await getAllUnits();
  }

  // 本地搜索（汉字 + 拼音匹配）
  const matched = searchInList(
    unitsCache,
    query,
    (u) => u.name,
    10
  );

  return matched.map(u => ({
    id: u.id,
    label: u.name,
    value: u.name,
    sublabel: u.code || undefined,
  }));
}

/**
 * 清除搜索缓存（数据更新后调用）
 */
export function clearSearchCache(): void {
  suppliersCache = null;
  productsCache = null;
  unitsCache = null;
}

// ============ v3.1: 获取全部选项（用于下拉选择器） ============

/**
 * 获取全部产品列表（用于下拉选择器）
 * @returns 全部产品选项列表
 */
export async function getAllProductsAsOptions(): Promise<AutocompleteOption[]> {
  // 使用缓存
  if (!productsCache) {
    productsCache = await getProducts();
  }

  return productsCache.map(p => ({
    id: p.id,
    label: p.name,
    value: p.name,
    sublabel: p.code || undefined,
  }));
}

/**
 * 获取全部供应商列表（用于下拉选择器）
 * @returns 全部供应商选项列表
 */
export async function getAllSuppliersAsOptions(): Promise<AutocompleteOption[]> {
  // 使用缓存
  if (!suppliersCache) {
    suppliersCache = await getSuppliers();
  }

  return suppliersCache.map(s => ({
    id: s.id,
    label: s.name,
    value: s.name,
    sublabel: s.contact_person || undefined,
  }));
}
