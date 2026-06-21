import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { Page } from 'playwright'

/**
 * 创建 Playwright 工具集 — 覆盖 17 种 Web 组件操作
 */
export function createPlaywrightTools(page: Page) {
  // ====== 共享辅助函数 ======
  const waitStable = () => page.waitForLoadState('networkidle').catch(() => {}).then(() => page.waitForTimeout(300))

  // 通过 label 文字找关联的输入控件（input/select/textarea）
  const findInputByLabel = (label: string): Promise<boolean> =>
    page.evaluate((targetLabel: string) => {
      const labels = Array.from(document.querySelectorAll('label'))
      for (const lbl of labels) {
        if (lbl.textContent?.includes(targetLabel)) {
          const forId = lbl.getAttribute('for')
          if (forId) {
            const el = document.getElementById(forId) as HTMLElement
            if (el) { el.focus(); return true }
          }
          const child = lbl.querySelector('input, textarea, select, [contenteditable]') as HTMLElement
          if (child) { child.focus(); return true }
        }
      }
      // label 文字所在容器附近找
      for (const el of document.body.querySelectorAll('div, span, td, th, .form-item, .ant-form-item, .el-form-item')) {
        const text = (el as HTMLElement).innerText?.split('\n')[0] || ''
        if (text.includes(targetLabel) && text.length < 60) {
          const input = el.querySelector('input, textarea, select, [contenteditable]') as HTMLElement
          if (input && (input as any).offsetParent !== null) { input.focus(); return true }
        }
      }
      return false
    }, label)

  return [
    // ========== 导航 ==========
    tool(
      async ({ url }) => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        return JSON.stringify({ success: true, url: page.url(), title: await page.title() })
      },
      { name: 'navigate', description: '导航到指定 URL', schema: z.object({ url: z.string().describe('完整 URL') }) }
    ),

    tool(
      async ({}) => { await page.goBack(); return JSON.stringify({ success: true }) },
      { name: 'navigate_back', description: '浏览器后退', schema: z.object({}) }
    ),

    tool(
      async ({}) => { await page.reload(); return JSON.stringify({ success: true }) },
      { name: 'refresh', description: '刷新当前页面', schema: z.object({}) }
    ),

    // ========== 点击 ==========
    tool(
      async ({ text }) => {
        const result = await page.evaluate((targetText: string) => {
          const selectors = ['button', '[role="button"]', 'a', '[onclick]', '.btn', '[class*="btn"]',
            'input[type="submit"]', 'input[type="button"]', '[tabindex]', 'label']
          for (const sel of selectors) {
            for (const el of Array.from(document.querySelectorAll(sel))) {
              const t = (el.textContent || '').trim()
              if (t === targetText || (t.length < 40 && t.includes(targetText))) {
                ;(el as HTMLElement).click(); return { success: true, tag: el.tagName, text: targetText }
              }
            }
          }
          // 文本节点向上找可点击父元素
          for (const node of Array.from(document.querySelectorAll('*'))) {
            if (node.childNodes.length === 1 && node.childNodes[0].nodeType === 3 && node.textContent?.trim() === targetText) {
              let p: Element | null = node as Element
              while (p && p.tagName !== 'BODY') {
                if (['BUTTON','A','LABEL','LI','TD','DIV'].includes(p.tagName) && p.getAttribute('onclick') !== null) break
                p = p.parentElement
              }
              if (p) { (p as HTMLElement).click(); return { success: true, tag: p.tagName, text: targetText } }
            }
          }
          return { success: false }
        }, text)
        if (!result.success)
          return JSON.stringify({ success: false, error: `未找到"${text}"按钮`, hint: '先用 get_page_info 查看页面文字' })
        await waitStable()
        return JSON.stringify(result)
      },
      { name: 'click_text', description: '点击包含指定文字的按钮/链接。如 click_text({text:"保存"})', schema: z.object({ text: z.string().describe('按钮上显示的文字') }) }
    ),

    tool(
      async ({ selector }) => {
        await page.locator(selector).first().click({ timeout: 10000 })
        await waitStable()
        return JSON.stringify({ success: true })
      },
      { name: 'click_selector', description: 'CSS 选择器精确点击。仅当 click_text 不好用或页面结构特殊时使用', schema: z.object({ selector: z.string().describe('CSS 选择器') }) }
    ),

    // ========== 输入 ==========
    tool(
      async ({ label, value }) => {
        const focused = await findInputByLabel(label)
        if (focused) {
          await page.keyboard.press('Control+a')
          await page.keyboard.type(value, { delay: 30 })
          await waitStable()
          return JSON.stringify({ success: true, method: 'label_found' })
        }
        return JSON.stringify({ success: false, error: `未找到"${label}"对应的输入框`, hint: '先用 get_page_info 查看页面上有哪些字段标签' })
      },
      { name: 'fill_by_label', description: '★★★ 填表单首选！通过标签文字找输入框并填写。如 fill_by_label({label:"用户名", value:"admin"})', schema: z.object({ label: z.string().describe('表单字段标签，如"用户名""价格""分类"'), value: z.string().describe('要填的内容') }) }
    ),

    tool(
      async ({ text, value }) => {
        // 先在页面上搜索所有可见 input，做模糊 placeholder 匹配
        const matched = await page.evaluate(({ search, val }: { search: string; val: string }) => {
          const inputs = Array.from(document.querySelectorAll('input:not([type=hidden]), textarea'))
          for (const input of inputs) {
            const ph = ((input as HTMLInputElement).placeholder || '').trim()
            // 精确匹配 → 包含匹配 → 逐字匹配
            if (ph === search || ph.includes(search) || search.includes(ph)) {
              ;(input as HTMLInputElement).value = val
              input.dispatchEvent(new Event('input', { bubbles: true }))
              input.dispatchEvent(new Event('change', { bubbles: true }))
              return { success: true, placeholder: ph, method: 'fuzzy' }
            }
          }
          return { success: false, searched: search }
        }, { search: text, val: value })

        if (matched.success) return JSON.stringify(matched)

        // 回退：Playwright 原生（精确匹配）
        try {
          await page.getByPlaceholder(text).first().fill(value, { timeout: 5000 })
          return JSON.stringify({ success: true, method: 'exact' })
        } catch {
          return JSON.stringify({ success: false, error: `未找到 placeholder 为"${text}"的输入框`, hint: '用 fill_by_label 代替，或先 get_page_info 查看页面' })
        }
      },
      { name: 'fill_by_placeholder', description: '通过 placeholder 文字（模糊匹配）找输入框填写。优先用 fill_by_label', schema: z.object({ text: z.string().describe('placeholder 大概文字'), value: z.string().describe('值') }) }
    ),

    tool(
      async ({ selector, value }) => {
        await page.fill(selector, value, { timeout: 10000 })
        return JSON.stringify({ success: true })
      },
      { name: 'fill', description: '通过 CSS 选择器填写（最后手段，未知 CSS 时不要用）', schema: z.object({ selector: z.string(), value: z.string() }) }
    ),

    // ========== 下拉选择器 ==========
    tool(
      async ({ label, option }) => {
        // 先尝试原生 <select> 的 option
        const native = await page.evaluate(({ label, option }: { label: string; option: string }) => {
          // 查找关联 label 的 select
          const labels = Array.from(document.querySelectorAll('label'))
          for (const lbl of labels) {
            if (lbl.textContent?.includes(label)) {
              const forId = lbl.getAttribute('for')
              if (forId) {
                const sel = document.getElementById(forId) as HTMLSelectElement
                if (sel?.tagName === 'SELECT') {
                  const opt = Array.from(sel.options).find(o => o.text.includes(option))
                  if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); return { success: true, native: true } }
                }
              }
              const child = lbl.querySelector('select') as HTMLSelectElement
              if (child) {
                const opt = Array.from(child.options).find(o => o.text.includes(option))
                if (opt) { child.value = opt.value; child.dispatchEvent(new Event('change', { bubbles: true })); return { success: true, native: true } }
              }
            }
          }
          return { success: false }
        }, { label, option })
        if (native.success)
          return JSON.stringify({ success: true, method: 'native_select' })

        // 自定义下拉：先点 label 附近的触发器，再选 option
        const triggered = await page.evaluate((label: string) => {
          const triggers = Array.from(document.querySelectorAll('[class*="select"], [class*="dropdown"], [class*="picker"], [role="combobox"], .ant-select-selector, .el-select'))
          for (const t of triggers) {
            const parent = t.closest('.ant-form-item, .el-form-item, .form-item, div, td, fieldset')
            if (parent?.textContent?.includes(label)) {
              (t as HTMLElement).click()
              return true
            }
          }
          return false
        }, label)
        if (triggered) {
          await page.waitForTimeout(600)
          // 在下拉菜单中找选项
          const clicked = await clickInDropdown(page, option)
          if (clicked) {
            await page.waitForTimeout(300)
            return JSON.stringify({ success: true, method: 'custom_dropdown' })
          }
        }
        return JSON.stringify({ success: false, error: `无法选择"${label}" → "${option}"`, hint: '先用 get_page_info 观察下拉框结构' })
      },
      { name: 'select_option', description: '★★★ 下拉选择器！选择下拉框中的某一项。如 select_option({label:"分类", option:"电子"})', schema: z.object({ label: z.string().describe('下拉框的标签文字'), option: z.string().describe('要选择的选项文字') }) }
    ),

    // ========== 复选框 / 开关 ==========
    tool(
      async ({ label }) => {
        const result = await page.evaluate(async (targetLabel: string) => {
          const labels = Array.from(document.querySelectorAll('label'))
          for (const lbl of labels) {
            if (lbl.textContent?.includes(targetLabel)) {
              // 找关联 checkbox
              const forId = lbl.getAttribute('for')
              let cb = forId ? document.getElementById(forId) : null
              if (!cb || cb.tagName !== 'INPUT') cb = lbl.querySelector('input[type="checkbox"]')
              if (!cb) {
                const row = lbl.closest('tr, .form-item, .ant-form-item, .el-form-item, div')
                cb = row?.querySelector('input[type="checkbox"]') || null
              }
              if (cb && !(cb as HTMLInputElement).checked) {
                ;(cb as HTMLElement).click()
                return { success: true }
              }
              // 试试 switch 组件
              const sw = lbl.closest('tr, .form-item, .ant-form-item, div')?.querySelector('[class*="switch"], [role="switch"]')
              if (sw) { (sw as HTMLElement).click(); return { success: true, asSwitch: true } }
            }
          }
          return { success: false }
        }, label)
        return JSON.stringify(result.success ? result : { success: false, error: `未找到"${label}"对应的复选框` })
      },
      { name: 'check', description: '勾选复选框。如 check({label:"新品"})', schema: z.object({ label: z.string().describe('复选框标签') }) }
    ),

    tool(
      async ({ label }) => {
        const result = await page.evaluate((targetLabel: string) => {
          const labels = Array.from(document.querySelectorAll('label'))
          for (const lbl of labels) {
            if (lbl.textContent?.includes(targetLabel)) {
              const forId = lbl.getAttribute('for')
              let cb = forId ? document.getElementById(forId) : null
              if (!cb || cb.tagName !== 'INPUT') cb = lbl.querySelector('input[type="checkbox"]')
              if (cb && (cb as HTMLInputElement).checked) {
                ;(cb as HTMLElement).click()
                return { success: true }
              }
            }
          }
          return { success: false }
        }, label)
        return JSON.stringify(result.success ? result : { success: false, error: `未找到已勾选的"${label}"复选框` })
      },
      { name: 'uncheck', description: '取消勾选复选框。如 uncheck({label:"新品"})', schema: z.object({ label: z.string().describe('复选框标签') }) }
    ),

    // ========== 悬浮 ==========
    tool(
      async ({ text }) => {
        await page.getByText(text).first().hover({ timeout: 5000 })
        await page.waitForTimeout(500)
        return JSON.stringify({ success: true })
      },
      { name: 'hover', description: '鼠标悬浮在文字上方，用于触发 tooltip、下拉菜单', schema: z.object({ text: z.string().describe('要悬浮的文字') }) }
    ),

    // ========== 键盘 ==========
    tool(
      async ({ key }) => {
        await page.keyboard.press(key)
        return JSON.stringify({ success: true, key })
      },
      { name: 'press_key', description: '按键盘按键。用于 Enter 提交、Escape 关闭弹窗、Tab 切换焦点', schema: z.object({ key: z.string().describe('按键名，如 Enter, Escape, Tab, ArrowDown') }) }
    ),

    // ========== 文件上传 ==========
    tool(
      async ({ label, filePath }) => {
        const focused = await findInputByLabel(label)
        if (focused) {
          // 尝试设置文件
          const input = page.locator('input[type="file"]').first()
          await input.setInputFiles(filePath)
          return JSON.stringify({ success: true })
        }
        return JSON.stringify({ success: false, hint: '未找到文件上传控件' })
      },
      { name: 'upload_file', description: '上传文件。如 upload_file({label:"头像", filePath:"C:/photo.jpg"})', schema: z.object({ label: z.string().describe('文件上传字段标签'), filePath: z.string().describe('本地文件绝对路径') }) }
    ),

    // ========== 弹窗处理 ==========
    tool(
      async ({ action }) => {
        page.once('dialog', async (dialog) => {
          if (action === 'accept') await dialog.accept()
          else await dialog.dismiss()
        })
        return JSON.stringify({ success: true, action })
      },
      { name: 'handle_dialog', description: '处理浏览器原生弹窗（alert/confirm/prompt）。action: accept 或 dismiss', schema: z.object({ action: z.enum(['accept', 'dismiss']).describe('accept=确认, dismiss=取消') }) }
    ),

    // ========== 等待 ==========
    tool(
      async ({ text }) => {
        try {
          await page.getByText(text).first().waitFor({ state: 'visible', timeout: 10000 })
          return JSON.stringify({ success: true, found: text })
        } catch {
          return JSON.stringify({ success: false, error: `超时未找到:"${text}"` })
        }
      },
      { name: 'wait_for_text', description: '等待页面上出现指定文字（如 Toast 消息"保存成功""操作失败"）', schema: z.object({ text: z.string().describe('等待出现的文字') }) }
    ),

    tool(
      async ({ ms }) => { await page.waitForTimeout(ms); return JSON.stringify({ success: true, waited: ms }) },
      { name: 'wait', description: '等待指定毫秒数', schema: z.object({ ms: z.number().describe('毫秒数') }) }
    ),

    // ========== 信息获取 ==========
    tool(
      async ({}) => {
        const url = page.url()
        const title = await page.title()
        // 提取更结构化的页面信息
        const info = await page.evaluate(() => {
          const inputs = Array.from(document.querySelectorAll('input, textarea, select')).map(el => ({
            tag: el.tagName,
            type: (el as HTMLInputElement).type || '',
            name: (el as HTMLInputElement).name || '',
            placeholder: (el as HTMLInputElement).placeholder || '',
            id: el.id,
            visible: (el as HTMLElement).offsetParent !== null,
          }))
          const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"], a.btn')).map(el => ({
            text: (el.textContent || (el as HTMLInputElement).value || '').trim().substring(0, 30),
            tag: el.tagName,
          })).filter(b => b.text)
          const selects = Array.from(document.querySelectorAll('select, [role="listbox"], [class*="select"]:not([class*="option"])')).map(el => ({
            text: (el.textContent || '').trim().substring(0, 60),
            tag: el.tagName,
          })).filter(s => s.text)
          return { inputs: inputs.slice(0, 20), buttons: buttons.slice(0, 20), selects: selects.slice(0, 10) }
        })
        return JSON.stringify({ success: true, url, title, structure: info })
      },
      { name: 'get_page_info', description: '获取当前页面结构化信息：所有输入框、按钮、下拉框列表。操作前先调用这个了解页面', schema: z.object({}) }
    ),

    // ========== 截图 ==========
    tool(
      async ({}) => {
        const ss = await page.screenshot({ type: 'jpeg', quality: 70 })
        return JSON.stringify({ success: true, screenshot: Buffer.from(ss).toString('base64') })
      },
      { name: 'screenshot', description: '截取当前页面截图', schema: z.object({}) }
    ),

    // ========== 滚动 ==========
    tool(
      async ({ direction, pixels }) => {
        const dy = direction === 'down' ? pixels : -pixels
        await page.evaluate((y: number) => window.scrollBy(0, y), dy)
        return JSON.stringify({ success: true, direction, pixels })
      },
      { name: 'scroll', description: '滚动页面', schema: z.object({ direction: z.enum(['down', 'up']), pixels: z.number() }) }
    ),
  ]
}

// ====== 辅助函数 ======

async function clickInDropdown(page: Page, targetText: string): Promise<boolean> {
  try {
    // 在各类下拉菜单中搜索选项
    const selectors = [
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) li',
      '.el-select-dropdown:not(.is-hidden) li',
      '[class*="dropdown"]:not([style*="display: none"]) li',
      '[class*="select-dropdown"]:not([style*="display: none"]) li',
      '[role="listbox"] [role="option"]',
      '[class*="option"]', '.dropdown-item', '.select-item',
    ]
    for (const sel of selectors) {
      const items = page.locator(sel)
      const count = await items.count()
      for (let i = 0; i < count; i++) {
        const text = await items.nth(i).textContent()
        if (text?.trim() === targetText) {
          await items.nth(i).click()
          return true
        }
      }
    }
    // 回退：在弹出层中按文字点击
    const popup = page.locator('[class*="dropdown"]:visible, [class*="select-dropdown"]:visible, [class*="popper"]:visible, [role="listbox"]:visible').first()
    if (await popup.count() > 0) {
      await popup.getByText(targetText, { exact: true }).first().click({ timeout: 3000 })
      return true
    }
    return false
  } catch {
    return false
  }
}
