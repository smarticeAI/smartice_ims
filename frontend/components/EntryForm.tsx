// EntryForm - 采购录入表单
// v2.5 - 合并"拍照"和"相册"按钮为单一"添加"按钮
// v2.4 - 单位输入改为自由文本（移除自动完成），修复总价为空时的页面崩溃
// v2.3 - 单位输入改为自动完成（与商品名称相同设计，输入后才显示下拉）
// v2.1 - 支持总价/单价双向输入，自动换算
// v2.0 - 单位输入改为下拉列表，移除单位映射表，直接使用 unitId
// v1.9 - 添加收货订单图片上传区，集成到信息卡片中
// v1.8 - 语音录入交互优化：识别后可编辑文本，点击发送按钮才解析填充表单
// v1.7 - UI 重构：隐藏相机/文件按钮，文本框多行滚动，提交按钮移至物品列表区域
// v1.6 - 添加物品删除按钮，始终可见，Storm Glass 风格悬停效果
// v1.5 - 重构语音 UI：移除浮动弹窗，集成到底部 bar，添加发光边框动画
// v1.4 - 修复语音录入 WebSocket 自动关闭问题，支持连续录音
// v1.3 - 清除 Mock 数据预填充，添加灰色占位符文本，添加语音录入实时转录

import React, { useState, useRef, useEffect } from 'react';
import { DailyLog, ProcurementItem, CategoryType, AttachedImage } from '../types';
// 图片识别功能暂时禁用，待后端 API 完成后重新启用
// import { parseDailyReport } from '../services/geminiService';
import { compressImage, generateThumbnail, formatFileSize } from '../services/imageService';
import { voiceEntryService, RecordingStatus, VoiceEntryResult } from '../services/voiceEntryService';
import { submitProcurement, formatSubmitResult } from '../services/inventoryService';
import { useAuth } from '../contexts/AuthContext';
import { Icons } from '../constants';
import { GlassCard, Button, Input, AutocompleteInput } from './ui';
import { searchSuppliers, searchProducts } from '../services/supabaseService';

