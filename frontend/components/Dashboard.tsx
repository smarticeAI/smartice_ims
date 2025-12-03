import React from 'react';
import { DailyLog } from '../types';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { GlassCard } from './ui';

interface DashboardProps {
  logs: DailyLog[];
}

export const Dashboard: React.FC<DashboardProps> = ({ logs }) => {
  const data = [...logs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const totalSpend = logs.reduce((acc, curr) => acc + curr.totalCost, 0);
  const totalItems = logs.reduce((acc, curr) => acc + curr.items.reduce((s, i) => s + i.quantity, 0), 0);
  const uniqueSuppliers = new Set(logs.map(l => l.supplier)).size;

  // Widget with 深色毛玻璃效果 - Cacao Night 风格
  // Responsive: use min-h with flex-1 to adapt to available space
  const Widget = ({ label, value }: { label: string, value: string }) => (
    <div className="glass-card min-h-[100px] p-4 flex flex-col justify-between relative overflow-hidden group flex-1">
      <span className="text-lg font-bold text-primary z-10">{label}</span>
      <p className="text-hero-number-xs z-10">{value}</p>
    </div>
  );

  // 按日期聚合采购金额
  const dailyTotals = new Map<string, number>();
  data.forEach(log => {
    const existing = dailyTotals.get(log.date) || 0;
    dailyTotals.set(log.date, existing + log.totalCost);
  });
  const chartData = Array.from(dailyTotals.entries())
    .map(([date, cost]) => ({ date, cost }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return (
    <div className="h-full flex flex-col gap-4 animate-slide-in pb-4 overflow-hidden">
      {/* Header - Bold clean typography with breathing room */}
      <div className="flex items-center justify-between pt-2 flex-shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-primary tracking-tight mb-1">今日概况</h2>
          <p className="text-sm text-secondary">实时数据监控</p>
        </div>
        <button className="btn-glass text-sm py-2.5 px-5">
          <span className="text-harbor-blue">近 30 天</span>
        </button>
      </div>

      {/* Stats Grid - 参考 UI风格A 布局 - Responsive heights */}
      <div className="grid grid-cols-2 gap-4 flex-shrink-0">
        {/* 主金额卡片 - 深色玻璃 - Responsive height */}
        <div className="col-span-2">
           <GlassCard padding="md" className="min-h-[120px] flex flex-col justify-between relative overflow-hidden group">
             {/* 微弱光晕 */}
             <div className="absolute -top-8 -right-8 w-32 h-32 rounded-full opacity-10 group-hover:opacity-15 transition-all duration-500 blur-3xl bg-white"></div>

             <span className="text-lg font-bold text-primary z-10">总采购额</span>
             <p className="text-hero-number z-10">
               ¥{totalSpend.toLocaleString()}
             </p>
           </GlassCard>
        </div>
        {/* 统计卡片 - 浅色玻璃 */}
        <Widget label="入库数量" value={totalItems.toLocaleString()} />
        <Widget label="供应商数" value={uniqueSuppliers.toString()} />
      </div>

      {/* Chart Card - 参考 UI风格A - Takes remaining space */}
      <GlassCard variant="elevated" padding="md" className="relative overflow-hidden flex-1 min-h-0 flex flex-col">
        {/* 微弱光晕 */}
        <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-white/5 blur-3xl"></div>

        <div className="flex items-center justify-between mb-2 flex-shrink-0">
          <h3 className="text-lg font-bold text-primary">支出趋势</h3>
        </div>
        <div className="flex-1 min-h-0 w-full relative z-10">
            <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <defs>
                {/* 中性白色渐变填充 */}
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#FFFFFF" stopOpacity={0.25}/>
                    <stop offset="50%" stopColor="#FFFFFF" stopOpacity={0.1}/>
                    <stop offset="100%" stopColor="#FFFFFF" stopOpacity={0}/>
                </linearGradient>
                {/* 白色线条渐变 */}
                <linearGradient id="strokeGradient" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="rgba(255,255,255,0.6)"/>
                    <stop offset="50%" stopColor="rgba(255,255,255,0.9)"/>
                    <stop offset="100%" stopColor="rgba(255,255,255,0.6)"/>
                </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  tickFormatter={(value) => {
                    const date = new Date(value);
                    return `${date.getMonth()+1}/${date.getDate()}`;
                  }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                  tickFormatter={(value) => `¥${value >= 1000 ? (value/1000).toFixed(0)+'k' : value}`}
                  width={35}
                />
                <Tooltip
                contentStyle={{
                  backgroundColor: 'rgba(25, 25, 30, 0.95)',
                  backdropFilter: 'blur(24px)',
                  border: '1px solid rgba(255, 255, 255, 0.15)',
                  borderRadius: '20px',
                  color: '#FFFFFF',
                  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
                  padding: '12px 16px',
                }}
                itemStyle={{ color: '#FFFFFF', fontWeight: 600 }}
                labelStyle={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '12px', marginBottom: '4px' }}
                cursor={{ stroke: 'rgba(255, 255, 255, 0.3)', strokeWidth: 2 }}
                />
                <Area
                    type="monotone"
                    dataKey="cost"
                    stroke="url(#strokeGradient)"
                    strokeWidth={2.5}
                    fillOpacity={1}
                    fill="url(#colorCost)"
                    dot={false}
                    activeDot={{
                      r: 6,
                      fill: "#FFFFFF",
                      stroke: "rgba(255,255,255,0.5)",
                      strokeWidth: 2,
                      filter: "drop-shadow(0 0 8px rgba(255, 255, 255, 0.4))"
                    }}
                />
            </AreaChart>
            </ResponsiveContainer>
        </div>
      </GlassCard>
    </div>
  );
};
