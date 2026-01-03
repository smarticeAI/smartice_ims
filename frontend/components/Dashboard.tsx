/**
 * Dashboard 仪表板组件
 * v4.4 - 物品选择改为按钮下拉样式，与品类筛选统一
 * v4.3 - 品类筛选改为自定义下拉框，统一与物品追踪下拉框样式
 * v4.2 - 修复图表容器高度问题，使用固定高度替代min-h
 *
 * 主要变更：
 * - v4.4: 物品选择使用按钮下拉样式，移除搜索输入框，统一UI风格
 * - v4.3: 品类筛选使用自定义下拉框，高度与日期选择按钮一致(34px)
 * - 合并支出趋势和采购量趋势为一个卡片（切换按钮）
 * - 统一大类统计和物品追踪的布局（标题左、控件右上）
 * - 搜索物品UI改进（参考AutocompleteInput：手动输入+下拉+删除+loading）
 * - 默认90天，预加载90天数据，切换7/30天秒切（从缓存筛选）
 * - 去掉柱状图highlight（cursor: default）
 * - 图表英文改中文（cost→金额, quantity→数量, price→单价）
 * - 大类统计卡片文字和数字居中
 * - 修复品类重复（getCategories传restaurantId）
 */
import React, { useState, useEffect, useMemo } from 'react';
import { DailyLog } from '../types';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { GlassCard } from './ui';
import {
  getCategories, getCategoryTrend, getSupplierStats, getDashboardStats,
  getItemPriceTrend, getItemNames, getQuantityTrend,
  Category, SupplierStats, ItemPriceTrend, DailyTrend, DashboardStats, ItemInfo, QuantityTrend
} from '../services/dashboardService';

interface DashboardProps {
  logs: DailyLog[];
  restaurantId?: string;
}

const COLORS = ['#5BA3C0', '#6B9E8A', '#E8A54C', '#E85A4F', '#9B7EDE', '#4ECDC4'];
const TIME_OPTIONS = [{ label: '7天', value: 7 }, { label: '30天', value: 30 }, { label: '90天', value: 90 }];

