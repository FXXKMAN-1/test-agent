import { useAppStore, TestRun } from '../store/appStore'

interface Props {
  testId: string
  onBack: () => void
  onRerun: () => void
}

export default function ReportPage({ testId, onBack, onRerun }: Props) {
  const history = useAppStore(s => s.history)
  const currentTest = useAppStore(s => s.currentTest)

  const report: TestRun | undefined =
    history.find(t => t.id === testId) ||
    (currentTest?.id === testId ? currentTest : undefined)

  if (!report) {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', padding: 32, textAlign: 'center', color: '#999' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
        <h2>未找到测试报告</h2>
        <button onClick={onBack} style={{ marginTop: 16, padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
          返回历史
        </button>
      </div>
    )
  }

  const handleExport = () => {
    const stepsHtml = report.events
      .map(e => `<div style="margin:4px 0"><b>[${e.type}]</b> ${e.content}</div>`)
      .join('')

    const screenshotsHtml = report.screenshots
      .map((ss, i) => `<div style="margin:12px 0">
        <h3>截图 ${i + 1}</h3>
        <img src="data:image/jpeg;base64,${ss}" style="max-width:100%;border:1px solid #ddd;border-radius:4px" />
      </div>`)
      .join('')

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>测试报告: ${report.name}</title>
<style>body{font-family:sans-serif;max-width:800px;margin:0 auto;padding:32px;color:#333}
h1{color:#1a1a2e} .summary{background:#f5f5f5;padding:16px;border-radius:8px;margin:16px 0}
.pass{color:#2e7d32} .fail{color:#c62828}</style></head>
<body>
<h1>🤖 AgentTest 测试报告</h1>
<div class="summary">
  <p><strong>测试名称:</strong> ${report.name}</p>
  <p><strong>测试目标:</strong> ${report.goal}</p>
  <p><strong>状态:</strong> <span class="${report.status === 'passed' ? 'pass' : 'fail'}">${report.status}</span></p>
  <p><strong>执行时间:</strong> ${report.createdAt}</p>
  ${report.duration ? `<p><strong>耗时:</strong> ${(report.duration / 1000).toFixed(1)}s</p>` : ''}
  <p><strong>步骤数:</strong> ${report.events.length}</p>
  <p><strong>截图数:</strong> ${report.screenshots.length}</p>
</div>
${report.conclusion ? `<div style="background:#f0f4ff;padding:16px;border-radius:8px;border-left:4px solid #1a1a2e"><strong>Agent 结论</strong><p>${report.conclusion}</p></div>` : ''}
<h2>执行过程</h2>
${stepsHtml}
<h2>截图</h2>
${screenshotsHtml}
<p style="color:#999;text-align:center;margin-top:40px;font-size:12px">AgentTest · AI 驱动自动化测试</p>
</body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${report.name}-${testId.slice(0, 8)}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14, padding: 0 }}>
          ← 返回历史
        </button>
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={onRerun}
            style={{ padding: '8px 16px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
            🔄 新建测试
          </button>
          <button onClick={handleExport}
            style={{ padding: '8px 16px', background: 'white', color: '#333', border: '1px solid #d0d0d0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
            📤 导出 HTML
          </button>
        </div>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>测试报告</h1>
      <p style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>
        {report.name} · {new Date(report.createdAt).toLocaleString('zh-CN')}
      </p>

      {/* 摘要 */}
      <div style={{
        background: 'white',
        borderRadius: 12,
        padding: 24,
        marginBottom: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        display: 'flex',
        gap: 40,
      }}>
        <div>
          <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>状态</div>
          <div style={{
            display: 'inline-block', padding: '4px 14px', borderRadius: 20,
            fontSize: 14, fontWeight: 600,
            background: report.status === 'passed' ? '#e8f5e9' : report.status === 'failed' ? '#ffebee' : '#fff3e0',
            color: report.status === 'passed' ? '#2e7d32' : report.status === 'failed' ? '#c62828' : '#f57c00',
          }}>
            {report.status === 'passed' ? '✅ 通过' : report.status === 'failed' ? '❌ 失败' : '⏹ 已取消'}
          </div>
        </div>
        <div>
          <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>执行步骤</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{report.events.length}</div>
        </div>
        <div>
          <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>截图数量</div>
          <div style={{ fontSize: 22, fontWeight: 700 }}>{report.screenshots.length}</div>
        </div>
        {report.duration && (
          <div>
            <div style={{ color: '#666', fontSize: 13, marginBottom: 4 }}>总耗时</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{(report.duration / 1000).toFixed(1)}s</div>
          </div>
        )}
      </div>

      {/* Agent 结论 */}
      {report.conclusion && (
        <div style={{
          background: '#f0f4ff', borderRadius: 12, padding: 20, marginBottom: 24,
          borderLeft: '4px solid #1a1a2e',
        }}>
          <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 14 }}>🤖 Agent 结论</div>
          <div style={{ color: '#333', lineHeight: 1.7, fontSize: 14 }}>{report.conclusion}</div>
        </div>
      )}

      {/* 测试目标 */}
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>📋 测试目标</h3>
        <div style={{ background: '#f9f9f9', padding: 14, borderRadius: 8, fontSize: 14, color: '#555', lineHeight: 1.6 }}>
          {report.goal}
        </div>
      </div>

      {/* 执行过程 */}
      <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>📝 执行过程</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {report.events.map((evt, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'flex-start', gap: 10,
            padding: '8px 14px', background: 'white', borderRadius: 8,
            boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
            fontSize: 13,
          }}>
            <span style={{
              padding: '2px 8px', borderRadius: 4,
              background: evt.type === 'thought' ? '#f0f4ff' : evt.type === 'action' ? '#fff8e1' : '#f5f5f5',
              fontSize: 11, fontWeight: 600, color: '#666',
              flexShrink: 0,
            }}>
              {evt.type}
            </span>
            <span style={{ flex: 1, color: '#333', lineHeight: 1.6 }}>{evt.content}</span>
            {evt.type === 'screenshot' && report.screenshots.length > 0 && (
              <img src={`data:image/jpeg;base64,${report.screenshots[0]}`}
                style={{ width: 80, height: 60, borderRadius: 4, objectFit: 'cover', cursor: 'pointer', flexShrink: 0 }}
                onClick={() => window.open(`data:image/jpeg;base64,${report.screenshots[0]}`, '_blank')}
                alt="截图缩略图"
              />
            )}
          </div>
        ))}
      </div>

      {/* 页脚 */}
      <div style={{ textAlign: 'center', marginTop: 40, padding: 20, color: '#999', fontSize: 12 }}>
        AgentTest · AI 驱动自动化测试 · {new Date().toISOString().split('T')[0]}
      </div>
    </div>
  )
}
