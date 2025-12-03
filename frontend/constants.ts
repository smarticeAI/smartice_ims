import React from 'react';

// Icons styled to resemble Apple SF Symbols (Stroke width ~2, rounded)
export const Icons = {
  Sparkles: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      viewBox: "0 0 24 24", 
      fill: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { 
      fillRule: "evenodd", 
      d: "M9 4.5a.75.75 0 01.721.544l.813 2.846a3.75 3.75 0 002.576 2.576l2.846.813a.75.75 0 010 1.442l-2.846.813a3.75 3.75 0 00-2.576 2.576l-.813 2.846a.75.75 0 01-1.442 0l-.813-2.846a3.75 3.75 0 00-2.576-2.576l-2.846-.813a.75.75 0 010-1.442l2.846-.813a3.75 3.75 0 002.576-2.576l.813-2.846A.75.75 0 019 4.5zM9 15a.75.75 0 01.75.75v1.5h1.5a.75.75 0 010 1.5h-1.5v1.5a.75.75 0 01-1.5 0v-1.5h-1.5a.75.75 0 010-1.5h1.5v-1.5A.75.75 0 019 15z", 
      clipRule: "evenodd" 
    })),

  ChartBar: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      fill: "none", 
      viewBox: "0 0 24 24", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { 
      strokeLinecap: "round", 
      strokeLinejoin: "round", 
      d: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" 
    })),

  PlusCircle: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      fill: "none", 
      viewBox: "0 0 24 24", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { 
      strokeLinecap: "round", 
      strokeLinejoin: "round", 
      d: "M12 9v6m3-3H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" 
    })),

  Clock: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      fill: "none", 
      viewBox: "0 0 24 24", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { 
      strokeLinecap: "round", 
      strokeLinejoin: "round", 
      d: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" 
    })),

  Check: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      fill: "none", 
      viewBox: "0 0 24 24", 
      strokeWidth: 2.5, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { 
      strokeLinecap: "round", 
      strokeLinejoin: "round", 
      d: "M4.5 12.75l6 6 9-13.5" 
    })),

  Menu: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      fill: "none", 
      viewBox: "0 0 24 24", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { 
      strokeLinecap: "round", 
      strokeLinejoin: "round", 
      d: "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" 
    })),

  Camera: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      fill: "none", 
      viewBox: "0 0 24 24", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { 
      strokeLinecap: "round", 
      strokeLinejoin: "round", 
      d: "M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" 
    }),
    React.createElement("path", { 
      strokeLinecap: "round", 
      strokeLinejoin: "round", 
      d: "M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" 
    })),
    
  Folder: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      fill: "none", 
      viewBox: "0 0 24 24", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { 
      strokeLinecap: "round", 
      strokeLinejoin: "round", 
      d: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" 
    })),

  ArrowLeft: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      strokeWidth: 2.5,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18"
    })),

  // v1.8: 发送按钮图标
  ArrowRight: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      strokeWidth: 2.5,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"
    })),

  ChevronRight: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      strokeWidth: 2.5,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M8.25 4.5l7.5 7.5-7.5 7.5"
    })),

  // v2.0: 下拉箭头图标（用户菜单）
  ChevronDown: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      strokeWidth: 2.5,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", {
      strokeLinecap: "round",
      strokeLinejoin: "round",
      d: "M19.5 8.25l-7.5 7.5-7.5-7.5"
    })),

  // v2.0: 退出登录图标
  Logout: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      strokeWidth: 2,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" })),

  // v2.1: 钥匙图标（修改密码）
  Key: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      fill: "none",
      viewBox: "0 0 24 24",
      strokeWidth: 2,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M15.75 5.25a3 3 0 013 3m3 0a6 6 0 01-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1121.75 8.25z" })),

  Trash: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      viewBox: "0 0 24 24",
      fill: "none", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" })),

  // SF Symbol style category icons
  Meat: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      viewBox: "0 0 24 24", 
      fill: "none", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" })),

  Vegetable: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      viewBox: "0 0 24 24", 
      fill: "none", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12.75 3.03v.568c0 .334.148.65.405.864l1.068.89c.442.369.535 1.01.216 1.49l-.51.766a2.25 2.25 0 01-1.161.886l-.143.048a1.107 1.107 0 00-.57 1.664c.369.555.169 1.307-.413 1.605-2.73.818-5.09 1.126-7.08 1.126-.457 0-.91-.005-1.356-.017-.584-.015-1.057-.493-1.07-1.076-.024-1.08.064-2.152.26-3.197.352-1.875 1.182-3.629 2.42-5.114.28-.337.667-.562 1.103-.563 2.182-.005 4.413-.055 6.699.043.57.025 1.037.477 1.037 1.047zM13.25 15c.5-1.5 2-2.5 4-2.5s3.5 1 4 2.5c.5 1.5-1 3.5-4 3.5s-4.5-2-4-3.5z" })),

  Cube: ({ className }: { className?: string }) => 
    React.createElement("svg", { 
      xmlns: "http://www.w3.org/2000/svg", 
      viewBox: "0 0 24 24", 
      fill: "none", 
      strokeWidth: 2, 
      stroke: "currentColor", 
      className: className 
    }, 
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M21 7.5l-9-5.25L3 7.5m18 0l-9 5.25m9-5.25v9l-9 5.25M3 7.5l9 5.25M3 7.5v9l9 5.25m0-9v9" })),

  Beaker: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      strokeWidth: 2,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" })),

  // 语音录入图标
  Microphone: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      strokeWidth: 2,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" })),

  // 加号图标
  Plus: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      strokeWidth: 2,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M12 4.5v15m7.5-7.5h-15" })),

  // 停止图标 (方块)
  Stop: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className: className
    },
    React.createElement("path", { fillRule: "evenodd", d: "M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z", clipRule: "evenodd" })),

  // X 关闭图标
  X: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      strokeWidth: 2.5,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M6 18L18 6M6 6l12 12" })),

  // v1.8: 发送按钮图标（纸飞机）
  PaperAirplane: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "currentColor",
      className: className
    },
    React.createElement("path", { d: "M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" })),

  // v3.0: 文档图标（收货单上传按钮）
  Document: ({ className }: { className?: string }) =>
    React.createElement("svg", {
      xmlns: "http://www.w3.org/2000/svg",
      viewBox: "0 0 24 24",
      fill: "none",
      strokeWidth: 2,
      stroke: "currentColor",
      className: className
    },
    React.createElement("path", { strokeLinecap: "round", strokeLinejoin: "round", d: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" })),
};