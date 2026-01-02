/**
 * Dashboard 仪表板组件
 * v4.0 - UI优化：时间筛选循环切换、品类可搜索、统计数字居中、图表标签中文化
 * v3.2 - 修复图表UI：饼图文字响应式、Tooltip白色字体、移除highlight边框、物品追踪改用折线图
 * v3.1 - 物品板块时间筛选独立，不影响大类板块
 * v3.0 - 大类板块受品类筛选，物品板块独立，可输入搜索，单价/采购量切换
 */
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { DailyLog } from '../types';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell
} from 'recharts';
import { GlassCard, AutocompleteInput, AutocompleteOption } from './ui';
import {
  getCategories, getCategoryTrend, getSupplierStats, getDashboardStats,
  getItemPriceTrend, getQuantityTrend, getItemNames,
  Category, SupplierStats, ItemPriceTrend, QuantityTrend, DailyTrend, DashboardStats, ItemInfo
} from '../services/dashboardService';

interface DashboardProps {
  logs: DailyLog[];
  restaurantId?: string;
}

const COLORS = ['#5BA3C0', '#6B9E8A', '#E8A54C', '#E85A4F', '#9B7EDE', '#4ECDC4'];
// 时间选项循环顺序：30天→90天→7天
const TIME_CYCLE = [30, 90, 7];

