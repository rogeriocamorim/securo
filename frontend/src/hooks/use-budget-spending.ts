import { useQuery } from '@tanstack/react-query'
import { budgets as budgetsApi } from '@/lib/api'
import type { Budget } from '@/types'

interface SpendingInput {
  monthParam: string
  selectedMonth: string
  budgets: Budget[] | undefined
}

/**
 * Spent-vs-budget data for one month. Shares the 'budgets' query prefix so
 * budget mutations refresh spending too. `spent` is undefined until the
 * comparison loads: a missing comparison must not read as "nothing spent".
 */
export function useBudgetSpending({ monthParam, selectedMonth, budgets }: SpendingInput) {
  const { data: comparison, isError: failed } = useQuery({
    queryKey: ['budgets', 'comparison', selectedMonth],
    queryFn: () => budgetsApi.comparison(monthParam),
  })
  const spentByCategory = new Map((comparison ?? []).map((row) => [row.category_id, Number(row.actual_amount)]))
  const loaded = comparison !== undefined
  const list = budgets ?? []
  const totalBudgeted = list.reduce((sum, budget) => sum + Number(budget.amount), 0)
  // Two members can budget the same category; its spending still counts once.
  const categoryIds = new Set(list.map((budget) => budget.category_id))
  const totalSpent = [...categoryIds].reduce((sum, id) => sum + (spentByCategory.get(id) ?? 0), 0)
  return { loaded, failed, spentByCategory, totalBudgeted, totalSpent, hasBudgets: list.length > 0 }
}
