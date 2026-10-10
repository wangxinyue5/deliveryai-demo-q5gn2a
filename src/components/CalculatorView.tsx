import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowLeft, Delete } from 'lucide-react'

/**
 * 演示用计算器：支持 +、−、×、÷ 四则运算与除零保护。
 * 状态机收敛在组件内（不接入全局 reducer），仅通过 props.onBack 反馈到 App。
 * UI 文案全部走 i18n（calculator.*），与现有 Demo 中英文切换能力一致。
 */
type Op = '+' | '−' | '×' | '÷'

interface CalcState {
  /** 显示区当前字符串：数字（含小数点）或错误文案 */
  display: string
  /** 表达式预览区字符串：完整可读表达式或计算结果 */
  preview: string
  /** 暂存的第一操作数；按下运算符后被设置，按 = 后清空 */
  pendingValue: number | null
  /** 暂存的运算符 */
  pendingOp: Op | null
  /** 等待输入第二操作数（按下运算符后置 true；输入数字或 . 后置 false） */
  awaiting: boolean
  /** 刚刚按过 =；下一次数字键按下时预览与显示都从该数字重新开始 */
  computed: boolean
  /** 除零等错误态：显示错误文案，按数字/C/运算符回到初始态 */
  errored: boolean
}

const INITIAL_STATE: CalcState = {
  display: '0',
  preview: '',
  pendingValue: null,
  pendingOp: null,
  awaiting: false,
  computed: false,
  errored: false,
}

const OP_FN: Record<Op, (a: number, b: number) => number> = {
  '+': (a, b) => a + b,
  '−': (a, b) => a - b,
  '×': (a, b) => a * b,
  '÷': (a, b) => a / b,
}

/**
 * 把计算结果格式化为可显示字符串：
 * - 避免显示 `0.1 + 0.2 = 0.30000000000000004` 这类浮点尾巴。
 * - 使用 toPrecision(12) 保留 12 位有效数字，再 parseFloat 去掉尾随 0；
 * - 不可计算（非有限数）返回 'error' 标记，由调用方决定是否进入错误态。
 */
function formatResult(n: number): string {
  if (!Number.isFinite(n)) return 'error'
  const rounded = parseFloat(n.toPrecision(12))
  // toString 已能去掉 parseFloat 引入的尾随 0；但科学计数法（极大/极小）这里不另做处理
  // ——Demo 演示范围不会触发科学计数法；如未来扩展再调整。
  return rounded.toString()
}

interface CalculatorViewProps {
  /** 返回按钮（以及错误态恢复后的等价行为）使用：跳回首页 */
  onBack: () => void
}

