import { useState, useEffect } from 'react'

interface Props {
  onBack: () => void
}

interface ModelProvider {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string
}

// 预置 Provider
const BUILTIN_PROVIDERS: ModelProvider[] = [
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', apiKey: '', models: 'deepseek-chat,deepseek-reasoner' },
  { id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', apiKey: '', models: 'gpt-4o,gpt-4o-mini' },
]

declare global {
  interface Window {
    electronAPI?: {
      getSettings: () => Promise<Record<string, any>>
      saveApiKey: (key: string) => Promise<{ success: boolean }>
      saveSettings: (settings: any) => Promise<any>
      saveProvider: (provider: any) => Promise<{ success: boolean }>
      deleteProvider: (providerId: string) => Promise<{ success: boolean }>
      onAgentEvent: (cb: (event: any) => void) => () => void
    }
  }
}

export default function SettingsPage({ onBack }: Props) {
  const [providers, setProviders] = useState<ModelProvider[]>([])
  const [editingProvider, setEditingProvider] = useState<ModelProvider | null>(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const [defaultTimeout, setDefaultTimeout] = useState(120)

  useEffect(() => {
    loadSettings()
  }, [])

  const loadSettings = async () => {
    try {
      const settings = await window.electronAPI?.getSettings()
      const saved = settings || {}

      // 加载 providers — 首次用内置预置
      const savedProviders = saved.providers || []
      const merged = [...BUILTIN_PROVIDERS]

      // 合并保存的 Key
      for (const mp of merged) {
        const existing = savedProviders.find((p: any) => p.id === mp.id)
        if (existing) {
          mp.apiKey = existing.apiKey || ''
          mp.baseUrl = existing.baseUrl || mp.baseUrl
          mp.models = existing.models || mp.models
        } else {
          // 兼容旧的 deepseekApiKey 字段
          if (mp.id === 'deepseek' && saved.deepseekApiKey) {
            mp.apiKey = saved.deepseekApiKey
          }
        }
      }

      // 附加自定义 provider
      for (const sp of savedProviders) {
        if (!merged.find(m => m.id === sp.id)) {
          merged.push(sp)
        }
      }

      setProviders(merged)
      setDefaultTimeout(saved.defaultTimeout || 120)
    } catch {
      setProviders(BUILTIN_PROVIDERS)
    }
  }

  const handleSaveProvider = async (provider: ModelProvider) => {
    if (!provider.baseUrl.trim() || !provider.apiKey.trim()) return

    try {
      await window.electronAPI?.saveProvider({
        id: provider.id,
        name: provider.name,
        baseUrl: provider.baseUrl.trim(),
        apiKey: provider.apiKey.trim(),
        models: provider.models.trim(),
        primaryModel: provider.models.split(',')[0].trim(),
      })
      setShowAddForm(false)
      setEditingProvider(null)
      setSavedMsg('✅ 已保存')
      setTimeout(() => setSavedMsg(''), 2000)
      await loadSettings()
    } catch (err: any) {
      // 浏览器模式 fallback to localStorage
      const settings = JSON.parse(localStorage.getItem('agent-test-settings') || '{}')
      const providers = settings.providers || []
      const idx = providers.findIndex((p: any) => p.id === provider.id)
      if (idx >= 0) providers[idx] = provider
      else providers.push(provider)
      settings.providers = providers
      localStorage.setItem('agent-test-settings', JSON.stringify(settings))
      setShowAddForm(false)
      setEditingProvider(null)
      setSavedMsg('✅ 已保存')
      setTimeout(() => setSavedMsg(''), 2000)
      await loadSettings()
    }
  }

  const handleDeleteProvider = async (id: string) => {
    if (BUILTIN_PROVIDERS.find(p => p.id === id)) {
      // 内置只清空 API Key
      await window.electronAPI?.saveProvider({ id, name: '', baseUrl: '', apiKey: '', models: '' })
    } else {
      await window.electronAPI?.deleteProvider(id)
    }
    await loadSettings()
    setSavedMsg('✅ 已删除')
    setTimeout(() => setSavedMsg(''), 2000)
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 32 }}>
      <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666', fontSize: 14, padding: 0, marginBottom: 24 }}>
        ← 返回
      </button>

      <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24 }}>设置</h1>

      {savedMsg && (
        <div style={{
          padding: '8px 16px', background: '#e8f5e9', borderRadius: 8,
          fontSize: 13, color: '#2e7d32', marginBottom: 16,
        }}>
          {savedMsg}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* 模型 Provider 管理 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 600 }}>模型 Provider</h3>
              <p style={{ color: '#666', fontSize: 13, marginTop: 4 }}>
                管理 API 接入地址和模型列表。支持任何 OpenAI 兼容的 API
              </p>
            </div>
            <button onClick={() => {
              setEditingProvider({ id: `custom-${Date.now()}`, name: '', baseUrl: '', apiKey: '', models: '' })
              setShowAddForm(true)
            }}
              style={{
                padding: '8px 16px', background: '#1a1a2e', color: 'white',
                border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}>
              + 添加
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {providers.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '14px 18px', borderRadius: 10, border: '1px solid #e8e8e8',
                background: '#fafafa',
              }}>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
                    {p.apiKey && <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '1px 8px', borderRadius: 10, fontSize: 11 }}>已配置</span>}
                  </div>
                  <div style={{ fontSize: 12, color: '#999' }}>
                    {p.baseUrl} · 模型: {p.models}
                  </div>
                </div>
                <button onClick={() => {
                  setEditingProvider({ ...p })
                  setShowAddForm(true)
                }}
                  style={{
                    padding: '6px 14px', background: 'transparent', color: '#1a73e8',
                    border: '1px solid #d0d0d0', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                  }}>
                  编辑
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* 编辑/添加 Provider 弹窗 */}
        {showAddForm && editingProvider && (
          <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.12)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>
              {editingProvider.id.startsWith('custom-') ? '新建 Provider' : `编辑 ${editingProvider.name}`}
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {editingProvider.id.startsWith('custom-') && (
                <>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>名称</label>
                    <input value={editingProvider.name}
                      onChange={e => setEditingProvider({ ...editingProvider, name: e.target.value })}
                      placeholder="例如: 硅基流动" style={inputStyle} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>Provider ID</label>
                    <input value={editingProvider.id}
                      onChange={e => setEditingProvider({ ...editingProvider, id: e.target.value })}
                      placeholder="例如: siliconflow" style={inputStyle} />
                  </div>
                </>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>API Base URL</label>
                <input value={editingProvider.baseUrl}
                  onChange={e => setEditingProvider({ ...editingProvider, baseUrl: e.target.value })}
                  placeholder="https://api.deepseek.com/v1" style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>API Key</label>
                <input type="password" value={editingProvider.apiKey}
                  onChange={e => setEditingProvider({ ...editingProvider, apiKey: e.target.value })}
                  placeholder="sk-xxxxxxxx" style={inputStyle} />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>模型列表（逗号分隔，第一个为默认）</label>
                <input value={editingProvider.models}
                  onChange={e => setEditingProvider({ ...editingProvider, models: e.target.value })}
                  placeholder="deepseek-chat,deepseek-reasoner" style={inputStyle} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button onClick={() => handleSaveProvider(editingProvider)}
                  style={{ padding: '10px 20px', background: '#1a1a2e', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600 }}>
                  保存
                </button>
                <button onClick={() => {
                  setShowAddForm(false)
                  setEditingProvider(null)
                }}
                  style={{ padding: '10px 20px', background: 'white', color: '#666', border: '1px solid #d0d0d0', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}>
                  取消
                </button>
                {editingProvider.apiKey && (
                  <button onClick={() => handleDeleteProvider(editingProvider.id)}
                    style={{ marginLeft: 'auto', padding: '8px 16px', background: '#ffebee', color: '#c62828', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}>
                    删除
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 默认配置 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>默认配置</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>默认浏览器</label>
              <select style={inputStyle}>
                <option value="chromium">Chromium</option>
                <option value="firefox">Firefox</option>
                <option value="webkit">WebKit</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 13, color: '#666', marginBottom: 4 }}>执行超时（秒）</label>
              <input type="number" value={defaultTimeout}
                onChange={e => setDefaultTimeout(Number(e.target.value))}
                style={inputStyle} />
            </div>
          </div>
        </div>

        {/* 关于 */}
        <div style={{ background: 'white', borderRadius: 12, padding: 24, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>关于</h3>
          <div style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
            <p><strong>AgentTest</strong> v1.0.0</p>
            <p>基于 LangGraph + Playwright 的 AI 驱动 Web 自动化测试工具</p>
            <p style={{ marginTop: 8 }}>支持 OpenAI 兼容协议，可接入 DeepSeek / OpenAI / 硅基流动 / 智谱 等</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #d0d0d0', borderRadius: 8,
  fontSize: 14, width: '100%', boxSizing: 'border-box',
}
