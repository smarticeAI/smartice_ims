/**
 * GlassCard - 毛玻璃卡片组件
 * v1.2 - 添加 style 支持（用于动态 z-index）
 */
import { clsx } from 'clsx';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
  padding?: 'none' | 'sm' | 'md' | 'lg';
  variant?: 'default' | 'elevated' | 'subtle';
  interactive?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
}

const paddingMap = {
  none: '',
  sm: 'p-3',
  md: 'p-5',
  lg: 'p-6',
};

const variantMap = {
  default: 'glass-card',
  elevated: 'glass-card-elevated',
  subtle: 'glass-card-subtle',
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className,
  padding = 'md',
  variant = 'default',
  interactive = false,
  onClick,
  style,
}) => {
  return (
    <div
      className={clsx(
        variantMap[variant],
        paddingMap[padding],
        (interactive || onClick) && 'cursor-pointer active:scale-[0.98]',
        className
      )}
      onClick={onClick}
      style={style}
    >
      {children}
    </div>
  );
};
