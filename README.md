# AgentTest — AI 驱动的 Web 自动化测试桌面应用

AgentTest 是一款基于 Electron 的桌面应用，用户只需输入自然语言测试目标，AI Agent 即可自动操控浏览器执行验证并生成带截图的 HTML 测试报告。

## 技术栈

| 层级 | 技术 |
|------|------|
| 桌面框架 | Electron 42 |
| 前端 | React 19 + TypeScript + Vite |
| 状态管理 | Zustand |
| AI Agent 引擎 | LangGraph (`createReactAgent`) + DeepSeek API |
| 浏览器自动化 | Playwright (Chromium / Firefox / WebKit) |
| 模型 SDK | `@langchain/openai` (ChatOpenAI, OpenAI 兼容协议) |
| 打包 | electron-builder (NSIS, Windows EXE) |

## 功能特性

### 核心能力

- **自然语言驱动测试** — 输入测试目标（如"打开登录页，用 admin/123456 登录，检查是否跳转到首页"），AI Agent 自动规划并执行浏览器操作
- **实时执行监控** — 执行页面实时展示 Agent 思考流（思考 → 工具调用 → 观察 循环），每步操作附实时截图
- **HTML 报告生成** — 测试完成后自动生成带步骤截图的 HTML 报告，可导出保存
- **历史记录管理** — 所有测试记录通过 localStorage 持久化，支持回溯查看

### 多 Provider 支持

- DeepSeek API（`deepseek-chat` / `deepseek-reasoner`）
- OpenAI API（`gpt-4o` / `gpt-4o-mini` 等）
- 任意 OpenAI 兼容 API（自定义 baseURL 和 API Key）

### 批量测试

- 支持导入 **Excel (.xlsx/.xls)**、**CSV**、**Markdown** 格式的测试用例文档
- 自动解析文档中的测试场景并逐条执行

### 智能交互

- **12 个 Playwright 工具** — navigate、click_selector、click_text、fill_by_label、fill、fill_by_placeholder、get_page_info、screenshot、get_text、get_attribute、wait、wait_for_selector、scroll
- **智能表单填充** — `fill_by_label` 工具通过标签自动定位表单字段
- **自动循环检测** — 连续 3 次相同工具调用自动强制停止，防止死循环
- **可配置最大轮次** — 单次测试最大对话轮次 10-120 可调

### 浏览器选择

- Chromium（默认，自动下载）
- Firefox
- WebKit

## 系统架构

```
┌──────────────────────────────────────────────────────────────┐
│                      Electron Application                     │
│                                                              │
│  ┌─────────────────────────┐    IPC     ┌─────────────────┐  │
│  │     Main Process         │ ←───────→ │    Renderer      │  │
│  │     electron/main.ts     │contextBridge│  React 19       │  │
│  │                          │           │                  │  │
│  │  ┌───────────────────┐   │           │  ┌────────────┐  │  │
│  │  │  Agent Engine      │   │           │  │ NewTestPage │  │  │
│  │  │  ┌───────────────┐ │   │           │  ├────────────┤  │  │
│  │  │  │ agent.ts      │ │   │           │  │ExecutionPage│  │  │
│  │  │  │ LangGraph      │ │   │           │  ├────────────┤  │  │
│  │  │  │ ReAct Agent   │ │   │           │  │ ReportPage  │  │  │
│  │  │  ├───────────────┤ │   │           │  ├────────────┤  │  │
│  │  │  │ tools.ts      │ │   │           │  │ HistoryPage │  │  │
│  │  │  │ 12 Playwright │ │   │           │  ├────────────┤  │  │
│  │  │  │ Tools         │ │   │           │  │SettingsPage │  │  │
│  │  │  ├───────────────┤ │   │           │  └────────────┘  │  │
│  │  │  │ prompt.ts     │ │   │           │                  │  │
│  │  │  │ System Prompt │ │   │           │  ┌────────────┐  │  │
│  │  │  └───────────────┘ │   │           │  │Zustand Store│  │  │
│  │  └───────────────────┘   │           │  └────────────┘  │  │
│  │                          │           └─────────────────┘  │
│  │  ┌───────────────────┐   │                                │
│  │  │ Browser Manager   │   │                                │
│  │  │ Playwright        │   │                                │
│  │  │ Chromium/Firefox/ │   │                                │
│  │  │ WebKit            │   │                                │
│  │  └───────────────────┘   │                                │
│  └─────────────────────────┘                                │
└──────────────────────────────────────────────────────────────┘
```

### Agent 执行流程

```
用户输入测试目标
       │
       ▼
┌──────────────────────────────────────────────┐
│              LangGraph ReAct Agent            │
│                                              │
│   ┌──────────┐    ┌──────────┐    ┌────────┐ │
│   │  思考     │───→│ 工具调用  │───→│  观察   │ │
│   │ (Think)  │←───│ (Action) │←───│(Observe)│ │
│   └──────────┘    └──────────┘    └────────┘ │
│         │                                   │
│         ▼                                   │
│   达到终止条件 / 最大轮次                      │
│         │                                   │
│         ▼                                   │
│   生成最终结论 + HTML 报告                    │
└──────────────────────────────────────────────┘
```

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9
- Windows 10/11（当前仅支持 Windows 打包）

### 安装与运行

