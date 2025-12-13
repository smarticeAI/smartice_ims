/**
 * Supabase 数据库服务
 * v4.0 - 供应商表重命名 ims_ref_supplier → ims_supplier，品牌字段改为 brand_id 外键
 * v3.8 - 添加物料别名(aliases)支持，实现模糊匹配（如西红柿→番茄）
 * v3.7 - 添加 use_ai_photo 和 use_ai_voice 字段，追踪 AI 功能使用情况
 * v3.6 - 添加分类API，getCategories() 从数据库读取分类
 * v3.5 - 添加供应商品牌过滤，getSuppliers() 支持 brandId 参数
 * v3.4 - 添加 brandCode 品牌过滤，支持按品牌加载物料
 *
 * 变更历史：
 * - v4.0: 供应商表重命名，brand_code → brand_id 外键，createOrGetSupplier 支持 brandId
 * - v3.8: Product 接口新增 aliases 字段，exactMatchProduct/searchProducts 支持别名匹配
 * - v3.7: createPurchasePrices 支持 use_ai_photo/use_ai_voice 字段写入
 * - v3.6: 新增 getCategories() 从数据库读取物料分类，支持品牌过滤
 * - v3.5: getSuppliers() 支持 brandId 参数，用于按品牌过滤供应商
 * - v3.4: getProducts() 支持 brandCode 参数，用于按品牌过滤物料
 * - v3.3: 添加删除采购记录功能
 * - v3.2: 与 PreloadDataContext 共享缓存，支持应用启动时预加载数据
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

// v4.0 - 更新为实际数据库表结构（ims_supplier, ims_material*）
export interface Supplier {
  id: number;
  name: string;
  contact_person?: string;
  phone?: string;
  is_active: boolean;
  brand_id: number;  // v4.0: 品牌ID外键，关联 ims_brand
}

export interface Product {
  id: number;
  code: string;
  name: string;
  category_id?: number;
  base_unit_id?: number;
  is_active: boolean;
  aliases?: string[];  // v3.8: 别名列表，用于模糊匹配（如 ["西红柿"] 对应番茄）
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

// v3.6 - 物料分类
export interface Category {
  id: number;
  name: string;
  sort_order: number;
  brand_code?: string | null;
}

// v3.7 - 添加 use_ai_photo 和 use_ai_voice 字段，追踪 AI 功能使用情况
// v3.6 - 添加 specification 字段，与 notes 分开存储
export interface StorePurchasePrice {
  id?: number;
  store_id: string;           // UUID - 门店
  created_by: string;         // UUID - 录入人
  material_id?: number;       // 关联 ims_material（可为空）
  supplier_id?: number;       // 关联 ims_supplier（可为空）
  item_name: string;          // 原始录入名称
  quantity: number;           // 数量
  unit: string;               // 单位（自由文本）
  unit_price: number;         // 单价
  total_amount?: number;      // 总金额
  receipt_image?: string;     // 收货单图片 URL
  goods_image?: string;       // 货物图片 URL
  price_date: string;         // 采购日期
  supplier_name?: string;     // "其他"供应商时的名称
  specification?: string;     // v3.6: 物料规格（如 150g/包、500ml/瓶）
  notes?: string;             // 备注
  status?: string;            // pending/approved/rejected
  use_ai_photo?: number;      // v3.7: AI 识图功能使用次数
  use_ai_voice?: number;      // v3.7: 语音识别功能使用次数
}

// ============ 分类 API ============
// v3.6 - 从数据库读取物料分类

/**
 * 获取物料分类列表（按品牌过滤）
 * v3.6 - 新增：从数据库读取分类，支持品牌过滤
 * @param brandCode 可选品牌代码 (YBL=野百灵, NGX=宁桂杏)，NULL表示通用
 */
export async function getCategories(brandCode?: string): Promise<Category[]> {
  let query = supabase
    .from('ims_ref_category')
    .select('id, name, sort_order, brand_code')
    .eq('is_active', true)
    .eq('category_type', 'material');

  // 品牌过滤：加载本品牌 + 通用(NULL) 分类
  if (brandCode) {
    query = query.or(`brand_code.eq.${brandCode},brand_code.is.null`);
  }

  const { data, error } = await query.order('sort_order');

  if (error) {
    console.error('获取分类列表失败:', error);
    throw error;
  }

  return data || [];
}

