// ====== 测试执行相关 ======

export type BrowserType = 'chromium' | 'firefox' | 'webkit'
export type TestStatus = 'pending' | 'running' | 'passed' | 'failed' | 'cancelled' | 'error'

export interface TestCase {
  id: string
  name: string
  goal: string
  model: string
  browser: BrowserType
  status: TestStatus
  createdAt: string
}

// ====== Agent 事件 ======

export type AgentEventType = 'thought' | 'action' | 'observation' | 'screenshot' | 'error' | 'result'

export interface AgentEvent {
  type: AgentEventType
  content: string
  data?: any
  timestamp: number
}

// ====== 测试步骤 ======

export interface StepResult {
  index: number
  type: string
  content: string
  status: 'success' | 'failed'
  duration: number
  screenshot?: string
  error?: string
}

// ====== 测试报告 ======

export interface TestReport {
  testId: string
  name: string
  goal: string
  status: TestStatus
  conclusion: string
  duration: number
  steps: StepResult[]
  screenshots: string[]
  createdAt: string
}

// ====== 文档解析 ======

export interface TestCaseDefinition {
  id: string
  name: string
  goal: string
  expectedResult: string
  priority: 'high' | 'medium' | 'low'
  enabled: boolean
}

export interface ParseResult {
  suiteName: string
  sourceFile: string
  cases: TestCaseDefinition[]
  errors: string[]
}

// ====== ElectronAPI ======

declare global {
  interface Window {
    electronAPI?: {
      // 文件
      openFile: () => Promise<string | null>
      parseDocument: (filePath: string) => Promise<ParseResult>

      // 设置
      getSettings: () => Promise<Record<string, any>>
      saveSettings: (settings: any) => Promise<any>
      saveProvider: (provider: any) => Promise<any>
      deleteProvider: (providerId: string) => Promise<any>

      // 执行
      runTest: (args: { goal: string; options: any }) => Promise<any>
      runBatch: (args: { cases: any[]; options: any }) => Promise<any>
      cancelTest: () => Promise<any>

      // 事件
      onAgentEvent: (callback: (event: AgentEvent) => void) => () => void
    }
  }
}
