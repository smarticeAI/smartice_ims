/**
 * Gemini Design Service
 *
 * 使用 Gemini 3 Pro 提供前端设计协同能力：
 * 1. imageToCode - 设计稿/截图转 React 代码
 * 2. reviewUI - UI 截图审查与优化建议
 * 3. generateComponent - 需求描述生成组件代码
 */

import { GoogleGenAI, Type, Schema } from "@google/genai";
import {
  GeneratedCode,
  UIReviewResult,
  ImageInput,
  ImageToCodeOptions,
  GenerateComponentOptions,
} from "../types";

// Gemini 3 Pro 配置
const apiKey = process.env.API_KEY;
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;
const MODEL_ID = 'gemini-3-pro-preview'; // Gemini 3 Pro

// ============ Schema 定义 ============

const generatedCodeSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    componentName: { type: Type.STRING, description: "组件名称 (PascalCase)" },
    code: { type: Type.STRING, description: "完整的 React 组件代码" },
    dependencies: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "需要安装的 npm 依赖包"
    },
    notes: { type: Type.STRING, description: "实现说明或注意事项" },
    usage: { type: Type.STRING, description: "组件使用示例代码" },
    props: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          type: { type: Type.STRING },
          required: { type: Type.BOOLEAN },
          description: { type: Type.STRING }
        }
      },
      description: "组件 Props 列表"
    }
  },
  required: ["componentName", "code"],
};

const uiReviewSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    score: { type: Type.NUMBER, description: "UI 评分 (1-10)" },
    issues: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          severity: { type: Type.STRING, description: "严重程度: high, medium, low" },
          description: { type: Type.STRING, description: "问题描述" },
          suggestion: { type: Type.STRING, description: "改进建议" }
        },
        required: ["severity", "description", "suggestion"]
      },
      description: "发现的问题列表"
    },
    strengths: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "UI 的优点"
    },
    codeSnippets: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          issue: { type: Type.STRING, description: "对应的问题" },
          fix: { type: Type.STRING, description: "修复代码" }
        }
      },
      description: "代码修复建议"
    }
  },
  required: ["score", "issues", "strengths"],
};

// ============ Mock 数据 ============

const MOCK_GENERATED_CODE: GeneratedCode = {
  componentName: "DemoCard",
  code: `import React from 'react';

interface DemoCardProps {
  title: string;
  description?: string;
  onClick?: () => void;
}

export const DemoCard: React.FC<DemoCardProps> = ({
  title,
  description,
  onClick
}) => {
  return (
    <div
      onClick={onClick}
      className="bg-zinc-900 border border-zinc-800 rounded-3xl p-5
                 hover:bg-zinc-800 transition-all cursor-pointer
                 active:scale-[0.98]"
    >
      <h3 className="text-lg font-bold text-white mb-2">{title}</h3>
      {description && (
        <p className="text-sm text-zinc-400">{description}</p>
      )}
    </div>
  );
};`,
  dependencies: [],
  notes: "这是一个演示卡片组件，使用项目的 iOS 深色主题风格",
  usage: `<DemoCard
  title="示例卡片"
  description="这是描述文字"
  onClick={() => console.log('clicked')}
/>`,
  props: [
    { name: "title", type: "string", required: true, description: "卡片标题" },
    { name: "description", type: "string", required: false, description: "描述文字" },
    { name: "onClick", type: "() => void", required: false, description: "点击回调" }
  ]
};

const MOCK_UI_REVIEW: UIReviewResult = {
  score: 7.5,
  issues: [
    {
      severity: "medium",
      description: "部分文字对比度不足，可能影响可读性",
      suggestion: "将 text-zinc-600 改为 text-zinc-400 以提高对比度"
    },
    {
      severity: "low",
      description: "按钮点击区域较小",
      suggestion: "增加 padding 或使用 min-h-[44px] 确保触摸友好"
    }
  ],
  strengths: [
    "整体布局清晰，层次分明",
    "深色主题使用得当，视觉舒适",
    "圆角和间距统一，符合 iOS 设计规范"
  ],
  codeSnippets: [
    {
      issue: "对比度不足",
      fix: `// 修改前
<p className="text-zinc-600">说明文字</p>

// 修改后
<p className="text-zinc-400">说明文字</p>`
    }
  ]
};

// ============ 核心函数 ============

/**
 * 设计稿/截图转 React 代码
 */
