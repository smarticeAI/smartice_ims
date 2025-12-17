/**
 * 草稿服务 - 自动保存录入表单草稿
 * v2.1 - 仅选分类不算有内容，必须有实际数据才保存/恢复草稿
 * v2.0 - 使用 IndexedDB 存储，支持图片；fallback 到 localStorage（只存文字）
 * v1.0 - 初始版本：localStorage 存储文本数据
 *
 * 存储策略：
 * 1. 优先使用 IndexedDB（支持图片，容量大）
 * 2. IndexedDB 不可用时 fallback 到 localStorage（只存文字）
 * 3. 存储失败时 fallback 到只存文字
 * 4. 首次加载时清理旧的 localStorage 草稿数据
 *
 * 功能：
 * - 自动保存表单数据（防抖 1 秒）
 * - 支持保存图片（receiptImages, goodsImages）
 * - 页面加载时恢复草稿
 * - 提交成功后清除草稿
 * - 24 小时过期自动忽略
 */

import { ProcurementItem, CategoryType, AttachedImage } from '../types';
import * as indexedDB from './indexedDBService';

// ============ 类型定义 ============

export type EntryStep = 'WELCOME' | 'CATEGORY' | 'WORKSHEET' | 'SUMMARY';

// v2.0: 添加图片字段
export interface EntryDraft {
  step: EntryStep;
  selectedCategory: CategoryType;
  supplier: string;
  supplierOther: string;
  notes: string;
  items: ProcurementItem[];
  receiptImages?: AttachedImage[];  // v2.0: 收货单图片
  goodsImages?: AttachedImage[];    // v2.0: 货物图片
  savedAt: number;  // 时间戳
}

export interface DraftInfo {
  category: string;
  itemCount: number;
  imageCount: number;  // v2.0: 图片数量
  savedAt: number;
  timeAgo: string;  // 格式化的时间：刚刚 / 5分钟前 / 今天 10:32
}

// ============ 常量配置 ============

const STORAGE_KEY = 'entry_draft';
const LEGACY_STORAGE_KEY = 'entry_draft';  // localStorage 的 key（用于清理）
const EXPIRE_HOURS = 24;  // 草稿过期时间（小时）
const DEBOUNCE_MS = 1000; // 防抖延迟（毫秒）

// ============ 工具函数 ============

/**
 * 格式化时间为相对时间
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);

  if (minutes < 1) {
    return '刚刚';
  } else if (minutes < 60) {
    return `${minutes}分钟前`;
  } else if (hours < 24) {
    // 今天，显示具体时间
    const date = new Date(timestamp);
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    return `今天 ${hour}:${minute}`;
  } else {
    // 超过一天，显示日期
    const date = new Date(timestamp);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hour = date.getHours().toString().padStart(2, '0');
    const minute = date.getMinutes().toString().padStart(2, '0');
    return `${month}月${day}日 ${hour}:${minute}`;
  }
}

/**
 * 检查草稿是否过期
 */
function isExpired(savedAt: number): boolean {
  const now = Date.now();
  const expireMs = EXPIRE_HOURS * 60 * 60 * 1000;
  return now - savedAt > expireMs;
}

/**
 * 移除草稿中的图片，只保留文字
 */
function stripImages(draft: Omit<EntryDraft, 'savedAt'>): Omit<EntryDraft, 'savedAt'> {
  const { receiptImages, goodsImages, ...textOnly } = draft as EntryDraft;
  return textOnly;
}

/**
 * 清理 localStorage 中的旧草稿数据
 */
function cleanupLocalStorage(): void {
  try {
    const oldData = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (oldData) {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      console.log('[草稿] 已清理 localStorage 旧数据');
    }
  } catch (error) {
    console.error('[草稿] 清理 localStorage 失败:', error);
  }
}

// ============ 草稿管理类 ============

class DraftManager {
  private debounceTimer: NodeJS.Timeout | null = null;
  private useIndexedDB: boolean = true;  // 是否使用 IndexedDB
  private initialized: boolean = false;

  constructor() {
    // 检查 IndexedDB 可用性
    this.useIndexedDB = indexedDB.isIndexedDBAvailable();
    if (!this.useIndexedDB) {
      console.warn('[草稿] IndexedDB 不可用，将使用 localStorage（只存文字）');
    }
  }

  /**
   * 初始化：清理旧数据，迁移到 IndexedDB
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // 清理 localStorage 中的旧数据
    cleanupLocalStorage();

    this.initialized = true;
    console.log('[草稿] 服务已初始化');
  }

  /**
   * 保存草稿（带防抖）
   */
  saveDraft(draft: Omit<EntryDraft, 'savedAt'>): void {
    // 清除之前的定时器
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // 防抖保存
    this.debounceTimer = setTimeout(() => {
      this.saveImmediately(draft);
    }, DEBOUNCE_MS);
  }