// ============ 供应商 API ============
// v4.0 - 使用 ims_supplier 表，brand_id 外键

/**
 * 获取供应商列表（按品牌过滤）
 * v4.0 - 使用 brand_id 外键过滤，加载本品牌 + 通用(id=3) 供应商
 * @param brandId 可选品牌ID (1=野百灵, 2=宁桂杏, 3=通用)
 */
export async function getSuppliers(brandId?: number): Promise<Supplier[]> {
  let query = supabase
    .from('ims_supplier')
    .select('id, name, contact_person, phone, is_active, brand_id')
    .eq('is_active', true);

  // v4.0: 品牌过滤 - 加载本品牌 + 通用(id=3) 供应商
  if (brandId) {
    query = query.or(`brand_id.eq.${brandId},brand_id.eq.3`);
  }

  const { data, error } = await query.order('name');

  if (error) {
    console.error('获取供应商列表失败:', error);
    throw error;
  }

  return data || [];
}

/**
 * 模糊匹配供应商
 * v4.0 - 使用 ims_supplier 表
 */
export async function matchSupplier(name: string): Promise<Supplier | null> {
  // 先精确匹配
  const { data: exactMatch } = await supabase
    .from('ims_supplier')
    .select('*')
    .eq('name', name)
    .eq('is_active', true)
    .single();

  if (exactMatch) {
    return exactMatch;
  }

  // 模糊匹配
  const { data: fuzzyMatch } = await supabase
    .from('ims_supplier')
    .select('*')
    .ilike('name', `%${name}%`)
    .eq('is_active', true)
    .limit(1);

  return fuzzyMatch?.[0] || null;
}

/**
 * 创建新供应商（或返回已存在的）
 * v4.0 - 添加 brandId 参数，新建供应商时绑定品牌
 * v3.4 - 用于"其他"供应商自动入库
 * @param name 供应商名称
 * @param brandId 品牌ID (1=野百灵, 2=宁桂杏, 3=通用)，默认为 3（通用）
 */
export async function createOrGetSupplier(name: string, brandId: number = 3): Promise<Supplier> {
  const trimmedName = name.trim();

  // 先检查是否已存在（同名同品牌）
  const { data: existing } = await supabase
    .from('ims_supplier')
    .select('*')
    .eq('name', trimmedName)
    .single();

  if (existing) {
    console.log(`[供应商] 已存在: ${trimmedName} (ID: ${existing.id}, brand_id: ${existing.brand_id})`);
    return existing;
  }

  // 不存在则创建新的，绑定品牌ID
  const { data: newSupplier, error } = await supabase
    .from('ims_supplier')
    .insert({ name: trimmedName, is_active: true, brand_id: brandId })
    .select()
    .single();

  if (error) {
    console.error('创建供应商失败:', error);
    throw error;
  }

  console.log(`[供应商] 新增: ${trimmedName} (ID: ${newSupplier.id}, brand_id: ${brandId})`);
  return newSupplier;
}

// ============ 产品 API ============
// v2.2 - 使用 ims_material 和 ims_material_sku 表

/**
 * 获取产品列表（按分类/品牌过滤）
 * v3.5 - 修复: 使用 brand_id 而非 brand_code 过滤物料
 * @param categoryId 可选分类ID
 * @param brandCode 可选品牌代码 (YBL=野百灵, NGX=宁桂杏, COMMON=通用)
 */
export async function getProducts(categoryId?: number, brandCode?: string): Promise<Product[]> {
  // 品牌代码到品牌ID的映射
  const brandCodeToId: Record<string, number> = {
    'YBL': 1,    // 野百灵
    'NGX': 2,    // 宁桂杏
    'COMMON': 3, // 通用
  };

  let query = supabase
    .from('ims_material')
    .select('id, code, name, category_id, base_unit_id, is_active, aliases')
    .eq('is_active', true);

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  // v3.5: 品牌过滤 - 使用 brand_id，加载本品牌 + 通用(id=3) 物料
  if (brandCode && brandCodeToId[brandCode]) {
    const brandId = brandCodeToId[brandCode];
    query = query.or(`brand_id.eq.${brandId},brand_id.eq.3`);
  }

  const { data, error } = await query.order('name');

  if (error) {
    console.error('获取产品列表失败:', error);
    throw error;
  }

  return data || [];
}

