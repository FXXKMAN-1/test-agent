import { AgentExecutor, type AgentEvent, type AgentResult } from './agent/index.js'
import type { TestCaseDefinition } from './parser.js'

/**
 * 批量执行选项
 */
export interface BatchOptions {
  model?: string
  browser?: 'chromium' | 'firefox' | 'webkit'
  providerId?: string
  baseURL?: string
  timeout?: number
  maxTurns?: number
}

/**
 * 单条用例执行结果
 */
export interface CaseRunResult {
  caseId: string
  caseName: string
  goal: string
  status: AgentResult['status']
  conclusion: string
  screenshots: string[]
  duration: number
  events: AgentEvent[]
}

/**
 * 批量执行总结果
 */
export interface BatchResult {
  suiteName: string
  results: CaseRunResult[]
  summary: {
    total: number
    passed: number
    failed: number
    cancelled: number
    errors: number
    skipped: number
    duration: number
  }
  startedAt: string
}

/**
 * 批量执行的状态
 */
export type BatchStatus = 'idle' | 'running' | 'paused' | 'cancelled' | 'done'

/**
 * 批量执行器
 * 按顺序执行测试用例，失败不中断
 */
export class BatchRunner {
  private cancelled = false
  private paused = false
  private status: BatchStatus = 'idle'
  private currentIndex = 0
  private activeAgent: AgentExecutor | null = null

  constructor(
    private cases: TestCaseDefinition[],
    private apiKey: string,
    private options: BatchOptions,
    private emit: (event: AgentEvent) => void
  ) {}

  getStatus() { return this.status }
  getCurrentIndex() { return this.currentIndex }

  cancel() {
    this.cancelled = true
    this.status = 'cancelled'
    // 同时取消正在运行的 Agent
    if (this.activeAgent) {
      this.activeAgent.cancel()
      this.activeAgent = null
    }
  }

  pause() {
    this.paused = true
    this.status = 'paused'
  }

  resume() {
    this.paused = false
    this.status = 'running'
  }

  async run(): Promise<BatchResult> {
    const startedAt = new Date().toISOString()
    const results: CaseRunResult[] = []
    const enabledCases = this.cases.filter(c => c.enabled)

    this.status = 'running'

    // 发送批次开始事件
    this.emit({
      type: 'observation',
      content: `开始批量执行: 共 ${enabledCases.length} 条用例`,
      timestamp: Date.now(),
    })

    for (let i = 0; i < enabledCases.length; i++) {
      if (this.cancelled) break

      // 暂停等待
      while (this.paused && !this.cancelled) {
        await new Promise(r => setTimeout(r, 500))
      }
      if (this.cancelled) break

      this.currentIndex = i
      const tc = enabledCases[i]

      // 发送单条开始事件
      this.emit({
        type: 'thought',
        content: `[${i + 1}/${enabledCases.length}] 正在执行: ${tc.name}`,
        timestamp: Date.now(),
      })

      const agent = new AgentExecutor()
      this.activeAgent = agent
      let caseResult: CaseRunResult = {
        caseId: tc.id,
        caseName: tc.name,
        goal: tc.goal,
        status: 'error',
        conclusion: '',
        screenshots: [],
        duration: 0,
        events: [],
      }

      // 收集本条用例的事件
      const cleanup = agent.onEvent((event) => {
        caseResult.events.push(event)
        // 对前端仍转发原事件，但加上 caseId
        this.emit({ ...event, content: `[${tc.id}] ${event.content}` })
      })

      try {
        const res = await agent.run(tc.goal, this.apiKey, this.options)
        caseResult.status = res.status
        caseResult.conclusion = res.conclusion
        caseResult.screenshots = res.screenshots
        caseResult.duration = res.totalDuration
      } catch (err: any) {
        caseResult.status = 'error'
        caseResult.conclusion = err?.message || String(err)
      } finally {
        cleanup()
        this.activeAgent = null
      }

      results.push(caseResult)

      // 发送单条完成事件
      this.emit({
        type: 'result',
        content: `[${tc.id}] ${caseResult.status === 'passed' ? '✅' : '❌'} ${tc.name} - ${caseResult.status}`,
        timestamp: Date.now(),
      })
    }

    // 汇总
    const passed = results.filter(r => r.status === 'passed').length
    const failed = results.filter(r => r.status === 'failed').length
    const cancelled = results.filter(r => r.status === 'cancelled').length
    const errors = results.filter(r => r.status === 'error').length
    const totalDuration = results.reduce((s, r) => s + r.duration, 0)

    this.status = this.cancelled ? 'cancelled' : 'done'

    this.emit({
      type: 'result',
      content: `批量执行完成: ${enabledCases.length}条 | ✅${passed} 通过 | ❌${failed} 失败`,
      timestamp: Date.now(),
    })

    return {
      suiteName: '',
      results,
      summary: {
        total: enabledCases.length,
        passed,
        failed,
        cancelled,
        errors,
        skipped: this.cases.length - enabledCases.length,
        duration: totalDuration,
      },
      startedAt,
    }
  }
}
