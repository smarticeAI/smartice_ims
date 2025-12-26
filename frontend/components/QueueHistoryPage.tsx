/**
 * QueueHistoryPage - 采购记录页面
 * v4.9 - 修复空白页问题：useEffect 依赖修复 + 错误状态显示 + 重试按钮
 * v4.8 - 显示上传成功状态（修复成功后立即消失的bug）
 * v4.7 - 一次性加载全部记录，移除分页（解决聚合显示不完整的问题）
 * v4.6 - 添加日期筛选器（今天/本周/本月/全部）+ 聚合显示优化
 * v4.5 - 聚合显示同一次上传的多个物品（按供应商+时间戳分组）
 * v4.4 - 重新上传防止重复点击 + 点击后返回列表并显示上传中状态
 * v4.3 - 支持显示多张货物照片（历史详情页）
 * v4.2 - 添加门店隔离，只显示本门店的采购记录
 * v4.1 - 修复收货单图片加载（解析JSON数组格式的URL）
 * v4.0 - 合并显示历史记录和上传队列，供应商作为标题，支持删除
 *
 * 功能：
 * - 混合显示数据库历史记录 + 本地上传队列
 * - 日期筛选：今天（默认）、本周、本月、全部
 * - 历史记录按供应商+created_at聚合（同一次上传的多个物品显示为一张卡片）
 * - 按时间倒序排列
 * - 供应商名称作为标题
 * - 历史记录支持删除（同步数据库，聚合记录批量删除）
 * - 懒加载：滚动到底部自动加载更多
 * - 门店隔离：只能查看和删除本门店的记录
 * - 支持显示多张货物照片
 * - 重新上传防止重复点击，自动返回列表并显示上传中状态
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { uploadQueueService, QueueItem, QueueStatus } from '../services/uploadQueueService';
import { getProcurementHistory, deleteProcurementRecord, ProcurementHistoryItem, DateFilterType } from '../services/supabaseService';
import { useAuth } from '../contexts/AuthContext';
import { Icons } from '../constants';
import { GlassCard } from './ui';
import { ProcurementItem } from '../types';

interface QueueHistoryPageProps {
  onBack: () => void;
}

// 统一的记录类型
type RecordType = 'queue' | 'history';
interface UnifiedRecord {
  type: RecordType;
  id: string | number;  // history类型使用聚合key，queue类型使用原始id
  supplierName: string;
  totalAmount: number;
  itemCount: number;
  timestamp: number;
  status: 'pending' | 'uploading' | 'success' | 'failed' | 'completed';
  // v4.5: history类型存储聚合后的多条记录数组
  original: QueueItem | ProcurementHistoryItem[];
}

type ViewMode = 'list' | 'detail';

// v4.5: 筛选器配置
const DATE_FILTER_OPTIONS: { value: DateFilterType; label: string }[] = [
  { value: 'today', label: '今天' },
  { value: 'week', label: '本周' },
  { value: 'month', label: '本月' },
  { value: 'all', label: '全部' },
];

export const QueueHistoryPage: React.FC<QueueHistoryPageProps> = ({ onBack }) => {
  // 获取当前用户的餐厅ID
  const { user } = useAuth();
  const storeId = user?.restaurant_id || undefined;

  // 本地队列状态
  const [queue, setQueue] = useState<QueueItem[]>([]);

  // 数据库历史状态
  const [history, setHistory] = useState<ProcurementHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // v4.9: 添加错误状态，便于用户排查问题
  const [loadError, setLoadError] = useState<string | null>(null);

  // v4.5: 日期筛选状态
  const [dateFilter, setDateFilter] = useState<DateFilterType>('today');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);

  // UI 状态
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [selectedRecord, setSelectedRecord] = useState<UnifiedRecord | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const filterDropdownRef = useRef<HTMLDivElement>(null);

  // 订阅本地队列变化
  useEffect(() => {
    setQueue(uploadQueueService.getQueue());
    const unsubscribe = uploadQueueService.subscribe((newQueue) => {
      setQueue(newQueue);
    });
    return () => unsubscribe();
  }, []);

  // v4.9: 加载历史记录（修复依赖问题）
  const loadHistory = useCallback(async (filter: DateFilterType, currentStoreId?: string) => {
    // v4.9: 使用传入的参数，避免闭包捕获旧值
    setLoadingHistory(true);
    setLoadError(null);

    try {
      // 一次性加载全部记录（pageSize=1000足够覆盖一个月的数据）
      const result = await getProcurementHistory(0, 1000, currentStoreId, filter);
      console.log(`[初始加载] ${filter} 返回 ${result.data.length} 条记录, storeId: ${currentStoreId}`);
      setHistory(result.data);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : '未知错误';
      console.error('加载历史记录失败:', errorMsg);
      setLoadError(`加载失败: ${errorMsg}`);
      setHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  }, []); // v4.9: 移除依赖，使用参数传递

  // v4.9: 初始加载 + storeId 变化时重新加载
  useEffect(() => {
    loadHistory(dateFilter, storeId);
  }, [storeId, loadHistory]);

  // v4.9: 切换筛选器
  const handleFilterChange = async (filter: DateFilterType) => {
    console.log(`[筛选器] 切换到: ${filter}, storeId: ${storeId}`);
    setDateFilter(filter);
    setShowFilterDropdown(false);
    setHistory([]);
    await loadHistory(filter, storeId);
  };

  // v4.5: 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterDropdownRef.current && !filterDropdownRef.current.contains(event.target as Node)) {
        setShowFilterDropdown(false);
      }
    };
    if (showFilterDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilterDropdown]);

  // v4.7: 聚合历史记录 - 按供应商+created_at分组
  const aggregatedHistory = React.useMemo(() => {
    const groups = new Map<string, ProcurementHistoryItem[]>();

    history.forEach(item => {
      // 使用供应商+created_at作为聚合key（同一次上传的记录created_at相同）
      const key = `${item.supplier_name || '未知供应商'}_${item.created_at}`;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(item);
    });

    return Array.from(groups.entries()).map(([key, items]) => ({
      key,
      items,
      supplierName: items[0].supplier_name || '未知供应商',
      totalAmount: items.reduce((sum, i) => sum + i.total_amount, 0),
      itemCount: items.length,
      timestamp: new Date(items[0].created_at).getTime(),
    }));
  }, [history]);

  // 合并并排序记录
  const unifiedRecords: UnifiedRecord[] = [
    // v4.8: 本地队列（包含成功状态，让用户看到"已上传"后再消失）
    ...queue
      .map(item => ({
        type: 'queue' as RecordType,
        id: item.id,
        supplierName: item.data.supplier || '未知供应商',
        totalAmount: item.data.totalCost,
        itemCount: item.data.items.length,
        timestamp: item.createdAt,
        status: item.status as UnifiedRecord['status'],
        original: [item] as any,  // 保持类型兼容，实际使用时会区分type
      })),
    // v4.5: 聚合后的历史记录
    ...aggregatedHistory.map(group => ({
      type: 'history' as RecordType,
      id: group.key,  // 使用聚合key作为id
      supplierName: group.supplierName,
      totalAmount: group.totalAmount,
      itemCount: group.itemCount,
      timestamp: group.timestamp,
      status: 'completed' as UnifiedRecord['status'],
      original: group.items,  // 存储聚合后的所有记录
    })),
  ].sort((a, b) => b.timestamp - a.timestamp);

  // 撤回/删除队列项
  const handleDeleteQueue = (id: string) => {
    if (confirm('确认删除该上传任务？')) {
      uploadQueueService.removeQueueItem(id);
      if (selectedRecord?.id === id) {
        setViewMode('list');
        setSelectedRecord(null);
      }
    }
  };

  // v4.5: 删除历史记录（支持批量删除聚合记录）
  const handleDeleteHistory = async (items: ProcurementHistoryItem[]) => {
    const itemCount = items.length;
    const confirmMsg = itemCount > 1
      ? `确认删除这 ${itemCount} 条采购记录？此操作不可撤销。`
      : '确认删除该采购记录？此操作不可撤销。';

    if (confirm(confirmMsg)) {
      try {
        // 批量删除所有聚合的记录
        const deletePromises = items.map(item =>
          deleteProcurementRecord(item.id, storeId)
        );
        await Promise.all(deletePromises);

        // 从本地状态中移除
        const deletedIds = new Set(items.map(item => item.id));
        setHistory(prev => prev.filter(item => !deletedIds.has(item.id)));

        // 如果当前选中的是被删除的记录，返回列表
        if (selectedRecord?.type === 'history') {
          const selectedItems = selectedRecord.original as ProcurementHistoryItem[];
          if (selectedItems.some(item => deletedIds.has(item.id))) {
            setViewMode('list');
            setSelectedRecord(null);
          }
        }
      } catch (error) {
        alert('删除失败，请重试');
      }
    }
  };

  // 点击记录
  const handleRecordClick = (record: UnifiedRecord) => {
    setSelectedRecord(record);
    setViewMode('detail');
  };

  // 返回列表
  const handleBackToList = () => {
    setViewMode('list');
    setSelectedRecord(null);
  };

  // 格式化时间
  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} 小时前`;
    return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' });
  };

  // 详情视图
  if (viewMode === 'detail' && selectedRecord) {
    if (selectedRecord.type === 'queue') {
      // queue类型的original实际是QueueItem，但为了类型兼容包装成了数组
      const queueItem = (selectedRecord.original as any)[0] as QueueItem;
      return (
        <QueueDetailView
          item={queueItem}
          onBack={handleBackToList}
          onDelete={handleDeleteQueue}
        />
      );
    }
    // v4.5: 聚合历史记录详情视图
    return (
      <HistoryDetailView
        items={selectedRecord.original as ProcurementHistoryItem[]}
        onBack={handleBackToList}
        onDelete={handleDeleteHistory}
      />
    );
  }

  // v4.5: 获取当前筛选器的显示文字
  const currentFilterLabel = DATE_FILTER_OPTIONS.find(o => o.value === dateFilter)?.label || '今天';

  // 列表视图
  return (
    <div className="h-full flex flex-col animate-slide-in relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="w-10 h-10 rounded-full bg-glass-bg backdrop-blur-glass border border-glass-border flex items-center justify-center text-secondary hover:bg-glass-bg-hover transition-colors"
          >
            <Icons.ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold text-primary tracking-tight">采购记录</h2>
        </div>

        {/* v4.5: 日期筛选器（手机友好的下拉菜单） */}
        <div className="relative" ref={filterDropdownRef}>
          <button
            onClick={() => setShowFilterDropdown(!showFilterDropdown)}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-glass-bg backdrop-blur-glass border border-glass-border text-sm text-secondary hover:bg-glass-bg-hover transition-colors active:scale-95"
          >
            <span>{currentFilterLabel}</span>
            <svg className={`w-4 h-4 transition-transform ${showFilterDropdown ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* 下拉菜单 - 深色不透明背景防止文字透视 */}
          {showFilterDropdown && (
            <div
              className="absolute right-0 top-full mt-2 py-2 min-w-[120px] rounded-2xl border border-glass-border shadow-glass-elevated z-50 animate-fade-in"
              style={{ background: 'rgba(30, 32, 38, 0.95)', backdropFilter: 'blur(24px)' }}
            >
              {DATE_FILTER_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleFilterChange(option.value)}
                  className={`w-full px-4 py-3 text-left text-sm transition-colors ${
                    dateFilter === option.value
                      ? 'text-ios-blue bg-ios-blue/10'
                      : 'text-secondary hover:bg-white/5'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 列表内容 */}
      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-6 pb-6"
      >
        {/* v4.9: 错误状态显示 */}
        {loadError && (
          <div className="mb-4 p-4 rounded-glass-lg border border-ios-red/30" style={{ background: 'rgba(232, 90, 79, 0.15)' }}>
            <div className="flex items-start gap-3">
              <Icons.X className="w-5 h-5 text-ios-red flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-ios-red mb-1">加载失败</p>
                <p className="text-sm text-white/80 mb-3">{loadError}</p>
                <button
                  onClick={() => loadHistory(dateFilter, storeId)}
                  className="text-sm text-ios-blue hover:underline"
                >
                  点击重试
                </button>
              </div>
            </div>
          </div>
        )}
        {unifiedRecords.length === 0 && !loadingHistory && !loadError ? (
          <div className="h-full flex flex-col items-center justify-center gap-3">
            <p className="text-muted">
              {dateFilter === 'today' && '今天暂无采购记录'}
              {dateFilter === 'week' && '本周暂无采购记录'}
              {dateFilter === 'month' && '本月暂无采购记录'}
              {dateFilter === 'all' && '暂无采购记录'}
            </p>
            {dateFilter !== 'all' && (
              <button
                onClick={() => handleFilterChange('all')}
                className="text-sm text-ios-blue hover:underline"
              >
                查看全部记录
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {unifiedRecords.map((record) => (
              <RecordCard
                key={`${record.type}-${record.id}`}
                record={record}
                onClick={() => handleRecordClick(record)}
                onDelete={record.type === 'queue'
                  ? () => handleDeleteQueue((record.original as any)[0].id)
                  : () => handleDeleteHistory(record.original as ProcurementHistoryItem[])
                }
                formatTime={formatTime}
              />
            ))}
            {loadingHistory && (
              <div className="py-4 flex justify-center">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ============ 统一记录卡片 ============

const RecordCard: React.FC<{
  record: UnifiedRecord;
  onClick: () => void;
  onDelete: () => void;
  formatTime: (t: number) => string;
}> = ({ record, onClick, onDelete, formatTime }) => {
  const statusConfig: Record<UnifiedRecord['status'], { color: string; bgColor: string; icon: any; label: string }> = {
    pending: { color: 'text-ios-blue', bgColor: 'bg-ios-blue/10', icon: Icons.Clock, label: '等待上传' },
    uploading: { color: 'text-ios-blue', bgColor: 'bg-ios-blue/10', icon: Icons.ArrowRight, label: '上传中' },
    success: { color: 'text-ios-green', bgColor: 'bg-ios-green/10', icon: Icons.Check, label: '已上传' },
    failed: { color: 'text-ios-red', bgColor: 'bg-ios-red/10', icon: Icons.X, label: '上传失败' },
    completed: { color: 'text-ios-green', bgColor: 'bg-ios-green/10', icon: Icons.Check, label: '已完成' },
  };

  const config = statusConfig[record.status];
  const StatusIcon = config.icon;
  const isUploading = record.status === 'uploading';

  return (
    <GlassCard padding="md" className="active:scale-[0.99] transition-transform" onClick={onClick}>
      <div className="flex items-start gap-3">
        {/* 状态图标 */}
        <div className={`w-10 h-10 rounded-full ${config.bgColor} flex items-center justify-center flex-shrink-0`}>
          {isUploading ? (
            <div className="w-5 h-5 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
          ) : (
            <StatusIcon className={`w-5 h-5 ${config.color}`} />
          )}
        </div>

        {/* 内容 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-base font-semibold text-primary truncate">{record.supplierName}</h3>
            <span className="text-ios-blue font-bold">¥{record.totalAmount.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-3 text-sm text-secondary">
            <span>{record.itemCount} 项商品</span>
            <span className={`text-xs ${config.color}`}>{config.label}</span>
          </div>
          <div className="text-xs text-muted mt-1">{formatTime(record.timestamp)}</div>

          {/* 失败原因 */}
          {record.status === 'failed' && record.type === 'queue' && (record.original as QueueItem).error && (
            <div className="mt-2 p-2 rounded-lg bg-ios-red/10 border border-ios-red/20">
              <p className="text-xs text-ios-red line-clamp-1">{(record.original as QueueItem).error}</p>
            </div>
          )}
        </div>

        {/* 删除按钮 */}
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-8 h-8 rounded-full bg-white/5 hover:bg-ios-red/20 flex items-center justify-center text-white/40 hover:text-ios-red transition-colors flex-shrink-0"
        >
          <Icons.X className="w-4 h-4" />
        </button>
      </div>
    </GlassCard>
  );
};

// ============ 队列详情视图 ============

const QueueDetailView: React.FC<{
  item: QueueItem;
  onBack: () => void;
  onDelete: (id: string) => void;
}> = ({ item, onBack, onDelete }) => {
  const [editedItems, setEditedItems] = useState<ProcurementItem[]>(item.data.items);
  const [editedSupplier, setEditedSupplier] = useState(item.data.supplier);
  const [editedNotes, setEditedNotes] = useState(item.data.notes || '');
  const [isResubmitting, setIsResubmitting] = useState(false);

  const isEditable = item.status === 'failed';

  // v4.4: 重新上传 - 防止重复点击 + 返回列表显示上传中状态
  const handleResubmit = async () => {
    // 防止重复点击
    if (!isEditable || isResubmitting) return;

    setIsResubmitting(true);

    const newData = {
      ...item.data,
      supplier: editedSupplier,
      notes: editedNotes,
      items: editedItems,
      totalCost: editedItems.reduce((sum, i) => sum + (i.total || 0), 0),
    };

    // 更新队列数据，状态会自动变为 pending，然后队列服务会自动处理上传
    uploadQueueService.updateQueueItemData(item.id, newData);

    // 立即返回列表页，让用户看到状态变化（pending -> uploading）
    // 不需要 setIsResubmitting(false)，因为马上就离开这个页面了
    onBack();
  };

  const handleItemChange = (index: number, field: keyof ProcurementItem, value: any) => {
    const newItems = [...editedItems];
    newItems[index] = { ...newItems[index], [field]: value };
    if (field === 'quantity' || field === 'unitPrice') {
      newItems[index].total = (newItems[index].quantity || 0) * (newItems[index].unitPrice || 0);
    }
    setEditedItems(newItems);
  };

  const statusConfig: Record<QueueStatus, { color: string; label: string; bgColor: string }> = {
    pending: { color: 'text-ios-blue', bgColor: 'bg-ios-blue/10', label: '等待上传' },
    uploading: { color: 'text-ios-blue', bgColor: 'bg-ios-blue/10', label: '上传中...' },
    success: { color: 'text-ios-green', bgColor: 'bg-ios-green/10', label: '上传成功' },
    failed: { color: 'text-ios-red', bgColor: 'bg-ios-red/10', label: '上传失败' },
  };
  const config = statusConfig[item.status];

  return (
    <div className="h-full flex flex-col animate-slide-in relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-glass-bg backdrop-blur-glass border border-glass-border flex items-center justify-center text-secondary hover:bg-glass-bg-hover transition-colors">
            <Icons.ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-primary tracking-tight">
            {isEditable ? '编辑并重新上传' : '上传详情'}
          </h2>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-medium ${config.color} ${config.bgColor}`}>
          {config.label}
        </span>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-6 pb-32">
        {item.status === 'failed' && item.error && (
          <div className="mb-4 p-4 rounded-glass-lg border border-ios-red/30" style={{ background: 'rgba(232, 90, 79, 0.15)' }}>
            <div className="flex items-start gap-3">
              <Icons.X className="w-5 h-5 text-ios-red flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-ios-red mb-1">上传失败原因</p>
                <p className="text-sm text-white/90">{item.error}</p>
              </div>
            </div>
          </div>
        )}

        <GlassCard padding="lg" className="mb-4">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted uppercase tracking-wider mb-2 block">供应商</label>
              {isEditable ? (
                <input type="text" value={editedSupplier} onChange={(e) => setEditedSupplier(e.target.value)}
                  className="w-full px-4 py-3 rounded-glass-lg bg-white/5 border border-white/10 text-white focus:border-ios-blue/50 focus:outline-none" />
              ) : (
                <p className="text-lg font-semibold text-primary">{item.data.supplier}</p>
              )}
            </div>
            {(item.data.notes || isEditable) && (
              <div>
                <label className="text-xs text-muted uppercase tracking-wider mb-2 block">备注</label>
                {isEditable ? (
                  <textarea value={editedNotes} onChange={(e) => setEditedNotes(e.target.value)} rows={2}
                    className="w-full px-4 py-3 rounded-glass-lg bg-white/5 border border-white/10 text-white focus:border-ios-blue/50 focus:outline-none resize-none" />
                ) : (
                  <p className="text-sm text-secondary">{item.data.notes || '无'}</p>
                )}
              </div>
            )}
          </div>
        </GlassCard>

        <GlassCard padding="lg">
          <h3 className="text-base font-bold text-primary mb-4">物品清单（{editedItems.length} 项）</h3>
          <div className="space-y-4">
            {editedItems.map((procItem, idx) => (
              <div key={idx} className="p-3 rounded-glass-lg bg-white/5 border border-white/10">
                {isEditable ? (
                  <div className="space-y-2">
                    <input type="text" value={procItem.name} onChange={(e) => handleItemChange(idx, 'name', e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" placeholder="商品名称" />
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" value={procItem.quantity || ''} onChange={(e) => handleItemChange(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" placeholder="数量" />
                      <input type="text" value={procItem.unit || ''} onChange={(e) => handleItemChange(idx, 'unit', e.target.value)}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" placeholder="单位" />
                      <input type="number" value={procItem.unitPrice || ''} onChange={(e) => handleItemChange(idx, 'unitPrice', parseFloat(e.target.value) || 0)}
                        className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm" placeholder="单价" />
                    </div>
                    <div className="text-right text-sm text-ios-blue">小计：¥{(procItem.total || 0).toFixed(2)}</div>
                  </div>
                ) : (
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-semibold text-primary">{procItem.name}</p>
                      <p className="text-sm text-muted mt-1">{procItem.quantity}{procItem.unit} × ¥{procItem.unitPrice}</p>
                    </div>
                    <p className="font-mono font-bold text-ios-blue">¥{(procItem.total || 0).toFixed(2)}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
            <span className="text-secondary">总计金额</span>
            <span className="text-2xl font-bold text-ios-blue">
              ¥{editedItems.reduce((sum, i) => sum + (i.total || 0), 0).toFixed(2)}
            </span>
          </div>
        </GlassCard>
      </div>

      {/* 底部操作 */}
      <div className="fixed bottom-6 left-4 right-4 z-50 safe-area-bottom">
        {isEditable ? (
          <div className="flex gap-3">
            <button onClick={() => onDelete(item.id)}
              className="flex-1 py-4 rounded-2xl text-white font-semibold border border-white/10 flex items-center justify-center gap-2"
              style={{ background: 'rgba(30, 30, 35, 0.65)', backdropFilter: 'blur(40px)' }}>
              <Icons.X className="w-5 h-5" /><span>删除</span>
            </button>
            <button onClick={handleResubmit} disabled={isResubmitting}
              className={`flex-1 py-4 rounded-2xl text-white font-semibold border flex items-center justify-center gap-2 transition-all ${
                isResubmitting
                  ? 'border-white/20 opacity-70 cursor-not-allowed'
                  : 'border-ios-blue/30 active:scale-[0.98]'
              }`}
              style={{ background: 'linear-gradient(135deg, rgba(91,163,192,0.3) 0%, rgba(91,163,192,0.15) 100%)', backdropFilter: 'blur(40px)' }}>
              {isResubmitting ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>提交中...</span>
                </>
              ) : (
                <>
                  <Icons.Check className="w-5 h-5" />
                  <span>重新上传</span>
                </>
              )}
            </button>
          </div>
        ) : (
          <button onClick={() => onDelete(item.id)}
            className="w-full py-4 rounded-2xl text-white font-semibold border border-white/10 flex items-center justify-center gap-2"
            style={{ background: 'rgba(30, 30, 35, 0.65)', backdropFilter: 'blur(40px)' }}>
            <Icons.X className="w-5 h-5" /><span>删除记录</span>
          </button>
        )}
      </div>
    </div>
  );
};

// ============ 历史详情视图（v4.5: 支持聚合显示多个物品） ============

const HistoryDetailView: React.FC<{
  items: ProcurementHistoryItem[];  // v4.5: 改为接收聚合后的多条记录
  onBack: () => void;
  onDelete: (items: ProcurementHistoryItem[]) => void;
}> = ({ items, onBack, onDelete }) => {
  // 取第一条记录的公共信息（供应商、日期、图片等，聚合记录中这些相同）
  const firstItem = items[0];
  const totalAmount = items.reduce((sum, item) => sum + item.total_amount, 0);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('zh-CN', {
      year: 'numeric', month: 'numeric', day: 'numeric',
      hour: 'numeric', minute: 'numeric'
    });
  };

  // 解析图片URL数组（支持多张图片）
  const parseImageUrls = (url: string | null): string[] => {
    if (!url) return [];
    try {
      const parsed = JSON.parse(url);
      if (Array.isArray(parsed)) {
        return parsed;
      }
      return [url];
    } catch {
      return [url];
    }
  };

  // 收货单和货物照片从第一条记录获取（聚合记录共享同一套图片）
  const receiptImageUrls = parseImageUrls(firstItem.receipt_image);
  const goodsImageUrls = parseImageUrls(firstItem.goods_image);

  return (
    <div className="h-full flex flex-col animate-slide-in relative overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="w-10 h-10 rounded-full bg-glass-bg backdrop-blur-glass border border-glass-border flex items-center justify-center text-secondary hover:bg-glass-bg-hover transition-colors">
            <Icons.ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-primary tracking-tight">采购详情</h2>
        </div>
        <span className="px-3 py-1 rounded-full text-xs font-medium text-ios-green bg-ios-green/10">
          已完成
        </span>
      </div>

      {/* 内容 */}
      <div className="flex-1 overflow-y-auto px-6 pb-32">
        {/* 供应商和总览信息 */}
        <GlassCard padding="lg" className="mb-4">
          <div className="space-y-4">
            <div>
              <label className="text-xs text-muted uppercase tracking-wider mb-1 block">供应商</label>
              <p className="text-xl font-bold text-primary">{firstItem.supplier_name || '未知供应商'}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-muted uppercase tracking-wider mb-1 block">采购日期</label>
                <p className="text-sm text-secondary">{firstItem.price_date}</p>
              </div>
              <div>
                <label className="text-xs text-muted uppercase tracking-wider mb-1 block">录入时间</label>
                <p className="text-sm text-secondary">{formatDate(firstItem.created_at)}</p>
              </div>
            </div>

            {firstItem.notes && (
              <div>
                <label className="text-xs text-muted uppercase tracking-wider mb-1 block">备注</label>
                <p className="text-sm text-secondary">{firstItem.notes}</p>
              </div>
            )}
          </div>
        </GlassCard>

        {/* v4.5: 物品清单（显示所有聚合的物品） */}
        <GlassCard padding="lg" className="mb-4">
          <h3 className="text-base font-bold text-primary mb-4">物品清单（{items.length} 项）</h3>
          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="p-3 rounded-glass-lg bg-white/5 border border-white/10">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-semibold text-primary">{item.item_name}</p>
                    <p className="text-sm text-muted mt-1">
                      {item.quantity} {item.unit} × ¥{item.unit_price.toFixed(2)}
                    </p>
                  </div>
                  <p className="font-mono font-bold text-ios-blue">¥{item.total_amount.toFixed(2)}</p>
                </div>
              </div>
            ))}
          </div>

          {/* 总计 */}
          <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
            <span className="text-secondary">总计金额</span>
            <span className="text-2xl font-bold text-ios-blue">¥{totalAmount.toFixed(2)}</span>
          </div>
        </GlassCard>

        {/* 图片预览 */}
        {(receiptImageUrls.length > 0 || goodsImageUrls.length > 0) && (
          <GlassCard padding="lg">
            <h3 className="text-base font-bold text-primary mb-4">凭证图片</h3>
            <div className="space-y-4">
              {receiptImageUrls.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-2">收货单 ({receiptImageUrls.length}张)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {receiptImageUrls.map((url, index) => (
                      <img
                        key={index}
                        src={url}
                        alt={`收货单 ${index + 1}`}
                        className="w-full rounded-lg object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}
              {goodsImageUrls.length > 0 && (
                <div>
                  <p className="text-xs text-muted mb-2">货物照片 ({goodsImageUrls.length}张)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {goodsImageUrls.map((url, index) => (
                      <img
                        key={index}
                        src={url}
                        alt={`货物照片 ${index + 1}`}
                        className="w-full rounded-lg object-cover"
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        )}
      </div>

      {/* 底部删除按钮 */}
      <div className="fixed bottom-6 left-4 right-4 z-50 safe-area-bottom">
        <button
          onClick={() => onDelete(items)}
          className="w-full py-4 rounded-2xl text-ios-red font-semibold border border-ios-red/30 flex items-center justify-center gap-2"
          style={{ background: 'rgba(232, 90, 79, 0.15)', backdropFilter: 'blur(40px)' }}
        >
          <Icons.X className="w-5 h-5" />
          <span>{items.length > 1 ? `删除全部 ${items.length} 条记录` : '删除记录'}</span>
        </button>
      </div>
    </div>
  );
};
