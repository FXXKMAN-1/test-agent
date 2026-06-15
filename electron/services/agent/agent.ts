import { ChatOpenAI } from '@langchain/openai'
import { HumanMessage, SystemMessage, AIMessage } from '@langchain/core/messages'
import { createReactAgent } from '@langchain/langgraph/prebuilt'
import { chromium, firefox, webkit, Browser, Page, LaunchOptions } from 'playwright'
import { createPlaywrightTools } from './tools'
import { SYSTEM_PROMPT } from './prompt'
import { EventEmitter } from 'events'

/**
 * Agent 事件类型
 */
export interface AgentEvent {
  type: 'thought' | 'action' | 'observation' | 'screenshot' | 'error' | 'result'
  content: string
  data?: any
  timestamp: number
}

/**
 * Agent 执行结果
 */
export interface AgentResult {
  status: 'passed' | 'failed' | 'error' | 'cancelled'
  conclusion: string
  steps: Array<{
    index: number
    type: string
    content: string
    status: 'success' | 'failed'
    duration: number
  }>
  screenshots: string[]
  totalDuration: number
  turnCount: number
  fullLog: string[]
}

/**
 * Agent 执行器
 */
export class AgentExecutor {
  private browser: Browser | null = null
  private page: Page | null = null
  private cancelled = false
  private emitter = new EventEmitter()

  onEvent(callback: (event: AgentEvent) => void): () => void {
    this.emitter.on('event', callback)
    return () => this.emitter.off('event', callback)
  }

  private emit(type: AgentEvent['type'], content: string, data?: any) {
    this.emitter.emit('event', { type, content, data, timestamp: Date.now() })
  }

  cancel() {
    this.cancelled = true
    this.emit('error', '用户取消了测试执行')
  }

