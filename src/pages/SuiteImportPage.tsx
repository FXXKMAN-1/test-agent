import { useState } from 'react'
import { useAppStore } from '../store/appStore'

interface TestCaseDef {
  id: string
  name: string
  goal: string
  expectedResult: string
  priority: 'high' | 'medium' | 'low'
  enabled: boolean
}

interface Props {
  onStart: (suiteName: string, cases: TestCaseDef[]) => void
  onBack: () => void
}

export default function SuiteImportPage({ onStart, onBack }: Props) {
  const [cases, setCases] = useState<TestCaseDef[]>([])
  const [suiteName, setSuiteName] = useState('')
  const [sourceFile, setSourceFile] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const setCurrentTest = useAppStore(s => s.setCurrentTest)

  const handleImport = async () => {
    setError('')
    setLoading(true)
    try {
      const filePath = await window.electronAPI?.openFile()
      if (!filePath) { setLoading(false); return }

      const result = await window.electronAPI?.parseDocument(filePath)
      if (!result) { setLoading(false); return }

      if (result.errors?.length) {
        setError(result.errors.join('；'))
      }
      setCases(result.cases || [])
      setSuiteName(result.suiteName || '')
      setSourceFile(result.sourceFile || '')
    } catch (err: any) {
      setError(err?.message || '导入失败')
    }
    setLoading(false)
  }

  const toggleCase = (idx: number) => {
    setCases(cases.map((c, i) => i === idx ? { ...c, enabled: !c.enabled } : c))
  }

  const toggleAll = (enabled: boolean) => {
    setCases(cases.map(c => ({ ...c, enabled })))
  }

  const enabledCount = cases.filter(c => c.enabled).length

  const handleStart = () => {
    if (cases.length === 0 || enabledCount === 0) return
    onStart(suiteName, cases.filter(c => c.enabled))
  }

  const priorityStyle = (p: string) => {
    switch (p) {
      case 'high': return { background: '#ffebee', color: '#c62828' }
      case 'low': return { background: '#f5f5f5', color: '#999' }
      default: return { background: '#fff8e1', color: '#f57c00' }
    }
  }
  const priorityLabel = (p: string) => {
    switch (p) { case 'high': return '高'; case 'low': return '低'; default: return '中' }
  }

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 32 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14, padding: 0, marginBottom: 24 }}>
        ← 返回
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>导入测试用例</h1>
      <p style={{ color: '#666', marginBottom: 24 }}>
        导入 Excel (.xlsx) / CSV / Markdown 测试用例文档
      </p>

      {cases.length === 0 ? (
        <div style={{
          background: 'white', borderRadius: 12, padding: 60, textAlign: 'center',
          boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📂</div>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>还没有测试用例</div>
          <p style={{ color: '#999', fontSize: 13, marginBottom: 20 }}>
            支持格式：Excel (.xlsx/.xls)、CSV、Markdown (.md)<br />
            文档需包含列：用例名称、测试步骤、预期结果
          </p>
          <button onClick={handleImport} disabled={loading}
            style={{ padding: '12px 28px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 10, cursor: 'pointer', fontSize: 15, fontWeight: 600 }}>
            {loading ? '正在解析...' : '📁 选择文档'}
          </button>
          {error && (
            <div style={{ marginTop: 16, padding: '12px 16px', background: '#fff3e0', borderRadius: 8, color: '#f57c00', fontSize: 13 }}>{error}</div>
          )}
        </div>
      ) : (
        <>
          {/* 用例清单 */}
          <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 600 }}>{suiteName}</h3>
                <p style={{ color: '#999', fontSize: 12 }}>{sourceFile} · {cases.length} 条用例</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => toggleAll(true)} style={smBtn}>全选</button>
                <button onClick={() => toggleAll(false)} style={smBtn}>全不选</button>
                <button onClick={handleImport} style={{ ...smBtn, background: '#f0f0f0' }}>重新导入</button>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
              {cases.map((tc, i) => (
                <div key={tc.id} onClick={() => toggleCase(i)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 14px', borderRadius: 8,
                    border: tc.enabled ? '1px solid #c8d6e5' : '1px solid #e8e8e8',
                    background: tc.enabled ? 'white' : '#f9f9f9',
                    cursor: 'pointer', opacity: tc.enabled ? 1 : 0.5,
                    transition: 'all 0.15s',
                  }}>
                  <input type="checkbox" checked={tc.enabled} onChange={() => toggleCase(i)}
                    style={{ width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{
                    padding: '2px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                    ...priorityStyle(tc.priority),
                    flexShrink: 0,
                  }}>{priorityLabel(tc.priority)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                      <span style={{ color: '#666', fontSize: 11 }}>{tc.id}</span> {tc.name}
                    </div>
                    <div style={{ fontSize: 11, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {tc.goal.substring(0, 80)}
                    </div>
                  </div>
                  {tc.expectedResult && (
                    <div style={{ fontSize: 11, color: '#4caf50', flexShrink: 0, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      title={tc.expectedResult}>
                      预期: {tc.expectedResult}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 操作栏 */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 13, color: '#666' }}>
              已选 <strong>{enabledCount}</strong> / {cases.length} 条用例
            </div>
            <button onClick={handleStart} disabled={enabledCount === 0}
              style={{ padding: '12px 28px', background: enabledCount > 0 ? '#1a1a2e' : '#ccc', color: 'white', border: 'none', borderRadius: 10, cursor: enabledCount > 0 ? 'pointer' : 'not-allowed', fontSize: 15, fontWeight: 600 }}>
              ▶ 批量执行（{enabledCount} 条）
            </button>
          </div>
        </>
      )}
    </div>
  )
}

const smBtn: React.CSSProperties = {
  padding: '4px 12px', border: '1px solid #d0d0d0', borderRadius: 6,
  background: 'white', cursor: 'pointer', fontSize: 12,
}
