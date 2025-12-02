/**
 * 登录页面
 * Storm Glass 风格设计
 */

import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface LoginPageProps {
  onSwitchToRegister?: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onSwitchToRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { login, error } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsSubmitting(true);
    try {
      await login({ username, password });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4">
      <div className="glass-card-elevated p-8 w-full max-w-md">
        {/* Logo / 标题 */}
        <div className="text-center mb-8">
          <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-gradient-to-br from-ios-blue/40 to-ios-blue/20 flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">门店入库系统</h1>
          <p className="text-white/60 mt-2">请登录您的账号</p>
        </div>

        {/* 登录表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 用户名 */}
          <div>
            <label className="block text-white/70 text-sm mb-2">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="请输入用户名"
              className="glass-input w-full px-4 py-3 text-white placeholder-white/40"
              disabled={isSubmitting}
            />
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-white/70 text-sm mb-2">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
              className="glass-input w-full px-4 py-3 text-white placeholder-white/40"
              disabled={isSubmitting}
            />
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="text-ios-red text-sm text-center py-2">
              {error}
            </div>
          )}

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={isSubmitting || !username || !password}
            className="btn-primary w-full py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? '登录中...' : '登录'}
          </button>
        </form>

        {/* 注册链接 */}
        {onSwitchToRegister && (
          <div className="text-center mt-6">
            <button
              onClick={onSwitchToRegister}
              className="text-ios-blue hover:text-ios-blue/80 text-sm transition-colors"
            >
              没有账号？立即注册
            </button>
          </div>
        )}

        {/* 底部提示 */}
        <p className="text-center text-white/40 text-sm mt-4">
          有点东西餐饮管理有限公司
        </p>
      </div>
    </div>
  );
};

export default LoginPage;
