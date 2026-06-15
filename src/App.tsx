import { useState } from 'react'
import { useAppStore } from './store/appStore'
import NewTestPage from './pages/NewTestPage'
import ExecutionPage from './pages/ExecutionPage'
import ReportPage from './pages/ReportPage'
import HistoryPage from './pages/HistoryPage'
import SettingsPage from './pages/SettingsPage'
import SuiteImportPage from './pages/SuiteImportPage'
import SuiteReportPage from './pages/SuiteReportPage'

type Page = 'new-test' | 'execution' | 'report' | 'history' | 'settings' | 'suite-import' | 'suite-report'

interface CaseResult {
  caseId: string; caseName: string; goal: string
  status: 'passed' | 'failed' | 'cancelled' | 'error'
  conclusion: string; screenshots: string[]; duration: number
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('new-test')
  const [activeTestId, setActiveTestId] = useState<string | null>(null)
  const [batchCases, setBatchCases] = useState<any[]>([])
  const [batchSuiteName, setBatchSuiteName] = useState('')
  const [suiteReport, setSuiteReport] = useState<{ suiteName: string; results: CaseResult[]; summary: any } | null>(null)

  const navigate = (page: Page, testId?: string) => {
    if (testId) setActiveTestId(testId)
    setCurrentPage(page)
  }

  return (
    <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{
        background: '#1a1a2e', color: 'white', padding: '0 24px', height: 48,
        display: 'flex', alignItems: 'center', gap: 24, userSelect: 'none', flexShrink: 0,
      }}>
        <span style={{ fontWeight: 700, fontSize: 18 }}>🤖 AgentTest</span>
        <nav style={{ display: 'flex', gap: 4, marginLeft: 24 }}>
          {[
            { id: 'new-test' as Page, label: '新建测试' },
            { id: 'suite-import' as Page, label: '批量测试' },
            { id: 'history' as Page, label: '历史记录' },
            { id: 'settings' as Page, label: '设置' },
          ].map(p => (
            <button key={p.id} onClick={() => navigate(p.id)}
              style={{
                background: currentPage === p.id ? 'rgba(255,255,255,0.15)' : 'transparent',
                color: 'white', border: 'none', padding: '6px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 14,
              }}>{p.label}</button>
          ))}
        </nav>
      </header>

      <main style={{ flex: 1, overflow: 'auto', background: '#f5f5f5' }}>
        {currentPage === 'new-test' && (
          <NewTestPage onStart={(testId) => navigate('execution', testId)} />
        )}
        {currentPage === 'suite-import' && (
          <SuiteImportPage
            onBack={() => navigate('new-test')}
            onStart={(suiteName, cases) => {
              setBatchSuiteName(suiteName)
              setBatchCases(cases)
              navigate('execution')
            }}
          />
        )}
        {currentPage === 'execution' && (
          <ExecutionPage
            testId={activeTestId!}
            batchMode={batchCases.length > 0 ? { suiteName: batchSuiteName, cases: batchCases } : undefined}
            onComplete={(id) => navigate('report', id)}
            onBatchComplete={(suiteName, results, summary) => {
              setSuiteReport({ suiteName, results, summary })
              setBatchCases([])
              navigate('suite-report')
            }}
            onBack={() => {
              setBatchCases([])
              navigate(batchCases.length > 0 ? 'suite-import' : 'new-test')
            }}
          />
        )}
        {currentPage === 'report' && (
          <ReportPage testId={activeTestId!}
            onBack={() => navigate('history')}
            onRerun={() => navigate('new-test')} />
        )}
        {currentPage === 'suite-report' && suiteReport && (
          <SuiteReportPage {...suiteReport} onBack={() => {
            setSuiteReport(null)
            navigate('history')
          }} />
        )}
        {currentPage === 'history' && (
          <HistoryPage onSelectTest={(id) => navigate('report', id)}
            onNewTest={() => navigate('new-test')} />
        )}
        {currentPage === 'settings' && (
          <SettingsPage onBack={() => navigate('new-test')} />
        )}
      </main>
    </div>
  )
}
