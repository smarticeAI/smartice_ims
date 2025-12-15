// v4.3.0 - 添加版本检测，每 10 分钟轮询检查新版本并提示用户刷新
// v4.2.0 - PreloadData 改为登录后加载，不再启动时加载
// v4.1.0 - 添加 userNickname 支持，用于更亲切的问候语
// v4.0.1 - 修复预加载无限循环，改为后台静默加载不阻塞UI
// v4.0.0 - 添加上传队列历史记录页面（显示队列状态、支持失败重试）
// v3.5.0 - 集成 PreloadDataContext，实现下拉框数据预加载
// v3.4.0 - 添加修改密码页面
// v3.3.0 - 仪表板数据从数据库获取
// v3.2.0 - EntryForm 欢迎页传递菜单回调
// v3.1.0 - 添加登录页面路由
import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { EntryForm } from './components/EntryForm';
import { LoginPage } from './components/LoginPage';
import { ChangePasswordPage } from './components/ChangePasswordPage';
import { QueueHistoryPage } from './components/QueueHistoryPage';
import { UpdateBanner } from './components/ui/UpdateBanner';
import { DailyLog, AppView } from './types';
import { Icons } from './constants';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { PreloadDataProvider, usePreloadData } from './contexts/PreloadDataContext';
import { getPurchaseLogs } from './services/dashboardService';
import { startVersionCheck, stopVersionCheck } from './services/versionService';

// 主应用内容（需要在 AuthProvider 内部使用）
const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading } = useAuth();
  // 预加载在后台静默进行，不阻塞 UI
  const { error: preloadError } = usePreloadData();
  const [currentView, setCurrentView] = useState<AppView>(AppView.DASHBOARD);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // 版本更新提示状态
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);

  // 从数据库加载采购记录
  useEffect(() => {
    async function loadLogs() {
      if (!isAuthenticated) return;

      setLogsLoading(true);
      try {
        console.log(`[Dashboard] 当前用户 restaurant_id: ${user?.restaurant_id}`);
        const data = await getPurchaseLogs(user?.restaurant_id || undefined, 30);
        setLogs(data);
        console.log(`[Dashboard] 加载了 ${data.length} 条采购记录 (餐厅过滤: ${user?.restaurant_id ? '是' : '否'})`);
      } catch (err) {
        console.error('[Dashboard] 加载采购记录失败:', err);
      } finally {
        setLogsLoading(false);
      }
    }

    loadLogs();
  }, [isAuthenticated, user?.restaurant_id]);

  // 版本检测：每 10 分钟检查一次新版本
  useEffect(() => {
    startVersionCheck((hasUpdate) => {
      if (hasUpdate) {
        setShowUpdateBanner(true);
      }
    });

    return () => {
      stopVersionCheck();
    };
  }, []);

  // 从认证上下文获取用户名和昵称
  const CURRENT_USER_NAME = user?.name || "用户";
  const CURRENT_USER_NICKNAME = user?.nickname || user?.name || "用户";

  // 仅认证加载时显示 loading（预加载在后台静默进行）
  if (isLoading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 border-4 border-white/20 border-t-white rounded-full animate-spin" />
          <div className="text-white text-xl">加载中...</div>
        </div>
      </div>
    );
  }

  // 预加载错误仅记录日志，不阻塞 UI
  if (preloadError) {
    console.warn('[App] 数据预加载失败（后台静默），下拉框将按需加载:', preloadError);
  }

  // 未登录显示登录页面
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // 刷新采购记录
  const refreshLogs = async () => {
    setLogsLoading(true);
    try {
      const data = await getPurchaseLogs(user?.restaurant_id || undefined, 30);
      setLogs(data);
    } catch (err) {
      console.error('[Dashboard] 刷新采购记录失败:', err);
    } finally {
      setLogsLoading(false);
    }
  };

  const handleSaveEntry = async (logData: Omit<DailyLog, 'id'>) => {
    // 数据已通过 EntryForm -> inventoryService 提交到数据库
    // 这里刷新数据并返回仪表板
    await refreshLogs();
    setCurrentView(AppView.DASHBOARD);
  };

  // 已登录显示主应用
  return (
    <div className="fixed inset-0 flex text-primary font-sans overflow-hidden">
      {/* 版本更新提示横幅 */}
      <UpdateBanner
        visible={showUpdateBanner}
        onRefresh={() => window.location.reload()}
        onDismiss={() => setShowUpdateBanner(false)}
      />

      <Sidebar
        currentView={currentView}
        onChangeView={setCurrentView}
        isOpen={sidebarOpen}
        toggleSidebar={() => setSidebarOpen(!sidebarOpen)}
        onChangePassword={() => setCurrentView(AppView.CHANGE_PASSWORD)}
      />

      <div className="flex-1 flex flex-col h-full relative w-full">
        {/* Mobile Header Button - Storm Glass */}
        {currentView !== AppView.NEW_ENTRY && currentView !== AppView.CHANGE_PASSWORD && (
          <div className="md:hidden pt-6 px-4 pb-2 flex items-center justify-between">
             <span className="text-xl font-bold text-white">门店管家</span>
             <button onClick={() => setSidebarOpen(true)} className="p-2 text-white/70 hover:text-white">
               <Icons.Menu className="w-6 h-6" />
             </button>
          </div>
        )}

        <main className={`flex-1 ${currentView === AppView.DASHBOARD ? 'overflow-hidden' : 'overflow-y-auto'} ${currentView === AppView.NEW_ENTRY || currentView === AppView.CHANGE_PASSWORD || currentView === AppView.HISTORY ? 'p-0' : 'p-4 md:p-8'} max-w-5xl mx-auto w-full`}>
            {currentView === AppView.DASHBOARD && (
              logsLoading ? (
                <div className="h-full flex items-center justify-center">
                  <div className="text-white/70">加载数据中...</div>
                </div>
              ) : (
                <Dashboard logs={logs} />
              )
            )}
            {currentView === AppView.NEW_ENTRY && <EntryForm onSave={handleSaveEntry} userName={CURRENT_USER_NAME} userNickname={CURRENT_USER_NICKNAME} onOpenMenu={() => setSidebarOpen(true)} />}
            {currentView === AppView.HISTORY && <QueueHistoryPage onBack={() => setCurrentView(AppView.DASHBOARD)} />}
            {currentView === AppView.CHANGE_PASSWORD && <ChangePasswordPage onBack={() => setCurrentView(AppView.DASHBOARD)} />}
        </main>
      </div>
    </div>
  );
};

// 根组件：提供 AuthProvider + PreloadDataProvider
const App: React.FC = () => {
  return (
    <AuthProvider>
      <PreloadDataProvider>
        <AppContent />
      </PreloadDataProvider>
    </AuthProvider>
  );
};

export default App;