interface EntryFormProps {
  onSave: (log: Omit<DailyLog, 'id'>) => void;
  userName: string;
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

const WelcomeScreen: React.FC<{ userName: string; onStart: () => void }> = ({ userName, onStart }) => {
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

const WorksheetScreen: React.FC<{
  items: ProcurementItem[];
  supplier: string;
  notes: string;
  isAnalyzing: boolean;
  grandTotal: number;
  attachedImages: AttachedImage[];
  voiceStatus: RecordingStatus;
  voiceMessage: string;
  transcriptionText: string;
  showTranscription: boolean;
  isSendingTranscription: boolean;
  onBack: () => void;
  onSupplierChange: (val: string) => void;
  onNotesChange: (val: string) => void;
  onItemChange: (index: number, field: keyof ProcurementItem, value: any) => void;
  onAddItem: () => void;
  onRemoveItem: (index: number) => void;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveImage: (id: string) => void;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  onTranscriptionChange: (text: string) => void;
  onSendTranscription: () => void;
  onReview: () => void;
}> = ({
  items, supplier, notes, isAnalyzing, grandTotal, attachedImages,
  voiceStatus, voiceMessage, transcriptionText, showTranscription, isSendingTranscription,
  onBack, onSupplierChange, onNotesChange, onItemChange, onAddItem, onRemoveItem, onImageUpload, onRemoveImage, onVoiceStart, onVoiceStop, onTranscriptionChange, onSendTranscription, onReview
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
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
        <GlassCard padding="md" className="space-y-4">
          <AutocompleteInput
            label="供应商全称"
            value={supplier}
            onChange={onSupplierChange}
            placeholder="输入供应商名称..."
            searchFn={searchSuppliers}
            debounceMs={300}
            minChars={1}
          />
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

          {/* v1.9: 收货订单图片上传区 */}
          <div>
             <label className="block text-[20px] tracking-wider text-zinc-500 font-bold mb-2 ml-1">
               收货订单
             </label>
             <div className="flex flex-wrap gap-3">
               {/* 已上传的收货单图片 */}
               {attachedImages.map((img) => (
                 <div key={img.id} className="relative group">
                   <img
                     src={`data:${img.mimeType};base64,${img.thumbnail || img.data}`}
                     alt="收货单"
                     className="w-20 h-20 object-cover rounded-xl border border-white/15"
                     style={{
                       boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
                     }}
                   />
                   {/* 删除按钮 */}
                   <button
                     onClick={() => onRemoveImage(img.id)}
                     className="absolute -top-2 -right-2 w-6 h-6 bg-red-500/90 rounded-full flex items-center justify-center transition-all hover:bg-red-500 border-2 border-[#1a1a1f]"
                   >
                     <Icons.X className="w-3.5 h-3.5 text-white" />
                   </button>
                 </div>
               ))}

               {/* 添加图片按钮（支持拍照和相册） */}
               <button
                 onClick={() => {
                   console.log('[图片上传] 点击添加图片按钮');
                   fileInputRef.current?.click();
                 }}
                 disabled={isAnalyzing}
                 className="w-20 h-20 rounded-xl border-2 border-dashed border-white/20 hover:border-white/40 bg-white/5 hover:bg-white/10 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 disabled:opacity-40"
               >
                 {isAnalyzing ? (
                   <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                 ) : (
                   <>
                     <Icons.Camera className="w-6 h-6 text-white/50" />
                     <span className="text-[10px] text-white/40">添加</span>
                   </>
                 )}
               </button>
             </div>
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
              disabled={voiceStatus === 'recording' || voiceStatus === 'processing'}
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
             {/* Hidden file input for image upload */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={onImageUpload}
                accept="image/*"
                multiple
                className="hidden"
              />

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
                 /* Microphone Button */
                 <button
                   onClick={onVoiceStart}
                   disabled={isAnalyzing || voiceStatus === 'processing'}
                   className="w-11 h-11 rounded-xl flex items-center justify-center text-white/60 hover:bg-white/10 hover:text-white transition-colors active:scale-95 disabled:opacity-40 flex-shrink-0"
                 >
                   {voiceStatus === 'processing' ? (
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
                : '尝试用AI帮忙录入，请用正常说话的方式说出你想录入的内容'
          }
          disabled={voiceStatus === 'recording' || voiceStatus === 'processing'}
          rows={1}
          className={`w-full min-h-[44px] max-h-[120px] rounded-xl px-3 py-2.5 text-sm text-white/90 placeholder-white/30 resize-none outline-none transition-all ${
            voiceStatus === 'recording' ? 'bg-transparent' : 'bg-white/8'
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

const SummaryScreen: React.FC<{
  items: ProcurementItem[];
  supplier: string;
  notes: string;
  grandTotal: number;
  isSubmitting: boolean;
  submitMessage: string;
  submitError: string | null;
  onBack: () => void;
  onConfirm: () => void;
}> = ({ items, supplier, notes, grandTotal, isSubmitting, submitMessage, submitError, onBack, onConfirm }) => {
  return (
    <div className="h-full animate-slide-in flex flex-col relative">
      <div className="px-6 py-5 flex items-center gap-4">
        <button onClick={onBack} className="w-10 h-10 rounded-full bg-glass-bg backdrop-blur-glass border border-glass-border flex items-center justify-center text-secondary hover:bg-glass-bg-hover transition-colors">
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

        {/* 成功消息框 - 显示在顶部 */}
        {submitMessage && !submitError && (
          <div className="mb-4 p-4 rounded-glass-lg border border-ios-green/30 animate-slide-in"
               style={{
                 background: 'rgba(107, 158, 138, 0.15)',
                 backdropFilter: 'blur(24px)',
                 WebkitBackdropFilter: 'blur(24px)',
                 boxShadow: '0 4px 24px rgba(107, 158, 138, 0.2)'
               }}>
            <div className="flex items-start gap-3">
              <div className="w-6 h-6 rounded-full bg-ios-green/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Icons.Check className="w-4 h-4 text-ios-green" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-semibold text-ios-green mb-1">提交成功</p>
                <p className="text-sm text-white/90 whitespace-pre-wrap">{submitMessage}</p>
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

      <div className="fixed bottom-6 left-4 right-4 z-50 safe-area-bottom">
         <button
           onClick={onConfirm}
           disabled={isSubmitting}
           className={`w-full py-4 rounded-2xl text-white font-semibold text-lg transition-all border border-white/10 flex items-center justify-center gap-2 ${
             isSubmitting ? 'opacity-60 cursor-not-allowed' : 'active:scale-[0.98] hover:bg-white/5'
           }`}
           style={{
             background: 'rgba(30, 30, 35, 0.75)',
             backdropFilter: 'blur(40px) saturate(180%)',
             WebkitBackdropFilter: 'blur(40px) saturate(180%)',
             boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.1)'
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
                <span>确认入库</span>
              </>
            )}
         </button>
      </div>
    </div>
  )
}

// --- Main Container ---

export const EntryForm: React.FC<EntryFormProps> = ({ onSave, userName }) => {
  const [step, setStep] = useState<EntryStep>('WELCOME');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('Meat');
  const [supplier, setSupplier] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [attachedImages, setAttachedImages] = useState<AttachedImage[]>([]);

  // 语音录入状态
  const [voiceStatus, setVoiceStatus] = useState<RecordingStatus>('idle');
  const [voiceMessage, setVoiceMessage] = useState('');
  const [transcriptionText, setTranscriptionText] = useState('');
  const [showTranscription, setShowTranscription] = useState(false);
  const [isSendingTranscription, setIsSendingTranscription] = useState(false);

  // v1.8: 填充表单数据的公共函数
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

  // v1.8: 手动发送文本进行解析
  const handleSendTranscription = async () => {
    if (!transcriptionText.trim() || isSendingTranscription) return;

    setIsSendingTranscription(true);
    try {
      console.log('[语音录入] 手动发送解析:', transcriptionText);
      const result = await voiceEntryService.extractFromText(transcriptionText);

      if (result) {
        fillFormWithResult(result);
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

  // 获取认证信息
  const { storeId, employeeId } = useAuth();

  // 初始化语音服务回调
  // v1.8: 识别完成后仅显示文本，不自动填充，需点击发送按钮
  useEffect(() => {
    voiceEntryService.setCallbacks({
      onStatusChange: (status, message) => {
        setVoiceStatus(status);
        setVoiceMessage(message || '');

        // 显示转录面板
        if (status === 'recording' || status === 'processing') {
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

  const addNewRow = () => {
    setItems([...items, { name: '', specification: '', quantity: 0, unit: '', unitPrice: 0, total: 0 }]);
  };

  const removeRow = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('[图片上传] 触发上传事件');
    const files = e.target.files;
    console.log('[图片上传] 选择的文件:', files?.length || 0, '个');
    if (!files || files.length === 0) return;

    // 先复制文件列表，再重置input（避免某些浏览器清空files）
    const fileList = Array.from(files);
    e.target.value = '';

    // 处理每个文件
    for (const file of fileList) {
      console.log('[图片上传] 开始处理文件:', file.name, file.type, file.size);
      // 生成唯一 ID
      const imageId = crypto.randomUUID();

      setIsAnalyzing(true);

      try {
        // 1. 压缩图片（识别优先：2560px, 0.85 质量, 1.5MB）
        console.log('[图片上传] 开始压缩...');
        const compressed = await compressImage(file);
        console.log(`[图片压缩] ${file.name}: ${formatFileSize(compressed.originalSize)} → ${formatFileSize(compressed.compressedSize)}`);

        // 2. 生成缩略图
        console.log('[图片上传] 生成缩略图...');
        const thumbnail = await generateThumbnail(compressed.data);
        console.log('[图片上传] 缩略图生成完成');

        // 3. 创建附件对象（未识别状态）
        const newImage: AttachedImage = {
          id: imageId,
          data: compressed.data,
          mimeType: compressed.mimeType,
          thumbnail,
          recognized: false,
          originalSize: compressed.originalSize,
          compressedSize: compressed.compressedSize
        };

        // 4. 立即添加到预览（显示识别中状态）
        console.log('[图片上传] 添加到预览列表...');
        setAttachedImages(prev => [...prev, newImage]);
        console.log('[图片上传] 图片处理完成!');

        // AI 图片识别暂时禁用 - 待后端 API 完成后重新启用
        // 目前图片仅作为附件保存，不进行识别
        console.log('[图片上传] AI 识别已禁用，图片仅作为附件保存');

        // 直接标记为已处理（非识别）
        setAttachedImages(prev =>
          prev.map(img => img.id === imageId ? { ...img, recognized: true } : img)
        );

      } catch (error) {
        console.error('图片处理失败:', error);
        // 移除失败的图片
        setAttachedImages(prev => prev.filter(img => img.id !== imageId));
        alert(`处理图片 ${file.name} 失败，请重试`);
      }
    }

    setIsAnalyzing(false);
  };

  // 删除附件图片
  const removeImage = (id: string) => {
    setAttachedImages(prev => prev.filter(img => img.id !== id));
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

  const handleWorksheetSubmit = () => {
    // 检查是否有物品
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

    // 检查是否有价格为空或为0
    const invalidPriceItems = validItems.filter(i => !i.unitPrice || i.unitPrice <= 0);
    if (invalidPriceItems.length > 0) {
        const names = invalidPriceItems.map(i => i.name).join('、');
        alert(`请填写单价（以下物品单价无效：${names}）`);
        return;
    }

    // 检查是否有数量为空或为0
    const invalidQuantityItems = validItems.filter(i => !i.quantity || i.quantity <= 0);
    if (invalidQuantityItems.length > 0) {
        const names = invalidQuantityItems.map(i => i.name).join('、');
        alert(`请填写数量（以下物品数量无效：${names}）`);
        return;
    }

    setStep('SUMMARY');
  };

  const handleSummaryConfirm = async () => {
    const validItems = items.filter(i => i.name.trim() !== '');

    // 构建日志数据
    const logData: Omit<DailyLog, 'id'> = {
      date: new Date().toISOString(),
      category: selectedCategory,
      supplier: supplier || '未知供应商',
      items: validItems,
      totalCost: calculateGrandTotal(),
      notes: notes,
      status: 'Stocked',
      attachments: attachedImages.length > 0 ? attachedImages : undefined
    };

    // 清除之前的错误信息
    setSubmitError(null);

    // 提交到数据库
    if (storeId && employeeId) {
      setIsSubmitting(true);
      setSubmitMessage('正在同步到数据库...');

      try {
        const result = await submitProcurement(logData, storeId, employeeId);

        // 检查是否提交成功
        if (!result.success && result.errors.length > 0) {
          // 提交失败：显示错误，保留在当前页面
          console.error('[EntryForm] 数据库提交失败:', result.errors);
          setSubmitError(result.errors.join('\n'));
          setIsSubmitting(false);
          setSubmitMessage('');
          return; // 不继续执行后续操作
        }

        // 提交成功：显示成功消息
        const message = formatSubmitResult(result);
        setSubmitMessage(message);

        // 保存到本地（仅在提交成功后）
        onSave(logData);

        // 显示结果 2 秒后清除状态并返回主页
        setTimeout(() => {
          setSubmitMessage('');
          setIsSubmitting(false);
          setStep('WELCOME'); // 返回主页
        }, 2000);

      } catch (err) {
        // 捕获异常：显示错误，保留在当前页面
        console.error('[EntryForm] 提交异常:', err);
        const errorMessage = err instanceof Error ? err.message : '未知错误';
        setSubmitError(`数据库同步失败: ${errorMessage}`);
        setIsSubmitting(false);
        setSubmitMessage('');
      }
    } else {
      // 未登录：显示错误提示
      console.warn('[EntryForm] 未登录，无法提交数据库');
      setSubmitError('未登录，请先登录后再提交数据');
      setIsSubmitting(false);
    }
  };

  return (
    <div className="h-full min-h-full text-primary overflow-hidden">
      {step === 'WELCOME' && (
        <WelcomeScreen
          userName={userName}
          onStart={() => setStep('CATEGORY')}
        />
      )}
      {step === 'CATEGORY' && (
        <CategoryScreen
          onSelect={handleCategorySelect}
          onBack={() => setStep('CATEGORY')}
        />
      )}
      {step === 'WORKSHEET' && (
        <WorksheetScreen
          items={items}
          supplier={supplier}
          notes={notes}
          isAnalyzing={isAnalyzing}
          grandTotal={calculateGrandTotal()}
          attachedImages={attachedImages}
          voiceStatus={voiceStatus}
          voiceMessage={voiceMessage}
          transcriptionText={transcriptionText}
          showTranscription={showTranscription}
          isSendingTranscription={isSendingTranscription}
          onBack={() => setStep('CATEGORY')}
          onSupplierChange={setSupplier}
          onNotesChange={setNotes}
          onItemChange={handleItemChange}
          onAddItem={addNewRow}
          onRemoveItem={removeRow}
          onImageUpload={handleImageUpload}
          onRemoveImage={removeImage}
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
          onBack={() => setStep('WORKSHEET')}
          onConfirm={handleSummaryConfirm}
        />
      )}
    </div>
  );
};
