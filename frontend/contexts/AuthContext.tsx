/**
 * 认证状态管理 Context
 * v3.1 - SWR 模式：启动时后台静默刷新用户信息
 *
 * 变更历史：
 * - v3.1: 实现 Stale-While-Revalidate，启动时先用缓存再后台刷新
 * - v3.0: 移除 Supabase Auth，使用 localStorage 会话管理
 * - v2.0: 迁移到 Supabase Auth，使用 onAuthStateChange 监听状态
 * - v1.1: UserCenter JWT Token 完整认证实现
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { CurrentUser, getCurrentUser, login as authLogin, logout as authLogout, refreshUser } from '../services/authService';

// Context 类型定义
interface AuthContextType {
  user: CurrentUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Provider Props
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * 认证状态 Provider
 * 实现 SWR（Stale-While-Revalidate）模式：
 * 1. 启动时立即使用 localStorage 缓存（快速显示，避免白屏）
 * 2. 后台静默请求数据库获取最新用户信息
 * 3. 如果数据有变化，静默更新状态和缓存
 * 4. 如果网络失败，继续使用缓存不影响使用
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Step 1: 立即从 localStorage 读取用户（Stale）
    const cachedUser = getCurrentUser();
    setUser(cachedUser);
    setIsLoading(false);

    // Step 2: 后台静默刷新（Revalidate）
    if (cachedUser?.id) {
      refreshUser(cachedUser.id).then((freshUser) => {
        if (freshUser) {
          // 检查是否有变化，避免不必要的 re-render
          const hasChanged = JSON.stringify(freshUser) !== JSON.stringify(cachedUser);
          if (hasChanged) {
            console.log('用户信息已更新:', {
              old: { restaurant_id: cachedUser.restaurant_id, restaurant_name: cachedUser.restaurant_name },
              new: { restaurant_id: freshUser.restaurant_id, restaurant_name: freshUser.restaurant_name }
            });
            setUser(freshUser);
          }
        } else {
          // 用户已被禁用或删除，强制登出
          console.warn('用户账号已被禁用，自动登出');
          authLogout();
          setUser(null);
        }
      });
    }
  }, []);

  const login = async (username: string, password: string) => {
    const loggedInUser = await authLogin(username, password);
    setUser(loggedInUser);
  };

  const logout = () => {
    authLogout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated: !!user,
      isLoading,
      login,
      logout,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * 使用认证 Context 的 Hook
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}

export default AuthContext;