export function CalculatorView({ onBack }: CalculatorViewProps) {
  const { t } = useTranslation()
  const [state, setState] = useState<CalcState>(INITIAL_STATE)

  const reset = useCallback(() => setState(INITIAL_STATE), [])

  const inputDigit = useCallback((d: string) => {
    setState((s) => {
      // 错误态：按下任何数字键回到可重新输入的初始态
      if (s.errored) {
        return { ...INITIAL_STATE, display: d, preview: d }
      }
      // 等待第二操作数：替换显示与预览尾段
      if (s.awaiting) {
        return { ...s, display: d, preview: `${s.preview} ${d}`, awaiting: false }
      }
      // 刚算完：从该数字重新开始
      if (s.computed) {
        return { ...s, display: d, preview: d, computed: false }
      }
      // 起始 '0'：按 0 时显示与预览都保持（无变化）；按非 0 时替换
      if (s.display === '0') {
        if (d === '0') return s
        return { ...s, display: d, preview: s.preview === '' ? d : s.preview + d }
      }
      // 常规追加
      return { ...s, display: s.display + d, preview: s.preview + d }
    })
  }, [])

  const inputDecimal = useCallback(() => {
    setState((s) => {
      if (s.errored) {
        return { ...INITIAL_STATE, display: '0.', preview: '0.' }
      }
      if (s.awaiting) {
        return { ...s, display: '0.', preview: `${s.preview} 0.`, awaiting: false }
      }
      if (s.computed) {
        return { ...s, display: '0.', preview: '0.', computed: false }
      }
      if (s.display.includes('.')) return s // 每段最多一个 .
      if (s.display === '0') {
        return { ...s, display: '0.', preview: s.preview === '' ? '0.' : s.preview + '.' }
      }
      return { ...s, display: s.display + '.', preview: s.preview + '.' }
    })
  }, [])

  const inputOp = useCallback((op: Op) => {
    setState((s) => {
      if (s.errored) {
        // 错误态下按运算符：回到初始态（不清显示，便于用户直接输入新表达式）
        return { ...INITIAL_STATE }
      }
      // 尚无第一操作数且显示为 0：忽略
      if (s.pendingValue === null && s.display === '0') return s
      // 等待输入第二操作数时再次按运算符：替换原运算符
      if (s.awaiting && s.pendingOp !== null) {
        return { ...s, pendingOp: op, preview: replaceTrailingOp(s.preview, op) }
      }
      // 链式：在已暂存的情况下输入了第二操作数后再按 op，立即结算并作为新第一操作数
      if (s.pendingValue !== null && s.pendingOp !== null && !s.awaiting) {
        const a = s.pendingValue
        const b = Number(s.display)
        if (op === '÷' && b === 0) {
          return { ...INITIAL_STATE, errored: true, display: t('calculator.error'), preview: '' }
        }
        const result = OP_FN[s.pendingOp](a, b)
        const formatted = formatResult(result)
        if (formatted === 'error') {
          return { ...INITIAL_STATE, errored: true, display: t('calculator.error'), preview: '' }
        }
        return {
          ...s,
          display: formatted,
          preview: `${s.preview} ${op}`,
          pendingValue: result,
          pendingOp: op,
          awaiting: true,
          computed: false,
        }
      }
      // 普通：暂存当前显示为第一操作数
      return {
        ...s,
        pendingValue: Number(s.display),
        pendingOp: op,
        awaiting: true,
        computed: false,
        preview: `${s.preview} ${op}`,
      }
    })
  }, [t])

  const inputEquals = useCallback(() => {
    setState((s) => {
      if (s.errored) return s
      if (s.pendingValue === null || s.pendingOp === null) return s
      if (s.awaiting) return s // 还没输入第二操作数
      const a = s.pendingValue
      const b = Number(s.display)
      if (s.pendingOp === '÷' && b === 0) {
        return { ...INITIAL_STATE, errored: true, display: t('calculator.error'), preview: '' }
      }
      const result = OP_FN[s.pendingOp](a, b)
      const formatted = formatResult(result)
      if (formatted === 'error') {
        return { ...INITIAL_STATE, errored: true, display: t('calculator.error'), preview: '' }
      }
      return {
        ...s,
        display: formatted,
        preview: `${s.preview} = ${formatted}`,
        pendingValue: null,
        pendingOp: null,
        awaiting: false,
        computed: true,
      }
    })
  }, [t])

  const inputBackspace = useCallback(() => {
    setState((s) => {
      if (s.errored) {
        return { ...INITIAL_STATE }
      }
      if (s.computed || s.awaiting) return s
      if (s.display === '0') return s
      if (s.display.length === 1) {
        return { ...s, display: '0', preview: s.preview.slice(0, -1) }
      }
      return { ...s, display: s.display.slice(0, -1), preview: s.preview.slice(0, -1) }
    })
  }, [])

  const display = state.errored ? t('calculator.error') : state.display
  const previewText = state.errored ? '' : state.preview

  return (
    <main className="min-h-screen bg-rice-100 paper-noise">
      <div className="mx-auto flex min-h-screen max-w-md flex-col px-5 py-6">
        <header className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('calculator.back_aria')}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-charcoal-900/10 bg-white text-charcoal-700 transition hover:border-chili-500/30 hover:bg-chili-50"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-extrabold text-charcoal-900">{t('calculator.title')}</h1>
            <p className="text-xs text-charcoal-500">{t('calculator.subtitle')}</p>
          </div>
        </header>

        <section
          aria-label={t('calculator.title')}
          data-testid="calculator"
          className="rounded-3xl border border-charcoal-900/5 bg-white/90 p-4 shadow-card"
        >
          <div
            data-testid="calculator-preview"
            className="min-h-[1.5rem] truncate text-right text-sm text-charcoal-500"
          >
            {previewText || t('calculator.preview_empty')}
          </div>
          <div
            data-testid="calculator-display"
            aria-live="polite"
            className="mt-1 truncate rounded-2xl bg-rice-100 px-4 py-5 text-right text-4xl font-extrabold tracking-tight text-charcoal-900"
          >
            {display}
          </div>

          <div className="mt-4 grid grid-cols-4 gap-2">
            <CalcButton
              variant="ghost"
              onClick={reset}
              ariaLabel={t('calculator.clear')}
              testId="calc-clear"
            >
              {t('calculator.clear')}
            </CalcButton>
            <CalcButton
              variant="ghost"
              onClick={inputBackspace}
              ariaLabel={t('calculator.backspace_aria')}
              testId="calc-backspace"
            >
              <Delete size={18} />
            </CalcButton>
            <CalcButton variant="op" onClick={() => inputOp('÷')} ariaLabel={t('calculator.op_div')} testId="calc-op-div">
              ÷
            </CalcButton>
            <CalcButton variant="op" onClick={() => inputOp('×')} ariaLabel={t('calculator.op_mul')} testId="calc-op-mul">
              ×
            </CalcButton>

            <CalcButton onClick={() => inputDigit('7')} testId="calc-7">7</CalcButton>
            <CalcButton onClick={() => inputDigit('8')} testId="calc-8">8</CalcButton>
            <CalcButton onClick={() => inputDigit('9')} testId="calc-9">9</CalcButton>
            <CalcButton variant="op" onClick={() => inputOp('−')} ariaLabel={t('calculator.op_sub')} testId="calc-op-sub">
              −
            </CalcButton>

            <CalcButton onClick={() => inputDigit('4')} testId="calc-4">4</CalcButton>
            <CalcButton onClick={() => inputDigit('5')} testId="calc-5">5</CalcButton>
            <CalcButton onClick={() => inputDigit('6')} testId="calc-6">6</CalcButton>
            <CalcButton variant="op" onClick={() => inputOp('+')} ariaLabel={t('calculator.op_add')} testId="calc-op-add">
              +
            </CalcButton>

            <CalcButton onClick={() => inputDigit('1')} testId="calc-1">1</CalcButton>
            <CalcButton onClick={() => inputDigit('2')} testId="calc-2">2</CalcButton>
            <CalcButton onClick={() => inputDigit('3')} testId="calc-3">3</CalcButton>
            <CalcButton variant="primary" onClick={inputEquals} ariaLabel={t('calculator.equals')} testId="calc-equals">
              {t('calculator.equals')}
            </CalcButton>

            <CalcButton onClick={() => inputDigit('0')} className="col-span-2" testId="calc-0">0</CalcButton>
            <CalcButton onClick={inputDecimal} testId="calc-dot">.</CalcButton>
            <CalcButton variant="primary" onClick={inputEquals} ariaLabel={t('calculator.equals')} testId="calc-equals-2">
              {t('calculator.equals')}
            </CalcButton>
          </div>
        </section>
      </div>
    </main>
  )
}

interface CalcButtonProps {
  children: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'op' | 'primary' | 'ghost'
  className?: string
  ariaLabel?: string
  testId?: string
}

function CalcButton({ children, onClick, variant = 'default', className, ariaLabel, testId }: CalcButtonProps) {
  const base = 'flex h-14 items-center justify-center rounded-2xl text-lg font-bold transition active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chili-500'
  const styles: Record<NonNullable<CalcButtonProps['variant']>, string> = {
    default: 'bg-rice-200 text-charcoal-900 hover:bg-amber-100',
    op: 'bg-chili-50 text-chili-600 hover:bg-chili-100',
    primary: 'bg-chili-500 text-white shadow-md hover:bg-chili-600',
    ghost: 'bg-white text-charcoal-700 border border-charcoal-900/10 hover:bg-rice-200',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      data-testid={testId}
      className={`${base} ${styles[variant]} ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** 仅替换预览末尾的运算符字符，保留前导空格，用于「再次按 op 替换原运算符」场景。 */
function replaceTrailingOp(s: string, newOp: Op): string {
  return s.replace(/[+−×÷]$/, newOp)
}
