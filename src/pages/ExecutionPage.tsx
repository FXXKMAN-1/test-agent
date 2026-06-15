import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import type { AgentEvent } from '../types'

interface BatchMode {
  suiteName: string
  cases: Array<{
    id: string
    name: string
    goal: string
    expectedResult: string
    priority: string
    enabled: boolean
  }>
}

interface CaseResult {
  caseId: string; caseName: string; goal: string
  status: 'passed' | 'failed' | 'cancelled' | 'error'
  conclusion: string; screenshots: string[]; duration: number
}

interface Props {
  testId: string
  batchMode?: BatchMode
  onComplete: (testId: string) => void
  onBatchComplete?: (suiteName: string, results: CaseResult[], summary: any) => void
  onBack: () => void
}

export default function ExecutionPage({ testId, batchMode, onComplete, onBatchComplete, onBack }: Props) {
  const currentTest = useAppStore(s => s.currentTest)
  const addAgentEvent = useAppStore(s => s.addAgentEvent)
  const addScreenshot = useAppStore(s => s.addScreenshot)
  const setTestStatus = useAppStore(s => s.setTestStatus)
  const setTestResult = useAppStore(s => s.setTestResult)
  const addToHistory = useAppStore(s => s.addToHistory)

  const [status, setStatus] = useState<'running' | 'passed' | 'failed' | 'cancelled'>('running')
  const [latestScreenshot, setLatestScreenshot] = useState('')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState('')
  const logEndRef = useRef<HTMLDivElement>(null)
  const events = currentTest?.events || []

  // 启动测试
  useEffect(() => {
    if (batchMode) return // 批量模式单独处理
    if (!testId || !currentTest) return

    let cancelled = false
    const startSingle = async () => {
      setStatus('running')
      setTestStatus('running')

      const cleanup = window.electronAPI?.onAgentEvent((event: AgentEvent) => {
        if (cancelled) return
        addAgentEvent(event)
        if (event.type === 'screenshot' && event.data) {
          setLatestScreenshot(event.data)
          addScreenshot(event.data)
        }
      })

      try {
        const runResult = await window.electronAPI?.runTest({
          goal: currentTest.goal,
          options: {
            model: currentTest.model || 'deepseek-chat',
            browser: currentTest.browser || 'chromium',
            providerId: currentTest.providerId,
            maxTurns: currentTest.maxTurns || 40,
          }
        })

        if (cancelled) return

        const resultStatus = runResult?.success && runResult.result
          ? (runResult.result.status as string)
          : 'failed'

        if (runResult?.success && runResult?.result) {
          // 映射全部 4 种状态，不再只分 passed/failed
          const mappedStatus = resultStatus === 'cancelled' ? 'cancelled'
            : resultStatus === 'error' ? 'failed'
            : resultStatus === 'failed' ? 'failed'
            : 'passed'

          setTestResult(runResult.result.conclusion || '测试完成', runResult.result.totalDuration || 0, mappedStatus)
          setStatus(mappedStatus)

          const latest = useAppStore.getState().currentTest
          addToHistory({
            id: testId, name: latest?.name || '未命名测试', goal: latest?.goal || '',
            browser: latest?.browser || 'chromium', model: latest?.model || 'deepseek-chat',
            providerId: latest?.providerId,
            status: mappedStatus,
            createdAt: latest?.createdAt || new Date().toISOString(),
            events: latest?.events || [], screenshots: latest?.screenshots || [],
            conclusion: runResult.result.conclusion,
            duration: runResult.result.totalDuration,
          })
        } else if (runResult?.error) {
          setError(runResult.error); setStatus('failed')
          addAgentEvent({ type: 'error', content: runResult.error, timestamp: Date.now() })
        }
      } catch (err: any) {
        if (!cancelled) { setError(err?.message || String(err)); setStatus('failed')
          addAgentEvent({ type: 'error', content: err?.message || String(err), timestamp: Date.now() }) }
      } finally { cleanup?.() }
    }

    startSingle()
    return () => { cancelled = true }
  }, [testId])

  // 批量执行
  useEffect(() => {
    if (!batchMode) return

    let cancelled = false
    const startBatch = async () => {
      setStatus('running')
      setProgress(`准备执行: 共 ${batchMode.cases.length} 条用例`)

      const cleanup = window.electronAPI?.onAgentEvent((event: AgentEvent) => {
        if (cancelled) return
        addAgentEvent(event)
        if (event.type === 'screenshot' && event.data) {
          setLatestScreenshot(event.data)
          addScreenshot(event.data)
        }
        // 更新进度
        const match = event.content?.match(/\[(\d+)\/(\d+)\]/)
        if (match) setProgress(`${match[0]} · ${batchMode.suiteName}`)
      })

      try {
        const result = await window.electronAPI?.runBatch({
          cases: batchMode.cases,
          options: {
            model: currentTest?.model || 'deepseek-chat',
            browser: currentTest?.browser || 'chromium',
            providerId: currentTest?.providerId,
            maxTurns: currentTest?.maxTurns || 40,
          }
        })

        if (cancelled) return
        if (result?.success && result?.result) {
          setStatus('passed')
          setProgress(`批量执行完成: ${result.result.summary.passed} 通过, ${result.result.summary.failed} 失败`)
          onBatchComplete?.(batchMode.suiteName, result.result.results, result.result.summary)
        } else {
          setError(result?.error || '批量执行失败')
          setStatus('failed')
        }
      } catch (err: any) {
        if (!cancelled) { setError(err?.message || String(err)); setStatus('failed') }
      } finally { cleanup?.() }
    }

    startBatch()
    return () => { cancelled = true }
  }, [batchMode?.suiteName])

  // 自动滚动
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events])

  // 完成后跳转
  useEffect(() => {
    if (status !== 'running' && !batchMode) {
      const timer = setTimeout(() => { if (!error) onComplete(testId) }, 1000)
      return () => clearTimeout(timer)
    }
  }, [status, testId, onComplete, error, batchMode])

  const handleCancel = async () => {
    setStatus('cancelled')
    setTestStatus('cancelled')
    // 不等待 cancelTest 返回 — 让后端异步清理即可
    window.electronAPI?.cancelTest()
  }

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'thought': return '🤔'
      case 'action': return '🔧'
      case 'observation': return '👀'
      case 'screenshot': return '📸'
      case 'error': return '❌'
      case 'result': return '✅'
      default: return '•'
    }
  }

  const statusConfig = {
    running: { color: '#2e7d32', bg: '#e8f5e9', text: '● 运行中' },
    passed: { color: '#2e7d32', bg: '#e8f5e9', text: '✅ 完成' },
    failed: { color: '#c62828', bg: '#ffebee', text: '❌ 失败' },
    cancelled: { color: '#f57c00', bg: '#fff3e0', text: '⏹ 已取消' },
  }[status]

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* 左侧：Agent 日志流 */}
      <div style={{ flex: 1, padding: 24, overflow: 'auto', background: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14, padding: 0 }}>
              ← 返回
            </button>
            <h2 style={{ margin: '8px 0 0', fontSize: 20, fontWeight: 700 }}>
              {batchMode ? batchMode.suiteName : (currentTest?.name || '测试执行')}
            </h2>
            {batchMode && progress && (
              <p style={{ color: '#666', fontSize: 13, margin: '4px 0 0' }}>{progress}</p>
            )}
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 20, fontSize: 13, fontWeight: 600, background: statusConfig.bg, color: statusConfig.color }}>
            {statusConfig.text}
          </div>
        </div>

        {batchMode && (
          <div style={{ padding: '10px 14px', background: '#f0f4ff', borderRadius: 8, fontSize: 13, color: '#555', marginBottom: 16, borderLeft: '3px solid #1a1a2e' }}>
            📋 批量测试 · 共 {batchMode.cases.length} 条用例
          </div>
        )}

        {currentTest?.goal && !batchMode && (
          <div style={{ padding: '10px 14px', background: '#f0f4ff', borderRadius: 8, fontSize: 13, color: '#555', marginBottom: 16, borderLeft: '3px solid #1a1a2e' }}>
            🎯 {currentTest.goal}
          </div>
        )}

        {error && (
          <div style={{ padding: '10px 14px', background: '#ffebee', borderRadius: 8, fontSize: 13, color: '#c62828', marginBottom: 16 }}>❌ {error}</div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {events.map((evt, i) => (
            <div key={i} style={{
              display: 'flex', gap: 10, padding: '8px 12px', borderRadius: 8,
              background: evt.type === 'thought' ? '#f0f4ff' : evt.type === 'action' ? '#fff8e1' : evt.type === 'error' ? '#ffebee' : 'transparent',
              fontSize: 14, lineHeight: 1.5, animation: 'fadeIn 0.3s',
            }}>
              <span style={{ flexShrink: 0, fontSize: 16 }}>{getEventIcon(evt.type)}</span>
              <span style={{ color: '#333', whiteSpace: 'pre-wrap' }}>{evt.content}</span>
            </div>
          ))}
          {status === 'running' && (
            <div style={{ padding: '8px 12px', fontSize: 13, color: '#999' }}>
              <span className="blink">●</span> Agent 思考中...
            </div>
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* 右侧：截图预览 */}
      <div style={{
        width: 400, padding: 24, background: '#fafafa', borderLeft: '1px solid #e0e0e0',
        display: 'flex', flexDirection: 'column',
      }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>📸 实时截图</h3>
        <div style={{
          flex: 1, background: '#e8e8e8', borderRadius: 8,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#999', fontSize: 14, overflow: 'hidden',
        }}>
          {latestScreenshot ? (
            <img src={`data:image/jpeg;base64,${latestScreenshot}`} alt="截图"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🖥️</div>
              <div>等待 Agent 操作浏览器...</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#666' }}>
          <span>执行步骤</span>
          <span>{events.length} 步</span>
        </div>

        {status === 'running' && (
          <button onClick={handleCancel}
            style={{ marginTop: 16, padding: '10px', background: '#e74c3c', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            ■ 取消
          </button>
        )}
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .blink { animation: blink 1s infinite; }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.3; } }
      `}</style>
    </div>
  )
}
