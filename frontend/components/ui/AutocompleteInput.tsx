/**
 * 自动完成输入框组件
 * v3.3 - 新增 strictSelection 严格选择模式，强制用户只能从列表选择
 *
 * 变更历史：
 * - v3.3: 新增 strictSelection 属性，启用时用户只能从下拉列表选择值
 * - v3.2: inline 变体输入框容器添加边框样式（bg-cacao-husk/60 + 棕色边框）
 * - v3.1: 使用 createPortal 将下拉框渲染到 body，避免被 GlassCard 遮挡
 * - v3.0: 新增 showDropdownButton 倒三角按钮，点击可展开下拉列表
 * - v2.0: 新增 extraOptions 支持静态选项
 * - v1.0: 支持汉字 + 拼音首字母搜索，毛玻璃风格下拉列表
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  /** v2.0: 额外的静态选项（如"其他"），始终显示在搜索结果末尾 */
  extraOptions?: AutocompleteOption[];
  /** v3.0: 显示倒三角下拉按钮 */
  showDropdownButton?: boolean;
  /** v3.0: 获取全部选项的函数（用于下拉按钮点击） */
  getAllOptionsFn?: () => Promise<AutocompleteOption[]>;
  /** v3.3: 严格选择模式 - 只能从下拉列表选择，不允许自由输入 */
  strictSelection?: boolean;
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
  extraOptions = [],
  showDropdownButton = false,
  getAllOptionsFn,
  strictSelection = false,
}) => {
  // 内部状态
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<AutocompleteOption[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  // v3.1: 下拉框位置（用于 Portal 定位）
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  // v3.3: 严格模式下，记录最后一次有效选择的值
  const [lastValidValue, setLastValidValue] = useState(value);
  // v3.3: 追踪是否通过选择方式设置了值
  const isValueFromSelection = useRef(false);

  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout>();
  // v3.1: 下拉框 ref（用于 Portal 点击外部检测）
  const dropdownRef = useRef<HTMLDivElement>(null);

  // v3.1: 更新下拉框位置
  const updateDropdownPosition = useCallback(() => {
    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // 8px gap
        left: rect.left,
        width: rect.width,
      });
    }
  }, []);

  // v3.1: 当下拉框打开时，更新位置并监听滚动/调整大小
  useEffect(() => {
    if (isOpen) {
      updateDropdownPosition();

      // 监听滚动和窗口调整
      const handleScrollOrResize = () => updateDropdownPosition();
      window.addEventListener('scroll', handleScrollOrResize, true);
      window.addEventListener('resize', handleScrollOrResize);

      return () => {
        window.removeEventListener('scroll', handleScrollOrResize, true);
        window.removeEventListener('resize', handleScrollOrResize);
      };
    }
  }, [isOpen, updateDropdownPosition]);

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
          // v2.0: 将搜索结果和 extraOptions 合并
          const combinedOptions = [...results, ...extraOptions];
          setOptions(combinedOptions);
          setIsOpen(combinedOptions.length > 0);
          setHighlightedIndex(-1);
        } catch (error) {
          console.error('搜索失败:', error);
          setOptions([]);
        } finally {
          setIsLoading(false);
        }
      }, debounceMs);
    },
    [onChange, searchFn, debounceMs, minChars, extraOptions]
  );

  // 选择选项
  const selectOption = useCallback(
    (option: AutocompleteOption) => {
      // v3.3: 标记值来自选择
      isValueFromSelection.current = true;
      onChange(option.value);
      onSelect?.(option);
      // v3.3: 更新最后有效值
      setLastValidValue(option.value);
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
  // v3.1: 增加 dropdownRef 检测，避免点击 Portal 渲染的下拉框时关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isInsideContainer = containerRef.current?.contains(target);
      const isInsideDropdown = dropdownRef.current?.contains(target);

      if (!isInsideContainer && !isInsideDropdown) {
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

  // v3.3: 当外部通过 props 清空 value 时（如点击清除按钮），同步更新 lastValidValue
  useEffect(() => {
    if (value === '' && lastValidValue !== '') {
      setLastValidValue('');
    }
  }, [value, lastValidValue]);

  // 聚焦时显示缓存选项
  const handleFocus = useCallback(() => {
    // v3.3: 聚焦时重置选择标记
    isValueFromSelection.current = false;
    if (value.length >= minChars && options.length > 0) {
      setIsOpen(true);
    }
  }, [value, minChars, options.length]);

  // v3.3: 失去焦点时，如果是严格模式且值不是通过选择获得的，恢复到最后有效值
  // 使用延迟执行避免与点击下拉选项的竞态条件
  const handleBlur = useCallback(() => {
    setTimeout(() => {
      if (strictSelection && !isValueFromSelection.current) {
        // 如果当前值不等于最后有效值，则恢复
        if (value !== lastValidValue) {
          onChange(lastValidValue);
        }
      }
      // 重置选择标记
      isValueFromSelection.current = false;
    }, 150);  // 150ms 延迟，确保 click 事件先处理
  }, [strictSelection, value, lastValidValue, onChange]);

  // v3.0: 下拉按钮点击 - 展开全部选项
  // v3.3: 使用 onMouseDown 阻止 blur 事件触发恢复逻辑
  const handleDropdownMouseDown = useCallback((e: React.MouseEvent) => {
    // 阻止默认行为，防止输入框失去焦点
    e.preventDefault();
  }, []);

  const handleDropdownClick = useCallback(async () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      let allOptions: AutocompleteOption[] = [];

      // 优先使用 getAllOptionsFn，否则用空字符串调用 searchFn
      if (getAllOptionsFn) {
        allOptions = await getAllOptionsFn();
      } else {
        // 如果没有 getAllOptionsFn，尝试用空搜索获取全部
        allOptions = await searchFn('');
      }

      // 合并 extraOptions
      const combinedOptions = [...allOptions, ...extraOptions];
      setOptions(combinedOptions);
      setIsOpen(combinedOptions.length > 0);
      setHighlightedIndex(-1);
    } catch (error) {
      console.error('获取选项列表失败:', error);
    } finally {
      setIsLoading(false);
    }
  }, [isOpen, getAllOptionsFn, searchFn, extraOptions]);

  return (
    <div ref={containerRef} className={clsx('relative w-full', className)}>
      {/* 标签（仅 default 变体） */}
      {label && variant === 'default' && (
        <label className="block text-[20px] tracking-wider text-zinc-500 font-bold mb-2 ml-1">
          {label}
        </label>
      )}

      {/* 输入框容器 - v3.2: inline 变体添加边框样式 */}
      <div className={clsx(
        'relative flex items-center',
        variant === 'inline' && 'px-3 py-2 rounded-glass-sm bg-cacao-husk/60 border border-[rgba(138,75,47,0.3)]'
      )}>
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder={placeholder}
          disabled={disabled}
          className={clsx(
            variant === 'default'
              ? 'glass-input w-full'
              : 'flex-1 bg-transparent outline-none',
            showDropdownButton && variant === 'default' && 'pr-12',
            error && 'border-ios-red',
            inputClassName
          )}
        />

        {/* v3.0: 倒三角下拉按钮 */}
        {showDropdownButton && variant === 'default' && (
          <button
            type="button"
            onMouseDown={handleDropdownMouseDown}
            onClick={handleDropdownClick}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg
                className={clsx(
                  'w-4 h-4 transition-transform duration-200',
                  isOpen && 'rotate-180'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        )}

        {/* v3.0: inline 变体的倒三角按钮 */}
        {showDropdownButton && variant === 'inline' && (
          <button
            type="button"
            onMouseDown={handleDropdownMouseDown}
            onClick={handleDropdownClick}
            disabled={disabled}
            className="ml-1 w-5 h-5 flex items-center justify-center text-white/40 hover:text-white/70 transition-colors disabled:opacity-40"
          >
            {isLoading ? (
              <div className="w-3 h-3 border border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <svg
                className={clsx(
                  'w-3 h-3 transition-transform duration-200',
                  isOpen && 'rotate-180'
                )}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            )}
          </button>
        )}

        {/* 加载指示器（仅 default 变体且无下拉按钮时显示） */}
        {isLoading && variant === 'default' && !showDropdownButton && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}
      </div>

      {/* v3.1: 下拉列表 - 使用 Portal 渲染到 body，避免层叠上下文问题 */}
      {isOpen &&
        createPortal(
          <div
            ref={dropdownRef}
            className={clsx(
              'fixed z-[9999]',
              'max-h-60 overflow-y-auto',
              'py-2',
              'rounded-[28px]',
              'border border-white/12'
            )}
            style={{
              top: dropdownPosition.top,
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              background:
                'linear-gradient(145deg, rgba(25,25,30,0.95) 0%, rgba(25,25,30,0.9) 100%)',
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
                  onMouseDown={handleDropdownMouseDown}
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
          </div>,
          document.body
        )}

      {/* 错误信息 */}
      {error && <p className="text-ios-red text-xs mt-1 ml-1">{error}</p>}
    </div>
  );
};

export default AutocompleteInput;
