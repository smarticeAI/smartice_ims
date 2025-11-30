
export interface ProcurementItem {
  name: string;
  specification: string; // Added specification field
  quantity: number;
  unit: string;
  unitPrice: number; // Added for line-item validation
  total: number;     // quantity * unitPrice
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

export interface DailyLog {
  id: string;
  date: string;
  category: CategoryType;
  supplier: string;
  items: ProcurementItem[];
  totalCost: number;
  notes: string;
  status: 'Stocked' | 'Pending' | 'Issue';
  attachments?: AttachedImage[];  // 凭证图片
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
  // DESIGN_ASSISTANT 已移除 - 前后端分离重构
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
