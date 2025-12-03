/**
 * 侧边栏导航组件
 * v2.2 - 修复用户菜单按钮点击问题
 *
 * 变更：
 * - v2.2: 分离移动端/桌面端 ref，添加 z-index 和 stopPropagation 修复点击问题
 * - v2.1: 用户菜单添加"修改密码"选项
 * - v2.0: 用户信息区域可点击，显示登出菜单
 * - v1.0: 初始实现，Storm Glass 风格侧边栏
 */

import React, { useState, useRef, useEffect } from 'react';
import { AppView } from '../types';
import { Icons } from '../constants';
import { useAuth } from '../contexts/AuthContext';

interface SidebarProps {
  currentView: AppView;
  onChangeView: (view: AppView) => void;
  isOpen: boolean;
  toggleSidebar: () => void;
  onChangePassword?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onChangeView,
  isOpen,
  toggleSidebar,
  onChangePassword
}) => {
  const { user, logout } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const mobileUserMenuRef = useRef<HTMLDivElement>(null);
  const desktopUserMenuRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭菜单 - 检查移动端和桌面端两个ref
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideMobile = mobileUserMenuRef.current?.contains(target);
      const isInsideDesktop = desktopUserMenuRef.current?.contains(target);
      if (!isInsideMobile && !isInsideDesktop) {
        setShowUserMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLogout = () => {
    setShowUserMenu(false);
    logout();
  };

  const handleChangePassword = () => {
    setShowUserMenu(false);
    toggleSidebar(); // 关闭移动端侧边栏
    onChangePassword?.();
  };

  const navItems = [
    { id: AppView.DASHBOARD, label: '工作台', icon: Icons.ChartBar },
    { id: AppView.NEW_ENTRY, label: '开始录入', icon: Icons.PlusCircle },
    { id: AppView.HISTORY, label: '历史记录', icon: Icons.Clock },
  ];

  // 获取用户名首字母缩写
  const getInitials = (name: string) => {
    const parts = name.split(' ').filter(p => p);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const userInitials = user ? getInitials(user.name) : 'U';
  const userName = user?.name || '用户';
  const storeName = user?.store_name || '未分配门店';

  // 用户菜单组件（复用于移动端和桌面端）
  // v2.2 - 添加 z-index 和 stopPropagation 修复点击问题
  const UserMenu = () => (
    <div
      className="absolute bottom-full left-0 right-0 mb-2 rounded-glass-lg overflow-hidden z-[100]"
      style={{
        background: 'rgba(25,25,30,0.95)',
        backdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.15)'
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleChangePassword();
        }}
        className="w-full flex items-center gap-3 px-4 py-3 text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
      >
        <Icons.Key className="w-5 h-5" />
        <span className="text-sm font-medium">修改密码</span>
      </button>
      <div className="border-t border-white/10" />
      <button
        onClick={(e) => {
          e.stopPropagation();
          handleLogout();
        }}
        className="w-full flex items-center gap-3 px-4 py-3 text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
      >
        <Icons.Logout className="w-5 h-5" />
        <span className="text-sm font-medium">退出登录</span>
      </button>
    </div>
  );

  return (
    <>
      {/* Mobile Slide-over Overlay - Storm Glass */}
      <div
        className={`fixed inset-0 z-50 md:hidden
        ${isOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}
      >
        <div
          className={`absolute inset-0 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
          style={{
            backgroundColor: 'rgba(0,0,0,0.3)',
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            transition: 'opacity 200ms ease-out',
          }}
          onClick={toggleSidebar}
        ></div>
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
           <div className="mt-auto mb-6 px-2 relative" ref={mobileUserMenuRef}>
             <div
               className="flex items-center gap-3 p-3 rounded-glass-xl cursor-pointer transition-all hover:bg-white/10"
               onClick={() => setShowUserMenu(!showUserMenu)}
               style={{
                 background: 'rgba(255,255,255,0.08)',
                 border: '1px solid rgba(255,255,255,0.1)'
               }}>
               <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                    style={{ background: 'linear-gradient(135deg, rgba(91,163,192,0.4) 0%, rgba(91,163,192,0.2) 100%)' }}>{userInitials}</div>
               <div className="flex-1">
                 <div className="text-sm font-semibold text-white">{userName}</div>
                 <div className="text-xs text-white/60">{storeName}</div>
               </div>
               <Icons.ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
             </div>

             {/* User Menu - Mobile */}
             {showUserMenu && <UserMenu />}
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

        {/* User Profile - Bottom (Desktop) */}
        <div className="mt-auto mb-10 px-2 relative" ref={desktopUserMenuRef}>
          <div
            className="flex items-center gap-4 p-3 rounded-glass-xl cursor-pointer transition-all hover:bg-white/10"
            onClick={() => setShowUserMenu(!showUserMenu)}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}>
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white"
                 style={{ background: 'linear-gradient(135deg, rgba(91,163,192,0.4) 0%, rgba(91,163,192,0.2) 100%)' }}>{userInitials}</div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">{userName}</div>
              <div className="text-xs text-white/60">{storeName}</div>
            </div>
            <Icons.ChevronDown className={`w-4 h-4 text-white/60 transition-transform ${showUserMenu ? 'rotate-180' : ''}`} />
          </div>

          {/* User Menu - Desktop */}
          {showUserMenu && <UserMenu />}
        </div>
      </div>
    </>
  );
};
