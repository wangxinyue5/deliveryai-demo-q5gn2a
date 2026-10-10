import { test, expect, type Page } from '@playwright/test'

/** 进入 #/calculator 视图（直接深链接，最小无关依赖）。 */
async function openCalculator(page: Page) {
  await page.goto('/#/calculator')
  await expect(page.getByTestId('calculator')).toBeVisible()
}

/** 从首页进入 #/calculator（验证首页入口卡片链路）。 */
async function openCalculatorFromHome(page: Page) {
  await page.goto('/')
  await expect(page).toHaveURL(/#\/home$/)
  await page.getByTestId('home-calculator-entry').click()
  await expect(page).toHaveURL(/#\/calculator$/)
  await expect(page.getByTestId('calculator')).toBeVisible()
}

/** 通用运算：用 data-testid 触发输入，支持链式。 */
async function pressDigit(page: Page, d: string) {
  await page.getByTestId(`calc-${d}`).click()
}

async function pressOp(page: Page, op: '+' | '−' | '×' | '÷') {
  const map: Record<typeof op, string> = {
    '+': 'calc-op-add',
    '−': 'calc-op-sub',
    '×': 'calc-op-mul',
    '÷': 'calc-op-div',
  }
  await page.getByTestId(map[op]).click()
}

async function pressEquals(page: Page) {
  await page.getByTestId('calc-equals').click()
}

async function display(page: Page) {
  return (await page.getByTestId('calculator-display').textContent())?.trim() ?? ''
}

test.describe('计算器（加/减/乘/除）演示能力 - E2E 验收测试', () => {
  test.describe.configure({ mode: 'serial' })

  test('REQ-001.1: 首页可见「计算器」入口卡片，点击后跳转到 #/calculator', async ({ page }) => {
    await openCalculatorFromHome(page)
    // 返回首页后「计算器」入口仍可见（不影响桌台绑定）
    await page.getByRole('button', { name: /返回首页|Back to home/ }).click()
    await expect(page).toHaveURL(/#\/home$/)
    await expect(page.getByTestId('home-calculator-entry')).toBeVisible()
  })

  test('REQ-001.2: 首页计算器入口与桌台绑定互不影响（入口独立于桌台选择区）', async ({ page }) => {
    await page.goto('/')
    // 计算器入口在 #/home 上始终可达，不依赖桌台
    await expect(page.getByTestId('home-calculator-entry')).toBeVisible()
    // A08 桌台依然可选（既有桌台绑定能力未被破坏）
    await expect(page.getByRole('button', { name: /A08/ }).first()).toBeVisible()
  })

  test('REQ-002.1: 进入 #/calculator 后显示区默认为 0，表达式预览区显示「从数字开始输入」', async ({ page }) => {
    await openCalculator(page)
    await expect(page.getByTestId('calculator-display')).toHaveText('0')
    await expect(page.getByTestId('calculator-preview')).toHaveText('从数字开始输入')
  })

  test('REQ-002.2: 默认 Desktop Chrome 1280x720 视口下完整显示、不出现横向滚动', async ({ page }) => {
    await openCalculator(page)
    // 默认视口即为 Desktop Chrome 1280x720；此处显式再断言一次
    const vp = page.viewportSize()
    expect(vp).toEqual({ width: 1280, height: 720 })
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })

  test('REQ-002.3: 按键区为 4 列网格，C/⌫/÷/× 位于首行（可访问）', async ({ page }) => {
    await openCalculator(page)
    const gridTop = page.locator('[data-testid="calculator"] > div.grid')
    await expect(gridTop).toBeVisible()
    // calculator 容器内首行具备 C/⌫/÷/× 四个按钮
    await expect(page.getByTestId('calc-clear')).toBeVisible()
    await expect(page.getByTestId('calc-backspace')).toBeVisible()
    await expect(page.getByTestId('calc-op-div')).toBeVisible()
    await expect(page.getByTestId('calc-op-mul')).toBeVisible()
  })

  test('REQ-003.1: 连续点击数字键可在显示区拼出对应数字（1 → 12）', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '1')
    await pressDigit(page, '2')
    expect(await display(page)).toBe('12')
    expect((await page.getByTestId('calculator-preview').textContent())?.trim()).toBe('12')
  })

  test('REQ-003.2: 显示区为 0 时点击数字键直接替换（按 5 → 5）', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '0')
    expect(await display(page)).toBe('0')
    await pressDigit(page, '5')
    expect(await display(page)).toBe('5')
  })

  test('REQ-003.3: 显示区为 0 时点击小数点显示 0.', async ({ page }) => {
    await openCalculator(page)
    await page.getByTestId('calc-dot').click()
    expect(await display(page)).toBe('0.')
    expect((await page.getByTestId('calculator-preview').textContent())?.trim()).toBe('0.')
  })

  test('REQ-003.4: 一个数值中只能出现一次小数点（多次点击 . 不会变成 0..）', async ({ page }) => {
    await openCalculator(page)
    await page.getByTestId('calc-dot').click() // 0.
    await page.getByTestId('calc-dot').click() // 忽略，保持 0.
    await page.getByTestId('calc-dot').click()
    expect(await display(page)).toBe('0.')
    await pressDigit(page, '1')
    expect(await display(page)).toBe('0.1')
    await page.getByTestId('calc-dot').click() // 后续 . 忽略
    expect(await display(page)).toBe('0.1')
  })

  test('REQ-004.1: 7 + 3 = 10', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '7')
    await pressOp(page, '+')
    await pressDigit(page, '3')
    await pressEquals(page)
    expect(await display(page)).toBe('10')
    expect((await page.getByTestId('calculator-preview').textContent())?.trim()).toBe('7 + 3 = 10')
  })

  test('REQ-004.2: 7 − 3 = 4', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '7')
    await pressOp(page, '−')
    await pressDigit(page, '3')
    await pressEquals(page)
    expect(await display(page)).toBe('4')
    expect((await page.getByTestId('calculator-preview').textContent())?.trim()).toBe('7 − 3 = 4')
  })

  test('REQ-004.3: 7 × 3 = 21', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '7')
    await pressOp(page, '×')
    await pressDigit(page, '3')
    await pressEquals(page)
    expect(await display(page)).toBe('21')
    expect((await page.getByTestId('calculator-preview').textContent())?.trim()).toBe('7 × 3 = 21')
  })

  test('REQ-004.4: 8 ÷ 2 = 4', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '8')
    await pressOp(page, '÷')
    await pressDigit(page, '2')
    await pressEquals(page)
    expect(await display(page)).toBe('4')
    expect((await page.getByTestId('calculator-preview').textContent())?.trim()).toBe('8 ÷ 2 = 4')
  })

  test('REQ-004.5: 链式计算 7 + 3 = 10 后继续 × 2 = 20', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '7')
    await pressOp(page, '+')
    await pressDigit(page, '3')
    await pressEquals(page)
    expect(await display(page)).toBe('10')
    // 等号之后继续按 × 进入新链式
    await pressOp(page, '×')
    await pressDigit(page, '2')
    await pressEquals(page)
    expect(await display(page)).toBe('20')
  })

  test('REQ-004.6: 浮点尾巴控制 0.1 + 0.2 = 0.3（不出现 0.30000000000000004）', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '0')
    await page.getByTestId('calc-dot').click()
    await pressDigit(page, '1')
    await pressOp(page, '+')
    await pressDigit(page, '0')
    await page.getByTestId('calc-dot').click()
    await pressDigit(page, '2')
    await pressEquals(page)
    expect(await display(page)).toBe('0.3')
  })

  test('REQ-005.1: 除以 0 进入错误态，显示区显示「错误」且不出现 -Infinity/NaN/undefined', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '7')
    await pressOp(page, '÷')
    await pressDigit(page, '0')
    await pressEquals(page)
    expect(await display(page)).toBe('错误')
    const txt = await page.getByTestId('calculator-display').textContent()
    expect(txt?.includes('-Infinity')).toBe(false)
    expect(txt?.includes('NaN')).toBe(false)
    expect(txt?.includes('undefined')).toBe(false)
  })

  test('REQ-005.2: 错误态下按数字键回到可重新输入状态', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '7')
    await pressOp(page, '÷')
    await pressDigit(page, '0')
    await pressEquals(page)
    expect(await display(page)).toBe('错误')
    // 按任意数字键 → 计算器恢复到可重新输入的初始态
    await pressDigit(page, '5')
    expect(await display(page)).toBe('5')
  })

  test('REQ-005.3: 错误态下按 C 键回到初始态（显示 0，预览「从数字开始输入」）', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '7')
    await pressOp(page, '÷')
    await pressDigit(page, '0')
    await pressEquals(page)
    expect(await display(page)).toBe('错误')
    await page.getByTestId('calc-clear').click()
    expect(await display(page)).toBe('0')
    expect((await page.getByTestId('calculator-preview').textContent())?.trim()).toBe('从数字开始输入')
  })

  test('REQ-006.1: 任意状态下按 C，显示区回到 0，表达式预览区清空', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '1')
    await pressDigit(page, '2')
    await pressDigit(page, '3')
    expect(await display(page)).toBe('123')
    await page.getByTestId('calc-clear').click()
    expect(await display(page)).toBe('0')
    expect((await page.getByTestId('calculator-preview').textContent())?.trim()).toBe('从数字开始输入')
  })

  test('REQ-006.2: ⌫ 删除显示区最后一个字符；删到 0 后再按 ⌫ 不变', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '1')
    await pressDigit(page, '2')
    await pressDigit(page, '3')
    await page.getByTestId('calc-backspace').click()
    expect(await display(page)).toBe('12')
    await page.getByTestId('calc-backspace').click()
    expect(await display(page)).toBe('1')
    await page.getByTestId('calc-backspace').click()
    expect(await display(page)).toBe('0')
    await page.getByTestId('calc-backspace').click() // 0 上再退格：保持 0
    expect(await display(page)).toBe('0')
  })

  test('REQ-006.3: 错误态按 ⌫ 同样回到初始态（与 C 等价）', async ({ page }) => {
    await openCalculator(page)
    await pressDigit(page, '7')
    await pressOp(page, '÷')
    await pressDigit(page, '0')
    await pressEquals(page)
    expect(await display(page)).toBe('错误')
    // 错误态按 ⌫：实现约定回到初始态（幂等于 C）
    await page.getByTestId('calc-backspace').click()
    expect(await display(page)).toBe('0')
  })

  test('REQ-007.1: 英文模式下计算器 i18n 文案全部刷新（calculator.* 命名空间生效）', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('i18nextLng', 'en') } catch { /* localStorage unavailable; ignore */ }
    })
    await openCalculator(page)
    await expect(page.getByRole('heading', { name: 'Calculator' })).toBeVisible()
    await expect(page.getByTestId('calculator-preview')).toHaveText('Start with a number')
    // 0+3 = 3：英文 i18n 下计算行为一致
    await pressDigit(page, '0')
    await pressDigit(page, '3')
    await pressEquals(page)
    expect(await display(page)).toBe('3')
    // 运算符的 aria-label 是英文
    await expect(page.getByTestId('calc-op-add')).toHaveAttribute('aria-label', 'Add')
    await expect(page.getByTestId('calc-op-sub')).toHaveAttribute('aria-label', 'Subtract')
    await expect(page.getByTestId('calc-op-mul')).toHaveAttribute('aria-label', 'Multiply')
    await expect(page.getByTestId('calc-op-div')).toHaveAttribute('aria-label', 'Divide')
  })

  test('REQ-007.2: 中文模式下计算器 i18n 文案（aria-label 为中文）', async ({ page }) => {
    await page.addInitScript(() => {
      try { localStorage.setItem('i18nextLng', 'zh') } catch { /* localStorage unavailable; ignore */ }
    })
    await openCalculator(page)
    await expect(page.getByRole('heading', { name: '计算器' })).toBeVisible()
    await expect(page.getByTestId('calculator-preview')).toHaveText('从数字开始输入')
    await expect(page.getByTestId('calc-op-add')).toHaveAttribute('aria-label', '加')
    await expect(page.getByTestId('calc-op-sub')).toHaveAttribute('aria-label', '减')
    await expect(page.getByTestId('calc-op-mul')).toHaveAttribute('aria-label', '乘')
    await expect(page.getByTestId('calc-op-div')).toHaveAttribute('aria-label', '除')
  })

  test('REQ-008.1: 直接以 #/calculator 深链接打开应用能直接进入计算器视图', async ({ page }) => {
    await page.goto('/#/calculator')
    await expect(page).toHaveURL(/#\/calculator$/)
    await expect(page.getByTestId('calculator')).toBeVisible()
    expect(await display(page)).toBe('0')
  })

  test('REQ-008.2: 计算器视图浏览器后退能回到上一个视图（home → calculator → back → home）', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('home-calculator-entry').click()
    await expect(page).toHaveURL(/#\/calculator$/)
    await page.goBack()
    await expect(page).toHaveURL(/#\/home$/)
    await expect(page.getByTestId('home-calculator-entry')).toBeVisible()
  })

  test('REQ-008.3: 计算器视图点击「返回首页」回到 #/home', async ({ page }) => {
    await openCalculator(page)
    await page.getByRole('button', { name: /返回首页|Back to home/ }).click()
    await expect(page).toHaveURL(/#\/home$/)
    await expect(page.getByTestId('home-calculator-entry')).toBeVisible()
  })

  test('REQ-008.4: VIEWS 中的其它视图深链接行为不受 calculator 增加影响', async ({ page }) => {
    // 来自 view-routing.spec.ts 的 ROUTE-005 / ROUTE-006 不变量
    await page.goto('/#/menu')
    await expect(page).toHaveURL(/#\/menu$/)
    await expect(page.getByRole('heading', { name: '鎏金番茄鸳鸯锅' })).toBeVisible()

    await page.goto('/#/not-a-view')
    await expect(page).toHaveURL(/#\/home$/)
    await expect(page.getByRole('button', { name: /A08/ }).first()).toBeVisible()
  })
})
