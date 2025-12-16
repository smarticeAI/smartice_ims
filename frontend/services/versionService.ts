// v1.1 - 版本检测服务，每 10 分钟轮询检查新版本
// v1.1 - 修复开发模式检测，使用 import.meta.env.DEV 替代版本号判断

// 当前应用版本（构建时注入）
const CURRENT_VERSION = import.meta.env.VITE_APP_VERSION || 'dev';

// 是否为开发模式（Vite 自动注入）
const IS_DEV_MODE = import.meta.env.DEV;

// 轮询间隔：10 分钟
const CHECK_INTERVAL = 10 * 60 * 1000;

// 版本检测回调
type VersionCallback = (hasUpdate: boolean) => void;

let checkInterval: ReturnType<typeof setInterval> | null = null;
let updateCallback: VersionCallback | null = null;

/**
 * 检查服务器版本
 * @returns 是否有新版本
 */
async function checkVersion(): Promise<boolean> {
  try {
    // 添加时间戳防止缓存
    const response = await fetch(`/version.json?t=${Date.now()}`);
    if (!response.ok) {
      console.warn('[VersionService] 获取版本信息失败:', response.status);
      return false;
    }

    const data = await response.json();
    const serverVersion = data.version;

    // 开发模式下跳过检测（使用 Vite 环境变量，更可靠）
    if (IS_DEV_MODE) {
      console.log('[VersionService] 开发模式，跳过版本检测');
      return false;
    }

    const hasUpdate = serverVersion !== CURRENT_VERSION;

    if (hasUpdate) {
      console.log(`[VersionService] 发现新版本: ${serverVersion} (当前: ${CURRENT_VERSION})`);
    } else {
      console.log('[VersionService] 版本已是最新');
    }

    return hasUpdate;
  } catch (error) {
    console.warn('[VersionService] 版本检测出错:', error);
    return false;
  }
}

/**
 * 启动版本检测轮询
 * @param onUpdate 发现新版本时的回调
 */
export function startVersionCheck(onUpdate: VersionCallback): void {
  // 保存回调
  updateCallback = onUpdate;

  // 清理已有的轮询
  if (checkInterval) {
    clearInterval(checkInterval);
  }

  console.log(`[VersionService] 启动版本检测，间隔 ${CHECK_INTERVAL / 1000 / 60} 分钟`);

  // 启动时立即检测一次
  checkVersion().then(hasUpdate => {
    if (hasUpdate && updateCallback) {
      updateCallback(true);
    }
  });

  // 设置定时轮询
  checkInterval = setInterval(async () => {
    const hasUpdate = await checkVersion();
    if (hasUpdate && updateCallback) {
      updateCallback(true);
    }
  }, CHECK_INTERVAL);
}

/**
 * 停止版本检测轮询
 */
export function stopVersionCheck(): void {
  if (checkInterval) {
    clearInterval(checkInterval);
    checkInterval = null;
  }
  updateCallback = null;
  console.log('[VersionService] 已停止版本检测');
}

/**
 * 手动触发版本检测
 * @returns 是否有新版本
 */
export async function checkForUpdate(): Promise<boolean> {
  return await checkVersion();
}

/**
 * 获取当前版本号
 */
export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
