/**
 * UserCenter 认证服务
 * 处理登录、Token 管理、用户信息获取
 */

// UserCenter API 基础 URL
const USER_CENTER_URL = import.meta.env.VITE_USER_CENTER_URL || 'http://localhost:8001';

// Token 存储键名
const ACCESS_TOKEN_KEY = 'access_token';
const REFRESH_TOKEN_KEY = 'refresh_token';

// 用户信息类型
export interface CurrentUser {
  account_id: string;
  username: string;
  phone: string | null;
  status: string;
  employee_id: string | null;
  employee_no: string | null;
  name: string | null;
  employment_status: string | null;
  position_code: string | null;
  store_id: string | null;
  store_name: string | null;
  brand_id: string | null;
  brand_name: string | null;
}

// 登录请求类型
export interface LoginRequest {
  username?: string;
  phone?: string;
  password: string;
}

// 注册请求类型
export interface RegisterRequest {
  username: string;  // 真实姓名
  phone: string;
  password: string;
  invitation_code: string;
}

// 注册响应类型
export interface RegisterResponse {
  success: boolean;
  message: string;
  account_id?: string;
}

// Token 响应类型
export interface TokenResponse {
  access_token: string;
  refresh_token: string;
}

// API 错误类型
export interface ApiError {
  detail: string;
}

/**
 * 保存 Token 到 localStorage
 */
export function saveTokens(tokens: TokenResponse): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, tokens.access_token);
  localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refresh_token);
}

/**
 * 获取 Access Token
 */
export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/**
 * 获取 Refresh Token
 */
export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/**
 * 清除 Token
 */
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/**
 * 检查是否已登录
 */
export function isAuthenticated(): boolean {
  return !!getAccessToken();
}

/**
 * 用户登录
 */
export async function login(credentials: LoginRequest): Promise<TokenResponse> {
  const response = await fetch(`${USER_CENTER_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(credentials),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.detail || '登录失败');
  }

  const tokens: TokenResponse = await response.json();
  saveTokens(tokens);
  return tokens;
}

/**
 * 刷新 Token
 */
export async function refreshAccessToken(): Promise<TokenResponse | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return null;
  }

  try {
    const response = await fetch(`${USER_CENTER_URL}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      clearTokens();
      return null;
    }

    const tokens: TokenResponse = await response.json();
    saveTokens(tokens);
    return tokens;
  } catch {
    clearTokens();
    return null;
  }
}

/**
 * 获取当前用户信息
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    return null;
  }

  try {
    const response = await fetch(`${USER_CENTER_URL}/api/v1/auth/me`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    if (!response.ok) {
      // Token 过期，尝试刷新
      if (response.status === 401) {
        const newTokens = await refreshAccessToken();
        if (newTokens) {
          // 重试获取用户信息
          return getCurrentUser();
        }
      }
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

/**
 * 用户注册
 */
export async function register(data: RegisterRequest): Promise<RegisterResponse> {
  const response = await fetch(`${USER_CENTER_URL}/api/v1/auth/register`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error: ApiError = await response.json();
    throw new Error(error.detail || '注册失败');
  }

  return await response.json();
}

/**
 * 用户登出
 */
export async function logout(): Promise<void> {
  const accessToken = getAccessToken();

  if (accessToken) {
    try {
      await fetch(`${USER_CENTER_URL}/api/v1/auth/logout`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      });
    } catch {
      // 忽略登出错误
    }
  }

  clearTokens();
}

/**
 * 带认证的 fetch 请求封装
 */
export async function authFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const accessToken = getAccessToken();

  const headers = new Headers(options.headers);
  if (accessToken) {
    headers.set('Authorization', `Bearer ${accessToken}`);
  }

  let response = await fetch(url, {
    ...options,
    headers,
  });

  // Token 过期，尝试刷新后重试
  if (response.status === 401) {
    const newTokens = await refreshAccessToken();
    if (newTokens) {
      headers.set('Authorization', `Bearer ${newTokens.access_token}`);
      response = await fetch(url, {
        ...options,
        headers,
      });
    }
  }

  return response;
}