export const Dashboard: React.FC<DashboardProps> = ({ logs, restaurantId }) => {
  // 全局筛选
  const [days, setDays] = useState(30);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<number | undefined>();
  const [categorySearch, setCategorySearch] = useState('');

  // 大类板块数据
  const [stats, setStats] = useState<DashboardStats>({ totalSpend: 0, totalItems: 0, supplierCount: 0 });
  const [categoryTrend, setCategoryTrend] = useState<DailyTrend[]>([]);
  const [supplierStats, setSupplierStats] = useState<SupplierStats[]>([]);
  const [quantityTrend, setQuantityTrend] = useState<QuantityTrend[]>([]);

  // 物品板块数据（独立时间筛选）
  const [itemDays, setItemDays] = useState(30);
  const [itemList, setItemList] = useState<ItemInfo[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemInfo | null>(null);
  const [itemSearch, setItemSearch] = useState('');
  const [itemTrend, setItemTrend] = useState<ItemPriceTrend[]>([]);
  const [itemViewMode, setItemViewMode] = useState<'price' | 'quantity'>('price');
  const [showItemDropdown, setShowItemDropdown] = useState(false);

  // 加载品类列表
  useEffect(() => {
    getCategories().then(setCategories);
  }, []);

  // 加载物品列表（独立时间筛选）
  useEffect(() => {
    getItemNames(restaurantId, itemDays).then(items => {
      setItemList(items);
      if (items.length > 0 && !selectedItem) setSelectedItem(items[0]);
    });
  }, [restaurantId, itemDays]);

  // 大类板块数据加载（受品类筛选影响）
  useEffect(() => {
    const load = async () => {
      const [s, ct, ss, qt] = await Promise.all([
        getDashboardStats(restaurantId, selectedCategory, days),
        getCategoryTrend(restaurantId, selectedCategory, days),
        getSupplierStats(restaurantId, selectedCategory, days),
        getQuantityTrend(restaurantId, selectedCategory, days)
      ]);
      setStats(s);
      setCategoryTrend(ct);
      setSupplierStats(ss);
      setQuantityTrend(qt);
    };
    load();
  }, [restaurantId, selectedCategory, days]);

  // 物品趋势数据加载（独立时间筛选）
  useEffect(() => {
    if (selectedItem) {
      getItemPriceTrend(selectedItem.name, restaurantId, itemDays).then(setItemTrend);
    }
  }, [selectedItem, restaurantId, itemDays]);

  // 过滤物品列表
  const filteredItems = useMemo(() => {
    if (!itemSearch) return itemList.slice(0, 20);
    const search = itemSearch.toLowerCase();
    return itemList.filter(i => i.name.toLowerCase().includes(search)).slice(0, 20);
  }, [itemList, itemSearch]);

  // 供应商饼图数据（截取前4字符避免文字碰撞）
  const pieData = supplierStats.slice(0, 5).map(s => ({ name: s.supplier, shortName: s.supplier.slice(0, 4), value: s.total }));

  // 时间循环切换
  const cycleDays = useCallback(() => {
    const currentIndex = TIME_CYCLE.indexOf(days);
    const nextIndex = (currentIndex + 1) % TIME_CYCLE.length;
    setDays(TIME_CYCLE[nextIndex]);
  }, [days]);

  // 品类搜索函数
  const searchCategories = useCallback(async (query: string): Promise<AutocompleteOption[]> => {
    const q = query.toLowerCase();
    return categories
      .filter(c => c.name.toLowerCase().includes(q))
      .map(c => ({ id: c.id, label: c.name, value: c.name }));
  }, [categories]);

  // 品类选择回调
  const handleCategorySelect = useCallback((option: AutocompleteOption) => {
    setSelectedCategory(option.id as number);
    setCategorySearch(option.value);
  }, []);

  // 清空品类筛选
  const clearCategoryFilter = useCallback(() => {
    setSelectedCategory(undefined);
    setCategorySearch('');
  }, []);

  // 样式
  const segmentClass = (active: boolean) => `px-3 py-1.5 text-xs rounded-lg transition-all ${active ? 'bg-white/20 text-white' : 'text-white/60 hover:text-white'}`;

  // 空状态组件
  const EmptyState = ({ text }: { text: string }) => (
    <div className="flex-1 flex items-center justify-center text-white/40 text-sm">{text}</div>
  );

  // 格式化日期
  const formatDate = (v: string) => `${new Date(v).getMonth()+1}/${new Date(v).getDate()}`;

  // 格式化大数字（响应式友好）
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
          {/* 时间筛选 - 循环切换按钮 */}
          <button onClick={cycleDays} className="btn-glass text-sm py-2 px-4">
            <span className="text-white">{days}天</span>
          </button>
          {/* 品类筛选 - 可搜索输入 */}
          <div className="relative w-28">
            <AutocompleteInput
              value={categorySearch}
              onChange={setCategorySearch}
              placeholder="全部品类"
              searchFn={searchCategories}
              onSelect={handleCategorySelect}
              variant="inline"
              showDropdownButton
              minChars={0}
              inputClassName="text-sm text-white placeholder:text-white/60"
            />
            {selectedCategory && (
              <button onClick={clearCategoryFilter} className="absolute right-6 top-1/2 -translate-y-1/2 text-white/40 hover:text-white">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ═══════════ 大类板块 ═══════════ */}
      <div className="text-xs text-white/40 uppercase tracking-wider">大类统计</div>

      {/* Stats Grid - 数字居中 */}
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

      {/* 支出趋势 */}
      <GlassCard padding="md" className="min-h-[180px] flex flex-col">
        <h3 className="text-base font-bold text-white mb-2">
          支出趋势 {selectedCategory ? `(${categories.find(c => c.id === selectedCategory)?.name})` : ''}
        </h3>
        {categoryTrend.length === 0 ? <EmptyState text="暂无数据" /> : (
          <div className="flex-1 min-h-[130px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={categoryTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} style={{ outline: 'none' }}>
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
                  formatter={(v: number) => [`¥${v.toLocaleString()}`, '采购额']} />
                <Area type="monotone" dataKey="cost" name="采购额" stroke="#5BA3C0" strokeWidth={2} fill="url(#colorCost)" style={{ outline: 'none' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      {/* 供应商 + 采购量 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GlassCard padding="md" className="min-h-[200px] flex flex-col">
          <h3 className="text-base font-bold text-white mb-2">供应商采购占比</h3>
          {pieData.length === 0 ? <EmptyState text="暂无数据" /> : (
            <div className="flex-1 min-h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart style={{ outline: 'none' }}>
                  <Pie data={pieData} cx="35%" cy="50%" innerRadius={30} outerRadius={50} paddingAngle={2} dataKey="value"
                    label={false} labelLine={false} style={{ outline: 'none' }}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} style={{ outline: 'none' }} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `¥${v.toLocaleString()}`}
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

        <GlassCard padding="md" className="min-h-[200px] flex flex-col">
          <h3 className="text-base font-bold text-white mb-2">采购量趋势</h3>
          {quantityTrend.length === 0 ? <EmptyState text="暂无数据" /> : (
            <div className="flex-1 min-h-[150px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={quantityTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} style={{ outline: 'none' }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                    itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }}
                    formatter={(v: number) => [v.toLocaleString(), '采购量']} />
                  <Bar dataKey="quantity" name="采购量" fill="#6B9E8A" radius={[4, 4, 0, 0]} style={{ outline: 'none' }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </GlassCard>
      </div>

      {/* ═══════════ 物品板块 ═══════════ */}
      <div className="flex items-center justify-between mt-2">
        <div className="text-xs text-white/40 uppercase tracking-wider">物品追踪</div>
        <button onClick={() => {
          const idx = TIME_CYCLE.indexOf(itemDays);
          setItemDays(TIME_CYCLE[(idx + 1) % TIME_CYCLE.length]);
        }} className="btn-glass text-xs py-1.5 px-3">
          <span className="text-white">{itemDays}天</span>
        </button>
      </div>

      <GlassCard padding="md" className="min-h-[220px] flex flex-col">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="text-base font-bold text-white">
            {selectedItem ? `${selectedItem.name}` : '选择物品'}
            {selectedItem?.unit && itemViewMode === 'price' && <span className="text-white/50 text-sm ml-2">(元/{selectedItem.unit})</span>}
            {selectedItem?.unit && itemViewMode === 'quantity' && <span className="text-white/50 text-sm ml-2">({selectedItem.unit})</span>}
          </h3>
          <div className="flex gap-2 items-center">
            {/* 物品搜索 */}
            <div className="relative">
              <input
                type="text"
                value={itemSearch}
                onChange={(e) => { setItemSearch(e.target.value); setShowItemDropdown(true); }}
                onFocus={() => setShowItemDropdown(true)}
                placeholder="搜索物品..."
                className="bg-white/10 border border-white/20 rounded-xl px-3 py-1.5 text-sm text-white w-32 focus:outline-none focus:border-white/40"
              />
              {showItemDropdown && filteredItems.length > 0 && (
                <div className="absolute top-full left-0 mt-1 w-48 max-h-48 overflow-y-auto bg-[rgba(25,25,30,0.95)] border border-white/15 rounded-xl z-50 backdrop-blur-xl">
                  {filteredItems.map(item => (
                    <div key={item.name} onClick={() => { setSelectedItem(item); setItemSearch(''); setShowItemDropdown(false); }}
                      className="px-3 py-2 text-sm text-white hover:bg-white/10 cursor-pointer truncate">
                      {item.name} <span className="text-white/40">({item.unit})</span>
                    </div>
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
        </div>

        {!selectedItem ? <EmptyState text="请选择物品" /> : itemTrend.length === 0 ? <EmptyState text="暂无采购记录" /> : (
          <div className="flex-1 min-h-[150px]">
            <ResponsiveContainer width="100%" height="100%">
              {itemViewMode === 'price' ? (
                <LineChart data={itemTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} style={{ outline: 'none' }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis dataKey="price" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={(v) => `¥${v}`} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                    itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }}
                    formatter={(v: number) => [`¥${v}`, '单价']} />
                  <Line type="monotone" dataKey="price" name="单价" stroke="#E8A54C" strokeWidth={2} dot={{ fill: '#E8A54C', r: 4 }} style={{ outline: 'none' }} />
                </LineChart>
              ) : (
                <BarChart data={itemTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }} style={{ outline: 'none' }}>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} tickFormatter={formatDate} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }} width={35} />
                  <Tooltip contentStyle={{ backgroundColor: 'rgba(25,25,30,0.95)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px', color: '#FFF' }}
                    itemStyle={{ color: '#FFF' }} labelStyle={{ color: '#FFF' }}
                    formatter={(v: number) => [v.toLocaleString(), '采购量']} />
                  <Bar dataKey="quantity" name="采购量" fill="#E8A54C" radius={[4, 4, 0, 0]} style={{ outline: 'none' }} />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>
        )}
      </GlassCard>

      {/* 点击外部关闭下拉 */}
      {showItemDropdown && <div className="fixed inset-0 z-40" onClick={() => setShowItemDropdown(false)} />}
    </div>
  );
};
