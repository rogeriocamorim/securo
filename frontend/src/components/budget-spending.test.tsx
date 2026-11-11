import { beforeEach, describe, expect, it, vi } from 'vitest'
import { screen } from '@testing-library/react'

import { BudgetCategoryProgress, BudgetSpendingSummary } from '@/components/budget-spending'
import { useBudgetSpending } from '@/hooks/use-budget-spending'
import { renderWithProviders, t } from '@/test/utils'
import type { Budget, BudgetVsActual } from '@/types'

const api = vi.hoisted(() => ({ budgets: { comparison: vi.fn() } }))

vi.mock('@/lib/api', () => ({ budgets: api.budgets }))
vi.mock('@/hooks/use-privacy-mode', () => ({
  usePrivacyMode: () => ({ mask: (value: string) => value, privacyMode: false, MASK: '••••' }),
}))

function budget(id: string, categoryId: string, amount: number): Budget {
  return { id, user_id: 'user-1', category_id: categoryId, amount, month: '2026-10-01', is_recurring: false }
}

function comparisonRow(categoryId: string, actual: number): BudgetVsActual {
  return {
    category_id: categoryId, category_name: categoryId, category_icon: 'tag', category_color: '#000',
    group_id: null, group_name: null, budget_amount: null, actual_amount: actual,
    projected_amount: actual, prev_month_amount: 0, projected_prev_month_amount: 0,
    percentage_used: null, is_recurring: false,
  }
}

function Harness({ budgets }: { budgets: Budget[] }) {
  const spending = useBudgetSpending({ monthParam: '2026-10-01', selectedMonth: '2026-10', budgets })
  const display = { userCurrency: 'USD', locale: 'en-US' }
  return (
    <div>
      <BudgetSpendingSummary spending={spending} {...display} />
      {budgets.map((item) => (
        <BudgetCategoryProgress key={item.id} spending={spending} categoryId={item.category_id} limit={Number(item.amount)} {...display} />
      ))}
    </div>
  )
}

describe('budget spending progress', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows spent over budgeted, percentage and remaining amount when under budget', async () => {
    api.budgets.comparison.mockResolvedValue([
      comparisonRow('food', 300),
      comparisonRow('rent', 600),
      // Unbudgeted spending stays out of the month total.
      comparisonRow('fun', 250),
    ])

    renderWithProviders(<Harness budgets={[budget('b1', 'food', 500), budget('b2', 'rent', 1000)]} />)

    expect(await screen.findByText('$900.00 / $1,500.00')).toBeInTheDocument()
    expect(screen.getAllByText('60%')).toHaveLength(3)
    expect(screen.getByText(t('budgets.remaining', { amount: '$600.00' }))).toBeInTheDocument()
  })

  it('shows what is left or overspent on each category', async () => {
    api.budgets.comparison.mockResolvedValue([comparisonRow('food', 650), comparisonRow('rent', 600)])

    renderWithProviders(<Harness budgets={[budget('b1', 'food', 500), budget('b2', 'rent', 1000)]} />)

    expect(await screen.findByText(t('budgets.overBy', { amount: '$150.00' }))).toBeInTheDocument()
    expect(screen.getByText(t('budgets.remaining', { amount: '$400.00' }))).toBeInTheDocument()
    // Month total: 1,250 of 1,500 spent.
    expect(screen.getByText(t('budgets.remaining', { amount: '$250.00' }))).toBeInTheDocument()
  })

  it('flags the month as over budget when spending exceeds the total', async () => {
    api.budgets.comparison.mockResolvedValue([comparisonRow('food', 900), comparisonRow('rent', 900)])

    renderWithProviders(<Harness budgets={[budget('b1', 'food', 500), budget('b2', 'rent', 1000)]} />)

    expect(await screen.findByText('$1,800.00 / $1,500.00')).toBeInTheDocument()
    expect(screen.getByText('120%')).toBeInTheDocument()
    expect(screen.getByText('180%')).toBeInTheDocument()
    expect(screen.getByText(t('budgets.overBy', { amount: '$300.00' }))).toBeInTheDocument()
  })

  it('counts a category once when two budgets share it', async () => {
    api.budgets.comparison.mockResolvedValue([comparisonRow('food', 400)])

    renderWithProviders(<Harness budgets={[budget('b1', 'food', 500), budget('b2', 'food', 300)]} />)

    expect(await screen.findByText('$400.00 / $800.00')).toBeInTheDocument()
  })

  it('shows an error instead of zero spending when spending fails to load', async () => {
    api.budgets.comparison.mockRejectedValue(new Error('boom'))

    renderWithProviders(<Harness budgets={[budget('b1', 'food', 500)]} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(t('budgets.spendingUnavailable'))
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText(t('budgets.monthTotal'))).not.toBeInTheDocument()
  })
})
