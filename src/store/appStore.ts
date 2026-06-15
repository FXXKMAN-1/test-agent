import { create } from 'zustand'
import type { AgentEvent, TestOptions, TestStatus } from '../types'

/**
 * 测试运行状态
 */
export interface TestRun {
  id: string
  name: string
  goal: string
  browser: 'chromium' | 'firefox' | 'webkit'
  model: string
  providerId?: string
  maxTurns?: number
  status: TestStatus
  createdAt: string
  events: AgentEvent[]
  screenshots: string[]
  conclusion?: string
  duration?: number
}

/**
 * 全局 Store
 */
interface AppStore {
  // 当前测试
  currentTest: TestRun | null
  setCurrentTest: (test: Partial<TestRun> & { id: string; goal: string }) => void

  // Agent 事件
  addAgentEvent: (event: AgentEvent) => void
  addScreenshot: (base64: string) => void
  setTestStatus: (status: TestStatus) => void
  setTestResult: (conclusion: string, duration: number, status?: string) => void

  // 历史记录
  history: TestRun[]
  addToHistory: (run: TestRun) => void
  loadHistory: () => void

  // 当前执行
  clearCurrentTest: () => void
}

const HISTORY_KEY = 'agent-test-history'

function loadHistoryFromDisk(): TestRun[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveHistoryToDisk(history: TestRun[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 50)))
  } catch { /* 存储满时忽略 */ }
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentTest: null,

  setCurrentTest: (test) =>
    set({
      currentTest: {
        id: test.id,
        name: test.name || '',
        goal: test.goal,
        browser: (test as any).browser || 'chromium',
        model: (test as any).model || 'deepseek-chat',
        maxTurns: (test as any).maxTurns || 40,
        status: 'pending',
        createdAt: new Date().toISOString(),
        events: [],
        screenshots: [],
      },
    }),

  addAgentEvent: (event) =>
    set((state) => ({
      currentTest: state.currentTest
        ? { ...state.currentTest, events: [...state.currentTest.events, event] }
        : null,
    })),

  addScreenshot: (base64) =>
    set((state) => ({
      currentTest: state.currentTest
        ? { ...state.currentTest, screenshots: [...state.currentTest.screenshots, base64] }
        : null,
    })),

  setTestStatus: (status) =>
    set((state) => ({
      currentTest: state.currentTest ? { ...state.currentTest, status } : null,
    })),

  setTestResult: (conclusion, duration, status = 'passed') =>
    set((state) => ({
      currentTest: state.currentTest
        ? { ...state.currentTest, conclusion, duration, status }
        : null,
    })),

  history: [],

  addToHistory: (run) =>
    set((state) => {
      const newHistory = [run, ...state.history].slice(0, 50)
      saveHistoryToDisk(newHistory)
      return { history: newHistory }
    }),

  loadHistory: () =>
    set({ history: loadHistoryFromDisk() }),

  clearCurrentTest: () =>
    set({ currentTest: null }),
}))
