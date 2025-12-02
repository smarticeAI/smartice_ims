# 野百灵数据录入系统 - 前端

## 项目概述

"有点东西餐饮管理有限公司"数据分析平台的数据录入前端，负责门店运营数据的采集与管理。

**当前功能**：
- 门店每日采购清单录入（支持手动录入 + 语音录入）
- 用户认证（登录/注册，集成 UserCenter）
- 图片识别功能暂时禁用（待后端 API 完成）

---

## 技术栈

| 类别 | 技术 | 说明 |
|------|------|------|
| 构建工具 | Vite 6 | 快速开发服务器 |
| 框架 | React 19 | 函数式组件 |
| 语言 | TypeScript 5 | 类型安全 |
| 样式 | **Tailwind CSS v4** | Storm Glass 毛玻璃风格 |
| 图表 | Recharts | 仪表板数据可视化 |
| 语音录入 | 后端 WebSocket | 通过后端调用讯飞 ASR + Qwen |

---

## 功能模块

| 模块 | 文件 | 说明 | 状态 |
|------|------|------|------|
| 仪表板 | `components/Dashboard.tsx` | 数据概览与图表 | 已完成 |
| 采购录入 | `components/EntryForm.tsx` | 手动+语音录入 | 已完成 |
| 登录页面 | `components/LoginPage.tsx` | 用户登录 | 已完成 |
| 注册页面 | `components/RegisterPage.tsx` | 邀请码注册 | 已完成 |
| 侧边栏 | `components/Sidebar.tsx` | 导航菜单 | 已完成 |
| UI 组件库 | `components/ui/*.tsx` | GlassCard, Button, Input | 已完成 |
| 认证上下文 | `contexts/AuthContext.tsx` | 全局认证状态管理 | 已完成 |
| 认证服务 | `services/authService.ts` | JWT Token 管理 | 已完成 |
| 库存服务 | `services/inventoryService.ts` | 库存 API 调用 | 已完成 |
| 语音服务 | `services/voiceEntryService.ts` | WebSocket 语音录入 | 已完成 |
| 图片服务 | `services/imageService.ts` | 图片压缩/缩略图 | 已完成 |

---

## UI 设计系统

### 设计风格：Storm Glass Glassmorphism（深色模式）

基于 **UI风格A.jpg** 参考图，**冷色调深灰毛玻璃**风格，使用 **Tailwind CSS v4**。

**核心特性**（2024-11 确定）：
- 深灰色玻璃：`rgba(25, 25, 30, 0.35-0.75)`
- 白色高光边框：`rgba(255, 255, 255, 0.1-0.2)`
- 模糊层级：24px/40px/56px 三级模糊
- 背景图：云海日落（暖色来自背景，UI元素为冷色）
- 强调色：Cyan 青色 `#5BA3C0`
- 文字：纯白色系

### Tailwind v4 配置架构

```
重要：Tailwind v4 不使用 tailwind.config.ts
所有配置在 CSS 文件中完成
@theme 定义变量，需手动创建工具类
```

| 文件 | 说明 |
|------|------|
| `src/styles/globals.css` | 主样式文件，@theme + @layer components/utilities |
| `postcss.config.js` | PostCSS 配置，使用 `@tailwindcss/postcss` |

---

## 确定的设计参数（Storm Glass）

### 主色板

```css
/* Storm Glass 主色板 - 中性冷色 */
--color-text-primary: #FFFFFF;              /* 主文字 - 纯白 */
--color-text-secondary: rgba(255,255,255,0.7);  /* 次要文字 */
--color-text-muted: rgba(255,255,255,0.5);      /* 弱化文字 */

/* 功能色 */
--color-ios-blue: #5BA3C0;     /* Cyan 青色强调 */
--color-ios-green: #6B9E8A;    /* 成功色 */
--color-ios-red: #E85A4F;      /* 警示色 */
--color-ios-orange: #E8A54C;   /* 橙色提示 */

/* 背景层级 */
--color-surface-base: #1A2634;      /* 深蓝灰基底 */
--color-surface-elevated: #2D3A4A;  /* 抬升层 */
```

### 毛玻璃参数（已确定）

| 组件 | 背景色 | 模糊度 | 边框 |
|------|--------|--------|------|
| **glass-card** | `rgba(25,25,30, 0.35-0.55)` | 40px | `rgba(255,255,255,0.1-0.15)` |
| **glass-card-elevated** | `rgba(25,25,30, 0.55-0.75)` | 48px | `rgba(255,255,255,0.12-0.2)` |
| **glass-card-light** | `rgba(255,255,255, 0.06-0.12)` | 40px | `rgba(255,255,255,0.15)` |
| **glass-card-subtle** | `rgba(25,25,30, 0.35)` | 24px | `rgba(255,255,255,0.08-0.1)` |
| **glass-card-pill** | `rgba(25,25,30, 0.35-0.5)` | 40px | `rgba(255,255,255,0.1-0.2)` |
| **glass-card-ultra** | `rgba(25,25,30, 0.55-0.75)` | 56px | `rgba(255,255,255,0.15-0.3)` |
| **glass-input** | `rgba(25,25,30, 0.5)` | 24px | `rgba(255,255,255,0.1-0.25)` |

