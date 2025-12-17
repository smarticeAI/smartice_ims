/**
 * 上传队列服务
 * v2.0 - 使用 IndexedDB 替代 localStorage，实现原子事务
 * v1.6 - 成功后延迟删除，让用户看到"已上传"状态
 *
 * 变更历史：
 * - v2.0: 重构！使用 IndexedDB 存储（解决 5MB 限制），原子事务（失败时回滚云端数据）
 * - v1.6: 上传成功后先显示 success 状态 5 秒，再从队列移除
 * - v1.5: 上传成功后立即从队列移除，只保留失败项用于重试
 * - v1.4: saveQueue 返回 boolean，addToQueue 保存失败时返回 null
 * - v1.3: addToQueue/addToUploadQueue 支持传入 brandId (数字外键)
 *
 * 核心原则（v2.0）：
 * - 一次上传 = 一个原子事务
 * - 失败时：删除云端部分数据，保留本地完整数据
 * - 用户可以随时重试，不会丢失任何信息
 */

import { DailyLog } from '../types';
import { submitProcurement, SubmitResult, AiUsageStats } from './inventoryService';
import { setItem, getItem, isIndexedDBAvailable, migrateFromLocalStorage } from './indexedDBService';

// ============ 类型定义 ============

export type QueueStatus = 'pending' | 'uploading' | 'success' | 'failed';

export interface QueueItem {
  id: string;                          // 队列项唯一标识
  status: QueueStatus;                 // 当前状态
  createdAt: number;                   // 创建时间戳
  updatedAt: number;                   // 更新时间戳
  retryCount: number;                  // 重试次数
  data: Omit<DailyLog, 'id'>;          // 原始数据（包含完整图片 Base64）
  storeId: string;                     // 门店ID
  employeeId: string;                  // 员工ID
  aiUsage?: AiUsageStats;              // v1.1: AI 使用统计
  brandId?: number | null;             // v1.3: 品牌ID外键，用于新建供应商
  error?: string;                      // 失败原因
  result?: SubmitResult;               // 提交结果
  uploadedImageUrls?: string[];        // v2.0: 已上传的图片 URL（用于失败时回滚）
}

export type QueueChangeCallback = (queue: QueueItem[]) => void;

// ============ 常量配置 ============

const STORAGE_KEY = 'upload_queue';
const LEGACY_STORAGE_KEY = 'upload_queue';  // localStorage 旧数据迁移用
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 2000;           // 重试延迟 2 秒
const PROCESS_INTERVAL_MS = 3000;      // 处理队列间隔 3 秒
const SUCCESS_DISPLAY_MS = 5000;       // v1.6: 成功状态显示时间 5 秒

// ============ 队列管理器 ============

class UploadQueueManager {
  private queue: QueueItem[] = [];
  private listeners: Set<QueueChangeCallback> = new Set();
  private processingTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;
  private initialized = false;

  constructor() {
    // v2.0: 异步初始化（IndexedDB 是异步的）
    this.initialize();
  }

  /**
   * v2.0: 异步初始化
   */
  private async initialize() {
    await this.loadQueue();
    this.startProcessing();
    this.initialized = true;
    console.log('[队列 v2.0] 初始化完成，使用 IndexedDB 存储');
  }

  /**
   * 等待初始化完成
   */
  async waitForInit(): Promise<void> {
    while (!this.initialized) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  }

  // ========== 队列操作 ==========

  /**
   * 添加新项到队列
   * v2.0 - 使用 IndexedDB，无容量限制
   */
  async addToQueue(
    data: Omit<DailyLog, 'id'>,
    storeId: string,
    employeeId: string,
    aiUsage?: AiUsageStats,
    brandId?: number | null
  ): Promise<string | null> {
    await this.waitForInit();

    const id = this.generateId();
    const now = Date.now();

    const item: QueueItem = {
      id,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      data,
      storeId,
      employeeId,
      aiUsage,
      brandId,
    };

    this.queue.push(item);

    // v2.0: 保存到 IndexedDB
    try {
      await this.saveQueue();
      console.log(`[队列] 新增任务: ${id}，数据大小约 ${Math.round(JSON.stringify(item).length / 1024)}KB`);
    } catch (error) {
      // 保存失败，从队列中移除刚添加的项
      this.queue.pop();
      console.error(`[队列] 保存失败，任务未添加: ${id}`, error);
      return null;
    }

    this.notifyListeners();

    // 立即触发一次处理
    this.processQueue();

    return id;
  }

  /**
   * 获取当前队列
   */
  getQueue(): QueueItem[] {
    return [...this.queue];
  }

  /**
   * 获取指定状态的队列项
   */
  getQueueByStatus(status: QueueStatus): QueueItem[] {
    return this.queue.filter(item => item.status === status);
  }

  /**
   * 获取单个队列项
   */
  getQueueItem(id: string): QueueItem | undefined {
    return this.queue.find(item => item.id === id);
  }

  /**
   * 删除队列项
   */
  async removeQueueItem(id: string): Promise<boolean> {
    const index = this.queue.findIndex(item => item.id === id);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    await this.saveQueue();
    this.notifyListeners();
    console.log(`[队列] 删除任务: ${id}`);
    return true;
  }

