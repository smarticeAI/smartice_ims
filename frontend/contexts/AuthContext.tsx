/**
 * 认证上下文
 * v1.0 - 提供门店和员工身份信息
 * 修复黄睿 PR #4 遗漏的文件
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';

interface AuthContextType {
  storeId: string | null;
  employeeId: string | null;
  storeName: string | null;
  employeeName: string | null;
  isAuthenticated: boolean;
  login: (storeId: string, employeeId: string, storeName?: string, employeeName?: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  // 默认使用测试数据，生产环境应从登录接口获取
  const [storeId, setStoreId] = useState<string | null>('store_deyang_001');
  const [employeeId, setEmployeeId] = useState<string | null>('emp_001');
  const [storeName, setStoreName] = useState<string | null>('德阳店');
  const [employeeName, setEmployeeName] = useState<string | null>('店长');

  const isAuthenticated = !!(storeId && employeeId);

  const login = (
    newStoreId: string,
    newEmployeeId: string,
    newStoreName?: string,
    newEmployeeName?: string
  ) => {
    setStoreId(newStoreId);
    setEmployeeId(newEmployeeId);
    if (newStoreName) setStoreName(newStoreName);
    if (newEmployeeName) setEmployeeName(newEmployeeName);
  };

  const logout = () => {
    setStoreId(null);
    setEmployeeId(null);
    setStoreName(null);
    setEmployeeName(null);
  };

  return (
    <AuthContext.Provider
      value={{
        storeId,
        employeeId,
        storeName,
        employeeName,
        isAuthenticated,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
