import { spawn } from 'child_process'
import { app } from 'electron'
import path from 'path'

/**
 * 检查 Playwright Chromium 浏览器是否已安装
 * 需要同时检查 executablePath 返回的路径真实存在
 */
export function isPlaywrightBrowserInstalled(): boolean {
  try {
    const chromePath = require('playwright').chromium.executablePath()
    return require('fs').existsSync(chromePath)
  } catch {
    return false
  }
}

/**
 * 获取 Playwright 浏览器安装路径（即使未安装也返回预期路径）
 */
export function getPlaywrightBrowsersPath(): string {
  // Playwright 默认浏览器安装位置
  const platform = process.platform
  const home = process.env.USERPROFILE || process.env.HOME || ''
  if (platform === 'win32') {
    return path.join(process.env.USERPROFILE || home, 'AppData', 'Local', 'ms-playwright')
  }
  return path.join(home, '.cache', 'ms-playwright')
}

/**
 * 下载并安装 Playwright Chromium 浏览器
 * 返回一个 { onProgress } 对象用于监听进度
 * 内置自动重试机制应对网络波动
 */
export function installPlaywrightBrowser(maxRetries = 3): {
  promise: Promise<void>
  onProgress: (cb: (msg: string) => void) => void
} {
  let progressCallbacks: Array<(msg: string) => void> = []

  const runInstall = (attempt: number): Promise<void> => {
    return new Promise((resolve, reject) => {
      const isWin = process.platform === 'win32'
      const cmd = isWin ? 'npx.cmd' : 'npx'
      const args = ['playwright', 'install', 'chromium']

      progressCallbacks.forEach(cb => cb(
        attempt > 1
          ? `🔄 第 ${attempt}/${maxRetries} 次尝试下载...`
          : `📥 正在下载 Chromium 浏览器 (约 180MB)...`
      ))

      const proc = spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        env: { ...process.env },
        timeout: 600000, // 10 分钟超时
      })

      const onData = (data: Buffer) => {
        const msg = data.toString().trim()
        if (msg) {
          progressCallbacks.forEach(cb => cb(msg))
        }
      }

      proc.stdout?.on('data', onData)
      proc.stderr?.on('data', onData)

      proc.on('close', (code) => {
        // 验证浏览器是否真的可用
        try {
          const chromePath = require('playwright').chromium.executablePath()
          if (require('fs').existsSync(chromePath)) {
            progressCallbacks.forEach(cb => cb('✅ 浏览器下载完成'))
            resolve()
            return
          }
        } catch { /* 继续检查错误 */ }

        if (code === 0) {
          // 退出码 0 但文件不存在 — 可能是权限问题
          const err = '浏览器文件未找到，可能是安装目录权限不足'
          progressCallbacks.forEach(cb => cb(`⚠️ ${err}`))
          reject(new Error(err))
        } else if (attempt < maxRetries) {
          // 重试
          progressCallbacks.forEach(cb => cb(`⚠️ 下载失败，${maxRetries - attempt} 次重试机会`))
          setTimeout(() => {
            runInstall(attempt + 1).then(resolve).catch(reject)
          }, 2000)
        } else {
          const err = `Playwright 浏览器安装失败，已达到最大重试次数 (exit code: ${code})`
          progressCallbacks.forEach(cb => cb(`❌ ${err}`))
          reject(new Error(err))
        }
      })

      proc.on('error', (err) => {
        if (attempt < maxRetries) {
          progressCallbacks.forEach(cb => cb(`⚠️ 网络错误: ${err.message}，正在重试...`))
          setTimeout(() => {
            runInstall(attempt + 1).then(resolve).catch(reject)
          }, 3000)
        } else {
          progressCallbacks.forEach(cb => cb(`❌ ${err.message}`))
          reject(err)
        }
      })
    })
  }

  return {
    promise: runInstall(1),
    onProgress: (cb) => {
      progressCallbacks.push(cb)
    },
  }
}

/**
 * 获取友好的下载状态文本
 */
export function formatInstallProgress(line: string): string {
  // 提取下载百分比信息
  const progressMatch = line.match(/(\d+\.\d+\s*[kMG]?B)\s*\/\s*(\d+\.\d+\s*[kMG]?B)/i)
  const percentMatch = line.match(/(\d+)%/)

  if (line.includes('Downloading')) {
    const name = line.replace(/.*(Chromium|Firefox|WebKit).*/, '$1') || 'Chromium'
    return `📥 正在下载 ${name} 浏览器... ${percentMatch?.[1] || ''}`
  }
  if (line.includes('extract') || line.includes('Extract')) {
    return '📦 正在解压...'
  }
  if (line.includes('Host system')) {
    return '🔍 检查系统依赖...'
  }
  if (line.includes('SUCCESS') || line.includes('success')) {
    return '✅ 安装成功'
  }
  if (percentMatch) {
    return `📥 下载中... ${percentMatch[1]}%`
  }

  // 截取有用信息
  const cleaned = line.replace(/^\[\d+m/, '').trim()
  return cleaned || ''
}
