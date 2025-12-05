// EntryForm - 采购录入表单
// v4.1 - 完整表单验证（供应商、单位、产品精确匹配）+ 提交直接加入队列
// v4.0 - 添加上传队列功能：支持"加入队列"提交模式，用户无需等待上传完成
// v3.9 - 优化麦克风权限请求体验：立即显示准备状态，支持 preparing 状态
// v3.8 - 表单提交前验证物品名称是否存在于数据库（优化 UX，避免到总结页才发现错误）
// v3.7 - 收货单和货物照片必填验证 + 移动端（iOS/Android）相机相册兼容性优化
// v3.6 - 调整UI顺序：图片上传在前，供应商/备注在后，避免AI识别覆盖用户手动输入
// v3.5 - 修复产品下拉选择不自动填入的 bug（React 状态竞态问题）
// v3.4 - 收货单识别 UX 优化：上传后显示"AI识别"按钮，点击触发识别
// v3.3 - 集成 Gemini 2.0 Flash 收货单图片识别，AI开关开启时自动识别填充表单
// v3.2 - 优化提交 UI 反馈：进度提示 + 绿色成功界面 + 倒计时跳转
// v3.0 - 重构图片上传：收货单+货物分开，供应商"其他"选项，AI开关（默认关）
// v2.6 - 欢迎页添加右上角菜单按钮，修复分类页返回按钮导航
// v2.5 - 合并"拍照"和"相册"按钮为单一"添加"按钮
// v2.4 - 单位输入改为自由文本（移除自动完成），修复总价为空时的页面崩溃
// v2.3 - 单位输入改为自动完成（与商品名称相同设计，输入后才显示下拉）
// v2.1 - 支持总价/单价双向输入，自动换算
// v2.0 - 单位输入改为下拉列表，移除单位映射表，直接使用 unitId
// v1.9 - 添加收货订单图片上传区，集成到信息卡片中
// v1.8 - 语音录入交互优化：识别后可编辑文本，点击发送按钮才解析填充表单

import React, { useState, useRef, useEffect } from 'react';
import { DailyLog, ProcurementItem, CategoryType, AttachedImage } from '../types';
import { recognizeReceipt } from '../services/receiptRecognitionService';
import { compressImage, generateThumbnail, formatFileSize } from '../services/imageService';
import { voiceEntryService, RecordingStatus, VoiceEntryResult } from '../services/voiceEntryService';
import { SubmitProgress } from '../services/inventoryService';
import { addToUploadQueue } from '../services/uploadQueueService';
import { useAuth } from '../contexts/AuthContext';
import { Icons } from '../constants';
import { GlassCard, Button, Input, AutocompleteInput } from './ui';
import { searchSuppliers, searchProducts, getAllProductsAsOptions, getAllSuppliersAsOptions, exactMatchProduct } from '../services/supabaseService';
import type { AutocompleteOption } from '../services/supabaseService';

interface EntryFormProps {
  onSave: (log: Omit<DailyLog, 'id'>) => void;
  userName: string;
  onOpenMenu?: () => void;
}

type EntryStep = 'WELCOME' | 'CATEGORY' | 'WORKSHEET' | 'SUMMARY';

const CATEGORIES: { id: CategoryType; label: string; icon: any }[] = [
  { id: 'Meat', label: '肉类', icon: Icons.Meat },
  { id: 'Vegetables', label: '蔬果', icon: Icons.Vegetable },
  { id: 'Dry Goods', label: '干杂', icon: Icons.Cube },
  { id: 'Alcohol', label: '酒水', icon: Icons.Beaker },
  { id: 'Consumables', label: '低耗', icon: Icons.Sparkles },
];

// Mock Data Presets for Demo
const MOCK_PRESETS: Record<string, { supplier: string; notes: string; items: ProcurementItem[] }> = {
  'Meat': {
    supplier: '双汇冷鲜肉直供',
    notes: '今日五花肉品质不错，已核对重量。',
    items: [
      { name: '精品五花肉', specification: '带皮', quantity: 20, unit: 'kg', unitPrice: 28.5, total: 570 },
      { name: '猪肋排', specification: '精修', quantity: 15, unit: 'kg', unitPrice: 32.0, total: 480 },
    ]
  },
  'Vegetables': {
    supplier: '城南蔬菜批发市场',
    notes: '土豆这批个头较小。',
    items: [
      { name: '本地土豆', specification: '黄心', quantity: 50, unit: '斤', unitPrice: 1.2, total: 60 },
      { name: '青椒', specification: '薄皮', quantity: 20, unit: '斤', unitPrice: 4.5, total: 90 },
      { name: '大白菜', specification: '新鲜', quantity: 30, unit: '斤', unitPrice: 0.8, total: 24 },
    ]
  },
  'Alcohol': {
    supplier: '雪花啤酒总代',
    notes: '周末备货，增加库存。',
    items: [
      { name: '雪花勇闯天涯', specification: '500ml*12', quantity: 50, unit: '箱', unitPrice: 38, total: 1900 },
      { name: '百威纯生', specification: '330ml*24', quantity: 20, unit: '箱', unitPrice: 120, total: 2400 },
    ]
  },
  'Dry Goods': {
    supplier: '粮油批发中心',
    notes: '',
    items: [
      { name: '金龙鱼大豆油', specification: '20L/桶', quantity: 5, unit: '桶', unitPrice: 210, total: 1050 },
      { name: '特一粉', specification: '25kg', quantity: 10, unit: '袋', unitPrice: 95, total: 950 },
    ]
  },
  'Consumables': {
    supplier: '酒店用品城',
    notes: '补货一次性用品。',
    items: [
      { name: '抽纸', specification: '200抽', quantity: 100, unit: '包', unitPrice: 2.5, total: 250 },
      { name: '洗洁精', specification: '5kg/桶', quantity: 4, unit: '桶', unitPrice: 15, total: 60 },
    ]
  }
};

// --- Welcome Screen (Minimalist Typography) ---

