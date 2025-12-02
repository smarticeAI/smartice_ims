/**
 * Supabase 数据库服务
 * 处理与 Database (public schema) 的数据交互
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { searchInList } from './pinyinSearch';

// Supabase 配置
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://wdpeoyugsxqnpwwtkqsl.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 创建 Supabase 客户端
let supabase: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!supabase) {
    if (!SUPABASE_ANON_KEY) {
      console.warn('VITE_SUPABASE_ANON_KEY 未配置');
    }
    supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      db: {
        schema: 'public', // 使用 public schema
      },
      auth: {
        persistSession: false, // 前端不持久化会话
      },
      global: {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Profile': 'public', // 指定 schema
          'Prefer': 'return=representation', // 要求返回完整数据
        },
      },
    });
  }
  return supabase;
}

// ============ 类型定义 ============

export interface Supplier {
  supplier_id: number;
  supplier_code: string;
  supplier_name: string;
  short_name?: string;
  supplier_type?: string;
  is_active: boolean;
}

export interface Product {
  product_id: number;
  product_code: string;
  product_name: string;
  product_type: 'finished' | 'semi_finished' | 'raw_material';
  category_id?: number;
  base_unit_id?: number;
  purchase_unit_id?: number;
  is_active: boolean;
}

export interface ProductSku {
  sku_id: number;
  product_id: number;
  sku_code: string;
  sku_name: string;
  package_spec?: string;
  package_quantity?: number;
  package_unit_id?: number;
  is_default: boolean;
  is_active: boolean;
}

export interface UnitOfMeasure {
  unit_id: number;
  unit_code: string;
  unit_name: string;
  unit_type: 'weight' | 'volume' | 'count' | 'length';
  unit_category: 'base' | 'package' | 'usage';
}

export interface StorePurchasePrice {
  price_id?: number;
  store_id: string;
  sku_id: number;
  supplier_id?: number;
  price_date: string;
  purchase_price: number;
  purchase_unit_id: number;
  purchase_quantity?: number;
  source_type?: string;
  status?: string;
  notes?: string;
  created_by: string;
}

// ============ 供应商 API ============

/**
 * 获取供应商列表
 */
export async function getSuppliers(): Promise<Supplier[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('ims_supplier')
    .select('supplier_id, supplier_code, supplier_name, short_name, supplier_type, is_active')
    .eq('is_active', true)
    .order('supplier_name');

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
  const client = getSupabaseClient();

  // 先精确匹配
  const { data: exactMatch } = await client
    .from('ims_supplier')
    .select('*')
    .eq('supplier_name', name)
    .eq('is_active', true)
    .single();

  if (exactMatch) {
    return exactMatch;
  }

  // 模糊匹配
  const { data: fuzzyMatch } = await client
    .from('ims_supplier')
    .select('*')
    .ilike('supplier_name', `%${name}%`)
    .eq('is_active', true)
    .limit(1);

  return fuzzyMatch?.[0] || null;
}

// ============ 产品 API ============

/**
 * 获取产品列表（按分类）
 */
