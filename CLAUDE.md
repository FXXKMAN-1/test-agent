# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AgentTest — AI驱动的 Web 自动化测试桌面应用。用户输入自然语言测试目标，Agent 自动操作浏览器执行验证并生成报告。

**技术栈**: Electron 42 + React 19 + TypeScript + LangGraph + DeepSeek API + Playwright

## Build & Run

```bash
# 完整构建（主进程 + 渲染进程）
npm run build

# 开发模式（先构建主进程，启动 Electron + Vite watch）
npm run dev

# 打包为 Windows EXE 安装包（输出到 release/）
npm run dist
```

主进程编译（`tsc -p tsconfig.electron.json`），渲染进程编译（`vite build`）。

## Architecture

### 双进程模型

```
┌─────────────────────────┐    IPC    ┌──────────────────────────┐
│  Main Process (Electron) │ ←──────→ │  Renderer (React 19)     │
│  electron/main.ts        │          │  src/                    │
│  electron/preload.ts     │          │  ├─ pages/   (5 页面)    │
│  electron/services/agent/│          │  ├─ store/   (Zustand)   │
│    ├─ agent.ts           │          │  └─ types/               │
│    ├─ tools.ts           │          └──────────────────────────┘
│    ├─ prompt.ts          │
│    └─ index.ts           │
└─────────────────────────┘
```

### Agent 引擎（electron/services/agent/）

基于 LangGraph 的 ReAct Agent（`createReactAgent`），运行在主进程：

- **agent.ts** — `AgentExecutor` 类：浏览器生命周期管理、LangGraph stream 执行、事件推送
- **tools.ts** — 12 个 Playwright 工具（navigate/click/fill/screenshot/scroll 等），用 `zod` 做参数校验
- **prompt.ts** — Agent 系统提示词（定义行为规则、工作流程、安全约束）
- **index.ts** — 导出入口

### 浏览器管理（electron/services/browser-manager.ts）

负责 Playwright Chromium 浏览器的自动下载和安装检测：

- `isPlaywrightBrowserInstalled()` — 检查浏览器是否已安装（调用 `chromium.executablePath()`）
- `installPlaywrightBrowser()` — 通过 `npx playwright install chromium` 下载，返回 `{ promise, onProgress }`
- `formatInstallProgress()` — 将安装日志转为友好的中文状态文本

执行流程：
1. 启动 Playwright 浏览器（Chromium）
2. 创建 DeepSeek 模型实例（ChatOpenAI，baseURL 指向 `https://api.deepseek.com/v1`）
3. ReAct Agent 进入思考→工具调用→观察循环
4. 通过 `agent.stream()` 获取实时事件并转发到渲染进程
5. 完成时关闭浏览器，返回结论

### 渲染进程（src/）

5 个页面通过 `App.tsx` 的 `useState` 做简单路由切换，`Zustand store` 管理跨页面状态：

| 页面 | 功能 | IPC 依赖 |
|------|------|---------|
| NewTestPage | 输入测试目标、浏览器/模型选择 | 无 |
| ExecutionPage | 实时展示 Agent 思考流+截图 | `agent:run`, `agent:event`, `agent:cancel` |
| ReportPage | 报告详情、导出 HTML | 无（从 store 读数据） |
| HistoryPage | 历史记录列表 | 无（localStorage 持久化） |
| SettingsPage | API Key 配置、默认设置 | `settings:save-api-key`, `settings:get` |

### DeepSeek 集成

- 通过 `@langchain/openai` 的 `ChatOpenAI` 类对接 DeepSeek API
- baseURL: `https://api.deepseek.com/v1`，模型: `deepseek-chat`
- API Key 存储在 `app.getPath('userData')/config.json`
- 采用 OpenAI 兼容协议，DeepSeek function calling 原生支持工具调用

### IPC 通信

通过 `contextBridge` 暴露的 API 位于 `electron/preload.ts`，类型定义在 `src/types/index.ts`：

```typescript
window.electronAPI = {
  saveApiKey(key),        // → settings:save-api-key
  getSettings(),           // → settings:get
  runTest(goal, options), // → agent:run（返回结果 Promise）
  cancelTest(),           // → agent:cancel
  onAgentEvent(callback), // → agent:event（流式事件，返回清理函数）
}
```

### 持久化

MVP 采用轻量方案：历史记录和 API Key 通过 `localStorage` + JSON 文件（主进程 `userData/config.json`）存储。

## Key Scripts

| Script | Description |
|--------|-------------|
| `npm run build` | 构建主进程 + 渲染进程 |
| `npm run dev` | 开发模式（Vite watch + Electron） |
| `npm run dist` | 打包 NSIS 安装包 |
| `npm run preview` | 预览 Vite 构建结果 |

## 启动流程

```
app.whenReady()
  → ensurePlaywrightBrowser()
    → 已安装？跳过
    → 未安装？弹出安装进度窗口 → npx playwright install chromium
  → createMainWindow()
```

- 首次启动会检查 Playwright Chromium 是否已安装，未安装时自动下载（~130MB）
- 安装进度窗口显示实时下载状态
- 安装完成后自动进入主应用

## 注意事项

- 首次使用需要在设置页配置 DeepSeek API Key
- DeepSeek 的 tool calling 能力决定 Agent 执行质量，复杂场景建议换用 `deepseek-reasoner`
- `resources/install-progress.html` 是浏览器安装进度页，使用 `nodeIntegration: true`（仅该窗口）