### 侧边栏参数（已确定）

| 属性 | 移动端 | 桌面端 |
|------|--------|--------|
| **宽度** | 256px (w-64) | 288px (w-72) |
| **背景** | `rgba(30,35,40, 0.15-0.25)` | `rgba(30,35,40, 0.12-0.2)` |
| **模糊度** | 24px | 24px |
| **饱和度** | 140% | 140% |
| **边框** | `rgba(255,255,255, 0.15-0.18)` | `rgba(255,255,255, 0.12-0.15)` |
| **透明度** | 高透明（可见背景） | 高透明（可见背景） |

### 导航项样式

```css
/* 选中状态 */
background: rgba(255,255,255,0.1-0.12);
color: #FFFFFF;
border: 1px solid rgba(255,255,255,0.15);

/* 未选中状态 */
background: transparent;
color: rgba(255,255,255,0.7);
border: 1px solid transparent;

/* 悬停状态 */
background: rgba(255,255,255,0.05);
color: #FFFFFF;
```

### 用户头像区域

```css
/* 卡片 */
background: rgba(255,255,255,0.08);
border: 1px solid rgba(255,255,255,0.1);
border-radius: 28px; /* rounded-glass-xl */

/* 头像圆形 */
background: linear-gradient(135deg, rgba(91,163,192,0.4) 0%, rgba(91,163,192,0.2) 100%);
width: 40px;
height: 40px;
border-radius: 50%;

/* 文字 */
标题: text-white (店长)
副标题: text-white/60 (德阳店)
```

### 圆角系统

```css
--radius-glass-pill: 9999px;  /* 胶囊形 */
--radius-glass-xl: 36px;      /* 大卡片 */
--radius-glass-lg: 28px;      /* 标准卡片 */
--radius-glass-md: 20px;      /* 输入框 */
--radius-glass-sm: 14px;      /* 小元素 */
```

### 模糊系统

```css
--blur-glass-light: 12px;   /* 轻量模糊 */
--blur-glass: 24px;         /* 标准模糊 */
--blur-glass-heavy: 40px;   /* 重度模糊 */
--blur-glass-ultra: 56px;   /* 极致模糊 */
```

### 阴影系统

```css
/* 标准玻璃阴影 */
--shadow-glass:
  0 4px 24px rgba(0,0,0,0.4),
  0 1px 3px rgba(0,0,0,0.2),
  inset 0 1px 0 rgba(255,255,255,0.08);

/* 抬升玻璃阴影 */
--shadow-glass-elevated:
  0 8px 40px rgba(0,0,0,0.5),
  0 4px 16px rgba(0,0,0,0.3),
  inset 0 1px 0 rgba(255,255,255,0.1);

/* 按钮光晕 */
--shadow-button-primary:
  0 4px 20px rgba(91,163,192,0.4),
  0 0 40px rgba(91,163,192,0.2);
```

---

## 字体尺寸（已确定）

### EntryForm 采购录入页

| 元素 | 字体大小 | 说明 |
|------|----------|------|
| 供应商/备注标签 | `text-[20px]` | 从10px调整为20px（2倍） |
| 物品列表标题 | `text-lg` (18px) | 从10px调整为18px |
| 物品名称输入 | `text-[13px]` | 从18px调整为13px（-30%） |
| 输入框高度 | 统一 `py-4` | 保持一致高度 |

### Dashboard 仪表板

| 元素 | 字体大小 |
|------|----------|
| 主金额数字 | `text-hero-number` (3.5rem/56px) |
| Widget数字 | `text-hero-number-xs` (1.75rem/28px) |
| 标题 | `text-xl` (20px) |
| 副标题 | `text-sm` (14px) |

### 数字字体样式

```css
.text-hero-number {
  font-size: 3.5rem;      /* 56px */
  font-weight: 300;       /* Light */
  letter-spacing: -0.02em;
  color: #FFFFFF;
}

.text-hero-number-xs {
  font-size: 1.75rem;     /* 28px */
  font-weight: 400;
  color: rgba(255,255,255,0.9);
}
```

---

## 组件类

| 类名 | 说明 |
|------|------|
| `.glass-card` | 深灰色毛玻璃卡片 |
| `.glass-card-elevated` | 高亮深色卡片（48px模糊） |
| `.glass-card-light` | 浅灰白毛玻璃（小卡片用） |
| `.glass-card-subtle` | 轻量通透卡片 |
| `.glass-card-ultra` | 极致毛玻璃（56px模糊） |
| `.glass-input` | 玻璃态输入框 |
| `.btn-primary` | Cyan青色渐变按钮 |
| `.btn-danger` | 红色警示按钮 |
| `.btn-glass` | 玻璃态按钮 |
| `.btn-ghost` | 透明幽灵按钮 |
| `.floating-island` | 浮动操作栏 |

---

## 背景图

| 属性 | 值 |
|------|-----|
| 文件 | `/public/backgrounds/cloud-sunset.jpg` |
| 定位 | `center/cover fixed no-repeat` |
| 叠加层 | `rgba(20,20,25,0.5-0.75)` 深灰色叠加 |
| 效果 | 暖色云海日落透过冷色UI元素可见 |

