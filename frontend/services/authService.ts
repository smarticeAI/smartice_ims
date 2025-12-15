/**
 * 简化认证服务 - 直接查询 master_employee 表
 * v5.0 - 迁移到 master tables: ims_users → master_employee, ims_stores → master_restaurant
 *
 * 变更历史：
 * - v5.0: 迁移到 master tables，使用 master_employee 替代 ims_users
 * - v4.4: brand_code → brand_id，直接使用外键ID，无需字符串映射
 * - v4.3: 添加 brand_code 字段，用于区分野百灵(YBL)/宁桂杏(NGX)品牌
 * - v4.2: 添加 refreshUser 函数，支持 Stale-While-Revalidate 模式
 * - v4.1: 添加 nickname 字段，用于更亲切的显示名称
 * - v4.0: 登录失败5次锁定账号，支持修改密码
 * - v3.0: 移除 Supabase Auth，直接查询 ims_users 表，明文密码认证
 * - v2.0: 使用 Supabase Auth 替代 UserCenter
 * - v1.0: 使用 UserCenter JWT Token
 */

import { supabase } from './supabaseClient';

// 最大登录失败次数
const MAX_LOGIN_ATTEMPTS = 5;

// 当前用户信息类型
export interface CurrentUser {
  id: string;
  username: string;
  name: string;
  nickname: string | null;  // 昵称，用于更亲切的显示
  phone: string | null;
  role: string;
  restaurant_id: string | null;  // v5.0: store_id → restaurant_id
  restaurant_name: string | null;  // v5.0: store_name → restaurant_name
  brand_id: number | null;  // v4.4: 品牌ID外键 (1=野百灵, 2=宁桂杏, 3=通用)
}

/**
 * 登录 - 直接查询 master_employee 表验证用户名和密码
 * 支持账号锁定检查和失败计数
 */
export async function login(username: string, password: string): Promise<CurrentUser> {
  // 1. 先查询用户是否存在及锁定状态
  const { data: userData, error: userError } = await supabase
    .from('master_employee')
    .select('id, is_locked, login_failed_count')
    .eq('username', username)
    .eq('is_active', true)
    .single();

  if (userError || !userData) {
    throw new Error('用户名或密码错误');
  }

  // 2. 检查账号是否被锁定
  if (userData.is_locked) {
    throw new Error('账号已被锁定，请联系管理员解锁');
  }

  // 3. 验证密码 (password_hash)
  const { data, error } = await supabase
    .from('master_employee')
    .select(`
      id,
      username,
      employee_name,
      phone,
      role_code,
      restaurant_id,
      master_restaurant(restaurant_name, brand_id)
    `)
    .eq('username', username)
    .eq('password_hash', password)
    .eq('is_active', true)
    .single();

  if (error || !data) {
    // 密码错误，增加失败次数
    const newFailedCount = (userData.login_failed_count || 0) + 1;
    const shouldLock = newFailedCount >= MAX_LOGIN_ATTEMPTS;

    await supabase
      .from('master_employee')
      .update({
        login_failed_count: newFailedCount,
        is_locked: shouldLock,
        locked_at: shouldLock ? new Date().toISOString() : null
      })
      .eq('id', userData.id);

    if (shouldLock) {
      throw new Error('密码错误次数过多，账号已被锁定');
    }

    const remainingAttempts = MAX_LOGIN_ATTEMPTS - newFailedCount;
    throw new Error(`密码错误，还剩 ${remainingAttempts} 次尝试机会`);
  }

  // 4. 登录成功，重置失败次数
  await supabase
    .from('master_employee')
    .update({
      login_failed_count: 0
    })
    .eq('id', data.id);

  const user: CurrentUser = {
    id: data.id,
    username: data.username,
    name: data.employee_name,
    nickname: null,  // master_employee doesn't have nickname field
    phone: data.phone,
    role: data.role_code,
    restaurant_id: data.restaurant_id,
    restaurant_name: (data.master_restaurant as any)?.restaurant_name || null,
    brand_id: (data.master_restaurant as any)?.brand_id || null,
  };

  // 保存到 localStorage
  localStorage.setItem('user', JSON.stringify(user));

  return user;
}

/**
 * 修改密码 - 验证原密码后更新新密码
 */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  // 1. 验证原密码
  const { data: userData, error: verifyError } = await supabase
    .from('master_employee')
    .select('id')
    .eq('id', userId)
    .eq('password_hash', currentPassword)
    .single();

  if (verifyError || !userData) {
    throw new Error('原密码错误');
  }

  // 2. 更新新密码
  const { error: updateError } = await supabase
    .from('master_employee')
    .update({ password_hash: newPassword })
    .eq('id', userId);

  if (updateError) {
    console.error('更新密码失败:', updateError);
    throw new Error('修改密码失败，请稍后重试');
  }
}

/**
 * 获取当前用户 - 从 localStorage 读取
 */
export function getCurrentUser(): CurrentUser | null {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch {
    return null;
  }
}

/**
 * 登出 - 清除 localStorage
 */
export function logout(): void {
  localStorage.removeItem('user');
}

/**
 * 检查是否已登录
 */
export function isLoggedIn(): boolean {
  return getCurrentUser() !== null;
}

/**
 * 检查是否已认证（异步版本，兼容旧代码）
 */
export async function isAuthenticated(): Promise<boolean> {
  return isLoggedIn();
}

/**
 * 刷新用户信息 - SWR 模式核心函数
 * 从数据库获取最新用户信息，如果有变化则更新 localStorage
 *
 * @param userId 用户 ID
 * @returns 最新的用户信息，如果用户不存在或已禁用则返回 null
 */
export async function refreshUser(userId: string): Promise<CurrentUser | null> {
  try {
    const { data, error } = await supabase
      .from('master_employee')
      .select(`
        id,
        username,
        employee_name,
        phone,
        role_code,
        restaurant_id,
        master_restaurant(restaurant_name, brand_id)
      `)
      .eq('id', userId)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      // 用户不存在或已禁用，清除本地缓存
      console.warn('用户信息刷新失败，可能已被禁用:', error?.message);
      return null;
    }

    const freshUser: CurrentUser = {
      id: data.id,
      username: data.username,
      name: data.employee_name,
      nickname: null,
      phone: data.phone,
      role: data.role_code,
      restaurant_id: data.restaurant_id,
      restaurant_name: (data.master_restaurant as any)?.restaurant_name || null,
      brand_id: (data.master_restaurant as any)?.brand_id || null,
    };

    // 更新 localStorage
    localStorage.setItem('user', JSON.stringify(freshUser));

    return freshUser;
  } catch (err) {
    // 网络错误等，静默失败，继续使用缓存
    console.warn('刷新用户信息时网络错误，继续使用缓存:', err);
    return null;
  }
}