export async function imageToCode(
  image: ImageInput,
  options: ImageToCodeOptions = {}
): Promise<GeneratedCode> {
  const {
    framework = 'react',
    styling = 'tailwind',
    componentName
  } = options;

  // Mock 模式
  if (!apiKey) {
    console.log("[Gemini Design] No API Key - returning mock data");
    return new Promise((resolve) => {
      setTimeout(() => resolve(MOCK_GENERATED_CODE), 2000);
    });
  }

  try {
    const prompt = `Analyze this UI design image and generate ${framework} component code.

Requirements:
- Use ${framework === 'react' ? 'React functional components with TypeScript' : 'Vue 3 Composition API'}
- Use ${styling === 'tailwind' ? 'Tailwind CSS' : styling} for styling
- Match the project's iOS dark theme: zinc color palette (bg-zinc-950, bg-zinc-900, border-zinc-800)
- Use rounded-3xl for cards, rounded-2xl for buttons, rounded-xl for inputs
- Include responsive design (mobile-first)
- Add hover and active states for interactive elements
${componentName ? `- Name the component: ${componentName}` : ''}

Generate a complete, production-ready component.`;

    const response = await ai!.models.generateContent({
      model: MODEL_ID,
      contents: {
        parts: [
          { inlineData: image },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: generatedCodeSchema,
        temperature: 0.2,
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as GeneratedCode;
    }

    throw new Error("Empty response from Gemini");
  } catch (error) {
    console.error("[Gemini Design] imageToCode error:", error);
    return MOCK_GENERATED_CODE;
  }
}

/**
 * UI 截图审查与优化建议
 */
export async function reviewUI(
  screenshot: ImageInput,
  context?: string
): Promise<UIReviewResult> {
  // Mock 模式
  if (!apiKey) {
    console.log("[Gemini Design] No API Key - returning mock review");
    return new Promise((resolve) => {
      setTimeout(() => resolve(MOCK_UI_REVIEW), 2000);
    });
  }

  try {
    const prompt = `Review this UI screenshot and provide improvement suggestions.
${context ? `Context: ${context}` : ''}

Analyze the following aspects:
1. Visual hierarchy and layout - 视觉层次和布局
2. Color contrast and accessibility - 颜色对比和可访问性
3. Spacing and alignment consistency - 间距和对齐一致性
4. Interactive element affordance - 交互元素的可感知性
5. Mobile usability - 移动端可用性
6. Consistency with iOS dark theme design patterns

Provide specific, actionable suggestions with code snippets where applicable.
Use Tailwind CSS for any code fixes.`;

    const response = await ai!.models.generateContent({
      model: MODEL_ID,
      contents: {
        parts: [
          { inlineData: screenshot },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: uiReviewSchema,
        temperature: 0.3,
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as UIReviewResult;
    }

    throw new Error("Empty response from Gemini");
  } catch (error) {
    console.error("[Gemini Design] reviewUI error:", error);
    return MOCK_UI_REVIEW;
  }
}

/**
 * 需求描述生成组件代码
 */
export async function generateComponent(
  description: string,
  options: GenerateComponentOptions = {}
): Promise<GeneratedCode> {
  const { type, styling = 'tailwind' } = options;

  // Mock 模式
  if (!apiKey) {
    console.log("[Gemini Design] No API Key - returning mock component");
    return new Promise((resolve) => {
      setTimeout(() => resolve(MOCK_GENERATED_CODE), 2000);
    });
  }

  try {
    const prompt = `Generate a React component based on this description:
"${description}"

${type ? `Component type hint: ${type}` : ''}

Requirements:
- React functional component with TypeScript
- ${styling === 'tailwind' ? 'Tailwind CSS' : styling} styling
- iOS dark theme: zinc color palette (bg-zinc-950, bg-zinc-900, text-white, text-zinc-400)
- Rounded corners: rounded-3xl for cards, rounded-2xl for buttons
- Include proper TypeScript interface for props
- Add hover/active states for interactive elements
- Mobile-first responsive design
- Include usage example

The component should be production-ready and follow best practices.`;

    const response = await ai!.models.generateContent({
      model: MODEL_ID,
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: "application/json",
        responseSchema: generatedCodeSchema,
        temperature: 0.3,
      },
    });

    if (response.text) {
      return JSON.parse(response.text) as GeneratedCode;
    }

    throw new Error("Empty response from Gemini");
  } catch (error) {
    console.error("[Gemini Design] generateComponent error:", error);
    return MOCK_GENERATED_CODE;
  }
}