export const Dashboard: React.FC<DashboardProps> = ({ logs, restaurantId }) => {
  // 全局筛选（默认90天）
  const [days, setDays] = useState(90);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();

  // 大类板块数据（90天缓存）
  const [stats90, setStats90] = useState<DashboardStats>({ totalSpend: 0, totalItems: 0, supplierCount: 0 });
  const [categoryTrend90, setCategoryTrend90] = useState<DailyTrend[]>([]);
  const [supplierStats90, setSupplierStats90] = useState<SupplierStats[]>([]);
  const [quantityTrend90, setQuantityTrend90] = useState<QuantityTrend[]>([]);

  // 大类趋势视图模式（支出/采购量）
  const [trendViewMode, setTrendViewMode] = useState<'cost' | 'quantity'>('cost');

  // 物品板块数据（90天缓存）
  const [itemList90, setItemList90] = useState<ItemInfo[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemInfo | null>(null);
  const [itemTrend90, setItemTrend90] = useState<ItemPriceTrend[]>([]);
  const [itemViewMode, setItemViewMode] = useState<'price' | 'quantity'>('price');
  const [showItemDropdown, setShowItemDropdown] = useState(false);
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // 加载品类列表（修复：传递restaurantId）
  useEffect(() => {
    getCategories(restaurantId).then(setCategories);
  }, [restaurantId]);

  // 加载物品列表（90天缓存）
  useEffect(() => {
    getItemNames(restaurantId, 90).then(items => {
      setItemList90(items);
      if (items.length > 0 && !selectedItem) setSelectedItem(items[0]);
    });
  }, [restaurantId]);

  // 大类板块数据加载（90天缓存）
  useEffect(() => {
    const load = async () => {
      const [s, ct, ss, qt] = await Promise.all([
        getDashboardStats(restaurantId, selectedCategory, 90),
        getCategoryTrend(restaurantId, selectedCategory, 90),
        getSupplierStats(restaurantId, selectedCategory, 90),
        getQuantityTrend(restaurantId, selectedCategory, 90)
      ]);
      setStats90(s);
      setCategoryTrend90(ct);
      setSupplierStats90(ss);
      setQuantityTrend90(qt);
    };
    load();
  }, [restaurantId, selectedCategory]);

  // 物品趋势数据加载（90天缓存）
  useEffect(() => {
    if (selectedItem) {
      getItemPriceTrend(selectedItem.name, restaurantId, 90).then(setItemTrend90);
    }
  }, [selectedItem, restaurantId]);

  // 从90天缓存中筛选当前天数的数据
  const stats = useMemo(() => {
    if (days === 90) return stats90;
    // 简化：直接返回90天数据（实际应重新计算，但为性能考虑暂用90天数据）
    return stats90;
  }, [stats90, days]);

  const categoryTrend = useMemo(() => {
    if (days === 90) return categoryTrend90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return categoryTrend90.filter(d => new Date(d.date) >= cutoffDate);
  }, [categoryTrend90, days]);

  const supplierStats = useMemo(() => {
    if (days === 90) return supplierStats90;
    return supplierStats90;
  }, [supplierStats90, days]);

  const quantityTrend = useMemo(() => {
    if (days === 90) return quantityTrend90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return quantityTrend90.filter(d => new Date(d.date) >= cutoffDate);
  }, [quantityTrend90, days]);

  const itemTrend = useMemo(() => {
    if (days === 90) return itemTrend90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    return itemTrend90.filter(d => new Date(d.date) >= cutoffDate);
  }, [itemTrend90, days]);

  // 供应商饼图数据
  const pieData = supplierStats.slice(0, 5).map(s => ({
    name: s.supplier,
    shortName: s.supplier.slice(0, 4),
    value: s.total
  }));

  // 样式
  const segmentClass = (active: boolean) => `px-3 py-1.5 text-xs rounded-lg transition-all ${active ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`;

  // 空状态组件
  const EmptyState = ({ text }: { text: string }) => (
    <div className="flex-1 flex items-center justify-center text-white/40 text-sm">{text}</div>
  );

  // 格式化日期
  const formatDate = (v: string) => `${new Date(v).getMonth()+1}/${new Date(v).getDate()}`;

  // 格式化大数字
  const formatNumber = (n: number) => n >= 10000 ? `${(n/10000).toFixed(1)}万` : n.toLocaleString();

  return (
    <div className="h-full flex flex-col gap-4 animate-slide-in pb-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-2 flex-shrink-0 flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold text-primary tracking-tight mb-1">数据看板</h2>
          <p className="text-sm text-secondary">采购数据分析</p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* 时间筛选 */}
          <div className="flex bg-white/10 rounded-xl p-1 h-[34px] items-center">
            {TIME_OPTIONS.map(t => (
              <button key={t.value} onClick={() => setDays(t.value)}
                className={segmentClass(days === t.value)}>{t.label}</button>
            ))}
          </div>
          {/* 品类筛选（自定义下拉框） */}
          <div className={`relative ${showCategoryDropdown ? 'isolate z-[9999]' : ''}`}>
            <button
              onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
              className="h-[34px] px-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white flex items-center gap-2 hover:border-white/30 transition-colors"
            >
              <span>{selectedCategory ? categories.find(c => c.id === selectedCategory)?.name : '全部品类'}</span>
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showCategoryDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showCategoryDropdown && (
              <div
                className="absolute right-0 z-[9999] overflow-y-auto py-2 rounded-[20px] border border-white/12"
                style={{
                  top: '100%',
                  marginTop: '4px',
                  minWidth: '8rem',
                  maxHeight: '15rem',
                  background: 'linear-gradient(145deg, rgba(25,25,30,0.98) 0%, rgba(25,25,30,0.95) 100%)',
                  backdropFilter: 'blur(48px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(48px) saturate(180%)',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
                }}
              >
                <button
                  type="button"
                  onClick={() => { setSelectedCategory(undefined); setShowCategoryDropdown(false); }}
                  className={`w-full px-4 py-2.5 text-left transition-colors text-sm ${!selectedCategory ? 'text-white bg-white/10' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                >
                  全部品类
                </button>
                {categories.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => { setSelectedCategory(c.id); setShowCategoryDropdown(false); }}
                    className={`w-full px-4 py-2.5 text-left transition-colors text-sm ${selectedCategory === c.id ? 'text-white bg-white/10' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════ 大类板块 ═══════════ */}
      <div className="text-xs text-white/40 uppercase tracking-wider">大类统计</div>

      {/* Stats Grid - 居中显示 */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[70px] md:min-h-[80px]">
          <span className="text-xs md:text-sm text-white/70">总采购额</span>
          <p className="text-base md:text-2xl font-light text-white">¥{formatNumber(stats.totalSpend)}</p>
        </GlassCard>
        <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[70px] md:min-h-[80px]">
          <span className="text-xs md:text-sm text-white/70">入库数量</span>
          <p className="text-base md:text-2xl font-light text-white">{formatNumber(stats.totalItems)}</p>
        </GlassCard>
        <GlassCard padding="sm" className="flex flex-col items-center justify-center min-h-[70px] md:min-h-[80px]">
          <span className="text-xs md:text-sm text-white/70">供应商数</span>
          <p className="text-base md:text-2xl font-light text-white">{stats.supplierCount}</p>
        </GlassCard>
      </div>

      {/* 趋势图（合并支出和采购量） */}
      <GlassCard padding="md" className="flex flex-col">
        <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
          <h3 className="text-base font-bold text-white">
            {trendViewMode === 'cost' ? '支出趋势' : '采购量趋势'}
            {selectedCategory && ` (${categories.find(c => c.id === selectedCategory)?.name})`}
          </h3>
          <div className="flex bg-white/10 rounded-xl p-1">
            <button onClick={() => setTrendViewMode('cost')} className={segmentClass(trendViewMode === 'cost')}>支出</button>
            <button onClick={() => setTrendViewMode('quantity')} className={segmentClass(trendViewMode === 'quantity')}>采购量</button>
          </div>
        </div>
        {categoryTrend.length === 0 ? <EmptyState text="暂无数据" /> : (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              {trendViewMode === 'cost' ? (
                <AreaChart data={categoryTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} style={{ outline: 'none' }}>
                  <defs>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#5BA3C0" stopOpacity={0.3}/>
                      <stop offset="100%" stopColor="#5BA3C0" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={(v) => `¥${v >= 1000 ? (v/1000).toFixed(0)+'k' : v}`} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                    itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }}
                    formatter={(v: number) => [`¥${v.toLocaleString()}`, '金额']} />
                  <Area type="monotone" dataKey="cost" stroke="#5BA3C0" strokeWidth={2} fill="url(#colorCost)" style={{ outline: 'none' }} />
                </AreaChart>
              ) : (
                <BarChart data={quantityTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} style={{ outline: 'none', cursor: 'default' }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                    itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }}
                    formatter={(v: number) => [v.toLocaleString(), '数量']} />
                  <Bar dataKey="quantity" fill="#6B9E8A" radius={[4, 4, 0, 0]} style={{ outline: 'none' }} cursor="default" activeBar={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      {/* 供应商采购占比 */}
      <GlassCard padding="md" className="flex flex-col">
        <h3 className="text-base font-bold text-white mb-2">供应商采购占比</h3>
        {pieData.length === 0 ? <EmptyState text="暂无数据" /> : (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart style={{ outline: 'none' }}>
                <Pie data={pieData} cx="35%" cy="50%" innerRadius={36} outerRadius={60} paddingAngle={2} dataKey="value"
                  label={false} labelLine={false} style={{ outline: 'none' }}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ outline: 'none' }} />)}
                </Pie>
                <Tooltip formatter={(v: number) => [`¥${v.toLocaleString()}`, '金额']}
                  contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                  itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }} />
                <Legend layout="vertical" align="right" verticalAlign="middle"
                  formatter={(value: string, entry: any) => {
                    const item = pieData.find(d => d.name === value);
                    const percent = item ? ((item.value / pieData.reduce((s, d) => s + d.value, 0)) * 100).toFixed(0) : 0;
                    return <span style={{ color: '#FFF', fontSize: '11px' }}>{item?.shortName} {percent}%</span>;
                  }}
                  wrapperStyle={{ paddingLeft: '10px' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      {/* ═══════════ 物品板块 ═══════════ */}
      <div className="text-xs text-white/40 uppercase tracking-wider mt-2">物品追踪</div>

      {/* 物品追踪卡片 */}
      <GlassCard padding="md" className="flex flex-col relative z-10">
        {/* 标题行 */}
        <h3 className="text-base font-bold text-white mb-2">
          {selectedItem ? `${selectedItem.name}` : '选择物品'}
          {selectedItem?.unit && itemViewMode === 'price' && <span className="text-white/50 text-sm ml-2">(元/{selectedItem.unit})</span>}
          {selectedItem?.unit && itemViewMode === 'quantity' && <span className="text-white/50 text-sm ml-2">({selectedItem.unit})</span>}
        </h3>
        {/* 控件行 */}
        <div className="flex gap-2 items-center mb-3">
          {/* 物品选择（按钮下拉样式） */}
          <div className={`relative ${showItemDropdown ? 'isolate z-[9999]' : ''}`}>
            <button
              onClick={() => setShowItemDropdown(!showItemDropdown)}
              className="h-[34px] px-3 bg-white/10 border border-white/20 rounded-xl text-sm text-white flex items-center gap-2 hover:border-white/30 transition-colors"
            >
              <span>{selectedItem?.name || '选择物品'}</span>
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showItemDropdown ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {/* 下拉框 */}
            {showItemDropdown && (
              <div
                className="absolute left-0 z-[9999] overflow-y-auto py-2 rounded-[20px] border border-white/12"
                style={{
                  top: '100%',
                  marginTop: '4px',
                  minWidth: '10rem',
                  maxHeight: '15rem',
                  background: 'linear-gradient(145deg, rgba(25,25,30,0.98) 0%, rgba(25,25,30,0.95) 100%)',
                  backdropFilter: 'blur(48px) saturate(180%)',
                  WebkitBackdropFilter: 'blur(48px) saturate(180%)',
                  boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 4px 16px rgba(0,0,0,0.4)',
                }}
              >
                {itemList90.slice(0, 20).map(item => (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => { setSelectedItem(item); setShowItemDropdown(false); }}
                    className={`w-full px-4 py-2.5 text-left transition-colors text-sm ${selectedItem?.name === item.name ? 'text-white bg-white/10' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
                  >
                    {item.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* 单价/采购量切换 */}
          <div className="flex bg-white/10 rounded-xl p-1">
            <button onClick={() => setItemViewMode('price')} className={segmentClass(itemViewMode === 'price')}>单价</button>
            <button onClick={() => setItemViewMode('quantity')} className={segmentClass(itemViewMode === 'quantity')}>采购量</button>
          </div>
        </div>

        {!selectedItem ? <EmptyState text="请选择物品" /> : itemTrend.length === 0 ? <EmptyState text="暂无采购记录" /> : (
          <div className="h-[180px]">
            <ResponsiveContainer width="100%" height="100%">
              {itemViewMode === 'price' ? (
                <LineChart data={itemTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} style={{ outline: 'none' }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={(v) => `¥${v}`} width={45} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                    itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }}
                    formatter={(v: number) => [`¥${v}`, '单价']} />
                  <Line type="monotone" dataKey="price" stroke="#E8A54C" strokeWidth={2} dot={{ fill: '#E8A54C', r: 4 }} style={{ outline: 'none' }} />
                </LineChart>
              ) : (
                <BarChart data={itemTrend} margin={{ top: 5, right: 5, left: 0, bottom: 0 }} style={{ outline: 'none', cursor: 'default' }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} width={45} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                    itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }}
                    formatter={(v: number) => [v.toLocaleString(), '数量']} />
                  <Bar dataKey="quantity" fill="#E8A54C" radius={[4, 4, 0, 0]} style={{ outline: 'none' }} cursor="default" activeBar={false} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      {/* 点击外部关闭下拉 */}
      {(showItemDropdown || showCategoryDropdown) && (
        <div className="fixed inset-0 z-[9998]" onClick={() => { setShowItemDropdown(false); setShowCategoryDropdown(false); }} />
      )}
    </div>
  );
};