---

## 目录结构

```
frontend/
├── App.tsx                 # 主应用入口
├── index.tsx               # React 挂载点 + CSS 导入
├── types.ts                # TypeScript 类型定义
├── constants.ts            # 图标组件
├── postcss.config.js       # PostCSS 配置 (@tailwindcss/postcss)
├── src/
│   └── styles/
│       └── globals.css     # Tailwind v4 主样式 + @theme 配置
├── components/
│   ├── ui/                 # UI 组件库
│   │   ├── GlassCard.tsx   # 毛玻璃卡片
│   │   ├── Button.tsx      # 按钮组件
│   │   ├── Input.tsx       # 输入框组件
│   │   └── index.ts        # 统一导出
│   ├── Dashboard.tsx       # 仪表板
│   ├── EntryForm.tsx       # 采购录入表单
│   ├── LoginPage.tsx       # 登录页面
│   ├── RegisterPage.tsx    # 注册页面
│   └── Sidebar.tsx         # 侧边导航
├── contexts/
│   └── AuthContext.tsx     # 认证状态上下文
├── services/
│   ├── authService.ts      # UserCenter 认证服务
│   ├── inventoryService.ts # 库存 API 服务
│   ├── voiceEntryService.ts # WebSocket 语音录入服务
│   ├── imageService.ts     # 图片压缩/缩略图
│   └── storageAdapter.ts   # 本地存储
├── public/
│   └── backgrounds/        # 背景图片
├── ui设计风格/              # 设计参考资源
├── docs/                   # 详细文档
└── .env                    # 环境变量（已gitignore）
```

---

## 文档索引

| 文档 | 说明 |
|-----|------|
| docs/DATA_INPUT_ARCH.md | 数据录入架构详解 |
| docs/DESIGN.md | UI 设计规范 |
| docs/API.md | 后端 API 接口（待对接） |
| docs/FORMS.md | 表单字段与验证规则 |
| docs/SUPABASE_CONNECTION.md | Supabase 连接配置指南 |

---

## 核心业务规则

1. **分类管理**：肉类、蔬果、干杂、酒水、低耗 5 大品类
2. **物品字段**：名称、规格、数量、单位、单价、小计
3. **自动计算**：小计 = 数量 × 单价，总计自动汇总
4. **状态管理**：已入库(Stocked)、待处理(Pending)、异常(Issue)
5. **门店识别**：通过账号绑定门店，登录后自动识别，无需UI选择

---

## 开发环境

### 命令

```bash
npm install      # 安装依赖
npm run dev      # 开发模式 (localhost:3000)
npm run build    # 构建生产版本
```

### 关键依赖

```json
{
  "tailwindcss": "^4.1.17",
  "@tailwindcss/postcss": "^4.1.17",
  "clsx": "^2.x"
}
```

### 环境变量 (.env)

```bash
# 语音录入后端（默认 localhost:8000）
VITE_VOICE_BACKEND_URL=http://localhost:8000

# UserCenter 认证服务（默认 localhost:8001）
VITE_USER_CENTER_URL=http://localhost:8001
```

**注意**：前端不存储 API Key，所有 AI 服务（讯飞、Qwen）通过后端调用

### MCP 工具

| MCP Server | 用途 |
|------------|------|
| chrome-devtools | 浏览器调试、元素检查、样式调试 |
| context7 | 技术文档查询 |

---

## 语音录入服务

### `voiceEntryService.ts`

通过 WebSocket 与后端通信，实现实时语音录入：

| 方法 | 功能 |
|------|------|
| `startRecording()` | 开始录音，建立 WebSocket 连接 |
| `stopRecording()` | 停止录音，获取识别结果 |
| `setCallbacks()` | 设置状态变化/结果回调 |

**后端端点**：`ws://localhost:8000/api/voice/ws`

---

## 快速参考

**设计风格**：Storm Glass Glassmorphism，冷色调深灰风格，云海日落背景 + 白色文字

**参考图片**：`ui设计风格/UI风格A.jpg`

**毛玻璃要点**：
- 使用 `backdrop-filter: blur(24-56px) saturate(140-180%)`
- 深灰色玻璃背景 `rgba(25, 25, 30, 0.35-0.75)`
- 白色顶部高光 `border-top: 1px solid rgba(255, 255, 255, 0.1-0.2)`
- 高透明侧边栏 `rgba(30, 35, 40, 0.12-0.25)`
- 黑色系阴影 `rgba(0, 0, 0, 0.4-0.5)`

**Tailwind v4 注意事项**：
- 不使用 `tailwind.config.ts`，配置在 `globals.css` 的 `@theme {}` 中
- PostCSS 插件使用 `@tailwindcss/postcss` 而非 `tailwindcss`
- 使用 `@import "tailwindcss"` 替代 `@tailwind` 指令
- `@theme` 定义的变量需在 `@layer utilities` 中手动创建工具类

**关联项目**：
- 根目录：`../CLAUDE.md` (Monorepo 总览)
- 后端：`../backend/CLAUDE.md`
