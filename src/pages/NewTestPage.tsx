import { useState, useEffect } from 'react'
import { useAppStore } from '../store/appStore'

interface Props {
  onStart: (testId: string) => void
}

interface ModelProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string
}

const FALLBACK_MODELS = ['deepseek-chat', 'deepseek-reasoner']

export default function NewTestPage({ onStart }: Props) {
  const [name, setName] = useState('')
  const [goal, setGoal] = useState('')
  const [browser, setBrowser] = useState<'chromium' | 'firefox' | 'webkit'>('chromium')
  const [providerId, setProviderId] = useState('deepseek')
  const [model, setModel] = useState('deepseek-chat')
  const [maxTurns, setMaxTurns] = useState(40)
  const [providers, setProviders] = useState<ModelProvider[]>([])
  const setCurrentTest = useAppStore(s => s.setCurrentTest)

  useEffect(() => {
    loadProviders()
  }, [])

  const loadProviders = async () => {
    try {
      const settings = await window.electronAPI?.getSettings()
      const savedProviders = (settings as any)?.providers || []

      // 合并内置 + 自定义
      const all: ModelProvider[] = [
        { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', models: 'deepseek-chat,deepseek-reasoner' },
        { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: 'gpt-4o,gpt-4o-mini' },
      ]
      for (const sp of savedProviders) {
        if (!all.find(a => a.id === sp.id)) {
          all.push(sp)
        } else {
          const existing = all.find(a => a.id === sp.id)!
          existing.apiKey = sp.apiKey || existing.apiKey
          existing.models = sp.models || existing.models
          existing.baseUrl = sp.baseUrl || existing.baseUrl
        }
      }
      setProviders(all)
    } catch {
      setProviders([])
    }
  }

  const currentProvider = providers.find(p => p.id === providerId)
  const modelList = currentProvider?.models?.split(',').map(s => s.trim()).filter(Boolean) || FALLBACK_MODELS

  // 当 provider 切换时，重置 model 为该 provider 的第一个模型
  useEffect(() => {
    if (modelList.length > 0 && !modelList.includes(model)) {
      setModel(modelList[0])
    }
  }, [providerId, modelList, model])

  const handleStart = () => {
    if (!goal.trim()) return
    const testId = crypto.randomUUID()
    setCurrentTest({
      id: testId,
      goal: goal.trim(),
      name: name.trim() || '未命名测试',
      browser,
      model,
      providerId,
      maxTurns,
    })
    onStart(testId)
  }

  const isReady = goal.trim().length > 0

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: 32 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>新建测试</h1>
      <p style={{ color: '#666', marginBottom: 32 }}>
        输入测试目标，AI Agent 会自动规划并执行浏览器操作
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
            测试名称（选填）
          </label>
          <input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="例如: 登录流程验证"
            style={inputStyle}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
            测试目标 <span style={{ color: '#e74c3c' }}>*</span>
          </label>
          <textarea
            value={goal}
            onChange={e => setGoal(e.target.value)}
            placeholder={`例如:
打开京东网站，搜索"机械键盘"
找到销量最高的商品，记录它的价格和名称`}
            rows={6}
            style={{ ...inputStyle, fontFamily: 'inherit', lineHeight: 1.6, resize: 'vertical' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 160 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              Provider
            </label>
            <select value={providerId}
              onChange={e => setProviderId(e.target.value)}
              style={selectStyle}>
              {providers.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 180 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              模型
            </label>
            <select value={model}
              onChange={e => setModel(e.target.value)}
              style={selectStyle}>
              {modelList.map(m => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>

          <div style={{ minWidth: 140 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              浏览器
            </label>
            <select value={browser}
              onChange={e => setBrowser(e.target.value as any)}
              style={selectStyle}>
              <option value="chromium">Chromium</option>
              <option value="firefox">Firefox</option>
              <option value="webkit">WebKit</option>
            </select>
          </div>

          <div style={{ minWidth: 180 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 600, fontSize: 14 }}>
              最大步数 <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>({maxTurns}轮)</span>
            </label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="range" min={10} max={120} step={5} value={maxTurns}
                onChange={e => setMaxTurns(Number(e.target.value))}
                style={{ flex: 1, accentColor: '#1a1a2e' }} />
              <span style={{ fontSize: 13, color: '#666', minWidth: 20 }}>{maxTurns}</span>
            </div>
            <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>
              越多 token 消耗越大，建议 40-60
            </div>
          </div>
        </div>

        <button
          onClick={handleStart}
          disabled={!isReady}
          style={{
            marginTop: 16, padding: '14px 32px',
            background: isReady ? '#1a1a2e' : '#ccc', color: 'white',
            border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 600,
            cursor: isReady ? 'pointer' : 'not-allowed',
          }}>
          ▶ 开始测试
        </button>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 14px', border: '1px solid #d0d0d0',
  borderRadius: 8, fontSize: 14, boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  width: '100%', padding: '8px 12px', border: '1px solid #d0d0d0',
  borderRadius: 8, fontSize: 14, background: 'white',
}
