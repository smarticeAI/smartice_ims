/**
 * 上传队列服务
 * v2.2 - 添加失败项数量限制，防止短期内大量失败导致存储耗尽
 * v2.1 - 修复内存问题：过期清理 + 成功立即删除 + 存储空间管理
 * v2.0 - 使用 IndexedDB 替代 localStorage，实现原子事务
 *
 * 变更历史：
 * - v2.2: 添加失败项数量限制（最多保留10个），紧急清理机制
 *         即使未过期，超出数量也会删除最旧的失败项
 * - v2.1: 修复内存不足问题：
 *         1. 失败队列超过3天自动清理
 *         2. 成功后立即删除（不再延迟5秒）
 *         3. 添加 cleanupExpiredItems 清理过期数据
 *         4. 添加存储空间检查
 * - v2.0: 重构！使用 IndexedDB 存储（解决 5MB 限制），原子事务（失败时回滚云端数据）
 * - v1.6: 上传成功后先显示 success 状态 5 秒，再从队列移除
 * - v1.5: 上传成功后立即从队列移除，只保留失败项用于重试
 * - v1.4: saveQueue 返回 boolean，addToQueue 保存失败时返回 null
 * - v1.3: addToQueue/addToUploadQueue 支持传入 brandId (数字外键)
 *
 * 核心原则（v2.1）：
 * - 一次上传 = 一个原子事务
 * - 失败项保留3天后自动清理，防止存储空间耗尽
 * - 成功后立即删除，避免存储占用
 */

import { DailyLog } from '../types';
import { submitProcurement, SubmitResult, AiUsageStats } from './inventoryService';
import { setItem, getItem, isIndexedDBAvailable, migrateFromLocalStorage, getStorageEstimate, checkStorageAvailable } from './indexedDBService';

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
const FAILED_EXPIRE_DAYS = 3;          // v2.1: 失败项保留天数（超过后自动清理）
const FAILED_EXPIRE_MS = FAILED_EXPIRE_DAYS * 24 * 60 * 60 * 1000;
const MAX_FAILED_ITEMS = 10;           // v2.2: 失败项最大保留数量（超出则删除最旧的）

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
   * v2.1: 异步初始化（添加过期清理）
   */
  private async initialize() {
    await this.loadQueue();

    // v2.1: 启动时清理过期的失败项
    await this.cleanupExpiredItems();

    this.startProcessing();
    this.initialized = true;

    // 输出存储空间信息
    const estimate = await getStorageEstimate();
    if (estimate) {
      const usedMB = (estimate.usage / 1024 / 1024).toFixed(1);
      const quotaMB = (estimate.quota / 1024 / 1024).toFixed(0);
      console.log(`[队列 v2.1] 存储空间: ${usedMB}MB / ${quotaMB}MB`);
    }
    console.log(`[队列 v2.1] 初始化完成，当前队列项数: ${this.queue.length}`);
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
   * v2.1 - 添加存储空间预检，空间不足时先清理过期项
   */
  async addToQueue(
    data: Omit<DailyLog, 'id'>,
    storeId: string,
    employeeId: string,
    aiUsage?: AiUsageStats,
    brandId?: number | null
  ): Promise<string | null> {
    await this.waitForInit();

    // v2.1: 检查存储空间，不足时先清理过期项
    const hasSpace = await checkStorageAvailable(10);  // 需要至少 10MB
    if (!hasSpace) {
      console.log('[队列] 存储空间不足，尝试清理过期项...');
      await this.cleanupExpiredItems();
      // 再次检查
      const hasSpaceAfterCleanup = await checkStorageAvailable(10);
      if (!hasSpaceAfterCleanup) {
        console.error('[队列] 清理后空间仍不足，无法添加新任务');
        return null;
      }
    }

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
   * v2.2: 清理失败项（时间+数量双重限制）
   * 1. 超过3天的失败项直接删除
   * 2. 未过期的失败项，只保留最新的 MAX_FAILED_ITEMS 个
   * 防止存储空间被长期占用或短期内大量堆积
   */
  async cleanupExpiredItems(): Promise<number> {
    const now = Date.now();
    let totalCleaned = 0;

    // 1. 清理过期的失败项（超过3天）
    const expiredItems = this.queue.filter(item =>
      item.status === 'failed' && (now - item.updatedAt) > FAILED_EXPIRE_MS
    );

    if (expiredItems.length > 0) {
      const expiredIds = new Set(expiredItems.map(item => item.id));
      this.queue = this.queue.filter(item => !expiredIds.has(item.id));
      totalCleaned += expiredItems.length;
      console.log(`[队列] 清理过期失败项: ${expiredItems.length} 项（超过 ${FAILED_EXPIRE_DAYS} 天）`);
    }

    // 2. v2.2: 检查未过期的失败项数量，超出限制则删除最旧的
    const remainingFailedItems = this.queue
      .filter(item => item.status === 'failed')
      .sort((a, b) => b.updatedAt - a.updatedAt);  // 按时间倒序，最新的在前

    if (remainingFailedItems.length > MAX_FAILED_ITEMS) {
      // 删除超出限制的旧失败项
      const itemsToRemove = remainingFailedItems.slice(MAX_FAILED_ITEMS);
      const removeIds = new Set(itemsToRemove.map(item => item.id));
      this.queue = this.queue.filter(item => !removeIds.has(item.id));
      totalCleaned += itemsToRemove.length;
      console.log(`[队列] 清理超限失败项: ${itemsToRemove.length} 项（超过 ${MAX_FAILED_ITEMS} 个限制）`);
    }

    if (totalCleaned > 0) {
      await this.saveQueue();
      this.notifyListeners();
    }

    return totalCleaned;
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
   * v2.1: 处理单个队列项（原子事务）
   * 修改：成功后立即删除，不再延迟
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
        // v2.1: 成功后立即删除，释放存储空间（不再延迟5秒）
        const index = this.queue.findIndex(i => i.id === item.id);
        if (index !== -1) {
          this.queue.splice(index, 1);
          await this.saveQueue();
          this.notifyListeners();
          console.log(`[队列] 上传成功并已清理: ${item.id}`);
        }
        return; // 提前返回
      } else {
        // 提交失败（返回错误）
        throw new Error(result.errors.join('; '));
      }
    } catch (error) {
      // v2.1: 上传失败处理
      // 失败项会保留，但超过3天后自动清理

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
        // v2.2: 失败项会保留在 IndexedDB，但受双重限制（3天过期 + 最多10个）
        item.status = 'failed';
        item.error = errorMessage;
        item.updatedAt = Date.now();
        console.error(`[队列] 标记为失败: ${item.id}`);

        // v2.2: 失败后立即检查是否需要清理（防止短期内大量堆积）
        await this.cleanupExpiredItems();
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
