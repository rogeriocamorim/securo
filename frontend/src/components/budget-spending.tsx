import { useTranslation } from 'react-i18next'
import { useBudgetSpending } from '@/hooks/use-budget-spending'
import { formatCurrency } from '@/lib/format'
import { usePrivacyMode } from '@/hooks/use-privacy-mode'

const WARNING_PCT = 80
const OVER_PCT = 100

function percentOf(spent: number, budgeted: number) {
  return budgeted > 0 ? (spent / budgeted) * 100 : 0
}

function barColor(pct: number) {
  if (pct > OVER_PCT) return 'bg-rose-500'
  if (pct >= WARNING_PCT) return 'bg-amber-400'
  return 'bg-emerald-500'
}

function BudgetBar({ pct, size }: { pct: number; size: 'sm' | 'md' }) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex-1 ${size === 'md' ? 'h-2' : 'h-1.5'} bg-muted/60 rounded-full overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all ${barColor(pct)}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <span className="text-xs font-bold tabular-nums text-foreground shrink-0">{pct.toFixed(0)}%</span>
    </div>
  )
}

type Spending = ReturnType<typeof useBudgetSpending>

interface DisplayProps {
  userCurrency: string
  locale: string
}

function useRemainingLabel({ userCurrency, locale }: DisplayProps) {
  const { t } = useTranslation()
  const { mask } = usePrivacyMode()
  return (diff: number) =>
    t(diff >= 0 ? 'budgets.remaining' : 'budgets.overBy', {
      amount: mask(formatCurrency(Math.abs(diff), userCurrency, locale)),
    })
}

export function BudgetSpendingSummary({ spending, ...display }: DisplayProps & { spending: Spending }) {
  const { t } = useTranslation()
  const { mask } = usePrivacyMode()
  const remainingLabel = useRemainingLabel(display)
  if (!spending.hasBudgets) return null
  if (spending.failed) {
    return (
      <p role="alert" className="px-4 sm:px-5 py-3 border-b border-border text-xs text-rose-500">
        {t('budgets.spendingUnavailable')}
      </p>
    )
  }
  if (!spending.loaded) return null
  const { totalSpent, totalBudgeted } = spending
  const diff = totalBudgeted - totalSpent
  return (
    <div className="px-4 sm:px-5 py-4 border-b border-border">
      <p className="text-xs font-medium text-muted-foreground mb-2">{t('budgets.monthTotal')}</p>
      <div className="mb-1.5">
        <BudgetBar pct={percentOf(totalSpent, totalBudgeted)} size="md" />
      </div>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span className="tabular-nums font-medium">
          {mask(formatCurrency(totalSpent, display.userCurrency, display.locale))}
          {' / '}
          {mask(formatCurrency(totalBudgeted, display.userCurrency, display.locale))}
        </span>
        <span className={diff >= 0 ? 'tabular-nums' : 'tabular-nums font-medium text-rose-500'}>{remainingLabel(diff)}</span>
      </div>
    </div>
  )
}

/** Progress for one category that has a saved budget; renders nothing otherwise. */
export function BudgetCategoryProgress({
  spending,
  categoryId,
  limit,
  ...display
}: DisplayProps & { spending: Spending; categoryId: string; limit: number }) {
  const { mask } = usePrivacyMode()
  const remainingLabel = useRemainingLabel(display)
  if (!spending.loaded || limit <= 0) return null
  const spent = spending.spentByCategory.get(categoryId) ?? 0
  return (
    <div className="mt-1.5">
      <BudgetBar pct={percentOf(spent, limit)} size="sm" />
      <p className="mt-1 flex flex-wrap gap-x-4 text-[11px] tabular-nums text-muted-foreground">
        <span>
          {mask(formatCurrency(spent, display.userCurrency, display.locale))}
          {' / '}
          <span className="font-semibold text-foreground">{mask(formatCurrency(limit, display.userCurrency, display.locale))}</span>
        </span>
        <span>{remainingLabel(limit - spent)}</span>
      </p>
    </div>
  )
}
