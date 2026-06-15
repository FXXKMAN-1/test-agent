import { useState } from 'react'

interface CaseResult {
  caseId: string
  caseName: string
  goal: string
  status: 'passed' | 'failed' | 'cancelled' | 'error'
  conclusion: string
  screenshots: string[]
  duration: number
}

interface Props {
  suiteName: string
  results: CaseResult[]
  summary: { total: number; passed: number; failed: number; cancelled: number; errors: number; duration: number }
  onBack: () => void
}

export default function SuiteReportPage({ suiteName, results, summary, onBack }: Props) {
  const [expandedCase, setExpandedCase] = useState<string | null>(null)

  const handleExport = () => {
    let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${suiteName} - 测试报告</title>
<style>body{font-family:sans-serif;max-width:900px;margin:0 auto;padding:32px} h1{color:#1a1a2e} .card{background:#fff;border-radius:8px;padding:16px;margin:8px 0;border:1px solid #eee} .pass{color:#2e7d32} .fail{color:#c62828} .muted{color:#999}</style></head><body>
<h1>📊 ${suiteName}</h1><div class="card"><p>总用例: ${summary.total} | ✅${summary.passed} | ❌${summary.failed} | ⏭${summary.cancelled + summary.errors}</p><p>总耗时: ${(summary.duration / 1000).toFixed(1)}s</p></div>`

    for (const r of results) {
      html += `<div class="card"><h3>${r.caseId} ${r.caseName}</h3><p><span class="${r.status === 'passed' ? 'pass' : 'fail'}">${r.status === 'passed' ? '✅ 通过' : '❌ 失败'}</span> · ${(r.duration / 1000).toFixed(1)}s</p><p style="color:#555">${r.conclusion}</p></div>`
    }
    html += '</body></html>'

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${suiteName}-测试报告.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14, padding: 0 }}>
          ← 返回
        </button>
        <button onClick={handleExport}
          style={{ padding: '8px 16px', background: 'white', color: '#333', border: '1px solid #d0d0d0', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
          📤 导出汇总报告
        </button>
      </div>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>📊 {suiteName}</h1>
      <p style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>
        批量测试执行报告 · {new Date().toLocaleString('zh-CN')}
      </p>

      {/* 统计卡片 */}
      <div style={{
        background: 'white', borderRadius: 12, padding: 24, marginBottom: 24,
        boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        display: 'flex', gap: 32, flexWrap: 'wrap',
      }}>
        {[
          { label: '总用例', value: summary.total, color: '#333' },
          { label: '✅ 通过', value: summary.passed, color: '#2e7d32' },
          { label: '❌ 失败', value: summary.failed, color: '#c62828' },
          { label: '⏭ 错误', value: summary.errors + summary.cancelled, color: '#f57c00' },
          { label: '总耗时', value: `${(summary.duration / 1000).toFixed(1)}s`, color: '#333' },
        ].map(s => (
          <div key={s.label}>
            <div style={{ fontSize: 12, color: '#999', marginBottom: 4 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* 用例列表 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {results.map((r, i) => (
          <div key={r.caseId}>
            <div onClick={() => setExpandedCase(expandedCase === r.caseId ? null : r.caseId)}
              style={{
                display: 'flex', alignItems: 'center', gap: 14,
                padding: '14px 18px', background: 'white', borderRadius: 10,
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)', cursor: 'pointer',
              }}>
              <span style={{
                padding: '4px 10px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                background: r.status === 'passed' ? '#e8f5e9' : r.status === 'failed' ? '#ffebee' : '#fff3e0',
                color: r.status === 'passed' ? '#2e7d32' : r.status === 'failed' ? '#c62828' : '#f57c00',
                flexShrink: 0,
              }}>
                {r.status === 'passed' ? '通过' : r.status === 'failed' ? '失败' : '异常'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{r.caseId} {r.caseName}</div>
              </div>
              <div style={{ fontSize: 12, color: '#999', flexShrink: 0 }}>{(r.duration / 1000).toFixed(1)}s</div>
            </div>

            {/* 展开详情 */}
            {expandedCase === r.caseId && (
              <div style={{
                marginLeft: 24, marginTop: 4, padding: '14px 18px',
                background: '#f9f9f9', borderRadius: 8, fontSize: 13,
              }}>
                <div style={{ marginBottom: 8 }}><strong>测试步骤：</strong>{r.goal}</div>
                <div style={{ marginBottom: 8, color: r.status === 'passed' ? '#2e7d32' : '#c62828' }}>
                  <strong>结论：</strong>{r.conclusion}
                </div>
                {r.screenshots.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, overflowX: 'auto' }}>
                    {r.screenshots.slice(0, 3).map((ss, j) => (
                      <img key={j} src={`data:image/jpeg;base64,${ss}`}
                        style={{ width: 120, height: 80, borderRadius: 4, objectFit: 'cover' }} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
