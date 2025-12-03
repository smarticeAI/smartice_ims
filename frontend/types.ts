
// v3.1 - 新增 productId 用于严格产品匹配
export interface ProcurementItem {
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  unitId?: number;
  unitPrice: number;
  total: number;
  productId?: number;    // v3.1: 产品 ID，用于严格匹配数据库
}

export type CategoryType = 'Meat' | 'Vegetables' | 'Dry Goods' | 'Alcohol' | 'Consumables' | 'Other';

// 附件图片类型 - 用于采购凭证
export interface AttachedImage {
  id: string;
  data: string;        // Base64 压缩后数据
  mimeType: string;
  thumbnail?: string;  // 128px 缩略图 Base64
  recognized: boolean; // 是否已 AI 识别
  originalSize?: number;   // 原始文件大小 (bytes)
  compressedSize?: number; // 压缩后大小 (bytes)
}

// v3.5 - 更新 DailyLog：receiptImages 改为数组支持多张收货单
// v3.0 - 新增 receiptImage/goodsImage 分类图片，supplierOther "其他"供应商名称
export interface DailyLog {
  id: string;
  date: string;
  category: CategoryType;
  supplier: string;
  supplierOther?: string;          // v3.0: "其他"供应商时的名称
  items: ProcurementItem[];
  totalCost: number;
  notes: string;
  status: 'Stocked' | 'Pending' | 'Issue';
  attachments?: AttachedImage[];   // 兼容旧版
  receiptImages?: AttachedImage[]; // v3.5: 收货单图片（多张）
  goodsImage?: AttachedImage;      // v3.0: 货物图片
}

export interface ParseResult {
  supplier: string;
  items: ProcurementItem[];
  totalCost: number; // This might be calculated from items
  notes: string;
  status: 'Stocked' | 'Pending' | 'Issue';
}

export enum AppView {
  DASHBOARD = 'DASHBOARD',
  NEW_ENTRY = 'NEW_ENTRY',
  HISTORY = 'HISTORY',
  CHANGE_PASSWORD = 'CHANGE_PASSWORD',
}

// ============ Gemini Design Service Types ============

export interface GeneratedCode {
  componentName: string;
  code: string;
  dependencies?: string[];
  notes?: string;
  usage?: string;
  props?: ComponentProp[];
}

export interface ComponentProp {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface UIReviewResult {
  score: number;
  issues: UIIssue[];
  strengths: string[];
  codeSnippets?: CodeFix[];
}

export interface UIIssue {
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface CodeFix {
  issue: string;
  fix: string;
}

export interface ImageInput {
  data: string;      // Base64 encoded
  mimeType: string;  // e.g., 'image/png', 'image/jpeg'
}

export interface ImageToCodeOptions {
  framework?: 'react' | 'vue';
  styling?: 'tailwind' | 'css' | 'styled-components';
  componentName?: string;
}

export interface GenerateComponentOptions {
  type?: 'form' | 'card' | 'table' | 'modal' | 'list' | 'button';
  styling?: 'tailwind';
}
