import * as XLSX from 'xlsx'
import fs from 'fs'
import path from 'path'

/**
 * 解析出的测试用例定义
 */
export interface TestCaseDefinition {
  id: string
  name: string
  goal: string
  expectedResult: string
  priority: 'high' | 'medium' | 'low'
  enabled: boolean
}

/**
 * 文档解析结果
 */
export interface ParseResult {
  suiteName: string
  sourceFile: string
  cases: TestCaseDefinition[]
  errors: string[]
}

/**
 * 解析 Excel (.xlsx/.xls) 测试用例文档
 * 支持列名: 用例编号/用例名称/测试步骤/预期结果/优先级
 */
function parseExcel(filePath: string): ParseResult {
  const errors: string[] = []
  const cases: TestCaseDefinition[] = []
  let workbook: XLSX.WorkBook
  try { workbook = XLSX.readFile(filePath) }
  catch (err: any) {
    return { suiteName: 'unknown', sourceFile: filePath, cases: [], errors: [`无法读取文件: ${err?.message || err}`] }
  }
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  // 转为二维数组
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })

  if (rows.length < 2) {
    return { suiteName: sheetName, sourceFile: filePath, cases: [], errors: ['表格为空，至少需要表头+一行数据'] }
  }

  // 解析表头，找出列映射
  const header = rows[0].map((h: any) => String(h || '').trim())
  const colMap: Record<string, number> = {}
  for (let i = 0; i < header.length; i++) {
    const h = header[i]
    if (/用例编号|编号|ID|id/i.test(h)) colMap.id = i
    else if (/用例名称|名称|name/i.test(h)) colMap.name = i
    else if (/测试步骤|测试目标|步骤|goal|step/i.test(h)) colMap.goal = i
    else if (/预期结果|预期|expect/i.test(h)) colMap.expectedResult = i
    else if (/优先级|priority|优/i.test(h)) colMap.priority = i
  }

  // 至少要有测试步骤列
  if (colMap.goal === undefined) {
    // 尝试把第一列当编号、第二列当名称、第三列当步骤
    if (rows[0].length >= 3) {
      colMap.id = 0
      colMap.name = 1
      colMap.goal = 2
      if (rows[0].length >= 4) colMap.expectedResult = 3
    } else {
      return { suiteName: sheetName, sourceFile: filePath, cases: [], errors: ['找不到"测试步骤"列'] }
    }
  }

  // 解析每一行
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c: any) => !c)) continue // 跳过空行

    const goal = String(row[colMap.goal] || '').trim()
    if (!goal) continue // 没有测试步骤的行跳过

    const id = colMap.id !== undefined ? String(row[colMap.id] || `TC${r}`).trim() : `TC${r}`
    const name = colMap.name !== undefined ? String(row[colMap.name] || '').trim() : ''
    const expectedResult = colMap.expectedResult !== undefined ? String(row[colMap.expectedResult] || '').trim() : ''
    const priorityRaw = colMap.priority !== undefined ? String(row[colMap.priority] || '').trim().toLowerCase() : 'medium'

    let priority: 'high' | 'medium' | 'low' = 'medium'
    if (priorityRaw.includes('高') || priorityRaw.includes('high') || priorityRaw === '1') priority = 'high'
    else if (priorityRaw.includes('低') || priorityRaw.includes('low') || priorityRaw === '3') priority = 'low'

    cases.push({
      id,
      name: name || goal.substring(0, 40),
      goal,
      expectedResult,
      priority,
      enabled: true,
    })
  }

  return { suiteName: sheetName, sourceFile: filePath, cases, errors }
}

/**
 * 解析 Markdown 测试用例文档
 * 格式:
 *   ## TC001 用例名称
 *   测试步骤内容第一行
 *   测试步骤内容第二行
 *   - 预期: 预期结果描述
 *   - 优先级: 高
 */
