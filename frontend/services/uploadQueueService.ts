/**
 * 上传队列服务
 * v1.2 - 添加 brandCode 支持，新建供应商时绑定品牌
 * v1.1 - 添加 AI 使用统计支持（use_ai_photo, use_ai_voice）
 *
 * 变更历史：
 * - v1.2: addToQueue/addToUploadQueue 支持传入 brandCode
 * - v1.1: addToQueue/addToUploadQueue 支持传入 aiUsage 统计
 * - v1.0: 初始版本：实现本地队列管理、后台上传、失败重试
 *
 * 功能：
 * - 支持添加采购记录到上传队列（立即返回，后台上传）
 * - 使用 localStorage 持久化队列状态
 * - 自动后台处理队列（失败自动重试）
 * - 支持手动重试失败的记录
 * - 提供队列状态查询和订阅功能
 */

import { DailyLog } from '../types';
import { submitProcurement, SubmitResult, AiUsageStats } from './inventoryService';

// ============ 类型定义 ============

export type QueueStatus = 'pending' | 'uploading' | 'success' | 'failed';

export interface QueueItem {
  id: string;                          // 队列项唯一标识
  status: QueueStatus;                 // 当前状态
  createdAt: number;                   // 创建时间戳
  updatedAt: number;                   // 更新时间戳
  retryCount: number;                  // 重试次数
  data: Omit<DailyLog, 'id'>;          // 原始数据
  storeId: string;                     // 门店ID
  employeeId: string;                  // 员工ID
  aiUsage?: AiUsageStats;              // v1.1: AI 使用统计
  brandCode?: string | null;           // v1.2: 品牌代码，用于新建供应商
  error?: string;                      // 失败原因
  result?: SubmitResult;               // 提交结果
}

export type QueueChangeCallback = (queue: QueueItem[]) => void;

// ============ 常量配置 ============

const STORAGE_KEY = 'upload_queue';
const MAX_RETRY_COUNT = 3;
const RETRY_DELAY_MS = 2000;           // 重试延迟 2 秒
const PROCESS_INTERVAL_MS = 3000;      // 处理队列间隔 3 秒

// ============ 队列管理器 ============

class UploadQueueManager {
  private queue: QueueItem[] = [];
  private listeners: Set<QueueChangeCallback> = new Set();
  private processingTimer: NodeJS.Timeout | null = null;
  private isProcessing = false;

  constructor() {
    this.loadQueue();
    this.startProcessing();
  }

  // ========== 队列操作 ==========

  /**
   * 添加新项到队列
   * v1.2 - 支持传入 brandCode
   * v1.1 - 支持传入 AI 使用统计
   */
  addToQueue(
    data: Omit<DailyLog, 'id'>,
    storeId: string,
    employeeId: string,
    aiUsage?: AiUsageStats,
    brandCode?: string | null
  ): string {
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
      brandCode,
    };

    this.queue.push(item);
    this.saveQueue();
    this.notifyListeners();

    console.log(`[队列] 新增任务: ${id}`);

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
  removeQueueItem(id: string): boolean {
    const index = this.queue.findIndex(item => item.id === id);
    if (index === -1) return false;

    this.queue.splice(index, 1);
    this.saveQueue();
    this.notifyListeners();
    console.log(`[队列] 删除任务: ${id}`);
    return true;
  }

  /**
   * 清空成功的队列项
   */
  clearSuccessItems(): number {
    const successCount = this.queue.filter(item => item.status === 'success').length;
    this.queue = this.queue.filter(item => item.status !== 'success');
    this.saveQueue();
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
    item.updatedAt = Date.now();

    this.saveQueue();
    this.notifyListeners();
    console.log(`[队列] 手动重试: ${id}`);

    // 立即处理
    await this.processQueue();
    return true;
  }

  /**
   * 修改失败队列项的数据（用于用户编辑后重新提交）
   */
  updateQueueItemData(id: string, newData: Omit<DailyLog, 'id'>): boolean {
    const item = this.queue.find(i => i.id === id);
    if (!item) {
      console.warn(`[队列] 更新失败: 项不存在 (id: ${id})`);
      return false;
    }

    item.data = newData;
    item.status = 'pending';
    item.retryCount = 0;
    item.error = undefined;
    item.updatedAt = Date.now();

    this.saveQueue();
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
   * 处理单个队列项
   */
  private async processItem(item: QueueItem) {
    // 更新状态为上传中
    item.status = 'uploading';
    item.updatedAt = Date.now();
    this.saveQueue();
    this.notifyListeners();

    try {
      console.log(`[队列] 上传中: ${item.id} (重试次数: ${item.retryCount})`);

      // v1.2: 调用提交服务，传入 AI 使用统计和品牌代码
      const result = await submitProcurement(
        item.data,
        item.storeId,
        item.employeeId,
        undefined,        // onProgress 回调不需要
        item.aiUsage,     // AI 使用统计
        item.brandCode    // 品牌代码
      );

      if (result.success) {
        // 成功
        item.status = 'success';
        item.result = result;
        item.error = undefined;
        item.updatedAt = Date.now();
        console.log(`[队列] 上传成功: ${item.id}`);
      } else {
        // 提交失败（返回错误）
        throw new Error(result.errors.join('; '));
      }
    } catch (error) {
      // 上传异常
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
        item.status = 'failed';
        item.error = errorMessage;
        item.updatedAt = Date.now();
        console.error(`[队列] 标记为失败: ${item.id}`);
      }
    }

    this.saveQueue();
    this.notifyListeners();
  }

  // ========== 持久化 ==========

  /**
   * 从 localStorage 加载队列
   */
  private loadQueue() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.queue = JSON.parse(stored);
        console.log(`[队列] 加载队列: ${this.queue.length} 项`);
      }
    } catch (error) {
      console.error('[队列] 加载队列失败:', error);
      this.queue = [];
    }
  }

  /**
   * 保存队列到 localStorage
   */
  private saveQueue() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[队列] 保存队列失败:', error);
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
 * v1.2 - 支持传入 brandCode
 * v1.1 - 支持传入 AI 使用统计
 */
export function addToUploadQueue(
  data: Omit<DailyLog, 'id'>,
  storeId: string,
  employeeId: string,
  aiUsage?: AiUsageStats,
  brandCode?: string | null
): string {
  return uploadQueueService.addToQueue(data, storeId, employeeId, aiUsage, brandCode);
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
