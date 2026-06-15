import { z } from 'zod'
import { tool } from '@langchain/core/tools'
import { Page } from 'playwright'

/**
 * 创建 Playwright 工具集
 * 每个工具绑定到一个已打开的浏览器页面
 */
export function createPlaywrightTools(page: Page) {
  return [
    tool(
      async ({ url }) => {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 })
        return JSON.stringify({
          success: true,
          url: page.url(),
          title: await page.title(),
        })
      },
      {
        name: 'navigate',
        description: '导航到指定 URL。输入完整的 URL（包含 https://）',
        schema: z.object({
          url: z.string().describe('完整的页面 URL，如 https://www.baidu.com'),
        }),
      }
    ),

    tool(
      async ({ selector }) => {
        await page.click(selector, { timeout: 10000 })
        return JSON.stringify({ success: true })
      },
      {
        name: 'click_selector',
        description: '通过 CSS 选择器点击页面元素',
        schema: z.object({
          selector: z.string().describe('CSS 选择器，如 #submit-btn, .search-button, button[type="submit"]'),
        }),
      }
    ),

    tool(
      async ({ text }) => {
        await page.getByText(text, { exact: false }).first().click({ timeout: 10000 })
        return JSON.stringify({ success: true, clickedText: text })
      },
      {
        name: 'click_text',
        description: '点击包含指定文本的页面元素',
        schema: z.object({
          text: z.string().describe('元素包含的文本内容，如 "登录", "搜索", "确定"'),
        }),
      }
    ),

    tool(
      async ({ selector, value }) => {
        await page.fill(selector, value, { timeout: 10000 })
        return JSON.stringify({ success: true })
      },
      {
        name: 'fill',
        description: '在输入框中填写内容（会先清空再输入）',
        schema: z.object({
          selector: z.string().describe('输入框的 CSS 选择器'),
          value: z.string().describe('要输入的内容'),
        }),
      }
    ),

    tool(
      async ({ text }) => {
        await page.getByPlaceholder(text).first().fill(text, { timeout: 10000 })
        return JSON.stringify({ success: true, text })
      },
      {
        name: 'fill_by_placeholder',
        description: '通过 placeholder 文本找到输入框并填写内容',
        schema: z.object({
          text: z.string().describe('placeholder 文本内容'),
        }),
      }
    ),

    tool(
      async ({ label, value }) => {
        const filled = await page.evaluate(({ label, value }: { label: string; value: string }) => {
          // 方法1: <label for="x">label</label> + <input id="x">
          const labels = Array.from(document.querySelectorAll('label'))
          for (const lbl of labels) {
            if (lbl.textContent?.includes(label) && lbl.htmlFor) {
              const el = document.getElementById(lbl.htmlFor) as HTMLInputElement
              if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); return true }
            }
          }
          // 方法2: <label>label <input></label>
          for (const lbl of labels) {
            if (lbl.textContent?.includes(label)) {
              const el = lbl.querySelector('input, textarea, select') as HTMLInputElement
              if (el) { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); return true }
            }
          }
          // 方法3: 文字附近找 input（div/span 后的输入框）
          for (const el of document.body.querySelectorAll('div, span, p, td, th')) {
            if (el.textContent?.includes(label)) {
              const input = (el.nextElementSibling?.querySelector('input, textarea') ||
                           el.closest('div, form, section, fieldset')?.querySelector('input, textarea:not([type=hidden])')) as HTMLInputElement
              if (input && input.offsetParent !== null) { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); return true }
            }
          }
          return false
        }, { label, value })
        return JSON.stringify({ success: filled, matched: filled })
      },
      {
        name: 'fill_by_label',
        description: '根据可见标签文字找到对应的输入框并填写。适合登录表单、注册表单等场景。你只需要说出输入框旁边的文字（如"用户名""密码""邮箱"）和要填的内容。如果这个工具有效，优先用这个而不是 fill',
        schema: z.object({
          label: z.string().describe('输入框旁边的可见标签文字，例如"用户名""密码""手机号"'),
          value: z.string().describe('要填写的内容'),
        }),
      }
    ),

    tool(
      async ({}) => {
        const url = page.url()
        const title = await page.title()
        const text = await page.evaluate(() => document.body.innerText)
        return JSON.stringify({
          success: true,
          url,
          title,
          visibleText: text.substring(0, 3000),
          textLength: text.length,
        })
      },
      {
        name: 'get_page_info',
        description: '获取当前页面的 URL、标题和可见文本（用于了解页面状态）',
        schema: z.object({}),
      }
    ),

    tool(
      async ({}) => {
        const screenshot = await page.screenshot({ type: 'jpeg', quality: 70 })
        return {
          success: true,
          screenshot: Buffer.from(screenshot).toString('base64'),
          size: screenshot.length,
        }
      },
      {
        name: 'screenshot',
        description: '截取当前页面的截图（JPEG 格式）',
        schema: z.object({}),
      }
    ),

    tool(
      async ({ selector }) => {
        const el = await page.$(selector)
        if (!el) {
          return JSON.stringify({ success: false, error: `未找到元素: ${selector}` })
        }
        const text = await el.textContent()
        return JSON.stringify({ success: true, text: text?.trim() || '' })
      },
      {
        name: 'get_text',
        description: '获取指定元素的文本内容',
        schema: z.object({
          selector: z.string().describe('元素的 CSS 选择器'),
        }),
      }
    ),

    tool(
      async ({ selector, attribute }) => {
        const el = await page.$(selector)
        if (!el) {
          return JSON.stringify({ success: false, error: `未找到元素: ${selector}` })
        }
        const value = await el.getAttribute(attribute)
        return JSON.stringify({ success: true, value })
      },
      {
        name: 'get_attribute',
        description: '获取指定元素的属性值',
        schema: z.object({
          selector: z.string().describe('元素的 CSS 选择器'),
          attribute: z.string().describe('属性名，如 href, src, class, value'),
        }),
      }
    ),

    tool(
      async ({ ms }) => {
        await page.waitForTimeout(ms)
        return JSON.stringify({ success: true, waited: ms })
      },
      {
        name: 'wait',
        description: '等待指定毫秒数。在页面加载或操作后需要等待时使用',
        schema: z.object({
          ms: z.number().describe('等待的毫秒数，如 2000 表示等待 2 秒'),
        }),
      }
    ),

    tool(
      async ({ selector }) => {
        await page.waitForSelector(selector, { timeout: 15000 })
        return JSON.stringify({ success: true, selector })
      },
      {
        name: 'wait_for_selector',
        description: '等待指定选择器的元素出现在页面上',
        schema: z.object({
          selector: z.string().describe('要等待的 CSS 选择器'),
        }),
      }
    ),

    tool(
      async ({ direction, pixels }) => {
        const dy = direction === 'down' ? pixels : -pixels
        await page.evaluate((y: number) => window.scrollBy(0, y), dy)
        return JSON.stringify({ success: true, direction, pixels })
      },
      {
        name: 'scroll',
        description: '滚动页面。direction 为 "down" 或 "up"，pixels 为像素数',
        schema: z.object({
          direction: z.enum(['down', 'up']).describe('滚动方向：down 向下，up 向上'),
          pixels: z.number().describe('滚动的像素数，如 500'),
        }),
      }
    ),
  ]
}