```bash
# 克隆仓库
git clone <repo-url>
cd AgentTest

# 安装依赖
npm install

# 开发模式（启动 Electron + Vite watch）
npm run dev

# 完整构建
npm run build

# 打包为 Windows EXE 安装包（输出到 release/）
npm run dist
```

### 首次启动

1. 启动应用后，如果本地未安装 Playwright Chromium 浏览器，会自动弹出安装进度窗口下载（约 130MB）
2. 安装完成后自动进入主应用
3. 进入 **设置页** 配置 API Key（支持 DeepSeek、OpenAI 或自定义服务商）
4. 在 **新建测试页** 输入测试目标，选择浏览器类型和模型，开始测试

## 页面概览

### 1. 新建测试页 (NewTestPage)

应用的入口页面。用户在此输入自然语言测试目标（如"打开百度首页，搜索 AgentTest，检查搜索结果是否包含相关条目"）。可选择目标浏览器（Chromium / Firefox / WebKit）、模型 Provider、以及设置最大执行轮次。底部提供批量导入按钮，支持上传 Excel/CSV/Markdown 测试用例文件。

### 2. 执行监控页 (ExecutionPage)

测试执行时的实时监控面板。左侧为 Agent 思考流，以对话气泡形式展示每一步的"思考→工具调用→观察"循环，包含工具名称、参数和返回结果。右侧为浏览器实时截图区域，每次操作后自动更新。顶部工具栏显示执行进度和耗时，提供取消按钮可随时中止测试。

### 3. 报告页 (ReportPage)

测试完成后自动跳转至此。顶部展示测试结论摘要（成功/失败/部分通过）、总耗时和步骤统计。下方按时间线展示每一步操作的详细信息——工具名称、参数、执行结果和对应截图。支持导出为独立 HTML 文件，可在任意浏览器中离线查看。

### 4. 历史记录页 (HistoryPage)

以卡片列表形式展示所有历史测试记录，每条记录包含测试目标摘要、执行时间、通过状态和耗时。支持搜索和筛选，点击可查看完整报告。数据通过 localStorage 持久化存储。

### 5. 设置页 (SettingsPage)

配置 API 连接信息。支持三种 Provider 模式：DeepSeek（预设）、OpenAI（预设）、自定义（需填写 baseURL）。可配置 API Key、模型名称、默认最大轮次、默认浏览器类型等偏好设置。API Key 加密存储在主进程 `userData/config.json` 中。

## 项目结构

```
AgentTest/
├── electron/                    # 主进程代码
│   ├── main.ts                  # Electron 主入口，窗口管理
│   ├── preload.ts               # contextBridge IPC 桥接
│   └── services/
│       ├── agent/               # Agent 引擎
│       │   ├── agent.ts         # AgentExecutor 类，LangGraph 执行
│       │   ├── tools.ts         # 12 个 Playwright 工具定义
│       │   ├── prompt.ts        # 系统提示词
│       │   └── index.ts         # 导出入口
│       └── browser-manager.ts   # Playwright 浏览器下载管理
├── src/                         # 渲染进程代码
│   ├── App.tsx                  # 根组件，页面路由
│   ├── main.tsx                 # React 入口
│   ├── pages/                   # 5 个页面组件
│   ├── store/                   # Zustand 状态管理
│   └── types/                   # TypeScript 类型定义
├── resources/                   # 静态资源
│   └── install-progress.html    # 浏览器安装进度页
├── package.json
├── tsconfig.json
├── tsconfig.electron.json       # 主进程 TS 配置
├── vite.config.ts               # Vite 构建配置
└── electron-builder.yml         # 打包配置
```

## 开发指南

### 架构要点

- **双进程模型** — 主进程负责 Agent 执行和浏览器操控，渲染进程负责 UI 展示，通过 `contextBridge` 暴露的安全 API 通信
- **Agent 引擎** — 基于 LangGraph 的 `createReactAgent`，使用 ReAct 模式（思考→行动→观察循环），通过 `agent.stream()` 获取实时事件流并推送到渲染进程
- **工具系统** — 所有 Playwright 操作封装为 LangChain 工具，使用 Zod 做参数校验，Agent 通过 function calling 自主选择调用
- **自研 Agent 循环** — 不使用 Claude API 或外部 Agent 框架，完全基于 LangGraph + DeepSeek/OpenAI API 构建

### 添加新工具

1. 在 `electron/services/agent/tools.ts` 中使用 `tool()` 定义新工具，包含 Zod schema 和实现函数
2. 将新工具加入 `createReactAgent` 的 tools 数组
3. 如需在系统提示词中说明工具用法，编辑 `electron/services/agent/prompt.ts`

### IPC 通信规范

渲染进程通过 `window.electronAPI` 调用主进程功能：

```typescript
// 运行测试
const result = await window.electronAPI.runTest(goal, options);

// 监听实时事件
const cleanup = window.electronAPI.onAgentEvent((event) => {
  // event.type: 'thinking' | 'tool_call' | 'tool_result' | 'finish' | 'error'
});

// 取消测试
await window.electronAPI.cancelTest();
```

### 构建产物

- `dist/` — Vite 构建的渲染进程产物
- `dist-electron/` — TypeScript 编译的主进程产物
- `release/` — electron-builder 打包的 Windows EXE 安装包

## License

MIT