function parseMarkdown(filePath: string): ParseResult {
  const errors: string[] = []
  const cases: TestCaseDefinition[] = []
  let content: string
  try { content = fs.readFileSync(filePath, 'utf-8') }
  catch (err: any) {
    return { suiteName: 'unknown', sourceFile: filePath, cases: [], errors: [`无法读取文件: ${err?.message || err}`] }
  }

  // 按 ## 或 ### 标题分割 — 每个标题代表一个测试用例
  const sections = content.split(/^##\s+/m).slice(1) // 跳过第一个空段

  for (const section of sections) {
    const lines = section.trim().split('\n')
    const titleLine = lines[0]?.trim() || ''

    // 解析标题: "TC001 登录验证" 或 "登录验证"
    const titleMatch = titleLine.match(/^(TC\d*|用例\d*)?\s*(.+)/i)
    const id = titleMatch?.[1] || `TC${cases.length + 1}`
    const name = titleMatch?.[2] || titleLine

    // 解析正文（去掉标题行和元数据行）
    const bodyLines = lines.slice(1).map(l => l.trim()).filter(l => {
      if (!l) return false
      // 过滤所有格式的元数据行
      if (/^[-*]\s*(优先级|预期)/.test(l)) return false
      return true
    })

    let expectedResult = ''
    let priority: 'high' | 'medium' | 'low' = 'medium'

    for (const l of lines.slice(1)) {
      const trimmed = l.trim()
      if (trimmed.startsWith('- 预期') || trimmed.startsWith('* 预期')) {
        expectedResult = trimmed.replace(/^[-*]\s*预期[:：]?\s*/, '').trim()
      }
      if (trimmed.startsWith('- 优先级') || trimmed.startsWith('* 优先级')) {
        const p = trimmed.replace(/^[-*]\s*优先级[:：]?\s*/, '').trim()
        if (p.includes('高') || p.includes('high')) priority = 'high'
        else if (p.includes('低') || p.includes('low')) priority = 'low'
      }
    }

    const goal = bodyLines.join('。\n').trim()
    if (!goal) continue

    cases.push({ id, name, goal, expectedResult, priority, enabled: true })
  }

  if (cases.length === 0) {
    errors.push('未找到测试用例，请使用 ## 标题格式定义每个用例')
  }

  return { suiteName: path.basename(filePath, path.extname(filePath)), sourceFile: filePath, cases, errors }
}

/**
 * 解析 CSV 测试用例文档
 * 与 Excel 同样的列规则
 */
function parseCSV(filePath: string): ParseResult {
  let content: string
  try { content = fs.readFileSync(filePath, 'utf-8') }
  catch (err: any) {
    return { suiteName: 'unknown', sourceFile: filePath, cases: [], errors: [`无法读取文件: ${err?.message || err}`] }
  }
  const workbook = XLSX.read(content, { type: 'string' })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1 })
  const cases: TestCaseDefinition[] = []

  if (rows.length < 2) {
    return { suiteName: path.basename(filePath, path.extname(filePath)), sourceFile: filePath, cases: [], errors: ['CSV 为空'] }
  }

  const header = rows[0].map((h: any) => String(h || '').trim())
  const colMap: Record<string, number> = {}
  for (let i = 0; i < header.length; i++) {
    const h = header[i]
    if (/用例编号|编号|ID|id/i.test(h)) colMap.id = i
    else if (/用例名称|名称|name/i.test(h)) colMap.name = i
    else if (/测试步骤|测试目标|步骤|goal|step/i.test(h)) colMap.goal = i
    else if (/预期结果|预期|expect/i.test(h)) colMap.expectedResult = i
    else if (/优先级|priority|优/i.test(h)) colMap.priority = i
  }

  if (colMap.goal === undefined && rows[0].length >= 2) {
    colMap.id = 0
    colMap.name = rows[0].length >= 3 ? 1 : 0
    colMap.goal = rows[0].length >= 3 ? 2 : 1
    if (rows[0].length >= 4) colMap.expectedResult = 3
  }

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || row.every((c: any) => !c)) continue
    const goal = String(row[colMap.goal] || '').trim()
    if (!goal) continue
    const id = colMap.id !== undefined ? String(row[colMap.id] || `TC${r}`).trim() : `TC${r}`
    const priorityRaw = colMap.priority !== undefined ? String(row[colMap.priority] || '').trim() : 'medium'
    let priority: 'high' | 'medium' | 'low' = 'medium'
    if (priorityRaw.includes('高') || priorityRaw.includes('high') || priorityRaw === '1') priority = 'high'
    else if (priorityRaw.includes('低') || priorityRaw.includes('low') || priorityRaw === '3') priority = 'low'
    cases.push({
      id,
      name: (colMap.name !== undefined ? String(row[colMap.name] || '').trim() : goal.substring(0, 40)),
      goal,
      expectedResult: colMap.expectedResult !== undefined ? String(row[colMap.expectedResult] || '').trim() : '',
      priority,
      enabled: true,
    })
  }

  return { suiteName: path.basename(filePath, path.extname(filePath)), sourceFile: filePath, cases, errors: [] }
}

/**
 * 统一解析入口：根据扩展名分发
 */
export function parseTestDocument(filePath: string): ParseResult {
  const ext = path.extname(filePath).toLowerCase()
  switch (ext) {
    case '.xlsx':
    case '.xls':
      return parseExcel(filePath)
    case '.csv':
      return parseCSV(filePath)
    case '.md':
    case '.markdown':
    case '.txt':
      return parseMarkdown(filePath)
    default:
      return { suiteName: path.basename(filePath), sourceFile: filePath, cases: [], errors: [`不支持的文件格式: ${ext}。支持: .xlsx, .csv, .md`] }
  }
}
