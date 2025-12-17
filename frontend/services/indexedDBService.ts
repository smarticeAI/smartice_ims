/**
 * IndexedDB 存储服务
 * v1.0 - 替代 localStorage，解决 5MB 容量限制问题
 *
 * 变更历史：
 * - v1.0: 初始版本，支持队列数据持久化
 *
 * 功能：
 * - 提供类似 localStorage 的简单 API
 * - 支持大容量存储（通常为磁盘空间的 50%）
 * - 自动处理数据库初始化和升级
 */

const DB_NAME = 'smartice_inventory';
const DB_VERSION = 1;
const STORE_NAME = 'upload_queue';

// ============ 数据库初始化 ============

let dbInstance: IDBDatabase | null = null;

/**
 * 获取数据库实例（懒加载 + 单例）
 */
async function getDB(): Promise<IDBDatabase> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('[IndexedDB] 打开数据库失败:', request.error);
      reject(new Error('IndexedDB 不可用'));
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      console.log('[IndexedDB] 数据库已连接');
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // 创建对象存储（类似表）
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        console.log('[IndexedDB] 创建存储: upload_queue');
      }
    };
  });
}

// ============ 公开 API ============

/**
 * 保存数据到 IndexedDB
 * @param key 存储键名
 * @param value 任意可序列化数据
 */
export async function setItem<T>(key: string, value: T): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.put({ key, value });

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('[IndexedDB] 保存失败:', request.error);
      reject(new Error('IndexedDB 保存失败'));
    };
  });
}

/**
 * 从 IndexedDB 读取数据
 * @param key 存储键名
 * @returns 存储的数据，不存在时返回 null
 */
export async function getItem<T>(key: string): Promise<T | null> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.get(key);

    request.onsuccess = () => {
      if (request.result) {
        resolve(request.result.value as T);
      } else {
        resolve(null);
      }
    };

    request.onerror = () => {
      console.error('[IndexedDB] 读取失败:', request.error);
      reject(new Error('IndexedDB 读取失败'));
    };
  });
}

/**
 * 从 IndexedDB 删除数据
 * @param key 存储键名
 */
export async function removeItem(key: string): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.delete(key);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('[IndexedDB] 删除失败:', request.error);
      reject(new Error('IndexedDB 删除失败'));
    };
  });
}

/**
 * 清空所有数据
 */
export async function clear(): Promise<void> {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    const request = store.clear();

    request.onsuccess = () => {
      console.log('[IndexedDB] 已清空所有数据');
      resolve();
    };

    request.onerror = () => {
      console.error('[IndexedDB] 清空失败:', request.error);
      reject(new Error('IndexedDB 清空失败'));
    };
  });
}

/**
 * 检查 IndexedDB 是否可用
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== 'undefined';
}

/**
 * 从 localStorage 迁移数据到 IndexedDB（一次性迁移）
 * @param localStorageKey localStorage 的键名
 * @param indexedDBKey IndexedDB 的键名
 */
export async function migrateFromLocalStorage<T>(
  localStorageKey: string,
  indexedDBKey: string
): Promise<T | null> {
  try {
    const localData = localStorage.getItem(localStorageKey);
    if (!localData) {
      return null;
    }

    const parsed = JSON.parse(localData) as T;

    // 保存到 IndexedDB
    await setItem(indexedDBKey, parsed);

    // 删除 localStorage 数据
    localStorage.removeItem(localStorageKey);

    console.log(`[IndexedDB] 迁移完成: ${localStorageKey} -> ${indexedDBKey}`);
    return parsed;
  } catch (error) {
    console.error('[IndexedDB] 迁移失败:', error);
    return null;
  }
}
