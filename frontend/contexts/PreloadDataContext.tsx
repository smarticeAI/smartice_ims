/**
 * PreloadDataContext - 数据预加载上下文
 * v2.0 - 登录触发加载：用户登录后才开始加载品牌相关数据
 * v1.6 - 使用 brand_id 外键过滤，移除 code→id 映射依赖
 *
 * 变更历史：
 * - v2.0: 监听 AuthContext，用户登录后才加载数据，登出时清空
 * - v1.6: 直接使用 user.brand_id 过滤，无需 code→id 映射
 * - v1.5: 品牌从数据库动态加载
 * - v1.4: 新增分类预加载，支持品牌过滤
 *
 * 流程：
 * 1. 用户登录 → AuthContext 设置 user
 * 2. PreloadDataContext 监听到 user 变化
 * 3. 根据 user.brand_id 加载该品牌的分类、物料、供应商
 * 4. 用户登出 → 清空所有预加载数据
 *
 * 使用方式：
 * - 在 App.tsx 中 AuthProvider 内部使用 PreloadDataProvider
 * - 必须放在 AuthProvider 内部才能使用 useAuth
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  getBrands,
  getSuppliers,
  getProducts,
  getAllUnits,
  getCategories,
  injectBrandsCache,
  injectSuppliersCache,
  injectProductsCache,
  injectUnitsCache,
  injectCategoriesCache,
} from '../services/supabaseService';
import { useAuth } from './AuthContext';
import type { Supplier, Product, Category } from '../services/supabaseService';

interface UnitOption {
  id: number;
  code: string;
  name: string;
}

interface PreloadDataContextValue {
  // 数据
  suppliers: Supplier[];
  products: Product[];
  units: UnitOption[];
  categories: Category[];  // v1.4: 新增分类

  // 加载状态（仅供调试，不阻塞UI）
  isLoading: boolean;
  isLoaded: boolean;

  // 错误信息
  error: string | null;

  // 刷新函数
  refresh: () => Promise<void>;
}

const PreloadDataContext = createContext<PreloadDataContextValue | undefined>(undefined);

export const PreloadDataProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // v2.0: 从 AuthContext 获取用户信息
  const { user, isAuthenticated } = useAuth();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 记录上次加载的 brandId，防止重复加载相同品牌的数据
  const lastLoadedBrandId = useRef<number | null | undefined>(undefined);

  // 清空所有预加载数据（用户登出时调用）
  const clearData = useCallback(() => {
    setSuppliers([]);
    setProducts([]);
    setUnits([]);
    setCategories([]);
    setIsLoaded(false);
    lastLoadedBrandId.current = undefined;

    // 清空 supabaseService 缓存
    injectSuppliersCache([]);
    injectProductsCache([]);
    injectUnitsCache([]);
    injectCategoriesCache([]);

    console.log('[PreloadData] 数据已清空（用户登出）');
  }, []);

  // 加载品牌相关数据（登录后执行）
  const loadData = useCallback(async (brandId?: number | null) => {
    // 避免重复加载相同品牌的数据
    if (lastLoadedBrandId.current === brandId && isLoaded) {
      console.log('[PreloadData] 跳过加载：品牌数据已存在', brandId);
      return;
    }

    console.log('[PreloadData] 开始加载品牌数据...', brandId ? `(brand_id: ${brandId})` : '(无品牌过滤)');
    setIsLoading(true);
    setError(null);

    try {
      // 先加载品牌数据
      const brandsData = await getBrands().catch(err => {
        console.error('[PreloadData] 加载品牌失败:', err);
        return [];
      });
      injectBrandsCache(brandsData);

      // 并行加载该品牌的所有数据
      const [suppliersData, productsData, unitsData, categoriesData] = await Promise.all([
        getSuppliers(brandId ?? undefined).catch(err => {
          console.error('[PreloadData] 加载供应商失败:', err);
          return [];
        }),
        getProducts(undefined, brandId ?? undefined).catch(err => {
          console.error('[PreloadData] 加载产品失败:', err);
          return [];
        }),
        getAllUnits().catch(err => {
          console.error('[PreloadData] 加载单位失败:', err);
          return [];
        }),
        getCategories(brandId ?? undefined).catch(err => {
          console.error('[PreloadData] 加载分类失败:', err);
          return [];
        }),
      ]);

      setSuppliers(suppliersData);
      setProducts(productsData);
      setUnits(unitsData);
      setCategories(categoriesData);
      setIsLoaded(true);
      lastLoadedBrandId.current = brandId;

      // 注入到 supabaseService 缓存中
      injectSuppliersCache(suppliersData);
      injectProductsCache(productsData);
      injectUnitsCache(unitsData);
      injectCategoriesCache(categoriesData);

      console.log('[PreloadData] 预加载完成:', {
        brands: brandsData.length,
        suppliers: suppliersData.length,
        products: productsData.length,
        units: unitsData.length,
        categories: categoriesData.length,
        brandId: brandId ?? '全部',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载数据失败';
      console.error('[PreloadData] 预加载失败:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, [isLoaded]);

  // 刷新数据（强制重新加载当前品牌）
  const refresh = useCallback(async () => {
    setIsLoaded(false);
    lastLoadedBrandId.current = undefined;
    if (isAuthenticated && user) {
      await loadData(user.brand_id);
    }
  }, [isAuthenticated, user, loadData]);

  // v2.0: 监听用户登录状态变化
  // - 用户登录后 → 加载该品牌的数据
  // - 用户登出后 → 清空所有数据
  useEffect(() => {
    if (isAuthenticated && user) {
      // 用户已登录，加载该品牌的数据
      console.log('[PreloadData] 用户已登录，准备加载数据:', {
        userId: user.id,
        userName: user.name,
        restaurantId: user.restaurant_id,
        brandId: user.brand_id,
      });
      loadData(user.brand_id);
    } else {
      // 用户已登出，清空数据
      if (lastLoadedBrandId.current !== undefined) {
        clearData();
      }
    }
  }, [isAuthenticated, user?.id, user?.brand_id]); // 只在认证状态或品牌变化时触发

  const value: PreloadDataContextValue = {
    suppliers,
    products,
    units,
    categories,
    isLoading,
    isLoaded,
    error,
    refresh,
  };

  return (
    <PreloadDataContext.Provider value={value}>
      {children}
    </PreloadDataContext.Provider>
  );
};

/**
 * 使用预加载数据的 Hook
 */
export const usePreloadData = (): PreloadDataContextValue => {
  const context = useContext(PreloadDataContext);
  if (!context) {
    throw new Error('usePreloadData 必须在 PreloadDataProvider 内部使用');
  }
  return context;
};
