import React from 'react';
import { AppView } from '../types';
import { Icons } from '../constants';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentView, onChangeView, isOpen, toggleSidebar }) => {
  const navItems = [
    { id: AppView.DASHBOARD, label: '工作台', icon: Icons.ChartBar },
    { id: AppView.NEW_ENTRY, label: '开始录入', icon: Icons.PlusCircle },
    { id: AppView.HISTORY, label: '历史记录', icon: Icons.Clock },
    // 设计助手已移除 - 前后端分离重构
  ];

  return (
    <>
      {/* Mobile Slide-over Overlay - Storm Glass */}
      <div
        className={`fixed inset-0 z-50 transition-all duration-300 md:hidden
        ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      >
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={toggleSidebar}></div>
        <div
          className={`absolute top-0 bottom-0 left-0 w-64 transform transition-transform duration-300 flex flex-col p-4 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
          style={{
            background: 'linear-gradient(180deg, rgba(30,35,40,0.25) 0%, rgba(35,40,50,0.15) 100%)',
            backdropFilter: 'blur(24px) saturate(140%)',
            WebkitBackdropFilter: 'blur(24px) saturate(140%)',
            borderRight: '1px solid rgba(255,255,255,0.18)',
            borderTop: '1px solid rgba(255,255,255,0.15)'
          }}
        >
           <h1 className="text-2xl font-bold mb-8 px-4 mt-8 text-white">门店管家</h1>
           <nav className="space-y-1">
             {navItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => { onChangeView(item.id); toggleSidebar(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-glass-lg transition-all"
                  style={{
                    background: currentView === item.id ? 'rgba(255,255,255,0.12)' : 'transparent',
                    color: currentView === item.id ? '#FFFFFF' : 'rgba(255,255,255,0.7)',
                    border: currentView === item.id ? '1px solid rgba(255,255,255,0.15)' : '1px solid transparent'
                  }}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.label}</span>
                </button>
             ))}
           </nav>

           {/* User Profile - Mobile */}
           <div className="mt-auto mb-6 px-2">
             <div className="flex items-center gap-3 p-3 rounded-glass-xl cursor-pointer transition-all hover:bg-white/10"
                  style={{
                    background: 'rgba(255,255,255,0.08)',
                    border: '1px solid rgba(255,255,255,0.1)'
                  }}>
               <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, rgba(91,163,192,0.4) 0%, rgba(91,163,192,0.2) 100%)' }}>JD</div>
               <div>
                 <div className="text-sm font-semibold text-white">店长</div>
                 <div className="text-xs text-white/60">德阳店</div>
               </div>
             </div>
           </div>
        </div>
      </div>

      {/* Desktop Sidebar (iPad style) - Storm Glass Transparent */}
      <div className="hidden md:flex flex-col w-72 h-full pt-10 px-5"
           style={{
             background: 'linear-gradient(180deg, rgba(30,35,40,0.2) 0%, rgba(35,40,50,0.12) 100%)',
             backdropFilter: 'blur(24px) saturate(140%)',
             WebkitBackdropFilter: 'blur(24px) saturate(140%)',
             borderRight: '1px solid rgba(255,255,255,0.15)',
             borderTop: '1px solid rgba(255,255,255,0.12)'
           }}>
        {/* Logo Area - Storm Glass typography */}
        <h1 className="text-xl font-bold mb-10 px-3 flex items-center gap-3">
           <div className="w-8 h-8 rounded-glass-md flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, rgba(91,163,192,0.3) 0%, rgba(91,163,192,0.15) 100%)',
                  boxShadow: '0 4px 20px rgba(91, 163, 192, 0.3)'
                }}>
             <div className="w-3.5 h-3.5 bg-white rounded-full"></div>
           </div>
           <span className="text-white">门店管家</span>
        </h1>

        {/* Navigation - Storm Glass style */}
        <nav className="space-y-2">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => onChangeView(item.id)}
              className={`
                w-full group flex items-center gap-4 px-4 py-3.5 rounded-glass-xl transition-all duration-200
                ${currentView === item.id
                  ? 'text-white border border-white/15'
                  : 'text-white/70 hover:text-white hover:bg-white/5'}
              `}
              style={currentView === item.id ? { background: 'rgba(255,255,255,0.1)' } : {}}
            >
              <item.icon className={`w-5 h-5 transition-colors ${currentView === item.id ? 'text-white' : ''}`} />
              <span className="font-semibold">{item.label}</span>
            </button>
          ))}
        </nav>

        {/* User Profile - Bottom */}
        <div className="mt-auto mb-10 px-2">
          <div className="flex items-center gap-4 p-3 rounded-glass-xl cursor-pointer transition-all hover:bg-white/10"
               style={{
                 background: 'rgba(255,255,255,0.08)',
                 border: '1px solid rgba(255,255,255,0.1)'
               }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                 style={{ background: 'linear-gradient(135deg, rgba(91,163,192,0.4) 0%, rgba(91,163,192,0.2) 100%)' }}>JD</div>
            <div>
              <div className="text-sm font-semibold text-white">店长</div>
              <div className="text-xs text-white/60">德阳店</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
