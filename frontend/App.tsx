
import React, { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { EntryForm } from './components/EntryForm';
// 设计助手已移除 - 前后端分离重构
// import { DesignAssistant } from './components/DesignAssistant';
import { DailyLog, AppView } from './types';
import { Icons } from './constants';

const INITIAL_DATA: DailyLog[] = [
  { 
    id: '1', 
    date: new Date(Date.now() - 86400000 * 6).toISOString(), 
    category: 'Meat', 
    supplier: '双汇肉业', 
    items: [
      { name: '五花肉', specification: '精选带皮', quantity: 80, unit: '斤', unitPrice: 12.5, total: 1000 },
      { name: '排骨', specification: '肋排', quantity: 40, unit: '斤', unitPrice: 22, total: 880 }
    ],
    totalCost: 1880,
    notes: '排骨质量不错',
    status: 'Stocked'
  },
  { 
    id: '2', 
    date: new Date(Date.now() - 86400000 * 5).toISOString(), 
    category: 'Vegetables', 
    supplier: '城南蔬菜批发', 
    items: [
      { name: '青椒', specification: '薄皮', quantity: 20, unit: '斤', unitPrice: 4.5, total: 90 },
      { name: '土豆', specification: '大个', quantity: 100, unit: '斤', unitPrice: 1.2, total: 120 }
    ],
    totalCost: 210,
    notes: '',
    status: 'Stocked'
  },
  { 
    id: '3', 
    date: new Date(Date.now() - 86400000 * 4).toISOString(), 
    category: 'Dry Goods',
    supplier: '麦德龙批发中心', 
    items: [
      { name: '面粉', specification: '25kg/袋', quantity: 10, unit: '袋', unitPrice: 95, total: 950 },
      { name: '食用油', specification: '20L/桶', quantity: 5, unit: '桶', unitPrice: 220, total: 1100 }
    ],
    totalCost: 2050,
    notes: '粮油储备补货',
    status: 'Stocked'
  },
  { 
    id: '4', 
    date: new Date(Date.now() - 86400000 * 3).toISOString(), 
    category: 'Alcohol',
    supplier: '雪花啤酒直供', 
    items: [
      { name: '雪花勇闯', specification: '12瓶/箱', quantity: 50, unit: '箱', unitPrice: 38, total: 1900 }
    ],
    totalCost: 1900,
    notes: '周末备货',
    status: 'Stocked'
  },
  { 
    id: '5', 
    date: new Date(Date.now() - 86400000 * 2).toISOString(), 
    category: 'Meat', 
    supplier: '刘记牛羊肉', 
    items: [
      { name: '牛肉卷', specification: '肥牛', quantity: 30, unit: '斤', unitPrice: 35, total: 1050 }
    ],
    totalCost: 1050,
    notes: '',
    status: 'Stocked'
  },
  { 
    id: '6', 
    date: new Date(Date.now() - 86400000 * 1).toISOString(), 
    category: 'Vegetables', 
    supplier: '每日鲜配送', 
    items: [
      { name: '生菜', specification: '新鲜', quantity: 15, unit: '斤', unitPrice: 3.5, total: 52.5 },
      { name: '番茄', specification: '普罗旺斯', quantity: 20, unit: '斤', unitPrice: 5.5, total: 110 }
    ],
    totalCost: 162.5,
    notes: '叶菜需注意保鲜',
    status: 'Stocked'
  }
];

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [logs, setLogs] = useState<DailyLog[]>(INITIAL_DATA);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Mock user data - in a real app this would come from an auth context
  const CURRENT_USER_NAME = "辉哥";

  const handleSaveEntry = (logData: Omit<DailyLog, 'id'>) => {
    const newLog: DailyLog = {
      ...logData,
      id: Math.random().toString(36).substr(2, 9),
    };
    setLogs(prev => [...prev, newLog]);
    setCurrentView(AppView.DASHBOARD);
  };

  const getCategoryLabel = (id: string) => {
     switch(id) {
       case 'Meat': return '肉类';
       case 'Vegetables': return '蔬果';
       case 'Dry Goods': return '干杂';
       case 'Alcohol': return '酒水';
       case 'Consumables': return '低耗';
       default: return '其他';
     }
  };

  const HistoryView = () => (
    <div className="space-y-4 animate-slide-in pb-20">
      <h1 className="text-3xl font-bold text-primary mb-6">历史记录</h1>
      {[...logs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).map((log, idx) => (
        <div key={log.id} className="glass-card p-4 flex justify-between items-center active:opacity-90 transition-colors cursor-pointer">
          <div className="flex items-center gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white ${log.category === 'Meat' ? 'bg-stamp-red' : log.category === 'Vegetables' ? 'bg-faded-steel' : 'bg-harbor-blue'}`}>
               <span className="text-xs font-bold">{getCategoryLabel(log.category).substring(0,2)}</span>
            </div>
            <div>
              <h3 className="text-primary font-medium">{log.supplier}</h3>
              <p className="text-sm text-secondary">{new Date(log.date).toLocaleDateString('zh-CN')}</p>
            </div>
          </div>
          <div className="text-right">
              <p className="text-harbor-blue font-bold">¥{log.totalCost.toFixed(2)}</p>
              <p className="text-xs text-muted">{log.items.length} 物品</p>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 flex text-primary font-sans overflow-hidden">
      <Sidebar
        currentView={currentView}
        onChangeView={setCurrentView}
        isOpen={sidebarOpen}
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
      />

      <div className="flex-1 flex flex-col h-full relative w-full">
        {/* Mobile Header Button - Storm Glass */}
        {currentView !== AppView.NEW_ENTRY && (
          <div className="md:hidden pt-6 px-4 pb-2 flex items-center justify-between">
             <span className="text-xl font-bold text-white">门店管家</span>
             <button onClick={() => setSidebarOpen(true)} className="p-2 text-white/70 hover:text-white">
               <Icons.Menu className="w-6 h-6" />
             </button>
          </div>
        )}

        <main className={`flex-1 ${currentView === AppView.DASHBOARD ? 'overflow-hidden' : 'overflow-y-auto'} ${currentView === AppView.NEW_ENTRY ? 'p-0' : 'p-4 md:p-8'} max-w-5xl mx-auto w-full`}>
            {currentView === AppView.DASHBOARD && <Dashboard logs={logs} />}
            {currentView === AppView.NEW_ENTRY && <EntryForm onSave={handleSaveEntry} userName={CURRENT_USER_NAME} />}
            {currentView === AppView.HISTORY && <HistoryView />}
        </main>
      </div>
    </div>
  );
};

export default App;
