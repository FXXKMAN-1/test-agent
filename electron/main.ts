import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import { AgentExecutor, type AgentEvent } from './services/agent/index.js'
import {
  isPlaywrightBrowserInstalled,
  installPlaywrightBrowser,
} from './services/browser-manager.js'
import type { TestCaseDefinition } from './services/parser.js'
import { BatchRunner, type BatchResult } from './services/batch-runner.js'

let mainWindow: BrowserWindow | null = null
let currentAgent: AgentExecutor | null = null

// ====== 工具函数 ======

function getConfigPath() {
  return path.join(app.getPath('userData'), 'config.json')
}

function readConfig(): Record<string, any> {
  try {
    return JSON.parse(fs.readFileSync(getConfigPath(), 'utf-8'))
  } catch {
    return {}
  }
}

function writeConfig(config: Record<string, any>) {
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2))
}

function isDev(): boolean {
  return !app.isPackaged
}

// ====== 窗口管理 ======

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'AgentTest',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  if (isDev()) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// ====== Playwright 浏览器安装流程 ======

function getProgressHtmlPath(): string {
  if (isDev()) {
    return path.join(process.cwd(), 'resources', 'install-progress.html')
  }
  return path.join(process.resourcesPath, 'resources', 'install-progress.html')
}

async function ensurePlaywrightBrowser(): Promise<void> {
  if (isPlaywrightBrowserInstalled()) {
    return
  }

  const progressWin = new BrowserWindow({
    width: 520,
    height: 460,
    resizable: false,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1a1a2e',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  progressWin.loadFile(getProgressHtmlPath())
  progressWin.center()

  const install = installPlaywrightBrowser()

  install.onProgress((msg: string) => {
    if (progressWin && !progressWin.isDestroyed()) {
      progressWin.webContents.send('install:progress', msg)
    }
  })

  try {
    await install.promise
    if (progressWin && !progressWin.isDestroyed()) {
      progressWin.webContents.send('install:done')
    }
    await new Promise(r => setTimeout(r, 1500))
  } catch (err: any) {
    if (progressWin && !progressWin.isDestroyed()) {
      progressWin.webContents.send('install:error', err.message)
    }
    await new Promise(r => setTimeout(r, 5000))
  } finally {
    if (progressWin && !progressWin.isDestroyed()) {
      progressWin.close()
    }
  }
}

// ====== 文档导入 ======

ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: '选择测试用例文档',
    filters: [
      { name: '测试文档', extensions: ['xlsx', 'xls', 'csv', 'md', 'txt'] },
      { name: '所有文件', extensions: ['*'] },
    ],
    properties: ['openFile'],
  })
  if (result.canceled) return null
  return result.filePaths[0]
})

ipcMain.handle('parser:parse', async (_event, filePath: string) => {
  const { parseTestDocument } = await import('./services/parser.js')
  return parseTestDocument(filePath)
})

// ====== IPC 处理器 ======

ipcMain.handle('settings:save-api-key', async (_event, apiKey: string) => {
  const config = readConfig()
  config.deepseekApiKey = apiKey
  writeConfig(config)
  return { success: true }
})

// 保存完整设置（支持多 provider、自定义 baseURL、自定义模型）
ipcMain.handle('settings:save', async (_event, settings: Record<string, any>) => {
  const config = readConfig()
  Object.assign(config, settings)
  writeConfig(config)
  return { success: true }
})

ipcMain.handle('settings:save-provider', async (_event, provider: Record<string, any>) => {
  const config = readConfig()
  const providers = config.providers || []
  const idx = providers.findIndex((p: any) => p.id === provider.id)
  if (idx >= 0) {
    providers[idx] = provider
  } else {
    providers.push(provider)
  }
  config.providers = providers
  writeConfig(config)
  return { success: true, providers }
})

ipcMain.handle('settings:delete-provider', async (_event, providerId: string) => {
  const config = readConfig()
  config.providers = (config.providers || []).filter((p: any) => p.id !== providerId)
  writeConfig(config)
  return { success: true, providers: config.providers }
})

ipcMain.handle('settings:get', async () => {
  return readConfig()
})

// 解析 API Key 和 baseURL
function resolveApiConfig(options: any, config: Record<string, any>) {
  let apiKey: string = ''
  let baseURL: string = 'https://api.deepseek.com/v1'

  if (options?.providerId && config.providers) {
    const provider = config.providers.find((p: any) => p.id === options.providerId)
    if (provider) {
      apiKey = provider.apiKey
      baseURL = provider.baseUrl
    }
  } else {
    apiKey = config.deepseekApiKey || ''
  }
  return { apiKey, baseURL }
}

function emitToRenderer(event: AgentEvent) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agent:event', event)
  }
}

// 单次执行
ipcMain.handle('agent:run-single', async (_event, args: {
  goal: string
  options: any
}) => {
  const config = readConfig()
  const { apiKey, baseURL } = resolveApiConfig(args.options, config)
  if (!apiKey) return { error: '请先在设置中配置 API Key' }

  if (currentAgent) { currentAgent.cancel() }

  const agent = new AgentExecutor()
  currentAgent = agent

  const cleanup = agent.onEvent(emitToRenderer)
  try {
    const result = await agent.run(args.goal, apiKey, { ...args.options, baseURL })
    return { success: true, result }
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) }
  } finally {
    cleanup()
    if (currentAgent === agent) currentAgent = null
  }
})

// 批量执行
let currentBatch: BatchRunner | null = null

ipcMain.handle('agent:run-batch', async (_event, args: {
  cases: TestCaseDefinition[]
  options: any
}) => {
  const config = readConfig()
  const { apiKey, baseURL } = resolveApiConfig(args.options, config)
  if (!apiKey) return { error: '请先在设置中配置 API Key' }

  if (currentAgent) { currentAgent.cancel() }
  if (currentBatch) { currentBatch.cancel() }

  const runner = new BatchRunner(args.cases, apiKey, { ...args.options, baseURL }, emitToRenderer)
  currentBatch = runner

  try {
    const result = await runner.run()
    return { success: true, result }
  } catch (error: any) {
    return { success: false, error: error?.message || String(error) }
  } finally {
    if (currentBatch === runner) currentBatch = null
  }
})

ipcMain.handle('agent:cancel', async () => {
  if (currentAgent) currentAgent.cancel()
  if (currentBatch) currentBatch.cancel()
  return { success: true }
})

// ====== 应用生命周期 ======

app.whenReady().then(async () => {
  await ensurePlaywrightBrowser()
  createMainWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createMainWindow()
  }
})

app.on('before-quit', () => {
  if (currentAgent) currentAgent.cancel()
  if (currentBatch) currentBatch.cancel()
})
