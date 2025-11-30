// 语音录入服务
// v2.5 - 语音识别与结构化提取分离：识别后返回文本供用户编辑，点击发送后才调用 Qwen
// v2.4: 修复竞态条件 - 在 getUserMedia 等待期间 WebSocket 状态可能变化
// v2.3: 处理 stop_recording 信号，当讯飞 VAD 检测到静音时立即停止发送音频
// v2.2: 优化 buffer size 从 4096 降至 1024，减少 ~192ms 延迟
// v2.1: 修复收到识别结果后不关闭 WebSocket，允许多次录音
// 与后端 inventory-entry-backend 配合使用，实时返回部分识别结果

import { ProcurementItem } from '../types';

// 后端服务配置
const BACKEND_URL = import.meta.env.VITE_VOICE_BACKEND_URL || 'http://localhost:8000';
const WS_URL = BACKEND_URL.replace('http', 'ws') + '/api/voice/ws';

// 语音录入结果 - 与后端 VoiceEntryResult 模型对应
export interface VoiceEntryResult {
  supplier: string;
  notes: string;
  items: ProcurementItem[];
}

// WebSocket 消息类型
// v2.5: 添加 text_final 类型（识别完成但未解析）
export type VoiceMessageType = 'start' | 'audio' | 'end' | 'cancel' | 'status' | 'partial' | 'text' | 'text_final' | 'result' | 'error' | 'stop_recording';

export interface VoiceMessage {
  type: VoiceMessageType;
  data?: string;
  text?: string; // 实时部分识别文本
  status?: 'listening' | 'processing' | 'completed' | 'error';
  message?: string;
  raw_text?: string;
  result?: VoiceEntryResult;
  error?: string;
}

// 录音状态
export type RecordingStatus = 'idle' | 'recording' | 'processing' | 'completed' | 'error';

// 回调函数类型
// v2.5: 添加 onTextFinal 回调（识别完成，可编辑后发送）
export interface VoiceEntryCallbacks {
  onStatusChange?: (status: RecordingStatus, message?: string) => void;
  onPartialText?: (text: string) => void;
  onTextFinal?: (text: string) => void;  // v2.5: 识别完成，文本可供编辑
  onResult?: (result: VoiceEntryResult, rawText: string) => void;
  onError?: (error: string) => void;
}

