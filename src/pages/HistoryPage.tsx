import { useEffect } from 'react'
import { useAppStore, TestRun } from '../store/appStore'

interface Props {
  onSelectTest: (testId: string) => void
  onNewTest: () => void
}

export default function HistoryPage({ onSelectTest, onNewTest }: Props) {
  const history = useAppStore(s => s.history)
  const loadHistory = useAppStore(s => s.loadHistory)

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>历史记录</h1>
        <button onClick={onNewTest}
          style={{ padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
          + 新建测试
        </button>
      </div>

      {history.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>📭</div>
          <div>还没有测试记录</div>
          <button onClick={onNewTest}
            style={{ marginTop: 16, padding: '8px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
            开始第一个测试
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {history.map(test => (
            <div key={test.id} onClick={() => onSelectTest(test.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '14px 20px', background: 'white', borderRadius: 10,
                cursor: 'pointer', boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                transition: 'box-shadow 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.06)'}
            >
              <span style={{
                padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                background: test.status === 'passed' ? '#e8f5e9' : test.status === 'failed' ? '#ffebee' : '#fff3e0',
                color: test.status === 'passed' ? '#2e7d32' : test.status === 'failed' ? '#c62828' : '#f57c00',
                flexShrink: 0,
              }}>
                {test.status === 'passed' ? '✅ 通过' : test.status === 'failed' ? '❌ 失败' : '⏹ 已取消'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{test.name || '未命名测试'}</div>
                <div style={{ fontSize: 12, color: '#999', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {test.goal.substring(0, 80)}
                </div>
              </div>
              <div style={{ fontSize: 12, color: '#999', flexShrink: 0, textAlign: 'right' }}>
                <div>{test.events.length} 步</div>
                <div>{new Date(test.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