export async function getProducts(productType?: string): Promise<Product[]> {
  const client = getSupabaseClient();
  let query = client
    .from('ims_product')
    .select('product_id, product_code, product_name, product_type, category_id, base_unit_id, purchase_unit_id, is_active')
    .eq('is_active', true);

  if (productType) {
    query = query.eq('product_type', productType);
  }

  const { data, error } = await query.order('product_name');

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
  const client = getSupabaseClient();

  // 使用 ILIKE 进行模糊匹配
  const { data, error } = await client
    .from('ims_product')
    .select('*')
    .or(`product_name.ilike.%${name}%,product_code.ilike.%${name}%`)
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
export async function getProductSkus(productId: number): Promise<ProductSku[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('ims_product_sku')
    .select('*')
    .eq('product_id', productId)
    .eq('is_active', true)
    .order('is_default', { ascending: false });

  if (error) {
    console.error('获取 SKU 列表失败:', error);
    throw error;
  }

  return data || [];
}

// ============ 单位 API ============

/**
 * 获取计量单位列表
 */
export async function getUnits(): Promise<UnitOfMeasure[]> {
  const client = getSupabaseClient();
  const { data, error } = await client
    .from('ims_unit_of_measure')
    .select('*')
    .order('unit_type');

  if (error) {
    console.error('获取单位列表失败:', error);
    throw error;
  }

  return data || [];
}

// 单位映射表
const UNIT_MAPPING: Record<string, string[]> = {
  'kg': ['kg', '千克', '公斤', 'KG', 'Kg'],
  'jin': ['斤', '市斤'],
  'g': ['g', '克', 'G'],
  'box': ['箱', '件'],
  'bag': ['袋', '包'],
  'bottle': ['瓶', '支'],
  'piece': ['个', '只', '枚'],
};

/**
 * 匹配单位
 */
export async function matchUnit(unitName: string): Promise<UnitOfMeasure | null> {
  // 先从映射表查找标准单位代码
  let standardCode: string | null = null;
  for (const [code, variants] of Object.entries(UNIT_MAPPING)) {
    if (variants.includes(unitName)) {
      standardCode = code;
      break;
    }
  }

  const client = getSupabaseClient();

  if (standardCode) {
    // 用标准代码查询
    const { data } = await client
      .from('ims_unit_of_measure')
      .select('*')
      .eq('unit_code', standardCode)
      .single();
    return data;
  }

  // 直接模糊匹配
  const { data } = await client
    .from('ims_unit_of_measure')
    .select('*')
    .or(`unit_code.eq.${unitName},unit_name.eq.${unitName}`)
    .single();

  return data;
}

// ============ 采购价格 API ============

/**
 * 创建采购价格记录
 */
export async function createPurchasePrice(data: StorePurchasePrice): Promise<StorePurchasePrice> {
  const client = getSupabaseClient();

  const { data: result, error } = await client
    .from('ims_store_purchase_price')
    .insert({
      store_id: data.store_id,
      sku_id: data.sku_id,
      supplier_id: data.supplier_id,
      price_date: data.price_date,
      purchase_price: data.purchase_price,
      purchase_unit_id: data.purchase_unit_id,
      purchase_quantity: data.purchase_quantity,
      source_type: data.source_type || 'manual_input',
      status: data.status || 'pending',
      notes: data.notes,
      created_by: data.created_by,
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
  const client = getSupabaseClient();

  const { data: results, error } = await client
    .from('ims_store_purchase_price')
    .insert(records.map(r => ({
      store_id: r.store_id,
      sku_id: r.sku_id,
      supplier_id: r.supplier_id,
      price_date: r.price_date,
      purchase_price: r.purchase_price,
      purchase_unit_id: r.purchase_unit_id,
      purchase_quantity: r.purchase_quantity,
      source_type: r.source_type || 'manual_input',
      status: r.status || 'pending',
      notes: r.notes,
      created_by: r.created_by,
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
 */
export async function testConnection(): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { error } = await client.from('ims_supplier').select('supplier_id').limit(1);
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

/**
 * 搜索供应商（支持汉字 + 拼音首字母）
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
    (s) => s.supplier_name + (s.short_name || ''),
    10
  );

  return matched.map(s => ({
    id: s.supplier_id,
    label: s.supplier_name,
    value: s.supplier_name,
    sublabel: s.short_name || undefined,
  }));
}

/**
 * 搜索产品（支持汉字 + 拼音首字母）
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
    (p) => p.product_name,
    10
  );

  const typeLabels: Record<string, string> = {
    'raw_material': '原材料',
    'semi_finished': '半成品',
    'finished': '成品',
  };

  return matched.map(p => ({
    id: p.product_id,
    label: p.product_name,
    value: p.product_name,
    sublabel: typeLabels[p.product_type] || p.product_type,
  }));
}

/**
 * 清除搜索缓存（数据更新后调用）
 */
export function clearSearchCache(): void {
  suppliersCache = null;
  productsCache = null;
}
