/**
 * PreloadDataContext - 数据预加载上下文
 * v1.3 - 供应商也支持品牌过滤
 *
 * 功能：
 * - 应用启动时后台静默预加载所有下拉框数据
 * - 不阻塞页面渲染，用户可立即使用
 * - 使用 ref 防止重复加载
 * - 与 supabaseService.ts 共享缓存机制
 * - v1.3: 供应商也根据用户 brand_code 过滤
 * - v1.2: 根据用户 brand_code 加载对应品牌的物料
 *
 * 使用方式：
 * 1. 在 App.tsx 中使用 PreloadDataProvider 包裹应用
 * 2. 预加载在后台静默进行，不阻塞 UI
 * 3. AutocompleteInput 会自动使用预加载的缓存数据
 */

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import {
  getSuppliers,
  getProducts,
  getAllUnits,
  injectSuppliersCache,
  injectProductsCache,
  injectUnitsCache,
} from '../services/supabaseService';
import { getCurrentUser } from '../services/authService';
import type { Supplier, Product } from '../services/supabaseService';

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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [units, setUnits] = useState<UnitOption[]>([]);

  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 使用 ref 防止重复加载（解决无限循环问题）
  const hasStartedLoading = useRef(false);

  // 加载所有数据（后台静默执行）
  const loadData = useCallback(async (force = false) => {
    // 避免重复加载（除非强制刷新）
    if (!force && hasStartedLoading.current) return;
    hasStartedLoading.current = true;

    // v1.2: 获取当前用户的品牌代码用于过滤物料
    const currentUser = getCurrentUser();
    const brandCode = currentUser?.brand_code || undefined;

    console.log('[PreloadData] 后台静默预加载下拉框数据...', brandCode ? `(品牌: ${brandCode})` : '(无品牌过滤)');
    setIsLoading(true);
    setError(null);

    try {
      // 并行加载所有数据
      // v1.3: 产品和供应商都传入品牌代码进行过滤
      const [suppliersData, productsData, unitsData] = await Promise.all([
        getSuppliers(brandCode).catch(err => {
          console.error('[PreloadData] 加载供应商失败:', err);
          return [];
        }),
        getProducts(undefined, brandCode).catch(err => {
          console.error('[PreloadData] 加载产品失败:', err);
          return [];
        }),
        getAllUnits().catch(err => {
          console.error('[PreloadData] 加载单位失败:', err);
          return [];
        }),
      ]);

      setSuppliers(suppliersData);
      setProducts(productsData);
      setUnits(unitsData);
      setIsLoaded(true);

      // 注入到 supabaseService 缓存中，供 AutocompleteInput 使用
      injectSuppliersCache(suppliersData);
      injectProductsCache(productsData);
      injectUnitsCache(unitsData);

      console.log('[PreloadData] 预加载完成:', {
        suppliers: suppliersData.length,
        products: productsData.length,
        units: unitsData.length,
        brandCode: brandCode || '全部',
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '加载数据失败';
      console.error('[PreloadData] 预加载失败:', err);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  }, []); // 无依赖，函数稳定不变

  // 刷新数据（强制重新加载）
  const refresh = useCallback(async () => {
    setIsLoaded(false);
    hasStartedLoading.current = false;
    await loadData(true);
  }, [loadData]);

  // 组件挂载时后台加载（只执行一次）
  useEffect(() => {
    loadData();
  }, []); // 空依赖，只在挂载时执行一次

  const value: PreloadDataContextValue = {
    suppliers,
    products,
    units,
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