const WelcomeScreen: React.FC<{ userName: string; onStart: () => void; onOpenMenu?: () => void }> = ({ userName, onStart, onOpenMenu }) => {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const hour = currentTime.getHours();
  let greeting = "早上好";
  if (hour >= 12 && hour < 18) greeting = "下午好";
  if (hour >= 18) greeting = "晚上好";

  // 格式化日期为苹果锁屏样式
  const formatDate = () => {
    const month = currentTime.getMonth() + 1;
    const day = currentTime.getDate();
    const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    const weekday = weekdays[currentTime.getDay()];
    return `${month}月${day}日 ${weekday}`;
  };

  return (
    <div className="h-full flex flex-col items-center justify-between p-8 animate-scale-up safe-area-bottom relative overflow-hidden">
      {/* Vintage Postcard ambient glows */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-harbor-blue opacity-12 blur-3xl"></div>
      <div className="absolute bottom-1/3 right-1/4 w-80 h-80 rounded-full bg-faded-steel opacity-10 blur-3xl"></div>
      <div className="absolute top-1/2 right-1/3 w-64 h-64 rounded-full bg-aged-paper opacity-15 blur-2xl"></div>

      {/* 顶部导航栏 - 菜单按钮 */}
      {onOpenMenu && (
        <div className="absolute top-6 right-4 z-20">
          <button
            onClick={onOpenMenu}
            className="p-2 text-white/70 hover:text-white transition-colors"
          >
            <Icons.Menu className="w-6 h-6" />
          </button>
        </div>
      )}

      {/* 苹果锁屏样式：日期 + 时间 */}
      <div className="w-full pt-16 relative z-10">
        <div className="text-center">
          {/* 日期 - 小字 */}
          <p className="text-lg font-medium text-secondary tracking-wide mb-2">
            {formatDate()}
          </p>
          {/* 时间 - 超大字 */}
          <p className="text-8xl font-light text-primary tracking-tight">
            {currentTime.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      {/* 问候语 */}
      <div className="flex-1 w-full flex flex-col items-center justify-center relative z-10">
         <div className="text-center space-y-5">
            <h1 className="text-4xl font-bold tracking-tight text-primary">
              {greeting}
            </h1>
            {/* 通知消息卡片 - 深色毛玻璃效果，宽度自适应 */}
            <div className="inline-block px-10 py-3 rounded-full border border-white/10"
                 style={{
                   background: 'rgba(30, 30, 35, 0.45)',
                   backdropFilter: 'blur(40px) saturate(180%)',
                   WebkitBackdropFilter: 'blur(40px) saturate(180%)',
                   boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
                 }}>
              <p className="text-base text-white font-medium whitespace-nowrap">
                {userName}，今日的工作就拜托你了
              </p>
            </div>
         </div>
      </div>

      <div className="w-full pb-4 relative z-10 px-8">
        <button
          onClick={onStart}
          className="w-full h-14 rounded-2xl border border-white/10 flex items-center justify-center gap-2 text-lg font-semibold text-white transition-all active:scale-[0.98]"
          style={{
            background: 'rgba(30, 30, 35, 0.55)',
            backdropFilter: 'blur(40px) saturate(180%)',
            WebkitBackdropFilter: 'blur(40px) saturate(180%)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
          }}
        >
          <span>开始录入</span>
          <Icons.PlusCircle className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

// --- Category Screen (Floating Layered List) ---

const CategoryScreen: React.FC<{ onSelect: (cat: CategoryType) => void; onBack: () => void }> = ({ onSelect, onBack }) => (
  <div className="min-h-full h-full p-6 flex flex-col animate-slide-in relative overflow-hidden safe-area-bottom">
    {/* Vintage Postcard ambient glows */}
    <div className="absolute top-20 right-10 w-64 h-64 rounded-full bg-harbor-blue opacity-12 blur-3xl"></div>
    <div className="absolute bottom-40 left-10 w-48 h-48 rounded-full bg-faded-steel opacity-10 blur-2xl"></div>

    <div className="flex items-center gap-4 mb-10 pt-2 relative z-10 flex-shrink-0">
      <button
        onClick={onBack}
        className="w-10 h-10 rounded-full bg-glass-bg backdrop-blur-glass border border-glass-border flex items-center justify-center text-secondary hover:bg-glass-bg-hover transition-colors"
      >
        <Icons.ArrowLeft className="w-5 h-5" />
      </button>
      <h2 className="text-2xl font-bold text-primary tracking-tight">选择分类</h2>
    </div>

    <div className="flex-1 space-y-3 overflow-y-auto relative z-10 pb-4">
      {CATEGORIES.map((cat, idx) => (
        <button
          key={cat.id}
          onClick={() => onSelect(cat.id)}
          className="group w-full flex items-center justify-between p-5 glass-card hover:bg-glass-bg-hover transition-all active:scale-[0.98] animate-slide-in"
          style={{ animationDelay: `${idx * 0.05}s` }}
        >
          <div className="flex items-center gap-4">
            {/* Vintage Icon Container */}
            <div className="w-12 h-12 rounded-glass-lg bg-glass-bg backdrop-blur-glass border border-glass-border flex items-center justify-center text-secondary group-hover:text-harbor-blue transition-colors">
               <cat.icon className="w-5 h-5" />
            </div>
            <span className="text-lg font-semibold text-primary group-hover:text-harbor-blue">{cat.label}</span>
          </div>
          <Icons.ChevronRight className="w-5 h-5 text-muted group-hover:text-harbor-blue transition-colors" />
        </button>
      ))}
    </div>
  </div>
);

// --- Worksheet Screen ---

// v3.5 - receiptImages 改为数组，支持多张收货单，AI识别按钮移至图片下方
// v3.4 - 修改 props：移除 aiAutoFill 开关，改为 isRecognizing + onAIRecognize 按钮
// v3.0 - 新增 supplierOther + onSupplierOtherChange，receiptImage + goodsImage
const WorksheetScreen: React.FC<{
  items: ProcurementItem[];
  supplier: string;
  supplierOther: string;
  notes: string;
  isAnalyzing: boolean;
  isRecognizing: boolean;  // v3.4: AI识别中状态
  grandTotal: number;
  receiptImages: AttachedImage[];  // v3.5: 多张收货单
  goodsImage: AttachedImage | null;
  voiceStatus: RecordingStatus;
  voiceMessage: string;
  transcriptionText: string;
  showTranscription: boolean;
  isSendingTranscription: boolean;
  onBack: () => void;
  onSupplierChange: (val: string) => void;
  onSupplierOtherChange: (val: string) => void;
  onNotesChange: (val: string) => void;
  onItemChange: (index: number, field: keyof ProcurementItem, value: any) => void;
  onProductSelect: (index: number, option: AutocompleteOption) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onReceiptImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onGoodsImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveReceiptImage: (index: number) => void;  // v3.5: 删除指定索引的收货单
  onRemoveGoodsImage: () => void;
  onAIRecognize: () => void;  // v3.4: AI识别按钮点击
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  onTranscriptionChange: (text: string) => void;
  onSendTranscription: () => void;
  onReview: () => void;
}> = ({
  items, supplier, supplierOther, notes, isAnalyzing, isRecognizing, grandTotal, receiptImages, goodsImage,
  voiceStatus, voiceMessage, transcriptionText, showTranscription, isSendingTranscription,
  onBack, onSupplierChange, onSupplierOtherChange, onNotesChange, onItemChange, onProductSelect, onAddItem, onRemoveItem,
  onReceiptImageUpload, onGoodsImageUpload, onRemoveReceiptImage, onRemoveGoodsImage, onAIRecognize,
  onVoiceStart, onVoiceStop, onTranscriptionChange, onSendTranscription, onReview
}) => {
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const goodsInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevItemsLengthRef = useRef<number>(items.length);
  const isInitialMountRef = useRef<boolean>(true);

  // Scroll to top on initial mount, scroll to bottom only when new items are added
  useEffect(() => {
    if (scrollRef.current) {
      if (isInitialMountRef.current) {
        // First render: scroll to top
        scrollRef.current.scrollTop = 0;
        isInitialMountRef.current = false;
      } else if (items.length > prevItemsLengthRef.current) {
        // New item added: scroll to bottom to show new item
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
      prevItemsLengthRef.current = items.length;
    }
  }, [items.length]);

  return (
    <div className="h-full flex flex-col animate-slide-in relative">
      {/* Header Layer - Storm Glass effect */}
      <div className="px-6 py-3 flex items-center justify-between sticky top-0 z-20 mb-4"
           style={{
             background: 'rgba(30, 30, 35, 0.45)',
             backdropFilter: 'blur(40px) saturate(180%)',
             WebkitBackdropFilter: 'blur(40px) saturate(180%)',
             boxShadow: '0 4px 24px rgba(0, 0, 0, 0.2)'
           }}>
         <button onClick={onBack} className="flex items-center gap-2 text-white/70 hover:text-white transition-colors">
            <Icons.ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">返回</span>
         </button>
         <div className="px-4 py-1.5 rounded-full border border-white/10 text-sm font-mono text-white font-bold"
              style={{
                background: 'rgba(30, 30, 35, 0.6)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)'
              }}>
            ¥{(Number(grandTotal) || 0).toFixed(2)}
         </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 pb-40 space-y-6">

        {/* Info Section - Card Layer */}
        {/* v3.6: 调整顺序 - 图片上传在前，供应商/备注在后，避免AI识别覆盖用户输入 */}
        <GlassCard padding="md" className="space-y-4">
          {/* 图片上传区 - 收货单支持多张，AI识别按钮移至下方 */}
          <div className="space-y-3">
            {/* 收货单图片（多张）- 必填 */}
            <div>
              <label className="block text-[20px] tracking-wider text-zinc-500 font-bold mb-2 ml-1">
                收货单照片 <span className="text-ios-red text-sm">*必填</span>
              </label>
              {/* 图片行：已上传的图片 + 添加按钮 */}
              <div className="flex items-center gap-2 flex-wrap mb-2">
                {/* 已上传的收货单图片列表 */}
                {receiptImages.map((img, index) => (
                  <div key={img.id} className="relative group">
                    <img
                      src={`data:${img.mimeType};base64,${img.thumbnail || img.data}`}
                      alt={`收货单 ${index + 1}`}
                      className={`w-16 h-16 object-cover rounded-lg border transition-all ${
                        img.recognized ? 'border-ios-green/50' : 'border-white/15'
                      }`}
                      style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)' }}
                    />
                    {/* 已识别标记 */}
                    {img.recognized && (
                      <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-ios-green rounded-full flex items-center justify-center border border-[#1a1a1f]">
                        <Icons.Check className="w-2.5 h-2.5 text-white" />
                      </div>
                    )}
                    {/* 删除按钮 */}
                    <button
                      onClick={() => onRemoveReceiptImage(index)}
                      className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500/90 rounded-full flex items-center justify-center transition-all hover:bg-red-500 border border-[#1a1a1f]"
                    >
                      <Icons.X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                {/* 添加更多按钮 */}
                <button
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={isAnalyzing}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-0.5 transition-all active:scale-95 disabled:opacity-40"
                >
                  {isAnalyzing ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <>
                      <Icons.Plus className="w-5 h-5 text-white/50" />
                      <span className="text-[9px] text-white/40">添加</span>
                    </>
                  )}
                </button>
              </div>
              {/* v3.5: AI识别按钮 - 有未识别图片时显示，独立一行 */}
              {receiptImages.length > 0 && receiptImages.some(img => !img.recognized) && (
                <button
                  onClick={onAIRecognize}
                  disabled={isRecognizing}
                  className="w-full h-10 rounded-xl flex items-center justify-center gap-2 transition-all active:scale-[0.98] disabled:opacity-60 border border-ios-blue/30 hover:border-ios-blue/50"
                  style={{
                    background: 'linear-gradient(135deg, rgba(91,163,192,0.15) 0%, rgba(91,163,192,0.08) 100%)',
                    boxShadow: '0 2px 12px rgba(91,163,192,0.1)'
                  }}
                >
                  {isRecognizing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
                      <span className="text-sm text-ios-blue font-medium">识别中...</span>
                    </>
                  ) : (
                    <>
                      <Icons.Sparkles className="w-4 h-4 text-ios-blue" />
                      <span className="text-sm text-ios-blue font-medium">
                        AI识别 {receiptImages.length > 1 ? `(${receiptImages.filter(img => !img.recognized).length}张)` : ''}
                      </span>
                    </>
                  )}
                </button>
              )}
              {/* 全部已识别提示 */}
              {receiptImages.length > 0 && receiptImages.every(img => img.recognized) && (
                <div className="flex items-center gap-1.5 text-xs text-ios-green">
                  <Icons.Check className="w-3.5 h-3.5" />
                  <span>已识别 {receiptImages.length} 张收货单</span>
                </div>
              )}
              {/* v3.7: 移动端兼容性优化 - 不使用 capture 属性，让用户选择相机或相册 */}
              <input
                type="file"
                ref={receiptInputRef}
                onChange={onReceiptImageUpload}
                accept="image/*"
                className="absolute opacity-0 w-0 h-0 pointer-events-none"
                aria-label="上传收货单照片"
              />
            </div>

            {/* 货物图片 - 必填 */}
            <div>
              <label className="block text-[20px] tracking-wider text-zinc-500 font-bold mb-2 ml-1">
                货物照片 <span className="text-ios-red text-sm">*必填</span>
              </label>
              <div className="flex items-center gap-3">
                {/* 已上传的货物图片 */}
                {goodsImage && (
                  <div className="relative group">
                    <img
                      src={`data:${goodsImage.mimeType};base64,${goodsImage.thumbnail || goodsImage.data}`}
                      alt="货物"
                      className="w-20 h-20 object-cover rounded-xl border border-white/15"
                      style={{ boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)' }}
                    />
                    <button
                      onClick={onRemoveGoodsImage}
                      className="absolute -top-2 -right-2 w-6 h-6 bg-red-500/90 rounded-full flex items-center justify-center transition-all hover:bg-red-500 border-2 border-[#1a1a1f]"
                    >
                      <Icons.X className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                )}
                {/* 上传按钮 */}
                {!goodsImage && (
                  <button
                    onClick={() => goodsInputRef.current?.click()}
                    disabled={isAnalyzing}
                    className="w-20 h-20 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 disabled:opacity-40"
                  >
                    {isAnalyzing ? (
                      <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <>
                        <Icons.Camera className="w-6 h-6 text-white/50" />
                        <span className="text-[10px] text-white/40">货物</span>
                      </>
                    )}
                  </button>
                )}
              </div>
              {/* v3.7: 移动端兼容性优化 - 不使用 capture 属性，让用户选择相机或相册 */}
              <input
                type="file"
                ref={goodsInputRef}
                onChange={onGoodsImageUpload}
                accept="image/*"
                className="absolute opacity-0 w-0 h-0 pointer-events-none"
                aria-label="上传货物照片"
              />
            </div>
          </div>

          {/* 供应商选择 + "其他"选项 */}
          <AutocompleteInput
            label="供应商全称"
            value={supplier}
            onChange={onSupplierChange}
            placeholder="输入供应商名称或选择'其他'"
            searchFn={searchSuppliers}
            debounceMs={300}
            minChars={1}
            extraOptions={[{ id: 'other', label: '其他', value: '其他', sublabel: '手动输入供应商' }]}
            showDropdownButton={true}
            getAllOptionsFn={getAllSuppliersAsOptions}
          />
          {/* "其他"供应商输入框 - 仅当选择"其他"时显示，新供应商自动入库 */}
          {supplier === '其他' && (
            <div className="animate-slide-in">
              <label className="block text-[16px] tracking-wider text-zinc-500 font-bold mb-2 ml-1">
                请输入供应商名称
              </label>
              <input
                type="text"
                value={supplierOther}
                onChange={(e) => onSupplierOtherChange(e.target.value)}
                placeholder="供货商将会被添加到数据库，下次直接选择即可"
                className="glass-input w-full py-3"
              />
            </div>
          )}

          <div>
             <label className="block text-[20px] tracking-wider text-zinc-500 font-bold mb-2 ml-1">
               备注信息
             </label>
             <textarea
                value={notes}
                onChange={(e) => onNotesChange(e.target.value)}
                placeholder="备注信息（可选）"
                rows={1}
                className="glass-input w-full resize-none py-4 leading-normal"
             />
          </div>
        </GlassCard>

        {/* List Section */}
        <div>
          <div className="flex items-center justify-between mb-3 px-1">
            <h3 className="text-lg tracking-wider text-secondary font-bold">物品清单</h3>
            <span className="text-lg text-muted">{items.length} 项</span>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <GlassCard key={index} padding="md" className="relative group">
                 {/* Top Row: Name & Delete */}
                 <div className="flex items-start justify-between mb-4">
                    <AutocompleteInput
                      value={item.name}
                      onChange={(val) => onItemChange(index, 'name', val)}
                      placeholder="商品名称"
                      searchFn={searchProducts}
                      variant="inline"
                      inputClassName="text-[13px] font-bold text-primary placeholder-muted"
                      debounceMs={250}
                      minChars={1}
                      showDropdownButton={true}
                      getAllOptionsFn={getAllProductsAsOptions}
                      onSelect={(option) => onProductSelect(index, option)}
                    />
                    <button
                      onClick={() => onRemoveItem(index)}
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white/40 hover:text-ios-red hover:bg-ios-red/10 transition-all ml-2"
                    >
                      <Icons.Trash className="w-4 h-4" />
                    </button>
                 </div>

                 {/* Grid Row: Data Inputs */}
                 <div className="grid grid-cols-12 gap-2">
                    {/* Packaging */}
                    <div className="col-span-3">
                        <label className="block text-[9px] text-muted mb-1 text-center">规格</label>
                        <input
                            type="text"
                            value={item.specification || ''}
                            onChange={(e) => onItemChange(index, 'specification', e.target.value)}
                            placeholder="规格"
                            className="w-full bg-cacao-husk/60 border border-[rgba(138,75,47,0.3)] rounded-glass-sm py-2 text-center text-sm text-secondary outline-none focus:border-ember-rock/50 placeholder:text-white/40"
                        />
                    </div>
                    {/* Unit - v2.4: 改为自由文本输入（不使用自动完成） */}
                    <div className="col-span-2">
                        <label className="block text-[9px] text-muted mb-1 text-center">单位</label>
                        <input
                            type="text"
                            value={item.unit || ''}
                            onChange={(e) => onItemChange(index, 'unit', e.target.value)}
                            placeholder="单位"
                            className="w-full bg-cacao-husk/60 border border-[rgba(138,75,47,0.3)] rounded-glass-sm py-2 text-center text-sm text-secondary outline-none focus:border-ember-rock/50 placeholder:text-white/40"
                        />
                    </div>
                    {/* Qty */}
                    <div className="col-span-2">
                        <label className="block text-[9px] text-muted mb-1 text-center">数量</label>
                        <input
                            type="number"
                            value={item.quantity || ''}
                            onChange={(e) => onItemChange(index, 'quantity', e.target.value)}
                            placeholder="数量"
                            className="w-full bg-cacao-husk/60 border border-[rgba(138,75,47,0.3)] rounded-glass-sm py-2 text-center text-sm text-primary font-medium outline-none focus:border-ember-rock/50 placeholder:text-white/40"
                        />
                    </div>
                    {/* Price */}
                    <div className="col-span-2">
                        <label className="block text-[9px] text-muted mb-1 text-center">单价</label>
                        <input
                            type="number"
                            value={item.unitPrice || ''}
                            onChange={(e) => onItemChange(index, 'unitPrice', e.target.value)}
                            placeholder="单价"
                            className="w-full bg-cacao-husk/60 border border-[rgba(138,75,47,0.3)] rounded-glass-sm py-2 text-center text-sm text-primary font-medium outline-none focus:border-ember-rock/50 placeholder:text-white/40"
                        />
                    </div>
                    {/* Subtotal - v2.1: 可编辑，支持输入总价反算单价 */}
                    <div className="col-span-3">
                        <label className="block text-[9px] text-muted mb-1 text-center">总价</label>
                        <input
                            type="number"
                            value={item.total || ''}
                            onChange={(e) => onItemChange(index, 'total', e.target.value)}
                            placeholder="总价"
                            className="w-full bg-ember-rock/20 border border-ember-rock/30 rounded-glass-sm py-2 text-center text-sm font-bold text-ember-rock outline-none focus:border-ember-rock/50 placeholder:text-ember-rock/40"
                        />
                    </div>
                 </div>
              </GlassCard>
            ))}

            {/* Inline Add Button */}
            <button
                onClick={onAddItem}
                className="w-full py-4 rounded-glass-xl border-2 border-dashed border-[rgba(180,160,140,0.25)] text-secondary hover:text-harbor-blue hover:border-harbor-blue/30 hover:bg-harbor-blue/5 transition-all flex items-center justify-center gap-2 group active:scale-[0.99]"
            >
                <Icons.PlusCircle className="w-5 h-5 group-hover:text-harbor-blue transition-colors" />
                <span className="font-medium text-sm">添加物品</span>
            </button>

            {/* v1.7: 提交按钮移到这里，和物品列表同层级 */}
            <button
              onClick={onReview}
              disabled={voiceStatus === 'recording' || voiceStatus === 'processing' || voiceStatus === 'preparing'}
              className="w-full py-4 mt-4 rounded-glass-xl text-white font-semibold text-base transition-all active:scale-[0.98] border border-white/15 disabled:opacity-40 flex items-center justify-center gap-2"
              style={{
                background: 'linear-gradient(135deg, rgba(91,163,192,0.3) 0%, rgba(91,163,192,0.15) 100%)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                boxShadow: '0 4px 20px rgba(91,163,192,0.2), inset 0 1px 0 rgba(255,255,255,0.1)'
              }}
            >
              <Icons.Check className="w-5 h-5" />
              <span>确认提交</span>
            </button>
          </div>
        </div>
      </div>

      {/* Gradient fade overlay above voice bar - creates smooth content fade effect */}
      <div
        className="fixed bottom-0 left-0 right-0 h-32 pointer-events-none z-40"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(20, 20, 25, 0.7) 50%, rgba(20, 20, 25, 0.95) 100%)'
        }}
      />

      {/* Floating Action Island - Storm Glass with Integrated Voice Display */}
      {/* v1.7: 简化底部栏，只保留语音按钮和文本显示 */}
      <div className="fixed bottom-6 left-4 right-4 z-50 safe-area-bottom">
        <div className="p-2 rounded-2xl border border-white/10"
             style={{
               background: 'rgba(30, 30, 35, 0.75)',
               backdropFilter: 'blur(40px) saturate(180%)',
               WebkitBackdropFilter: 'blur(40px) saturate(180%)',
               boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
             }}>

           {/* Main Row: Voice Button + Text Box (no submit button here) */}
           <div className="flex items-start gap-2">
             {/* v3.0: file inputs moved to image upload section */}

             {/* v1.7: 只保留语音按钮 */}
             <div className="flex items-center">
               {/* Voice Recording Button - Start or Stop */}
               {voiceStatus === 'recording' ? (
                 /* Stop Button - Red circle with white square SVG */
                 <button
                   onClick={onVoiceStop}
                   className="w-11 h-11 rounded-xl flex items-center justify-center transition-all active:scale-95 flex-shrink-0"
                 >
                   <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
                     <circle cx="14" cy="14" r="13" stroke="#ef4444" strokeWidth="2" className="animate-pulse" style={{ filter: 'drop-shadow(0 0 6px rgba(239, 68, 68, 0.6))' }} />
                     <rect x="9" y="9" width="10" height="10" rx="1.5" fill="white" />
                   </svg>
                 </button>
               ) : (
                 /* Microphone Button - v3.9: 支持 preparing 状态 */
                 <button
                   onClick={onVoiceStart}
                   disabled={isAnalyzing || voiceStatus === 'processing' || voiceStatus === 'preparing'}
                   className="w-11 h-11 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors active:scale-95 disabled:opacity-40 flex-shrink-0"
                 >
                   {(voiceStatus === 'processing' || voiceStatus === 'preparing') ? (
                     <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full" />
                   ) : (
                     <Icons.Microphone className="w-5 h-5" />
                   )}
                 </button>
               )}

               {/* v1.7: 注释掉相机和文件上传按钮
               <button
                 onClick={() => cameraInputRef.current?.click()}
                 disabled={isAnalyzing || voiceStatus === 'recording'}
                 className="w-11 h-11 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors active:scale-95 disabled:opacity-40"
               >
                 {isAnalyzing ? <div className="animate-spin w-5 h-5 border-2 border-white/30 border-t-white rounded-full"></div> : <Icons.Camera className="w-5 h-5" />}
               </button>
               <button
                 onClick={() => fileInputRef.current?.click()}
                 disabled={isAnalyzing || voiceStatus === 'recording'}
                 className="w-11 h-11 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors active:scale-95 disabled:opacity-40"
               >
                 <Icons.Folder className="w-5 h-5" />
               </button>
               */}
             </div>

             {/* v1.8: 可编辑文本框 + 发送按钮 */}
             <TranscriptionBox
               transcriptionText={transcriptionText}
               voiceStatus={voiceStatus}
               onTextChange={onTranscriptionChange}
               onSend={onSendTranscription}
               isSending={isSendingTranscription}
             />
           </div>
        </div>
      </div>
    </div>
  );
}

// v1.8: 可编辑的转录文本组件 - 支持编辑后手动发送解析
const TranscriptionBox: React.FC<{
  transcriptionText: string;
  voiceStatus: RecordingStatus;
  onTextChange: (text: string) => void;
  onSend: () => void;
  isSending: boolean;
}> = ({ transcriptionText, voiceStatus, onTextChange, onSend, isSending }) => {
  const textRef = useRef<HTMLTextAreaElement>(null);

  // 自动滚动到底部
  useEffect(() => {
    if (textRef.current) {
      textRef.current.scrollTop = textRef.current.scrollHeight;
    }
  }, [transcriptionText]);

  // 自动调整高度
  useEffect(() => {
    if (textRef.current) {
      textRef.current.style.height = 'auto';
      textRef.current.style.height = Math.min(textRef.current.scrollHeight, 120) + 'px';
    }
  }, [transcriptionText]);

  const showSendButton = transcriptionText.trim() && voiceStatus !== 'recording';

  return (
    <div className="flex-1 flex items-end gap-2">
      {/* 可编辑文本框 */}
      <div
        className={`flex-1 relative transition-all duration-300 ${
          voiceStatus === 'recording'
            ? 'voice-recording-border rounded-xl'
            : ''
        }`}
      >
        <textarea
          ref={textRef}
          value={transcriptionText}
          onChange={(e) => onTextChange(e.target.value)}
          placeholder={
            voiceStatus === 'recording'
              ? '正在聆听...'
              : voiceStatus === 'processing'
                ? '正在处理...'
                : voiceStatus === 'preparing'
                  ? '正在准备...'
                  : '尝试用AI帮忙补充或修改，您可以说：请帮我把牛肋条的单位改成kg，或请帮我添加一个猪五花，20斤，一斤23块'
          }
          disabled={voiceStatus === 'recording' || voiceStatus === 'processing' || voiceStatus === 'preparing'}
          rows={1}
          className={`w-full min-h-[44px] max-h-[120px] rounded-xl px-3 py-2.5 text-sm text-white/90 placeholder-white/30 resize-none outline-none transition-all ${
            voiceStatus === 'recording' || voiceStatus === 'preparing' ? 'bg-transparent' : 'bg-white/8'
          }`}
          style={{
            background: voiceStatus === 'recording' || transcriptionText
              ? 'rgba(255, 255, 255, 0.08)'
              : 'transparent',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(255,255,255,0.2) transparent'
          }}
        />
        {/* 录音时的闪烁光标效果 */}
        {voiceStatus === 'recording' && !transcriptionText && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2 pointer-events-none">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
          </span>
        )}
      </div>

      {/* 发送按钮 - 有文本且不在录音时显示 */}
      {showSendButton && (
        <button
          onClick={onSend}
          disabled={isSending}
          className="w-10 h-10 rounded-xl flex items-center justify-center bg-ios-blue/80 hover:bg-ios-blue text-white transition-all active:scale-95 disabled:opacity-50 flex-shrink-0"
        >
          {isSending ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Icons.PaperAirplane className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}

// --- Summary Screen (Receipt Style) ---
// v3.2: 添加进度状态和成功界面

const SummaryScreen: React.FC<{
  items: ProcurementItem[];
  supplier: string;
  notes: string;
  grandTotal: number;
  isSubmitting: boolean;
  submitMessage: string;
  submitError: string | null;
  submitProgress: SubmitProgress | null;
  countdown: number;
  onBack: () => void;
  onConfirm: () => void;
  onImmediateReturn: () => void;
}> = ({ items, supplier, notes, grandTotal, isSubmitting, submitMessage, submitError, submitProgress, countdown, onBack, onConfirm, onImmediateReturn }) => {
  // v3.2: 成功界面 - 全屏覆盖
  if (submitProgress === 'success' && countdown > 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center animate-slide-in px-6">
        {/* 成功图标 */}
        <div className="w-24 h-24 rounded-full flex items-center justify-center mb-6"
             style={{
               background: 'rgba(107, 158, 138, 0.2)',
               boxShadow: '0 0 60px rgba(107, 158, 138, 0.4)'
             }}>
          <div className="w-16 h-16 rounded-full bg-ios-green flex items-center justify-center">
            <Icons.Check className="w-10 h-10 text-white" />
          </div>
        </div>

        {/* 成功文字 */}
        <h2 className="text-2xl font-bold text-ios-green mb-2">提交成功</h2>
        <p className="text-secondary text-center mb-8">{submitMessage}</p>

        {/* 倒计时 */}
        <div className="text-center mb-8">
          <p className="text-muted text-sm mb-2">{countdown} 秒后自动返回</p>
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-ios-green rounded-full transition-all duration-1000 ease-linear"
              style={{ width: `${(countdown / 3) * 100}%` }}
            />
          </div>
        </div>

        {/* 立即返回按钮 */}
        <button
          onClick={onImmediateReturn}
          className="px-8 py-3 rounded-full bg-white/10 border border-white/20 text-white text-base font-medium transition-all hover:bg-white/20 active:scale-95"
        >
          立即返回
        </button>
      </div>
    );
  }

  return (
    <div className="h-full animate-slide-in flex flex-col relative">
      <div className="px-6 py-5 flex items-center gap-4">
        <button onClick={onBack} disabled={isSubmitting} className={`w-10 h-10 rounded-full bg-glass-bg backdrop-blur-glass border border-glass-border flex items-center justify-center text-secondary transition-colors ${isSubmitting ? 'opacity-50 cursor-not-allowed' : 'hover:bg-glass-bg-hover'}`}>
           <Icons.ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-xl font-bold text-primary tracking-tight">确认单据</h2>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-32">
        {/* 错误提示框 - 显示在顶部 */}
        {submitError && (
          <div className="mb-4 p-4 rounded-glass-lg border border-ios-red/30 animate-slide-in"
               style={{
                 background: 'rgba(232, 90, 79, 0.15)',
                 backdropFilter: 'blur(24px)',
                 WebkitBackdropFilter: 'blur(24px)',
                 boxShadow: '0 4px 24px rgba(232, 90, 79, 0.2)'
               }}>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-ios-red/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icons.X className="w-4 h-4 text-ios-red" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ios-red mb-1">提交失败</p>
                <p className="text-sm text-white/90 whitespace-pre-wrap">{submitError}</p>
              </div>
            </div>
          </div>
        )}

        {/* 进度消息框 - 上传/保存过程中显示 */}
        {isSubmitting && submitMessage && !submitError && submitProgress !== 'success' && (
          <div className="mb-4 p-4 rounded-glass-lg border border-ios-blue/30 animate-slide-in"
               style={{
                 background: 'rgba(91, 163, 192, 0.15)',
                 backdropFilter: 'blur(24px)',
                 WebkitBackdropFilter: 'blur(24px)',
                 boxShadow: '0 4px 24px rgba(91, 163, 192, 0.2)'
               }}>
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 flex items-center justify-center flex-shrink-0">
                <div className="w-5 h-5 border-2 border-ios-blue/30 border-t-ios-blue rounded-full animate-spin" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ios-blue">{submitMessage}</p>
              </div>
            </div>
          </div>
        )}

        {/* Glass Receipt Card - Vintage Postcard Glassmorphism */}
        <GlassCard variant="elevated" padding="lg" className="relative overflow-hidden">
           {/* Vintage ambient glow */}
           <div className="absolute -top-20 -right-20 w-48 h-48 rounded-full bg-harbor-blue opacity-10 blur-3xl"></div>
           <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-aged-paper opacity-15 blur-2xl"></div>

           {/* Receipt Header */}
           <div className="text-center mb-8 border-b border-[rgba(180,160,140,0.15)] pb-8 relative z-10">
              <div className="w-14 h-14 bg-harbor-blue/10 border border-harbor-blue/20 rounded-full flex items-center justify-center mx-auto mb-5 text-harbor-blue">
                  <Icons.Check className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-primary tracking-tight mb-2">入库清单预览</h3>
              <p className="text-sm text-muted font-mono">{new Date().toLocaleString('zh-CN', { hour12: false })}</p>
              <div className="mt-5 px-5 py-2.5 bg-glass-bg backdrop-blur-glass rounded-glass-lg inline-block border border-glass-border">
                  <p className="text-base font-semibold text-primary">{supplier || "未知供应商"}</p>
              </div>
           </div>

           {/* Receipt Items */}
           <div className="space-y-5 mb-8 relative z-10">
              {items.map((item, idx) => (
                <div key={idx} className="flex justify-between items-start group">
                   <div className="flex-1 pr-4">
                      <p className="font-bold text-primary text-base">{item.name}</p>
                      <p className="text-muted text-sm mt-1 font-mono">
                        {item.specification ? `${item.specification} | ` : ''}
                        {item.quantity}{item.unit} × ¥{item.unitPrice}
                      </p>
                   </div>
                   <p className="font-mono font-bold text-harbor-blue text-lg">¥{(Number(item.total) || 0).toFixed(0)}</p>
                </div>
              ))}
           </div>

           {/* Receipt Footer */}
           <div className="border-t border-[rgba(180,160,140,0.15)] pt-6 relative z-10">
              <div className="flex justify-between items-center">
                 <span className="text-secondary font-medium">总计金额</span>
                 <span className="text-3xl font-bold tracking-tight text-harbor-blue">
                   ¥{(Number(grandTotal) || 0).toFixed(2)}
                 </span>
              </div>
           </div>

           {notes && (
             <div className="mt-8 bg-glass-bg backdrop-blur-glass p-4 rounded-glass-lg border border-glass-border relative z-10">
                <p className="font-bold text-muted text-[10px] uppercase tracking-wider mb-2">备注</p>
                <p className="text-secondary text-sm">{notes}</p>
             </div>
           )}
        </GlassCard>

        <p className="text-center text-muted text-xs mt-6">请核对以上信息，确认无误后提交入库。</p>
      </div>

      {/* v4.1: 只保留一个确认提交按钮（直接加入队列） */}
      <div className="fixed bottom-6 left-4 right-4 z-50 safe-area-bottom">
         <button
           onClick={onConfirm}
           disabled={isSubmitting}
           className={`w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all border border-ios-blue/30 flex items-center justify-center gap-2 ${
             isSubmitting ? 'opacity-60 cursor-not-allowed' : 'active:scale-[0.98] hover:border-ios-blue/50'
           }`}
           style={{
             background: 'linear-gradient(135deg, rgba(91,163,192,0.3) 0%, rgba(91,163,192,0.15) 100%)',
             backdropFilter: 'blur(40px) saturate(180%)',
             WebkitBackdropFilter: 'blur(40px) saturate(180%)',
             boxShadow: '0 8px 32px rgba(91,163,192,0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
           }}
         >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>提交中...</span>
              </>
            ) : (
              <>
                <Icons.Check className="w-5 h-5" />
                <span>确认提交</span>
              </>
            )}
         </button>
      </div>
    </div>
  )
}

// --- Main Container ---

export const EntryForm: React.FC<EntryFormProps> = ({ onSave, userName, onOpenMenu }) => {
  const [step, setStep] = useState<EntryStep>('WELCOME');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('Meat');
  const [supplier, setSupplier] = useState('');
  const [supplierOther, setSupplierOther] = useState('');  // v3.0: "其他"供应商名称
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // v3.5: 收货单改为数组支持多张，AI识别支持批量
  const [receiptImages, setReceiptImages] = useState<AttachedImage[]>([]);
  const [goodsImage, setGoodsImage] = useState<AttachedImage | null>(null);
  const [isRecognizing, setIsRecognizing] = useState(false);

  // 语音录入状态
  const [voiceStatus, setVoiceStatus] = useState<RecordingStatus>('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [transcriptionText, setTranscriptionText] = useState('');
  const [showTranscription, setShowTranscription] = useState(false);
  const [isSendingTranscription, setIsSendingTranscription] = useState(false);

  // v3.3: 获取当前表单数据（用于传递给 AI 进行修改）
  const getCurrentFormData = (): VoiceEntryResult => {
    // 只包含有效的物品（名称非空）
    const validItems = items.filter(item => item.name.trim() !== '');
    return {
      supplier: supplier,
      notes: notes,
      items: validItems
    };
  };

  // v3.3: 完全替换表单数据（用于 AI 修改模式返回的结果）
  const replaceFormWithResult = (result: VoiceEntryResult) => {
    console.log('[语音录入] 完全替换表单数据:', result);

    // 1. 供应商：直接替换
    setSupplier(result.supplier || '');

    // 2. 备注：直接替换
    setNotes(result.notes || '');

    // 3. 物品：完全替换
    if (result.items && result.items.length > 0) {
      setItems(result.items);
    } else {
      // 如果 AI 返回空列表，保留一个空行
      setItems([{ name: '', specification: '', quantity: 0, unit: '', unitPrice: 0, total: 0 }]);
    }
  };

  // v1.8: 填充表单数据的公共函数（新建模式，仅添加）
  const fillFormWithResult = (result: VoiceEntryResult) => {
    // 1. 供应商：REPLACE（替换）
    if (result.supplier) {
      console.log('[语音录入] 供应商替换:', result.supplier);
      setSupplier(result.supplier);
    }

    // 2. 备注：APPEND（追加）
    if (result.notes) {
      setNotes(prev => {
        if (!prev || prev.trim() === '') {
          console.log('[语音录入] 备注设置（首次）:', result.notes);
          return result.notes;
        }
        const merged = `${prev}；${result.notes}`;
        console.log('[语音录入] 备注追加:', prev, '→', merged);
        return merged;
      });
    }

    // 3. 物品：ADD ONLY（仅添加，不删除现有）
    if (result.items && result.items.length > 0) {
      setItems(prev => {
        const existingItems = prev.filter(item => item.name.trim() !== '');
        const merged = [...existingItems, ...result.items];
        console.log('[语音录入] 物品添加:', existingItems.length, '→', merged.length, '(新增', result.items.length, '项)');
        return merged;
      });
    }
  };

  // v3.3: 手动发送文本进行解析（支持修改模式）
  const handleSendTranscription = async () => {
    if (!transcriptionText.trim() || isSendingTranscription) return;

    setIsSendingTranscription(true);
    try {
      // v3.3: 获取当前表单数据，传递给 AI
      const currentData = getCurrentFormData();
      const hasExistingItems = currentData.items.length > 0;

      console.log('[语音录入] 手动发送解析:', transcriptionText);
      console.log('[语音录入] 当前数据:', hasExistingItems ? `${currentData.items.length} 项` : '无');

      // 调用 API，传入当前数据（如果有）
      const result = await voiceEntryService.extractFromText(
        transcriptionText,
        hasExistingItems ? currentData : undefined
      );

      if (result) {
        // v3.3: 如果有现有数据，使用替换模式；否则使用添加模式
        if (hasExistingItems) {
          replaceFormWithResult(result);
        } else {
          fillFormWithResult(result);
        }
        // 清除文本框
        setTranscriptionText('');
        setShowTranscription(false);
      } else {
        console.error('[语音录入] 解析失败');
        setVoiceMessage('解析失败，请重试');
      }
    } catch (error) {
      console.error('[语音录入] 发送解析错误:', error);
      setVoiceMessage('解析失败，请重试');
    } finally {
      setIsSendingTranscription(false);
    }
  };

  // 数据库提交状态
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState('');
  const [submitError, setSubmitError] = useState<string | null>(null);
  // v3.2: 进度状态和成功倒计时
  const [submitProgress, setSubmitProgress] = useState<SubmitProgress | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 获取认证信息
  // v1.9: 从 user 对象中正确提取 storeId 和 employeeId
  const { user } = useAuth();
  const storeId = user?.store_id || null;
  const employeeId = user?.id || null;

  // v3.9: 页面加载时预检麦克风权限（非阻塞）
  useEffect(() => {
    // 静默检查权限，不触发权限弹窗
    voiceEntryService.checkMicrophonePermission().then(status => {
      console.log('[EntryForm] 麦克风权限预检完成:', status);
    }).catch(err => {
      console.log('[EntryForm] 麦克风权限预检失败（忽略）:', err);
    });
  }, []);

  // 初始化语音服务回调
  // v1.8: 识别完成后仅显示文本，不自动填充，需点击发送按钮
  useEffect(() => {
    voiceEntryService.setCallbacks({
      onStatusChange: (status, message) => {
        setVoiceStatus(status);
        setVoiceMessage(message || '');

        // v3.9: 显示转录面板（包括 preparing 状态）
        if (status === 'recording' || status === 'processing' || status === 'preparing') {
          setShowTranscription(true);
          if (status === 'recording') {
            setTranscriptionText('');
          }
        }
      },
      onPartialText: (text) => {
        console.log('[语音录入] 实时文本:', text);
        setTranscriptionText(text);
      },
      // v1.8: onTextFinal - 识别完成，文本可编辑，需手动发送
      onTextFinal: (text) => {
        console.log('[语音录入] 识别完成（待发送）:', text);
        setTranscriptionText(text);
        // 不自动填充，等待用户点击发送按钮
      },
      // 保留 onResult 以兼容旧版后端（自动解析模式）
      onResult: (result, rawText) => {
        console.log('[语音录入] 收到解析结果:', result);
        setTranscriptionText(rawText);
        fillFormWithResult(result);
        // 自动解析模式：清除文本框
        setTimeout(() => {
          setTranscriptionText('');
          setShowTranscription(false);
        }, 500);
      },
      onError: (error) => {
        console.error('[语音录入] 错误:', error);
        setVoiceMessage(error);
        setTranscriptionText('识别失败');
        // 错误信息保留 2 秒后清除
        setTimeout(() => {
          setShowTranscription(false);
          setVoiceStatus('idle');
          setVoiceMessage('');
          setTranscriptionText('');
        }, 2000);
      }
    });
  }, []);

  const handleCategorySelect = (cat: CategoryType) => {
    setSelectedCategory(cat);
    // Initialize with empty form for production use
    setSupplier('');
    setNotes('');
    setItems([{ name: '', specification: '', quantity: 0, unit: '', unitPrice: 0, total: 0 }]);
    setStep('WORKSHEET');
  };

  const handleItemChange = (index: number, field: keyof ProcurementItem, value: any) => {
    const newItems = [...items];
    const updatedItem = { ...newItems[index], [field]: value };

    // v3.1: 手动输入名称时清除之前选择的 productId（因为名称变了）
    // 但如果是通过 onSelect 设置的 productId，则不清除
    if (field === 'name') {
      // 用户手动输入，清除 productId，提交时会尝试匹配
      updatedItem.productId = undefined;
    }

    // v2.1 - 双向计算：支持用户输入总价或单价
    if (field === 'quantity' || field === 'unitPrice') {
      // 数量或单价变化 → 计算总价
      const q = parseFloat(updatedItem.quantity as any) || 0;
      const p = parseFloat(updatedItem.unitPrice as any) || 0;
      updatedItem.total = q * p;
    } else if (field === 'total') {
      // 总价变化 → 反算单价
      const q = parseFloat(updatedItem.quantity as any) || 0;
      const t = parseFloat(updatedItem.total as any) || 0;
      if (q > 0) {
        updatedItem.unitPrice = t / q;
      }
    }

    newItems[index] = updatedItem;
    setItems(newItems);
  };

  // 产品选择回调 - 同时设置 name 和 productId，避免 React 状态竞态问题
  const handleProductSelect = (index: number, option: AutocompleteOption) => {
    const newItems = [...items];
    newItems[index] = {
      ...newItems[index],
      name: option.value,
      productId: option.id as number
    };
    setItems(newItems);
  };

  const addNewRow = () => {
    setItems([...items, { name: '', specification: '', quantity: 0, unit: '', unitPrice: 0, total: 0 }]);
  };

  const removeRow = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  // v3.5: 收货单图片上传处理（支持多张，追加到数组）
  const handleReceiptImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[图片上传] 触发收货单上传');
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    e.target.value = '';

    console.log('[图片上传] 收货单文件:', file.name, file.type, file.size);
    setIsAnalyzing(true);

    try {
      // 1. 压缩图片
      const compressed = await compressImage(file);
      console.log(`[图片压缩] 收货单: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)}`);

      // 2. 生成缩略图
      const thumbnail = await generateThumbnail(compressed.data);

      // 3. 创建附件对象
      const newImage: AttachedImage = {
        id: crypto.randomUUID(),
        data: compressed.data,
        mimeType: compressed.mimeType,
        thumbnail,
        recognized: false,
        originalSize: compressed.originalSize,
        compressedSize: compressed.compressedSize
      };

      // v3.5: 追加到数组而非替换
      setReceiptImages(prev => [...prev, newImage]);
      console.log('[图片上传] 收货单图片添加成功，等待用户点击"AI识别"');

    } catch (error) {
      console.error('收货单图片处理失败:', error);
      alert(`处理收货单图片失败，请重试`);
    }

    setIsAnalyzing(false);
  };

  // v3.5: 删除指定索引的收货单图片
  const handleRemoveReceiptImage = (index: number) => {
    setReceiptImages(prev => prev.filter((_, i) => i !== index));
  };

  // v3.5: AI识别按钮点击处理（支持多张图片批量识别）
  const handleAIRecognize = async () => {
    // 找出未识别的图片
    const unrecognizedImages = receiptImages.filter(img => !img.recognized);
    if (unrecognizedImages.length === 0 || isRecognizing) return;

    console.log(`[AI识别] 开始识别 ${unrecognizedImages.length} 张收货单...`);
    setIsRecognizing(true);

    try {
      // 逐张识别并合并结果
      let successCount = 0;
      for (let i = 0; i < unrecognizedImages.length; i++) {
        const img = unrecognizedImages[i];
        console.log(`[AI识别] 识别第 ${i + 1}/${unrecognizedImages.length} 张...`);

        const result = await recognizeReceipt(img.data, img.mimeType);
        if (result) {
          console.log(`[AI识别] 第 ${i + 1} 张识别成功:`, result);
          successCount++;
          // 使用与语音录入相同的表单填充逻辑（追加模式）
          fillFormWithResult(result);
          // 标记该图片已识别
          setReceiptImages(prev =>
            prev.map(item => item.id === img.id ? { ...item, recognized: true } : item)
          );
        } else {
          console.warn(`[AI识别] 第 ${i + 1} 张识别失败`);
        }
      }

      // 检查是否有失败的（使用本地计数避免 React 状态异步问题）
      const failCount = unrecognizedImages.length - successCount;
      if (failCount > 0) {
        alert(`${successCount} 张识别成功，${failCount} 张失败`);
      }
    } catch (recognitionError) {
      console.error('[AI识别] 识别出错:', recognitionError);
      alert('收货单识别出错，请手动输入');
    }

    setIsRecognizing(false);
  };

  // v3.0: 货物图片上传处理
  const handleGoodsImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[图片上传] 触发货物上传');
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    e.target.value = '';

    console.log('[图片上传] 货物文件:', file.name, file.type, file.size);
    setIsAnalyzing(true);

    try {
      // 1. 压缩图片
      const compressed = await compressImage(file);
      console.log(`[图片压缩] 货物: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)}`);

      // 2. 生成缩略图
      const thumbnail = await generateThumbnail(compressed.data);

      // 3. 创建附件对象
      const newImage: AttachedImage = {
        id: crypto.randomUUID(),
        data: compressed.data,
        mimeType: compressed.mimeType,
        thumbnail,
        recognized: false,
        originalSize: compressed.originalSize,
        compressedSize: compressed.compressedSize
      };

      setGoodsImage(newImage);
      console.log('[图片上传] 货物图片处理完成!');

    } catch (error) {
      console.error('货物图片处理失败:', error);
      alert(`处理货物图片失败，请重试`);
    }

    setIsAnalyzing(false);
  };

  // v3.0: 删除收货单图片
  const removeReceiptImage = () => {
    setReceiptImages([]);
  };

  // v3.0: 删除货物图片
  const removeGoodsImage = () => {
    setGoodsImage(null);
  };

  // 语音录入 - 开始录音
  const handleVoiceStart = async () => {
    if (!voiceEntryService.isSupported()) {
      alert('您的浏览器不支持语音录入功能');
      return;
    }

    try {
      await voiceEntryService.startRecording();
    } catch (error: any) {
      console.error('[语音录入] 启动失败:', error);
      if (error.name === 'NotAllowedError') {
        alert('请允许麦克风访问权限');
      }
    }
  };

  // 语音录入 - 停止录音
  const handleVoiceStop = () => {
    voiceEntryService.stopRecording();
  };

  const calculateGrandTotal = () => items.reduce((acc, curr) => acc + curr.total, 0);

  const handleWorksheetSubmit = async () => {
    // v4.1: 完整表单验证 - 图片、供应商、物品、单位、产品名称

    // 1. 图片必填验证
    if (receiptImages.length === 0) {
        alert('请上传收货单照片（必填）');
        return;
    }

    if (!goodsImage) {
        alert('请上传货物照片（必填）');
        return;
    }

    // 2. 供应商必填验证
    if (!supplier || supplier.trim() === '') {
        alert('请选择或输入供应商（必填）');
        return;
    }

    // 3. 检查是否有物品
    if (items.length === 0) {
        alert("请至少录入一项物品");
        return;
    }

    // 检查是否有物品名称为空
    const emptyNameItems = items.filter(i => i.name.trim() === '');
    if (emptyNameItems.length > 0) {
        alert(`请填写商品名称（共有 ${emptyNameItems.length} 项物品未填写名称）`);
        return;
    }

    // 检查是否有有效物品
    const validItems = items.filter(i => i.name.trim() !== '');
    if (validItems.length === 0) {
        alert("请至少录入一项物品");
        return;
    }

    // 4. 单位必填验证
    const missingUnitItems = validItems.filter(i => !i.unit || i.unit.trim() === '');
    if (missingUnitItems.length > 0) {
        const names = missingUnitItems.map(i => `"${i.name}"`).join('、');
        alert(`请填写单位（以下物品缺少单位：${names}）`);
        return;
    }

    // 5. 检查是否有价格为空或为0
    const invalidPriceItems = validItems.filter(i => !i.unitPrice || i.unitPrice <= 0);
    if (invalidPriceItems.length > 0) {
        const names = invalidPriceItems.map(i => i.name).join('、');
        alert(`请填写单价（以下物品单价无效：${names}）`);
        return;
    }

    // 6. 检查是否有数量为空或为0
    const invalidQuantityItems = validItems.filter(i => !i.quantity || i.quantity <= 0);
    if (invalidQuantityItems.length > 0) {
        const names = invalidQuantityItems.map(i => i.name).join('、');
        alert(`请填写数量（以下物品数量无效：${names}）`);
        return;
    }

    // 7. v4.1: 验证物品名称是否精确存在于数据库（避免"1"匹配到"红油"的问题）
    const unmatchedProducts: string[] = [];
    for (const item of validItems) {
        // 如果已有 productId（从下拉选择），则跳过验证
        if (item.productId) {
            continue;
        }

        // 使用精确匹配验证产品
        try {
            const product = await exactMatchProduct(item.name);
            if (!product) {
                // 产品不存在
                unmatchedProducts.push(item.name);
            }
        } catch (error) {
            console.error(`[验证] 产品精确匹配失败: ${item.name}`, error);
            // 网络错误时也算作未匹配（安全起见）
            unmatchedProducts.push(item.name);
        }
    }

    // 如果有未匹配的产品，显示错误提示并阻止提交
    if (unmatchedProducts.length > 0) {
        const productList = unmatchedProducts.map(name => `"${name}"`).join('、');
        const message = `以下物品在系统中未找到：

${productList}

请从下拉列表中选择已有物品，或联系管理员添加新物品。`;
        alert(message);
        return;
    }

    // v3.6: 进入 SUMMARY 页面前清除之前的提交状态
    setSubmitError(null);
    setSubmitMessage('');
    setSubmitProgress(null);
    setCountdown(0);
    setIsSubmitting(false);

    setStep('SUMMARY');
  };


  // v4.1: 确认提交直接加入队列（后台上传，用户无需等待）
  const handleSummaryConfirm = () => {
    const validItems = items.filter(i => i.name.trim() !== '');

    // 构建日志数据
    const logData: Omit<DailyLog, 'id'> = {
      date: new Date().toISOString(),
      category: selectedCategory,
      supplier: supplier || '未知供应商',
      supplierOther: supplier === '其他' ? supplierOther : undefined,
      items: validItems,
      totalCost: calculateGrandTotal(),
      notes: notes,
      status: 'Stocked',
      receiptImages: receiptImages.length > 0 ? receiptImages : undefined,
      goodsImage: goodsImage || undefined,
    };

    // 添加到队列
    if (storeId && employeeId) {
      const queueId = addToUploadQueue(logData, storeId, employeeId);
      console.log(`[队列] 任务已加入队列: ${queueId}`);

      // 显示成功提示
      setSubmitProgress('success');
      setSubmitMessage('已提交，可在上传记录中查看状态');
      setCountdown(2);

      // 2 秒后返回
      countdownIntervalRef.current = setInterval(() => {
        setCountdown(prev => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            // 重置表单状态
            setItems([{ name: '', specification: '', quantity: 1, unit: '', unitPrice: 0, total: 0 }]);
            setSupplier('');
            setSupplierOther('');
            setNotes('');
            setReceiptImages([]);
            setGoodsImage(null);
            setSubmitMessage('');
            setSubmitProgress(null);
            setCountdown(0);
            // 跳转回首页
            onSave(logData);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } else {
      alert('未登录，请先登录');
    }
  };

  // 立即返回 - 跳过倒计时直接返回
  const handleImmediateReturn = () => {
    // 清除倒计时
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    // 重置状态
    setSubmitMessage('');
    setIsSubmitting(false);
    setSubmitProgress(null);
    setCountdown(0);
    // 重置表单状态
    setItems([{ name: '', specification: '', quantity: 1, unit: '', unitPrice: 0, total: 0 }]);
    setSupplier('');
    setSupplierOther('');
    setNotes('');
    setReceiptImages([]);
    setGoodsImage(null);
    // 构建 logData 并调用 onSave 跳转
    const logData: Omit<DailyLog, 'id'> = {
      date: new Date().toISOString(),
      category: selectedCategory,
      supplier: supplier || '未知供应商',
      items: [],
      totalCost: 0,
      notes: '',
      status: 'Stocked',
    };
    onSave(logData);
  };

  return (
    <div className="h-full min-h-full text-primary overflow-hidden">
      {step === 'WELCOME' && (
        <WelcomeScreen
          userName={userName}
          onStart={() => setStep('CATEGORY')}
          onOpenMenu={onOpenMenu}
        />
      )}
      {step === 'CATEGORY' && (
        <CategoryScreen
          onSelect={handleCategorySelect}
          onBack={() => setStep('WELCOME')}
        />
      )}
      {step === 'WORKSHEET' && (
        <WorksheetScreen
          items={items}
          supplier={supplier}
          supplierOther={supplierOther}
          notes={notes}
          isAnalyzing={isAnalyzing}
          isRecognizing={isRecognizing}
          grandTotal={calculateGrandTotal()}
          receiptImages={receiptImages}
          goodsImage={goodsImage}
          voiceStatus={voiceStatus}
          voiceMessage={voiceMessage}
          transcriptionText={transcriptionText}
          showTranscription={showTranscription}
          isSendingTranscription={isSendingTranscription}
          onBack={() => setStep('CATEGORY')}
          onSupplierChange={setSupplier}
          onSupplierOtherChange={setSupplierOther}
          onNotesChange={setNotes}
          onItemChange={handleItemChange}
          onProductSelect={handleProductSelect}
          onAddItem={addNewRow}
          onRemoveItem={removeRow}
          onReceiptImageUpload={handleReceiptImageUpload}
          onGoodsImageUpload={handleGoodsImageUpload}
          onRemoveReceiptImage={handleRemoveReceiptImage}
          onRemoveGoodsImage={removeGoodsImage}
          onAIRecognize={handleAIRecognize}
          onVoiceStart={handleVoiceStart}
          onVoiceStop={handleVoiceStop}
          onTranscriptionChange={setTranscriptionText}
          onSendTranscription={handleSendTranscription}
          onReview={handleWorksheetSubmit}
        />
      )}
      {step === 'SUMMARY' && (
        <SummaryScreen
          items={items}
          supplier={supplier}
          notes={notes}
          grandTotal={calculateGrandTotal()}
          isSubmitting={isSubmitting}
          submitMessage={submitMessage}
          submitError={submitError}
          submitProgress={submitProgress}
          countdown={countdown}
          onBack={() => setStep('WORKSHEET')}
          onConfirm={handleSummaryConfirm}
          onImmediateReturn={handleImmediateReturn}
        />
      )}
    </div>
  );
};