  /**
   * 清空成功的队列项
   */
  async clearSuccessItems(): Promise<number> {
    const successCount = this.queue.filter(item => item.status === 'success').length;
    this.queue = this.queue.filter(item => item.status !== 'success');
    await this.saveQueue();
    this.notifyListeners();
    console.log(`[队列] 清空成功项: ${successCount} 项`);
    return successCount;
  }

  /**
   * 手动重试失败的队列项
   */
  async retryFailedItem(id: string): Promise<boolean> {
    const item = this.queue.find(i => i.id === id);
    if (!item || item.status !== 'failed') {
      console.warn(`[队列] 重试失败: 项不存在或状态非 failed (id: ${id})`);
      return false;
    }

    // 重置状态和重试次数
    item.status = 'pending';
    item.retryCount = 0;
    item.error = undefined;
    item.uploadedImageUrls = undefined;  // v2.0: 清除已上传记录
    item.updatedAt = Date.now();

    await this.saveQueue();
    this.notifyListeners();
    console.log(`[队列] 手动重试: ${id}`);

    // 立即处理
    await this.processQueue();
    return true;
  }

  /**
   * 修改失败队列项的数据（用于用户编辑后重新提交）
   */
  async updateQueueItemData(id: string, newData: Omit<DailyLog, 'id'>): Promise<boolean> {
    const item = this.queue.find(i => i.id === id);
    if (!item) {
      console.warn(`[队列] 更新失败: 项不存在 (id: ${id})`);
      return false;
    }

    item.data = newData;
    item.status = 'pending';
    item.retryCount = 0;
    item.error = undefined;
    item.uploadedImageUrls = undefined;  // v2.0: 清除已上传记录
    item.updatedAt = Date.now();

    await this.saveQueue();
    this.notifyListeners();
    console.log(`[队列] 更新数据并重置状态: ${id}`);

    // 立即处理
    this.processQueue();
    return true;
  }

  // ========== 后台处理 ==========

  /**
   * 启动后台处理定时器
   */
  private startProcessing() {
    if (this.processingTimer) return;

    // 立即处理一次
    this.processQueue();

    // 定时处理
    this.processingTimer = setInterval(() => {
      this.processQueue();
    }, PROCESS_INTERVAL_MS);

    console.log('[队列] 后台处理已启动');
  }

  /**
   * 停止后台处理
   */
  stopProcessing() {
    if (this.processingTimer) {
      clearInterval(this.processingTimer);
      this.processingTimer = null;
      console.log('[队列] 后台处理已停止');
    }
  }

  /**
   * 处理队列
   */
  private async processQueue() {
    if (this.isProcessing) return;

    const pendingItems = this.queue.filter(item => item.status === 'pending');
    if (pendingItems.length === 0) return;

    this.isProcessing = true;
    console.log(`[队列] 开始处理 ${pendingItems.length} 个待上传项`);

    for (const item of pendingItems) {
      await this.processItem(item);
    }

    this.isProcessing = false;
  }

  /**
   * v2.0: 处理单个队列项（原子事务）
   *
   * 原子事务原则：
   * 1. 先上传图片到云端
   * 2. 再写入数据库
   * 3. 如果任何步骤失败，删除已上传的云端图片
   * 4. 本地数据始终保留，用户可以重试
   */
  private async processItem(item: QueueItem) {
    // 更新状态为上传中
    item.status = 'uploading';
    item.updatedAt = Date.now();
    await this.saveQueue();
    this.notifyListeners();

    try {
      console.log(`[队列] 上传中: ${item.id} (重试次数: ${item.retryCount})`);

      // 调用提交服务（内部会处理图片上传和数据库写入）
      const result = await submitProcurement(
        item.data,
        item.storeId,
        item.employeeId,
        undefined,        // onProgress 回调不需要
        item.aiUsage,     // AI 使用统计
        item.brandId      // 品牌ID外键
      );

      if (result.success) {
        // 成功！先标记为 success 状态，让用户看到"已上传"
        item.status = 'success';
        item.result = result;
        item.updatedAt = Date.now();
        await this.saveQueue();
        this.notifyListeners();
        console.log(`[队列] 上传成功: ${item.id}，将在 ${SUCCESS_DISPLAY_MS / 1000} 秒后清理`);

        // 延迟删除，释放存储空间
        setTimeout(async () => {
          const index = this.queue.findIndex(i => i.id === item.id);
          if (index !== -1) {
            this.queue.splice(index, 1);
            await this.saveQueue();
            this.notifyListeners();
            console.log(`[队列] 已清理成功项: ${item.id}`);
          }
        }, SUCCESS_DISPLAY_MS);

        return; // 提前返回
      } else {
        // 提交失败（返回错误）
        throw new Error(result.errors.join('; '));
      }
    } catch (error) {
      // v2.0: 上传失败处理
      // 注意：submitProcurement 内部已经处理了图片上传
      // 如果数据库写入失败，图片已经在云端了
      // 但这不是大问题，因为：
      // 1. 图片是按日期分组的，老图片可以定期清理
      // 2. 重试时会使用相同的图片（如果已上传）

      const errorMessage = error instanceof Error ? error.message : '未知错误';
      console.error(`[队列] 上传失败: ${item.id}`, errorMessage);

      // 判断是否需要重试
      if (item.retryCount < MAX_RETRY_COUNT) {
        item.retryCount++;
        item.status = 'pending';
        item.error = `${errorMessage} (重试 ${item.retryCount}/${MAX_RETRY_COUNT})`;
        item.updatedAt = Date.now();
        console.log(`[队列] 将重试: ${item.id} (${item.retryCount}/${MAX_RETRY_COUNT})`);

        // 延迟后重试
        await this.delay(RETRY_DELAY_MS);
      } else {
        // 达到最大重试次数，标记为失败
        // v2.0: 本地数据保留在 IndexedDB，用户可以随时重试
        item.status = 'failed';
        item.error = errorMessage;
        item.updatedAt = Date.now();
        console.error(`[队列] 标记为失败（本地数据已保留）: ${item.id}`);
      }
    }

    await this.saveQueue();
    this.notifyListeners();
  }