class VoiceEntryService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private audioProcessor: ScriptProcessorNode | null = null;
  private audioSource: MediaStreamAudioSourceNode | null = null;
  private mediaStream: MediaStream | null = null;
  private ws: WebSocket | null = null;
  private callbacks: VoiceEntryCallbacks = {};
  private status: RecordingStatus = 'idle';
  private audioChunks: Blob[] = [];

  /**
   * 检查浏览器是否支持语音录入
   */
  isSupported(): boolean {
    return !!(
      navigator.mediaDevices &&
      navigator.mediaDevices.getUserMedia &&
      window.MediaRecorder &&
      window.WebSocket
    );
  }

  /**
   * 获取当前状态
   */
  getStatus(): RecordingStatus {
    return this.status;
  }

  /**
   * 设置回调函数
   */
  setCallbacks(callbacks: VoiceEntryCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * 开始录音 - 实时流式识别（默认方法）
   */
  async startRecording(): Promise<void> {
    if (this.status === 'recording') {
      console.warn('[VoiceEntry] 已经在录音中');
      return;
    }

    try {
      // v2.1: 如果 WebSocket 已连接（连续录音），直接开始新的录音会话
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        console.log('[VoiceEntry] 复用现有 WebSocket 连接');
        await this.startNewRecordingSession();
        return;
      }

      // 首次连接 WebSocket
      this.ws = new WebSocket(WS_URL);

      this.ws.onopen = async () => {
        console.log('[VoiceEntry] WebSocket onopen 触发，状态:', this.ws?.readyState);

        // v2.4: 等待 WebSocket 真正处于 OPEN 状态（某些浏览器 onopen 触发时状态可能还未更新）
        await this.waitForWebSocketReady();

        if (this.ws?.readyState === WebSocket.OPEN) {
          await this.startNewRecordingSession();
        } else {
          console.error('[VoiceEntry] WebSocket 未就绪，放弃录音');
          this.updateStatus('error', 'WebSocket 连接不稳定，请重试');
        }
      };

      this.ws.onmessage = (event) => {
        const message: VoiceMessage = JSON.parse(event.data);
        this.handleWebSocketMessage(message);
      };

      this.ws.onerror = (error) => {
        console.error('[VoiceEntry] WebSocket 错误:', error);
        this.cleanup();
        this.updateStatus('error', 'WebSocket 连接失败');
      };

      this.ws.onclose = () => {
        console.log('[VoiceEntry] WebSocket 已关闭');
        // v2.1: 仅在非正常状态下清理资源（避免结果接收后自动关闭）
        if (this.status === 'recording' || this.status === 'processing') {
          this.cleanup();
          this.updateStatus('error', 'WebSocket 意外关闭');
        }
      };

    } catch (error: any) {
      console.error('[VoiceEntry] 录音启动失败:', error);
      this.cleanup();
      this.updateStatus('error', error.message || '启动失败');
      throw error;
    }
  }

  /**
   * 开始新的录音会话（复用 WebSocket）
   * v2.4: 修复竞态条件 - 在 getUserMedia 等待期间 WebSocket 状态可能变化
   */
  private async startNewRecordingSession(): Promise<void> {
    try {
      // v2.4: 先检查 WebSocket 状态
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error('[VoiceEntry] WebSocket 未就绪，状态:', this.ws?.readyState);
        throw new Error('WebSocket 连接未就绪，请重试');
      }

      // 请求麦克风权限
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // v2.4: getUserMedia 后再次检查 WebSocket 状态（可能在等待权限时断开）
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        console.error('[VoiceEntry] 获取麦克风权限后 WebSocket 已断开');
        this.stopMediaStream();
        throw new Error('WebSocket 连接已断开，请重试');
      }

      // 创建 AudioContext
      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream);

      // 使用 ScriptProcessorNode 进行实时处理
      // v2.3: 优化 buffer size: 讯飞推荐每 40ms 发送 1280 bytes = 640 samples
      // Web Audio API 要求 buffer size 为 2^n，最接近的是 512 (~32ms)
      // 512 samples = 1024 bytes，每 32ms 发送一次，比讯飞推荐更频繁但更小
      this.audioProcessor = this.audioContext.createScriptProcessor(512, 1, 1);

      this.audioProcessor.onaudioprocess = (e) => {
        if (this.ws?.readyState === WebSocket.OPEN && this.status === 'recording') {
          const inputData = e.inputBuffer.getChannelData(0);

          // 转换为 16-bit PCM
          const pcmData = this.float32ToPCM16(inputData);
          const base64Data = this.arrayBufferToBase64(pcmData);

          // 发送音频块到服务器
          this.ws.send(JSON.stringify({
            type: 'audio',
            data: base64Data
          }));
        }
      };

      // 连接音频节点
      this.audioSource.connect(this.audioProcessor);
      this.audioProcessor.connect(this.audioContext.destination);

      // v2.4: 最终检查并发送开始信号
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'start' }));
        this.updateStatus('recording', '正在录音...');
        console.log('[VoiceEntry] 开始实时录音');
      } else {
        throw new Error('WebSocket 在发送前断开');
      }

    } catch (error: any) {
      console.error('[VoiceEntry] 麦克风访问失败:', error);
      this.cleanup();
      this.updateStatus('error', error.message || '无法访问麦克风');
      throw error;
    }
  }

  /**
   * v2.4: 停止媒体流（不清理 WebSocket）
   */
  private stopMediaStream(): void {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  /**
   * v2.4: 等待 WebSocket 真正处于 OPEN 状态
   * 某些浏览器在 onopen 触发时 readyState 可能还未更新
   */
  private waitForWebSocketReady(): Promise<void> {
    return new Promise((resolve) => {
      const maxAttempts = 10;
      let attempts = 0;

      const checkReady = () => {
        attempts++;
        if (this.ws?.readyState === WebSocket.OPEN) {
          console.log('[VoiceEntry] WebSocket 已就绪，尝试次数:', attempts);
          resolve();
        } else if (attempts < maxAttempts && this.ws) {
          // 每 50ms 检查一次，最多等待 500ms
          setTimeout(checkReady, 50);
        } else {
          console.warn('[VoiceEntry] WebSocket 等待超时，状态:', this.ws?.readyState);
          resolve(); // 超时也继续，让后续代码处理错误
        }
      };

      checkReady();
    });
  }

  /**
   * 停止录音
   */
  stopRecording(): void {
    if (this.ws?.readyState === WebSocket.OPEN && this.status === 'recording') {
      // 发送结束信号
      this.ws.send(JSON.stringify({ type: 'end' }));
      this.updateStatus('processing', '正在识别语音...');
      console.log('[VoiceEntry] 停止录音');

      // 停止音频处理
      this.stopAudioProcessing();
    }
  }

  /**
   * 取消录音
   */
  cancelRecording(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'cancel' }));
    }
    this.cleanup();
    this.updateStatus('idle');
    console.log('[VoiceEntry] 取消录音');
  }

  /**
   * 关闭 WebSocket 连接（用于清理资源或页面卸载）
   */
  closeConnection(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'close' }));
    }
    this.cleanup();
    this.updateStatus('idle');
    console.log('[VoiceEntry] 关闭连接');
  }

  /**
   * 停止音频处理
   */
  private stopAudioProcessing(): void {
    if (this.audioProcessor) {
      this.audioProcessor.disconnect();
      this.audioProcessor = null;
    }
    if (this.audioSource) {
      this.audioSource.disconnect();
      this.audioSource = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
  }

  /**
   * 清理资源
   */
  private cleanup(): void {
    this.stopAudioProcessing();

    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }

    if (this.ws) {
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }
  }

  /**
   * 处理录音数据 - 发送到后端
   */
  private async processAudio(): Promise<void> {
    if (this.audioChunks.length === 0) {
      this.updateStatus('error', '没有录音数据');
      return;
    }

    try {
      // 合并音频数据
      const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
      console.log(`[VoiceEntry] 音频大小: ${(audioBlob.size / 1024).toFixed(2)} KB`);

      // 发送到后端 REST API (简单方案，不使用 WebSocket)
      const formData = new FormData();
      formData.append('audio', audioBlob, 'recording.webm');

      const response = await fetch(`${BACKEND_URL}/api/voice/transcribe`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`);
      }

      const data = await response.json();

      if (data.success && data.result) {
        this.updateStatus('completed', '识别完成');
        this.callbacks.onResult?.(data.result, data.raw_text || '');
        console.log('[VoiceEntry] 识别结果:', data.result);
      } else {
        throw new Error(data.error || '识别失败');
      }

    } catch (error: any) {
      console.error('[VoiceEntry] 处理失败:', error);
      this.updateStatus('error', error.message || '处理失败');
      this.callbacks.onError?.(error.message || '处理失败');
    }
  }

  /**
   * 批处理模式录音（REST API 备用方案）
   * 用于 WebSocket 不可用时的降级处理
   */
  async startBatchRecording(): Promise<void> {
    if (this.status === 'recording') {
      console.warn('[VoiceEntry] 已经在录音中');
      return;
    }

    try {
      // 请求麦克风权限
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        }
      });

      // 创建 AudioContext 用于转换采样率
      this.audioContext = new AudioContext({ sampleRate: 16000 });

      // 创建 MediaRecorder
      // 注意：浏览器可能不支持 PCM，使用 webm 然后在后端转换
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 16000
      });

      this.audioChunks = [];

      // 录音数据事件
      this.mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // 录音停止事件
      this.mediaRecorder.onstop = async () => {
        // 停止所有音轨
        stream.getTracks().forEach(track => track.stop());

        // 发送音频到后端处理
        await this.processAudio();
      };

      // 开始录音
      this.mediaRecorder.start(1000); // 每秒触发一次 ondataavailable

      this.updateStatus('recording', '正在录音...');
      console.log('[VoiceEntry] 开始批处理录音');

    } catch (error: any) {
      console.error('[VoiceEntry] 录音启动失败:', error);
      this.updateStatus('error', error.message || '无法访问麦克风');
      throw error;
    }
  }

  /**
   * 停止批处理录音
   */
  stopBatchRecording(): void {
    if (this.mediaRecorder && this.status === 'recording') {
      this.mediaRecorder.stop();
      this.updateStatus('processing', '正在识别语音...');
      console.log('[VoiceEntry] 停止批处理录音');
    }
  }

  /**
   * 处理 WebSocket 消息
   */
  private handleWebSocketMessage(message: VoiceMessage): void {
    switch (message.type) {
      case 'status':
        if (message.status === 'listening') {
          this.updateStatus('recording', message.message);
        } else if (message.status === 'processing') {
          this.updateStatus('processing', message.message);
        }
        break;

      case 'partial':
        // 实时部分识别结果
        this.callbacks.onPartialText?.(message.text || '');
        break;

      case 'text':
        // 完整识别文本（兼容旧版）
        this.callbacks.onPartialText?.(message.data || '');
        break;

      case 'stop_recording':
        // v2.3: 后端通知停止录音（讯飞 VAD 检测到静音，已完成识别）
        console.log('[VoiceEntry] 收到停止录音信号:', message.message);
        this.stopAudioProcessing();
        break;

      case 'text_final':
        // v2.5: 识别完成，返回文本供用户编辑（不自动解析）
        console.log('[VoiceEntry] 识别完成，文本:', message.text);
        this.updateStatus('idle', '');  // 回到 idle，允许继续录音或手动发送
        this.callbacks.onTextFinal?.(message.text || '');
        this.stopAudioProcessing();
        break;

      case 'result':
        // 保留 result 处理以兼容旧版后端
        if (message.result) {
          this.updateStatus('idle', '');
          this.callbacks.onResult?.(message.result, message.raw_text || '');
          this.stopAudioProcessing();
        }
        break;

      case 'error':
        this.updateStatus('error', message.error || '未知错误');
        this.callbacks.onError?.(message.error || '未知错误');
        this.cleanup();
        break;
    }
  }

  /**
   * 停止实时录音
   */
  stopRealtimeRecording(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'end' }));
    }
    this.audioContext?.close();
  }

  /**
   * 更新状态
   */
  private updateStatus(status: RecordingStatus, message?: string): void {
    this.status = status;
    this.callbacks.onStatusChange?.(status, message);
  }

  /**
   * Float32 转 16-bit PCM
   */
  private float32ToPCM16(float32Array: Float32Array): ArrayBuffer {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);

    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    return buffer;
  }

  /**
   * ArrayBuffer 转 Base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * 直接从文本提取结构化数据 (测试用)
   */
  async extractFromText(text: string): Promise<VoiceEntryResult | null> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/voice/extract`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });

      if (!response.ok) {
        throw new Error(`服务器错误: ${response.status}`);
      }

      const data = await response.json();
      return data.success ? data.result : null;

    } catch (error) {
      console.error('[VoiceEntry] 文本提取失败:', error);
      return null;
    }
  }

  /**
   * 检查后端服务状态
   */
  async checkBackendHealth(): Promise<boolean> {
    try {
      const response = await fetch(`${BACKEND_URL}/api/voice/health`);
      const data = await response.json();
      return data.status === 'ok';
    } catch {
      return false;
    }
  }
}

// 单例导出
export const voiceEntryService = new VoiceEntryService();
