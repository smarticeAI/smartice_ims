// v1.1 - 版本更新提示横幅，Storm Glass 毛玻璃风格
import React from 'react';
import { clsx } from 'clsx';

interface UpdateBannerProps {
  visible: boolean;
  onRefresh: () => void;
  onDismiss: () => void;
}

export const UpdateBanner: React.FC<UpdateBannerProps> = ({
  visible,
  onRefresh,
  onDismiss,
}) => {
  if (!visible) return null;

  return (
    <div
      className={clsx(
        'fixed top-0 left-0 right-0 z-50',
        'flex items-center justify-center gap-3 px-4 py-3',
        // Storm Glass 深色毛玻璃背景（85% 不透明度确保文字清晰）
        'bg-[rgba(25,25,30,0.85)] backdrop-blur-[40px] backdrop-saturate-[140%]',
        // 白色高光边框（底部）
        'border-b border-white/15',
        'text-white text-sm',
        // 玻璃阴影
        'shadow-[0_4px_24px_rgba(0,0,0,0.4),0_1px_3px_rgba(0,0,0,0.2)]',
        'animate-slide-down'
      )}
    >
      {/* 青色强调图标 */}
      <span className="flex items-center gap-2">
        <svg className="w-4 h-4 text-ios-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
        <span className="text-white/90">Jeremy发布了新版本！赶紧刷新！</span>
      </span>

      {/* 青色渐变刷新按钮 */}
      <button
        onClick={onRefresh}
        className={clsx(
          'px-4 py-1.5 rounded-full',
          'bg-gradient-to-r from-ios-blue/80 to-ios-blue/60',
          'hover:from-ios-blue hover:to-ios-blue/80',
          'border border-white/20',
          'text-white font-medium text-xs',
          'shadow-[0_2px_12px_rgba(91,163,192,0.3)]',
          'transition-all duration-200'
        )}
      >
        立即刷新
      </button>

      {/* 玻璃态关闭按钮 */}
      <button
        onClick={onDismiss}
        className={clsx(
          'p-1.5 rounded-full',
          'hover:bg-white/10',
          'border border-transparent hover:border-white/10',
          'transition-all duration-200'
        )}
        aria-label="关闭"
      >
        <svg className="w-4 h-4 text-white/60 hover:text-white/90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
};