/**
 * 模糊匹配产品（用于搜索下拉）
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
 * 精确匹配产品（用于提交验证）
 * v3.8 - 支持别名匹配：使用 RPC 函数同时匹配 name 和 aliases
 * v3.3 - 新增：验证产品名称是否精确存在于数据库
 */
export async function exactMatchProduct(name: string): Promise<Product | null> {
  const trimmedName = name.trim();

  // 使用数据库 RPC 函数进行匹配（同时匹配 name 和 aliases）
  const { data, error } = await supabase
    .rpc('match_material_by_alias', { search_name: trimmedName });

  if (error) {
    console.error('精确匹配产品失败:', error);
    throw error;
  }

  return data && data.length > 0 ? data[0] : null;
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
 * v3.7 - 支持 use_ai_photo/use_ai_voice 字段
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
      specification: data.specification || null,
      notes: data.notes || null,
      status: data.status || 'pending',
      use_ai_photo: data.use_ai_photo || 0,
      use_ai_voice: data.use_ai_voice || 0,
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
 * v3.7 - 支持 use_ai_photo/use_ai_voice 字段
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
      specification: r.specification || null,
      notes: r.notes || null,
      status: r.status || 'pending',
      use_ai_photo: r.use_ai_photo || 0,
      use_ai_voice: r.use_ai_voice || 0,
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
 * v4.0 - 使用 ims_supplier 表
 */
export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await supabase.from('ims_supplier').select('id').limit(1);
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

// ============ v3.2: 数据缓存（与 PreloadDataContext 共享） ============

// 数据缓存 - 可从外部注入（PreloadDataContext 使用）
let suppliersCache: Supplier[] | null = null;
let productsCache: Product[] | null = null;
let unitsCache: Array<{id: number, code: string, name: string}> | null = null;
let categoriesCache: Category[] | null = null;

/**
 * 注入供应商缓存（由 PreloadDataContext 调用）
 */
export function injectSuppliersCache(data: Supplier[]): void {
  suppliersCache = data;
  console.log(`[SupabaseService] 注入供应商缓存: ${data.length} 条`);
}

/**
 * 注入产品缓存（由 PreloadDataContext 调用）
 */
export function injectProductsCache(data: Product[]): void {
  productsCache = data;
  console.log(`[SupabaseService] 注入产品缓存: ${data.length} 条`);
}

/**
 * 注入单位缓存（由 PreloadDataContext 调用）
 */
export function injectUnitsCache(data: Array<{id: number, code: string, name: string}>): void {
  unitsCache = data;
  console.log(`[SupabaseService] 注入单位缓存: ${data.length} 条`);
}

/**
 * 注入分类缓存（由 PreloadDataContext 调用）
 * v3.6 - 新增
 */
export function injectCategoriesCache(data: Category[]): void {
  categoriesCache = data;
  console.log(`[SupabaseService] 注入分类缓存: ${data.length} 条`);
}

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
 * 搜索产品（支持汉字 + 拼音首字母 + 别名匹配）
 * v3.8 - 支持别名搜索：搜索关键词会同时匹配 name 和 aliases 数组
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

  // v3.8: 扩展搜索函数，同时匹配 name 和 aliases
  const getSearchableText = (p: Product): string => {
    // 将 name 和所有别名合并为一个可搜索字符串
    const aliasText = p.aliases ? p.aliases.join(' ') : '';
    return `${p.name} ${aliasText}`;
  };

  // 本地搜索（汉字 + 拼音匹配 + 别名匹配）
  const matched = searchInList(
    productsCache,
    query,
    getSearchableText,
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
  categoriesCache = null;
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

// ============ v3.3: 历史记录查询（分页懒加载） ============

/**
 * 采购历史记录项
 */
export interface ProcurementHistoryItem {
  id: number;
  item_name: string;
  supplier_name: string | null;
  quantity: number;
  unit: string;
  unit_price: number;
  total_amount: number;
  price_date: string;
  notes: string | null;
  status: string;
  receipt_image: string | null;
  goods_image: string | null;
  created_at: string;
}

// v4.5: 时间筛选类型
export type DateFilterType = 'today' | 'week' | 'month' | 'all';

/**
 * 获取采购历史记录（分页）
 * v4.5: 添加日期范围筛选
 * @param page 页码（从0开始）
 * @param pageSize 每页数量
 * @param storeId 可选门店ID过滤
 * @param dateFilter 日期筛选类型
 * @returns 历史记录列表
 */
// v5.0: 修复供应商名称显示 - 通过 supplier_id 关联 ims_supplier 表获取名称
export async function getProcurementHistory(
  page: number = 0,
  pageSize: number = 20,
  storeId?: string,
  dateFilter: DateFilterType = 'today'
): Promise<{ data: ProcurementHistoryItem[]; hasMore: boolean; total: number }> {
  const from = page * pageSize;
  const to = from + pageSize - 1;

  // v5.0: 使用关联查询获取供应商名称
  let query = supabase
    .from('ims_material_price')
    .select('*, ims_supplier(name)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (storeId) {
    query = query.eq('store_id', storeId);
  }

  // v4.5: 根据筛选类型添加日期条件
  if (dateFilter !== 'all') {
    const now = new Date();
    let startDate: Date;

    switch (dateFilter) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        break;
      case 'week':
        // 本周一开始（周一为一周第一天）
        const dayOfWeek = now.getDay();
        const daysToMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysToMonday);
        break;
      case 'month':
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        break;
      default:
        startDate = new Date(0);
    }

    query = query.gte('created_at', startDate.toISOString());
  }

  const { data, error, count } = await query;

  // DEBUG: 打印筛选条件和结果
  console.log('[getProcurementHistory] 筛选条件:', { page, pageSize, storeId, dateFilter });
  console.log('[getProcurementHistory] 查询结果:', { dataCount: data?.length, total: count });

  if (error) {
    console.error('获取采购历史失败:', error);
    throw error;
  }

  const total = count || 0;
  const hasMore = (from + (data?.length || 0)) < total;

  // v5.0: 优先使用关联查询的供应商名称，其次使用 supplier_name 字段
  return {
    data: (data || []).map(item => ({
      id: item.id,
      item_name: item.item_name,
      supplier_name: item.ims_supplier?.name || item.supplier_name,
      quantity: parseFloat(item.quantity) || 0,
      unit: item.unit,
      unit_price: parseFloat(item.unit_price) || 0,
      total_amount: parseFloat(item.total_amount) || 0,
      price_date: item.price_date,
      notes: item.notes,
      status: item.status || 'completed',
      receipt_image: item.receipt_image,
      goods_image: item.goods_image,
      created_at: item.created_at,
    })),
    hasMore,
    total,
  };
}

/**
 * 获取采购统计
 */
export async function getProcurementStats(storeId?: string): Promise<{ total: number; count: number }> {
  let query = supabase
    .from('ims_material_price')
    .select('total_amount');

  if (storeId) {
    query = query.eq('store_id', storeId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('获取采购统计失败:', error);
    return { total: 0, count: 0 };
  }

  const total = (data || []).reduce((sum, item) => sum + (parseFloat(item.total_amount) || 0), 0);
  return { total, count: data?.length || 0 };
}

/**
 * 删除采购记录
 * v3.4 - 添加门店验证，只能删除本门店的记录
 * v3.3 - 新增删除功能
 */
export async function deleteProcurementRecord(id: number, storeId?: string): Promise<boolean> {
  let query = supabase
    .from('ims_material_price')
    .delete()
    .eq('id', id);

  // 添加门店验证，确保只能删除本门店的记录
  if (storeId) {
    query = query.eq('store_id', storeId);
  }

  const { error } = await query;

  if (error) {
    console.error('删除采购记录失败:', error);
    throw error;
  }

  return true;
}