  /**
   * 执行测试
   */
  async run(
    goal: string,
    apiKey: string,
    options?: {
      model?: string
      browser?: 'chromium' | 'firefox' | 'webkit'
      timeout?: number
      baseURL?: string
      maxTurns?: number
    }
  ): Promise<AgentResult> {
    const startTime = Date.now()
    const model = options?.model || 'deepseek-chat'
    const browserType = options?.browser || 'chromium'
    const timeout = (options?.timeout || 120) * 1000
    const baseURL = options?.baseURL || 'https://api.deepseek.com/v1'
    const maxTurns = options?.maxTurns || 40

    const fullLog: string[] = []
    const screenshots: string[] = []
    const steps: AgentResult['steps'] = []

    try {
      this.emit('thought', `准备启动 ${browserType} 浏览器...`)

      // 1. 启动浏览器（根据用户选择）
      const launcher = browserType === 'firefox' ? firefox : browserType === 'webkit' ? webkit : chromium
      this.browser = await launcher.launch({ headless: false, timeout: 30000 })
      const context = await this.browser.newContext({
        viewport: { width: 1280, height: 720 },
        locale: 'zh-CN',
      })
      this.page = await context.newPage()

      this.emit('observation', `${browserType} 浏览器已启动`)
      fullLog.push(`浏览器启动: ${browserType}`)

      // 2. 创建 DeepSeek 模型
      const modelInstance = new ChatOpenAI({
        model,
        apiKey,
        configuration: { baseURL },
        maxTokens: 4096,
        temperature: 0.1,
        timeout,
      })

      // 3. 创建 Playwright 工具集
      const tools = createPlaywrightTools(this.page)

      // 4. 创建 LangGraph React Agent
      const agent = createReactAgent({
        llm: modelInstance,
        tools,
        messageModifier: new SystemMessage(SYSTEM_PROMPT),
      })

      // 5. 流式执行 Agent（实时获取每一步）
      this.emit('thought', '开始分析测试目标并规划步骤...')
      fullLog.push(`测试目标: ${goal}`)

      const config = {
        configurable: { thread_id: `test-${Date.now()}` },
        recursionLimit: maxTurns + 10,
      }
      let turnCount = 0
      let finalContent = ''
      const recentCalls: string[] = []

      // 使用 stream 模式获取逐步输出
      const stream = await agent.stream(
        { messages: [new HumanMessage(goal)] },
        config
      )

      for await (const chunk of stream) {
        if (this.cancelled) break
        turnCount++

        // 强制终止：超过用户设置的最大步数
        if (turnCount > maxTurns) {
          this.emit('error', `执行已达最大步数限制(${maxTurns}轮)，强制终止`)
          finalContent = '⚠️ 测试步骤过多（>' + maxTurns + '轮），已强制终止。当前结论：' + (finalContent || '未能完成测试目标')
          break
        }

        // LangGraph stream 返回键值对: { agent: {...} } 或 { tools: {...} }
        const nodeName = Object.keys(chunk)[0]
        const nodeData: any = chunk[nodeName]

        if (nodeName === 'agent') {
          // Agent 正在思考或返回结果
          const messages: any[] = nodeData?.messages || []
          const lastMsg = messages[messages.length - 1]
          if (lastMsg) {
            if (lastMsg.tool_calls?.length > 0) {
              // 检测死循环：同一工具+参数连续3次
              const callKey = JSON.stringify(lastMsg.tool_calls.map((t: any) => ({ n: t.name, a: t.args })))
              recentCalls.push(callKey)
              if (recentCalls.length > 5) recentCalls.shift()
              if (recentCalls.filter(c => c === callKey).length >= 3) {
                this.emit('error', '检测到重复操作死循环，强制终止')
                finalContent = '⚠️ Agent 陷入循环操作，已自动终止。请简化测试目标或换用其他模型。当前结论：' + (finalContent || '未能完成')
                break
              }

              // Agent 决定调用工具
              for (const tc of lastMsg.tool_calls) {
                this.emit('thought', `决定调用 ${tc.name}`)
                this.emit('action', `${tc.name}(${JSON.stringify(tc.args)})`)
                fullLog.push(`→ 工具调用: ${tc.name}`)
              }
            } else if (lastMsg.content) {
              // Agent 思考过程或最终结论
              const content = typeof lastMsg.content === 'string' ? lastMsg.content : JSON.stringify(lastMsg.content)
              if (content) {
                this.emit('thought', content.substring(0, 500))
                fullLog.push(`💭 ${content}`)
                finalContent = content
              }
            }
          }
        } else if (nodeName === 'tools') {
          // 工具执行完毕
          const messages: any[] = nodeData?.messages || []
          const lastMsg = messages[messages.length - 1]
          if (lastMsg) {
            const content = typeof lastMsg.content === 'string'
              ? lastMsg.content.substring(0, 500)
              : JSON.stringify(lastMsg.content).substring(0, 500)

            this.emit('observation', content)
            fullLog.push(`📋 ${content}`)

            // 记录步骤
            steps.push({
              index: steps.length + 1,
              type: lastMsg.name || 'tool',
              content,
              status: content.includes('error') || content.includes('失败') ? 'failed' : 'success',
              duration: 0,
            })
          }

          // 工具调用后自动截图
          if (this.page) {
            try {
              const ss = await this.page.screenshot({ type: 'jpeg', quality: 70 })
              const base64 = Buffer.from(ss).toString('base64')
              screenshots.push(base64)
              this.emit('screenshot', `截图 ${screenshots.length}`, base64)
            } catch { /* 忽略截图失败 */ }
          }
        }
      }

      // 6. 处理结果
      if (this.cancelled) {
        const cancelMsg = '测试已被用户取消'
        this.emit('result', cancelMsg)
        return {
          status: 'cancelled',
          conclusion: cancelMsg,
          steps,
          screenshots,
          totalDuration: Date.now() - startTime,
          turnCount,
          fullLog,
        }
      }

      // 从 Agent 结论中推断状态
      const lowerContent = finalContent.toLowerCase()
      const hasFailure = /测试失败|执行失败|遇到错误|无法完成|❌|failed|error|timeout|unable/i.test(finalContent)
      const status: AgentResult['status'] = hasFailure ? 'failed' : 'passed'

      finalContent = finalContent || '测试执行完成（无详细结论）'
      this.emit('result', finalContent)

      return {
        status,
        conclusion: finalContent,
        steps,
        screenshots,
        totalDuration: Date.now() - startTime,
        turnCount,
        fullLog,
      }

    } catch (error: any) {
      const errMsg = error?.message || String(error)
      this.emit('error', `执行异常: ${errMsg}`)
      fullLog.push(`❌ ${errMsg}`)

      // 如果浏览器还在，截最后一张图
      if (this.page) {
        try {
          const ss = await this.page.screenshot({ type: 'jpeg', quality: 70 })
          screenshots.push(Buffer.from(ss).toString('base64'))
        } catch { /* */ }
      }

      return {
        status: this.cancelled ? 'cancelled' : 'error',
        conclusion: `执行出错: ${errMsg}`,
        steps,
        screenshots,
        totalDuration: Date.now() - startTime,
        turnCount: 0,
        fullLog,
      }

    } finally {
      // 关闭浏览器
      if (this.browser) {
        try { await this.browser.close() } catch { /* */ }
        this.browser = null
        this.page = null
      }
    }
  }
}
