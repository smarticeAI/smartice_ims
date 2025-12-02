import React, { useState, useRef } from 'react';
import { imageToCode, reviewUI, generateComponent } from '../services/geminiDesignService';
import { GeneratedCode, UIReviewResult } from '../types';
import { Icons } from '../constants';
import { GlassCard, Button, Input } from './ui';

type AssistantMode = 'imageToCode' | 'reviewUI' | 'generateComponent';

export const DesignAssistant: React.FC = () => {
  const [mode, setMode] = useState<AssistantMode>('generateComponent');
  const [isLoading, setIsLoading] = useState(false);
  const [description, setDescription] = useState('');
  const [componentName, setComponentName] = useState('');
  const [context, setContext] = useState('');
  const [uploadedImage, setUploadedImage] = useState<string | null>(null);
  const [imageMimeType, setImageMimeType] = useState<string>('');

  // Results
  const [codeResult, setCodeResult] = useState<GeneratedCode | null>(null);
  const [reviewResult, setReviewResult] = useState<UIReviewResult | null>(null);
  const [copied, setCopied] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = reader.result as string;
      setUploadedImage(base64.split(',')[1]);
      setImageMimeType(file.type);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    setCodeResult(null);
    setReviewResult(null);

    try {
      switch (mode) {
        case 'imageToCode':
          if (!uploadedImage) {
            alert('请先上传设计图');
            return;
          }
          const code = await imageToCode(
            { data: uploadedImage, mimeType: imageMimeType },
            { componentName: componentName || undefined }
          );
          setCodeResult(code);
          break;

        case 'reviewUI':
          if (!uploadedImage) {
            alert('请先上传 UI 截图');
            return;
          }
          const review = await reviewUI(
            { data: uploadedImage, mimeType: imageMimeType },
            context || undefined
          );
          setReviewResult(review);
          break;

        case 'generateComponent':
          if (!description.trim()) {
            alert('请输入组件描述');
            return;
          }
          const component = await generateComponent(description);
          setCodeResult(component);
          break;
      }
    } catch (error) {
      console.error('Error:', error);
      alert('处理失败，请重试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (codeResult?.code) {
      await navigator.clipboard.writeText(codeResult.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const clearResults = () => {
    setCodeResult(null);
    setReviewResult(null);
    setUploadedImage(null);
    setDescription('');
    setComponentName('');
    setContext('');
  };

  return (
    <div className="h-full flex flex-col animate-slide-in">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[rgba(138,75,47,0.3)]">
        <h1 className="text-2xl font-bold text-dune-peach mb-1">设计助手</h1>
        <p className="text-sm text-adobe-brown">Powered by Gemini 3</p>
      </div>

      {/* Mode Selector */}
      <div className="px-6 py-4 flex gap-2 border-b border-[rgba(138,75,47,0.3)] overflow-x-auto">
        {[
          { id: 'generateComponent', label: '生成组件', icon: Icons.Sparkles },
          { id: 'imageToCode', label: '图片转代码', icon: Icons.Camera },
          { id: 'reviewUI', label: 'UI 审查', icon: Icons.ChartBar },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => { setMode(item.id as AssistantMode); clearResults(); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-glass-lg text-sm font-medium transition-all whitespace-nowrap
              ${mode === item.id
                ? 'bg-ember-rock text-dune-peach'
                : 'bg-glass-bg backdrop-blur-sm text-adobe-brown hover:text-dune-peach border border-glass-border'
              }`}
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {/* Input Section */}
        <GlassCard padding="md" className="space-y-4">
          {/* Image Upload (for imageToCode and reviewUI) */}
          {(mode === 'imageToCode' || mode === 'reviewUI') && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-adobe-brown font-bold mb-2 ml-1">
                {mode === 'imageToCode' ? '上传设计图' : '上传 UI 截图'}
              </label>
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageUpload}
                accept="image/*"
                className="hidden"
              />
              {uploadedImage ? (
                <div className="relative">
                  <img
                    src={`data:${imageMimeType};base64,${uploadedImage}`}
                    alt="Uploaded"
                    className="w-full max-h-64 object-contain rounded-glass-lg border border-glass-border"
                  />
                  <button
                    onClick={() => { setUploadedImage(null); setImageMimeType(''); }}
                    className="absolute top-2 right-2 w-8 h-8 bg-cacao-husk/70 backdrop-blur-sm rounded-full flex items-center justify-center text-adobe-brown hover:text-dune-peach border border-[rgba(138,75,47,0.3)]"
                  >
                    <Icons.Trash className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-8 rounded-glass-xl border-2 border-dashed border-[rgba(138,75,47,0.3)] text-adobe-brown hover:text-apricot-dust hover:border-ember-rock/50 transition-colors flex flex-col items-center gap-2"
                >
                  <Icons.Camera className="w-8 h-8" />
                  <span>点击上传图片</span>
                </button>
              )}
            </div>
          )}

          {/* Component Name (for imageToCode) */}
          {mode === 'imageToCode' && (
            <Input
              label="组件名称（可选）"
              value={componentName}
              onChange={(e) => setComponentName(e.target.value)}
              placeholder="如 LoginForm, ProductCard..."
            />
          )}

          {/* Context (for reviewUI) */}
          {mode === 'reviewUI' && (
            <Input
              label="页面说明（可选）"
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="如：这是移动端的采购录入页面..."
            />
          )}

          {/* Description (for generateComponent) */}
          {mode === 'generateComponent' && (
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-adobe-brown font-bold mb-2 ml-1">
                组件描述
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="描述你想要的组件，例如：&#10;一个带搜索功能的下拉选择器，支持异步加载选项，iOS 风格..."
                rows={4}
                className="glass-input w-full resize-none"
              />
            </div>
          )}

          {/* Submit Button */}
          <Button
            variant="primary"
            fullWidth
            onClick={handleSubmit}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin mr-2" />
                <span>Gemini 处理中...</span>
              </>
            ) : (
              <>
                <Icons.Sparkles className="w-5 h-5 mr-2" />
                <span>
                  {mode === 'imageToCode' && '生成代码'}
                  {mode === 'reviewUI' && '开始审查'}
                  {mode === 'generateComponent' && '生成组件'}
                </span>
              </>
            )}
          </Button>
        </GlassCard>

        {/* Results Section */}
        {(codeResult || reviewResult) && (
          <GlassCard padding="md" className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-dune-peach">
                {codeResult ? '生成结果' : 'UI 审查报告'}
              </h3>
              {codeResult && (
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-glass-md bg-cacao-husk/50 text-sm text-apricot-dust hover:text-dune-peach transition-colors border border-[rgba(138,75,47,0.3)]"
                >
                  {copied ? (
                    <>
                      <Icons.Check className="w-4 h-4 text-success-green" />
                      <span>已复制</span>
                    </>
                  ) : (
                    <>
                      <Icons.Folder className="w-4 h-4" />
                      <span>复制代码</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Code Result */}
            {codeResult && (
              <div className="space-y-4">
                {/* Component Name */}
                <div className="flex items-center gap-2">
                  <span className="text-adobe-brown text-sm">组件名：</span>
                  <span className="text-dune-peach font-mono">{codeResult.componentName}</span>
                </div>

                {/* Code Block */}
                <pre className="bg-midnight-soil/50 border border-[rgba(138,75,47,0.3)] rounded-glass-lg p-4 overflow-x-auto text-sm text-apricot-dust font-mono">
                  {codeResult.code}
                </pre>

                {/* Notes */}
                {codeResult.notes && (
                  <GlassCard variant="subtle" padding="sm">
                    <p className="text-[10px] uppercase tracking-wider text-adobe-brown font-bold mb-1">说明</p>
                    <p className="text-sm text-apricot-dust">{codeResult.notes}</p>
                  </GlassCard>
                )}

                {/* Usage */}
                {codeResult.usage && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-adobe-brown font-bold mb-2 ml-1">使用示例</p>
                    <pre className="bg-midnight-soil/50 border border-[rgba(138,75,47,0.3)] rounded-glass-lg p-4 text-sm text-apricot-dust font-mono">
                      {codeResult.usage}
                    </pre>
                  </div>
                )}

                {/* Props */}
                {codeResult.props && codeResult.props.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-adobe-brown font-bold mb-2 ml-1">Props</p>
                    <div className="space-y-2">
                      {codeResult.props.map((prop, idx) => (
                        <div key={idx} className="flex items-center gap-3 text-sm">
                          <span className="font-mono text-dune-peach">{prop.name}</span>
                          <span className="text-adobe-brown">:</span>
                          <span className="font-mono text-apricot-dust">{prop.type}</span>
                          {prop.required && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stamp-red/20 text-stamp-red">必填</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Review Result */}
            {reviewResult && (
              <div className="space-y-4">
                {/* Score */}
                <div className="flex items-center gap-4">
                  <div className={`text-4xl font-bold ${
                    reviewResult.score >= 8 ? 'text-success-green' :
                    reviewResult.score >= 6 ? 'text-ember-rock' : 'text-stamp-red'
                  }`}>
                    {reviewResult.score}
                  </div>
                  <div className="text-adobe-brown">/ 10</div>
                </div>

                {/* Strengths */}
                {reviewResult.strengths.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-success-green font-bold mb-2">优点</p>
                    <ul className="space-y-1">
                      {reviewResult.strengths.map((s, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-apricot-dust">
                          <Icons.Check className="w-4 h-4 text-success-green mt-0.5 flex-shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Issues */}
                {reviewResult.issues.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stamp-red font-bold mb-2">问题</p>
                    <div className="space-y-3">
                      {reviewResult.issues.map((issue, idx) => (
                        <GlassCard key={idx} variant="subtle" padding="sm">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded ${
                              issue.severity === 'high' ? 'bg-stamp-red/20 text-stamp-red' :
                              issue.severity === 'medium' ? 'bg-ember-rock/20 text-ember-rock' :
                              'bg-cacao-husk/30 text-adobe-brown'
                            }`}>
                              {issue.severity === 'high' ? '高' : issue.severity === 'medium' ? '中' : '低'}
                            </span>
                          </div>
                          <p className="text-sm text-dune-peach mb-1">{issue.description}</p>
                          <p className="text-sm text-apricot-dust">{issue.suggestion}</p>
                        </GlassCard>
                      ))}
                    </div>
                  </div>
                )}

                {/* Code Fixes */}
                {reviewResult.codeSnippets && reviewResult.codeSnippets.length > 0 && (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-adobe-brown font-bold mb-2 ml-1">代码修复建议</p>
                    {reviewResult.codeSnippets.map((snippet, idx) => (
                      <div key={idx} className="mb-3">
                        <p className="text-sm text-apricot-dust mb-1">{snippet.issue}</p>
                        <pre className="bg-midnight-soil/50 border border-[rgba(138,75,47,0.3)] rounded-glass-lg p-3 text-sm text-apricot-dust font-mono overflow-x-auto">
                          {snippet.fix}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </GlassCard>
        )}
      </div>
    </div>
  );
};
