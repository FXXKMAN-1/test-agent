import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  // 文件
  openFile: () => ipcRenderer.invoke('dialog:open-file'),
  parseDocument: (filePath: string) => ipcRenderer.invoke('parser:parse', filePath),

  // 设置
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: any) => ipcRenderer.invoke('settings:save', settings),
  saveProvider: (provider: any) => ipcRenderer.invoke('settings:save-provider', provider),
  deleteProvider: (providerId: string) => ipcRenderer.invoke('settings:delete-provider', providerId),

  // Agent 执行
  runTest: (args: any) => ipcRenderer.invoke('agent:run-single', args),
  runBatch: (args: any) => ipcRenderer.invoke('agent:run-batch', args),
  cancelTest: () => ipcRenderer.invoke('agent:cancel'),

  // Agent 事件
  onAgentEvent: (callback: (event: any) => void) => {
    const handler = (_event: Electron.IpcRendererEvent, data: any) => callback(data)
    ipcRenderer.on('agent:event', handler)
    return () => ipcRenderer.removeListener('agent:event', handler)
  },
})
