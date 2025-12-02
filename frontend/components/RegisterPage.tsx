/**
 * 注册页面
 * Storm Glass 风格设计
 */

import React, { useState } from 'react';
import { register, RegisterRequest } from '../services/authService';

interface RegisterPageProps {
  onSwitchToLogin: () => void;
}

export const RegisterPage: React.FC<RegisterPageProps> = ({ onSwitchToLogin }) => {
  const [formData, setFormData] = useState<RegisterRequest>({
    username: '',
    phone: '',
    password: '',
    invitation_code: '',
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError(null);
  };

  const validateForm = (): boolean => {
    if (!formData.username || formData.username.length < 2) {
      setError('请输入真实姓名（至少2个字符）');
      return false;
    }

    const phoneRegex = /^1[3-9]\d{9}$/;
    if (!phoneRegex.test(formData.phone)) {
      setError('请输入有效的手机号码');
      return false;
    }

    if (!formData.password || formData.password.length < 6) {
      setError('密码至少需要6个字符');
      return false;
    }

    if (formData.password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return false;
    }

    if (!formData.invitation_code || formData.invitation_code.length < 3) {
      setError('请输入有效的邀请码');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!validateForm()) return;

    setIsSubmitting(true);
    try {
      const response = await register(formData);
      if (response.success) {
        setSuccess(response.message);
        // 3秒后跳转到登录页
        setTimeout(() => {
          onSwitchToLogin();
        }, 3000);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '注册失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-4 overflow-y-auto">
      <div className="glass-card-elevated p-8 w-full max-w-md my-8">
        {/* Logo / 标题 */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gradient-to-br from-ios-blue/40 to-ios-blue/20 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">员工注册</h1>
          <p className="text-white/60 mt-1 text-sm">请填写以下信息完成注册</p>
        </div>

        {/* 注册表单 */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* 真实姓名 */}
          <div>
            <label className="block text-white/70 text-sm mb-2">真实姓名</label>
            <input
              type="text"
              name="username"
              value={formData.username}
              onChange={handleChange}
              placeholder="请输入真实姓名"
              className="glass-input w-full px-4 py-3 text-white placeholder-white/40"
              disabled={isSubmitting}
            />
          </div>

          {/* 手机号 */}
          <div>
            <label className="block text-white/70 text-sm mb-2">手机号码</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="请输入手机号"
              className="glass-input w-full px-4 py-3 text-white placeholder-white/40"
              disabled={isSubmitting}
            />
          </div>

          {/* 密码 */}
          <div>
            <label className="block text-white/70 text-sm mb-2">设置密码</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              placeholder="请设置密码（至少6位）"
              className="glass-input w-full px-4 py-3 text-white placeholder-white/40"
              disabled={isSubmitting}
            />
          </div>

          {/* 确认密码 */}
          <div>
            <label className="block text-white/70 text-sm mb-2">确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => {
                setConfirmPassword(e.target.value);
                setError(null);
              }}
              placeholder="请再次输入密码"
              className="glass-input w-full px-4 py-3 text-white placeholder-white/40"
              disabled={isSubmitting}
            />
          </div>

          {/* 邀请码 */}
          <div>
            <label className="block text-white/70 text-sm mb-2">邀请码</label>
            <input
              type="text"
              name="invitation_code"
              value={formData.invitation_code}
              onChange={handleChange}
              placeholder="请输入门店邀请码"
              className="glass-input w-full px-4 py-3 text-white placeholder-white/40"
              disabled={isSubmitting}
            />
            <p className="text-white/40 text-xs mt-1">请向门店管理员获取邀请码</p>
          </div>

          {/* 错误提示 */}
          {error && (
            <div className="text-ios-red text-sm text-center py-2">
              {error}
            </div>
          )}

          {/* 成功提示 */}
          {success && (
            <div className="glass-card-light p-4 rounded-lg">
              <div className="text-ios-green text-sm text-center">
                {success}
              </div>
              <p className="text-white/60 text-xs text-center mt-2">
                即将跳转到登录页面...
              </p>
            </div>
          )}

          {/* 注册按钮 */}
          {!success && (
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn-primary w-full py-3 text-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? '提交中...' : '提交注册'}
            </button>
          )}
        </form>

        {/* 底部链接 */}
        <div className="text-center mt-6">
          <button
            onClick={onSwitchToLogin}
            className="text-ios-blue hover:text-ios-blue/80 text-sm transition-colors"
          >
            已有账号？返回登录
          </button>
        </div>

        {/* 底部提示 */}
        <p className="text-center text-white/40 text-xs mt-4">
          注册后需等待管理员审核通过后方可登录
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