  /**
   * 立即保存草稿（不防抖）
   * v2.0: 优先 IndexedDB，失败则 fallback
   */
  async saveImmediately(draft: Omit<EntryDraft, 'savedAt'>): Promise<boolean> {
    const fullDraft: EntryDraft = {
      ...draft,
      savedAt: Date.now(),
    };

    // 计算数据大小
    const hasImages = (draft.receiptImages && draft.receiptImages.length > 0) ||
                      (draft.goodsImages && draft.goodsImages.length > 0);
    const imageCount = (draft.receiptImages?.length || 0) + (draft.goodsImages?.length || 0);

    // 尝试 IndexedDB（完整数据，包含图片）
    if (this.useIndexedDB) {
      try {
        await indexedDB.setItem(STORAGE_KEY, fullDraft);
        console.log(`[草稿] IndexedDB 保存成功${hasImages ? `，含 ${imageCount} 张图片` : ''}`);
        return true;
      } catch (error) {
        console.error('[草稿] IndexedDB 保存失败，尝试 fallback:', error);
        // IndexedDB 失败，fallback 到 localStorage（只存文字）
      }
    }

    // Fallback: localStorage（只存文字，不存图片）
    try {
      const textOnlyDraft: EntryDraft = {
        ...stripImages(draft),
        savedAt: Date.now(),
      };
      localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(textOnlyDraft));
      console.log('[草稿] localStorage 保存成功（仅文字，图片未保存）');
      return true;
    } catch (error) {
      console.error('[草稿] localStorage 保存也失败:', error);
      return false;
    }
  }

  /**
   * 加载草稿
   * 返回 null 表示没有草稿或草稿已过期
   * v2.0: 优先从 IndexedDB 加载，fallback 到 localStorage
   */
  async loadDraft(): Promise<EntryDraft | null> {
    // 确保初始化
    await this.initialize();

    // 尝试从 IndexedDB 加载
    if (this.useIndexedDB) {
      try {
        const draft = await indexedDB.getItem<EntryDraft>(STORAGE_KEY);
        if (draft) {
          // 检查是否过期
          if (isExpired(draft.savedAt)) {
            console.log('[草稿] IndexedDB 草稿已过期，自动清除');
            await this.clearDraft();
            return null;
          }
          const imageCount = (draft.receiptImages?.length || 0) + (draft.goodsImages?.length || 0);
          console.log(`[草稿] 从 IndexedDB 加载成功${imageCount > 0 ? `，含 ${imageCount} 张图片` : ''}`);
          return draft;
        }
      } catch (error) {
        console.error('[草稿] IndexedDB 加载失败:', error);
      }
    }

    // Fallback: 从 localStorage 加载
    try {
      const stored = localStorage.getItem(LEGACY_STORAGE_KEY);
      if (stored) {
        const draft = JSON.parse(stored) as EntryDraft;

        // 检查是否过期
        if (isExpired(draft.savedAt)) {
          console.log('[草稿] localStorage 草稿已过期，自动清除');
          await this.clearDraft();
          return null;
        }

        console.log('[草稿] 从 localStorage 加载成功（仅文字）');
        return draft;
      }
    } catch (error) {
      console.error('[草稿] localStorage 加载失败:', error);
    }

    return null;
  }

  /**
   * 获取草稿摘要信息（用于显示恢复弹窗）
   * v2.0: 添加图片数量
   */
  async getDraftInfo(): Promise<DraftInfo | null> {
    const draft = await this.loadDraft();
    if (!draft) {
      return null;
    }

    // 检查草稿是否有实质内容（不只是空表单）
    // v2.1: 仅选分类不算有内容，必须有实际填写的数据才提示恢复
    const hasContent = draft.supplier ||
                       draft.supplierOther ||
                       draft.notes ||
                       draft.items.some(item => item.name.trim() !== '') ||
                       (draft.receiptImages && draft.receiptImages.length > 0) ||
                       (draft.goodsImages && draft.goodsImages.length > 0);

    if (!hasContent) {
      // 空草稿，不需要恢复
      return null;
    }

    const imageCount = (draft.receiptImages?.length || 0) + (draft.goodsImages?.length || 0);

    return {
      category: draft.selectedCategory || '',
      itemCount: draft.items.length,
      imageCount,
      savedAt: draft.savedAt,
      timeAgo: formatTimeAgo(draft.savedAt),
    };
  }

  /**
   * 清除草稿
   * v2.0: 同时清理 IndexedDB 和 localStorage
   */
  async clearDraft(): Promise<void> {
    // 取消待执行的防抖保存
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    // 清理 IndexedDB
    if (this.useIndexedDB) {
      try {
        await indexedDB.removeItem(STORAGE_KEY);
        console.log('[草稿] IndexedDB 已清除');
      } catch (error) {
        console.error('[草稿] IndexedDB 清除失败:', error);
      }
    }

    // 清理 localStorage
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch (error) {
      console.error('[草稿] localStorage 清除失败:', error);
    }
  }

  /**
   * 检查是否有草稿
   */
  async hasDraft(): Promise<boolean> {
    const info = await this.getDraftInfo();
    return info !== null;
  }
}

// ============ 导出单例 ============

export const draftService = new DraftManager();

// ============ 便捷函数（异步版本）============

export function saveDraft(draft: Omit<EntryDraft, 'savedAt'>): void {
  draftService.saveDraft(draft);
}

export async function loadDraft(): Promise<EntryDraft | null> {
  return draftService.loadDraft();
}

export async function getDraftInfo(): Promise<DraftInfo | null> {
  return draftService.getDraftInfo();
}

export async function clearDraft(): Promise<void> {
  return draftService.clearDraft();
}

export async function hasDraft(): Promise<boolean> {
  return draftService.hasDraft();
}
