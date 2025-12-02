/**
 * 认证状态管理 Context
 * 提供全局用户认证状态和相关方法
 */

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import {
  CurrentUser,
  LoginRequest,
  login as apiLogin,
  logout as apiLogout,
  getCurrentUser,
  isAuthenticated as checkAuth,
} from '../services/authService';

// 开发模式：绕过登录（仅用于测试）
const DEV_MODE = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
const DEV_USER: CurrentUser = {
  account_id: 'dev-account-001',
  username: 'dev_user',
  phone: '13800138000',
  status: 'active',
  employee_id: 'dev-employee-001',
  employee_no: 'E001',
  name: '开发测试员',
  employment_status: 'active',
  position_code: 'manager',
  store_id: 'dev-store-001',
  store_name: '开发测试门店',
  brand_id: 'dev-brand-001',
  brand_name: '野百灵',
};

// Context 类型定义
interface AuthContextType {
  user: CurrentUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
  login: (credentials: LoginRequest) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  // 便捷属性
  storeId: string | null;
  employeeId: string | null;
  storeName: string | null;
  brandName: string | null;
}

// 创建 Context
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider Props
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * 认证状态 Provider
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 刷新用户信息
  const refreshUser = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const currentUser = await getCurrentUser();
      setUser(currentUser);
    } catch (err) {
      console.error('获取用户信息失败:', err);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 初始化：检查是否已登录
  useEffect(() => {
    // 开发模式：直接使用模拟用户
    if (DEV_MODE) {
      console.log('🔧 开发模式：使用模拟用户');
      setUser(DEV_USER);
      setIsLoading(false);
      return;
    }

    if (checkAuth()) {
      refreshUser();
    } else {
      setIsLoading(false);
    }
  }, [refreshUser]);

  // 登录
  const login = useCallback(async (credentials: LoginRequest): Promise<boolean> => {
    try {
      setIsLoading(true);
      setError(null);
      await apiLogin(credentials);
      await refreshUser();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '登录失败';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshUser]);

  // 登出
  const logout = useCallback(async () => {
    try {
      setIsLoading(true);
      await apiLogout();
      setUser(null);
      setError(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // 计算派生值
  const isAuthenticated = !!user;
  const storeId = user?.store_id || null;
  const employeeId = user?.employee_id || null;
  const storeName = user?.store_name || null;
  const brandName = user?.brand_name || null;

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated,
    error,
    login,
    logout,
    refreshUser,
    storeId,
    employeeId,
    storeName,
    brandName,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 使用认证 Context 的 Hook
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * 需要认证的组件包装器
 */
interface RequireAuthProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function RequireAuth({ children, fallback }: RequireAuthProps) {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white/70">加载中...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return fallback ? <>{fallback}</> : null;
  }

  return <>{children}</>;
}