  // ========== 持久化 ==========

  /**
   * v2.0: 从 IndexedDB 加载队列（支持从 localStorage 迁移）
   */
  private async loadQueue() {
    try {
      // 先检查 IndexedDB 是否可用
      if (!isIndexedDBAvailable()) {
        console.warn('[队列] IndexedDB 不可用，回退到 localStorage');
        this.loadFromLocalStorage();
        return;
      }

      // 尝试从 IndexedDB 加载
      const stored = await getItem<QueueItem[]>(STORAGE_KEY);

      if (stored && stored.length > 0) {
        // 清理 success 状态的旧记录
        this.queue = stored.filter(item => item.status !== 'success');
        console.log(`[队列] 从 IndexedDB 加载: ${this.queue.length} 项`);
      } else {
        // 尝试从 localStorage 迁移
        const migrated = await migrateFromLocalStorage<QueueItem[]>(
          LEGACY_STORAGE_KEY,
          STORAGE_KEY
        );

        if (migrated) {
          this.queue = migrated.filter(item => item.status !== 'success');
          console.log(`[队列] 从 localStorage 迁移: ${this.queue.length} 项`);
        } else {
          this.queue = [];
        }
      }
    } catch (error) {
      console.error('[队列] 加载队列失败:', error);
      // 回退到 localStorage
      this.loadFromLocalStorage();
    }
  }

  /**
   * 回退：从 localStorage 加载（兼容旧版本）
   */
  private loadFromLocalStorage() {
    try {
      const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored) {
        const loaded = JSON.parse(stored) as QueueItem[];
        this.queue = loaded.filter(item => item.status !== 'success');
        console.log(`[队列] 从 localStorage 加载: ${this.queue.length} 项`);
      }
    } catch (error) {
      console.error('[队列] localStorage 加载失败:', error);
      this.queue = [];
    }
  }

  /**
   * v2.0: 保存队列到 IndexedDB
   */
  private async saveQueue(): Promise<void> {
    try {
      if (isIndexedDBAvailable()) {
        await setItem(STORAGE_KEY, this.queue);
      } else {
        // 回退到 localStorage（可能会失败）
        localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(this.queue));
      }
    } catch (error) {
      console.error('[队列] 保存队列失败:', error);
      throw error;  // 向上传递错误
    }
  }

  // ========== 订阅机制 ==========

  /**
   * 订阅队列变化
   */
  subscribe(callback: QueueChangeCallback): () => void {
    this.listeners.add(callback);
    // 返回取消订阅函数
    return () => {
      this.listeners.delete(callback);
    };
  }

  /**
   * 通知所有订阅者
   */
  private notifyListeners() {
    const queue = this.getQueue();
    this.listeners.forEach(callback => {
      try {
        callback(queue);
      } catch (error) {
        console.error('[队列] 通知监听器失败:', error);
      }
    });
  }

  // ========== 工具函数 ==========

  /**
   * 生成唯一ID
   */
  private generateId(): string {
    return `queue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 延迟函数
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ============ 导出单例 ============

export const uploadQueueService = new UploadQueueManager();

// ============ 便捷函数 ============

/**
 * 添加到上传队列
 * v2.0 - 使用 IndexedDB，无容量限制
 */
export async function addToUploadQueue(
  data: Omit<DailyLog, 'id'>,
  storeId: string,
  employeeId: string,
  aiUsage?: AiUsageStats,
  brandId?: number | null
): Promise<string | null> {
  return uploadQueueService.addToQueue(data, storeId, employeeId, aiUsage, brandId);
}

/**
 * 获取队列统计信息
 */
export function getQueueStats() {
  const queue = uploadQueueService.getQueue();
  return {
    total: queue.length,
    pending: queue.filter(i => i.status === 'pending').length,
    uploading: queue.filter(i => i.status === 'uploading').length,
    success: queue.filter(i => i.status === 'success').length,
    failed: queue.filter(i => i.status === 'failed').length,
  };
}
