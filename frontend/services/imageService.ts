/**
 * 图片压缩与上传服务
 * v2.0 - 支持图片分类上传（receipt/goods）
 *
 * 变更历史：
 * - v2.0: uploadImageToStorage 新增 category 参数支持图片分类
 * - v1.0: 识别优先策略，保持高清晰度以确保 AI 识别准确率
 */

export interface CompressOptions {
  maxWidth?: number;      // 最大宽度，默认 2560（识别优先）
  maxHeight?: number;     // 最大高度，默认 1920
  quality?: number;       // 压缩质量 0-1，默认 0.85（高质量）
  maxSizeKB?: number;     // 目标大小 KB，默认 1500（1.5MB）
}

export interface CompressResult {
  data: string;           // Base64 数据（不含前缀）
  mimeType: string;
  originalSize: number;   // 原始大小 (bytes)
  compressedSize: number; // 压缩后大小 (bytes)
  width: number;
  height: number;
}

/**
 * 压缩图片
 * @param file 原始文件
 * @param options 压缩选项
 * @returns 压缩后的 base64 数据和元信息
 */
export const compressImage = async (
  file: File,
  options: CompressOptions = {}
): Promise<CompressResult> => {
  const {
    maxWidth = 2560,
    maxHeight = 1920,
    quality = 0.85,
    maxSizeKB = 1500
  } = options;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      const img = new Image();

      img.onload = () => {
        // 计算缩放比例
        let { width, height } = img;
        if (width > maxWidth || height > maxHeight) {
          const ratio = Math.min(maxWidth / width, maxHeight / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }

        // 创建 canvas 压缩
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // 使用高质量缩放
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        // 递归压缩直到满足大小要求
        let currentQuality = quality;
        let dataUrl = canvas.toDataURL('image/jpeg', currentQuality);

        // dataUrl 长度约为实际大小的 4/3（base64 编码）
        const targetLength = maxSizeKB * 1024 * 4 / 3;

        while (dataUrl.length > targetLength && currentQuality > 0.3) {
          currentQuality -= 0.05;
          dataUrl = canvas.toDataURL('image/jpeg', currentQuality);
        }

        // 提取 base64 数据（去掉 data:image/jpeg;base64, 前缀）
        const base64Data = dataUrl.split(',')[1];
        const compressedSize = Math.round(base64Data.length * 3 / 4); // 实际字节数

        resolve({
          data: base64Data,
          mimeType: 'image/jpeg',
          originalSize: file.size,
          compressedSize,
          width,
          height
        });
      };

      img.onerror = () => reject(new Error('图片加载失败'));
      img.src = e.target?.result as string;
    };

    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
};

/**
 * 生成缩略图
 * @param base64Data 原图 Base64 数据
 * @param size 缩略图尺寸（正方形），默认 128
 * @returns 缩略图 Base64 数据
 */
export const generateThumbnail = async (
  base64Data: string,
  size: number = 128
): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d')!;

      // 居中裁切为正方形
      const minDim = Math.min(img.width, img.height);
      const sx = (img.width - minDim) / 2;
      const sy = (img.height - minDim) / 2;

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'medium';
      ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

      // 缩略图使用较低质量以节省内存
      const thumbnailDataUrl = canvas.toDataURL('image/jpeg', 0.6);
      resolve(thumbnailDataUrl.split(',')[1]);
    };

    img.onerror = () => reject(new Error('缩略图生成失败'));
    img.src = `data:image/jpeg;base64,${base64Data}`;
  });
};

/**
 * 格式化文件大小显示
 */
export const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

/**
 * 验证文件是否为图片
 */
export const isImageFile = (file: File): boolean => {
  return file.type.startsWith('image/');
};

/**
 * 从 Base64 数据创建 Blob（用于上传到后端）
 */
export const base64ToBlob = (base64Data: string, mimeType: string = 'image/jpeg'): Blob => {
  const byteCharacters = atob(base64Data);
  const byteNumbers = new Array(byteCharacters.length);

  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }

  const byteArray = new Uint8Array(byteNumbers);
  return new Blob([byteArray], { type: mimeType });
};

/**
 * 上传图片到 Supabase Storage
 * v2.0 - 支持图片分类（receipt/goods）
 *
 * @param base64Data Base64 图片数据（不含前缀）
 * @param mimeType 图片类型
 * @param storeId 门店ID
 * @param category 图片分类：'receipt' 收货单 | 'goods' 货物
 * @returns 图片的 public URL
 */
export const uploadImageToStorage = async (
  base64Data: string,
  mimeType: string,
  storeId: string,
  category: 'receipt' | 'goods' = 'receipt'
): Promise<string> => {
  const { supabase } = await import('./supabaseClient');

  // 1. Base64 转 Blob
  const blob = base64ToBlob(base64Data, mimeType);

  // 2. 生成文件路径：category/restaurant_id/日期/时间戳_随机.jpg
  const date = new Date().toISOString().split('T')[0];
  const fileName = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
  const path = `${category}/${storeId}/${date}/${fileName}`;

  // 3. 上传到 Storage
  const { data, error } = await supabase.storage
    .from('ims-receipts')
    .upload(path, blob, {
      contentType: mimeType,
      upsert: false
    });

  if (error) {
    console.error('[图片上传] 失败:', error);
    throw new Error(`图片上传失败: ${error.message}`);
  }

  // 4. 返回 public URL
  const { data: urlData } = supabase.storage
    .from('ims-receipts')
    .getPublicUrl(path);

  console.log(`[图片上传] 成功 (${category}): ${urlData.publicUrl}`);
  return urlData.publicUrl;
};
