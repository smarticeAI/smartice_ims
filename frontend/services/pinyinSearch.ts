/**
 * 拼音搜索服务
 * 提供拼音首字母提取和匹配功能，支持汉字 + 拼音双重搜索
 */

import { pinyin } from 'pinyin-pro';

/**
 * 获取文本的拼音首字母
 * @param text 中文文本
 * @returns 拼音首字母字符串（小写）
 * @example getPinyinInitials("牛五花") => "nwh"
 */
export function getPinyinInitials(text: string): string {
  if (!text) return '';

  return pinyin(text, {
    pattern: 'first',  // 只取首字母
    type: 'array',     // 返回数组
    toneType: 'none',  // 不带声调
  }).join('').toLowerCase();
}

/**
 * 获取文本的完整拼音
 * @param text 中文文本
 * @returns 完整拼音字符串（小写，无空格）
 * @example getFullPinyin("牛五花") => "niuwuhua"
 */
export function getFullPinyin(text: string): string {
  if (!text) return '';

  return pinyin(text, {
    toneType: 'none',  // 不带声调
    type: 'array',
  }).join('').toLowerCase();
}

/**
 * 检查文本是否匹配查询（支持汉字和拼音首字母）
 * @param text 被搜索的文本
 * @param query 搜索关键词
 * @returns 是否匹配
 * @example
 *   matchesQuery("牛五花", "牛") => true
 *   matchesQuery("牛五花", "nwh") => true
 *   matchesQuery("牛五花", "nw") => true
 *   matchesQuery("牛五花", "niuwu") => true
 */
export function matchesQuery(text: string, query: string): boolean {
  if (!text || !query) return false;

  const normalizedText = text.toLowerCase();
  const normalizedQuery = query.toLowerCase().trim();

  // 1. 直接汉字匹配（包含关系）
  if (normalizedText.includes(normalizedQuery)) {
    return true;
  }

  // 2. 拼音首字母匹配
  const initials = getPinyinInitials(text);
  if (initials.startsWith(normalizedQuery)) {
    return true;
  }

  // 3. 完整拼音匹配（前缀匹配）
  const fullPinyin = getFullPinyin(text);
  if (fullPinyin.startsWith(normalizedQuery)) {
    return true;
  }

  return false;
}

/**
 * 在列表中搜索匹配项
 * @param items 待搜索的列表
 * @param query 搜索关键词
 * @param getSearchText 获取搜索文本的函数
 * @param limit 返回结果数量限制
 * @returns 匹配的项列表
 */
export function searchInList<T>(
  items: T[],
  query: string,
  getSearchText: (item: T) => string,
  limit: number = 10
): T[] {
  if (!query || !items.length) return [];

  const results: T[] = [];

  for (const item of items) {
    if (results.length >= limit) break;

    const searchText = getSearchText(item);
    if (matchesQuery(searchText, query)) {
      results.push(item);
    }
  }

  return results;
}
