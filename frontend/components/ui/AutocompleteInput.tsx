/**
 * 自动完成输入框组件
 * 支持汉字 + 拼音首字母搜索，毛玻璃风格下拉列表
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import clsx from 'clsx';

/**
 * 自动完成选项类型
 */
export interface AutocompleteOption {
  id: string | number;
  label: string;
  value: string;
  sublabel?: string;
}

/**
 * AutocompleteInput 组件 Props
 */
export interface AutocompleteInputProps {
  /** 输入框标签（仅 default 变体显示） */
  label?: string;
  /** 当前值（受控） */
  value: string;
  /** 值变化回调 */
  onChange: (value: string) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 搜索函数 */
  searchFn: (query: string) => Promise<AutocompleteOption[]>;
  /** 防抖延迟（毫秒），默认 300 */
  debounceMs?: number;
  /** 触发搜索的最小字符数，默认 1 */
  minChars?: number;
  /** 选中选项时的回调 */
  onSelect?: (option: AutocompleteOption) => void;
  /** 样式变体：default（带 label）或 inline（紧凑） */
  variant?: 'default' | 'inline';
  /** 容器额外类名 */
  className?: string;
  /** 输入框额外类名 */
  inputClassName?: string;
  /** 禁用状态 */
  disabled?: boolean;
  /** 错误信息 */
  error?: string;
}

export const AutocompleteInput: React.FC<AutocompleteInputProps> = ({
  label,
  value,
  onChange,
  placeholder,
  searchFn,
  debounceMs = 300,
  minChars = 1,
  onSelect,
  variant = 'default',
  className,
  inputClassName,
  disabled = false,
  error,
}) => {
  // 内部状态
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();

  // 防抖搜索
  const handleInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      onChange(newValue);

      // 清除之前的延迟
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      // 字符数不足
      if (newValue.length < minChars) {
        setOptions([]);
        setIsOpen(false);
        return;
      }

      // 延迟搜索
      debounceRef.current = setTimeout(async () => {
        setIsLoading(true);
        try {
          const results = await searchFn(newValue);
          setOptions(results);
          setIsOpen(results.length > 0);
          setHighlightedIndex(-1);
        } catch (error) {
          console.error('搜索失败:', error);
          setOptions([]);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    },
    [onChange, searchFn, debounceMs, minChars]
  );

  // 选择选项
  const selectOption = useCallback(
    (option: AutocompleteOption) => {
      onChange(option.value);
      onSelect?.(option);
      setIsOpen(false);
      setHighlightedIndex(-1);
      inputRef.current?.focus();
    },
    [onChange, onSelect]
  );

  // 键盘导航
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!isOpen) {
        // 下拉框关闭时，按下键打开（如果有缓存选项）
        if (e.key === 'ArrowDown' && options.length > 0) {
          setIsOpen(true);
          setHighlightedIndex(0);
          e.preventDefault();
        }
        return;
      }

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex((prev) =>
            prev < options.length - 1 ? prev + 1 : prev
          );
          break;

        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : 0));
          break;

        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && highlightedIndex < options.length) {
            selectOption(options[highlightedIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          setIsOpen(false);
          setHighlightedIndex(-1);
          break;

        case 'Tab':
          setIsOpen(false);
          // 不阻止默认行为，允许焦点移动
          break;
      }
    },
    [isOpen, options, highlightedIndex, selectOption]
  );

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 清理防抖计时器
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  // 聚焦时显示缓存选项
  const handleFocus = useCallback(() => {
    if (value.length >= minChars && options.length > 0) {
      setIsOpen(true);
    }
  }, [value, minChars, options.length]);

  return (
    <div ref={containerRef} className={clsx('relative w-full', className)}>
      {/* 标签（仅 default 变体） */}
      {label && variant === 'default' && (
        <label className="block text-[20px] tracking-wider text-zinc-500 font-bold mb-2 ml-1">
          {label}
        </label>
      )}

      {/* 输入框容器 */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          placeholder={placeholder}
          disabled={disabled}
          className={clsx(
            variant === 'default'
              ? 'glass-input w-full pr-10'
              : 'flex-1 bg-transparent outline-none',
            error && 'border-ios-red',
            inputClassName
          )}
        />

        {/* 加载指示器（仅 default 变体） */}
        {isLoading && variant === 'default' && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* 下拉列表 */}
      {isOpen && (
        <div
          className={clsx(
            'absolute z-50 w-full mt-2',
            'max-h-60 overflow-y-auto',
            'py-2',
            'rounded-[28px]',
            'border border-white/12'
          )}
          style={{
            background:
              'linear-gradient(145deg, rgba(25,25,30,0.85) 0%, rgba(25,25,30,0.75) 100%)',
            backdropFilter: 'blur(48px) saturate(180%)',
            WebkitBackdropFilter: 'blur(48px) saturate(180%)',
            boxShadow:
              '0 8px 40px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3)',
          }}
        >
          {options.length === 0 ? (
            <div className="px-4 py-3 text-sm text-white/50 text-center">
              无匹配结果
            </div>
          ) : (
            options.map((option, index) => (
              <button
                key={option.id}
                type="button"
                onClick={() => selectOption(option)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={clsx(
                  'w-full px-4 py-3 text-left transition-colors',
                  'flex flex-col gap-0.5',
                  index === highlightedIndex
                    ? 'bg-white/10 text-white'
                    : 'text-white/70 hover:bg-white/5 hover:text-white'
                )}
              >
                <span className="text-sm font-medium">{option.label}</span>
                {option.sublabel && (
                  <span className="text-xs text-white/50">{option.sublabel}</span>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* 错误信息 */}
      {error && <p className="text-ios-red text-xs mt-1 ml-1">{error}</p>}
    </div>
  );
};

export default AutocompleteInput;
