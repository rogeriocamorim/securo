import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, screen } from '@testing-library/react'

import BudgetsPage from '@/pages/budgets'
import { renderWithProviders, t } from '@/test/utils'

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

const api = vi.hoisted(() => ({
  budgets: {
    list: vi.fn(),
    comparison: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  categories: { list: vi.fn(), listIncludingHidden: vi.fn() },
  categoryGroups: { list: vi.fn() },
}))

vi.mock('sonner', () => ({ toast }))

vi.mock('@/lib/api', () => ({
  budgets: api.budgets,
  categories: api.categories,
  categoryGroups: api.categoryGroups,
}))

vi.mock('@/hooks/use-display-locale', () => ({
  useDisplayLocale: () => 'en-US',
  useDateLocale: () => 'en-US',
}))

vi.mock('@/contexts/auth-context', () => ({
  useAuth: () => ({ user: { preferences: { currency_display: 'USD' } } }),
}))

vi.mock('@/contexts/workspace-context', () => ({
  useWorkspace: () => ({ canWrite: true }),
}))

vi.mock('@/hooks/use-privacy-mode', () => ({
  usePrivacyMode: () => ({ mask: (value: string) => value }),
}))

function budget(id: string, categoryId: string, amount: number) {
  return { id, user_id: 'user-1', category_id: categoryId, amount, month: '2026-10-01', is_recurring: false }
}

function comparisonRow(categoryId: string, budgetAmount: number | null, actual: number) {
  return {
    category_id: categoryId, category_name: categoryId, category_icon: 'tag', category_color: '#000',
    group_id: null, group_name: null, budget_amount: budgetAmount, actual_amount: actual,
    projected_amount: actual, prev_month_amount: 0, projected_prev_month_amount: 0,
    percentage_used: null, is_recurring: false,
  }
}

describe('BudgetsPage month progress', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.categories.list.mockResolvedValue([])
    api.categories.listIncludingHidden.mockResolvedValue([])
    api.categoryGroups.list.mockResolvedValue([])
    api.budgets.list.mockResolvedValue([budget('b1', 'food', 500), budget('b2', 'rent', 1000)])
  })

  it('shows spent over budgeted, percentage and remaining amount when under budget', async () => {
    api.budgets.comparison.mockResolvedValue([
      comparisonRow('food', 500, 300),
      comparisonRow('rent', 1000, 600),
      // Unbudgeted spending stays out of the month total.
      comparisonRow('fun', null, 250),
    ])

    renderWithProviders(<BudgetsPage />)

    expect(await screen.findByText('$900.00 / $1,500.00')).toBeInTheDocument()
    expect(screen.getAllByText('60%')).toHaveLength(3)
    expect(screen.getByText(t('budgets.remaining', { amount: '$600.00' }))).toBeInTheDocument()
  })

  it('shows what is left or overspent on each category row', async () => {
    api.budgets.comparison.mockResolvedValue([
      comparisonRow('food', 500, 650),
      comparisonRow('rent', 1000, 600),
    ])

    renderWithProviders(<BudgetsPage />)

    expect(await screen.findByText(t('budgets.overBy', { amount: '$150.00' }))).toBeInTheDocument()
    expect(screen.getByText(t('budgets.remaining', { amount: '$400.00' }))).toBeInTheDocument()
    // Month total: 1,250 of 1,500 spent.
    expect(screen.getByText(t('budgets.remaining', { amount: '$250.00' }))).toBeInTheDocument()
  })

  it('flags the month as over budget when spending exceeds the total', async () => {
    api.budgets.comparison.mockResolvedValue([
      comparisonRow('food', 500, 900),
      comparisonRow('rent', 1000, 900),
    ])

    renderWithProviders(<BudgetsPage />)

    expect(await screen.findByText('$1,800.00 / $1,500.00')).toBeInTheDocument()
    expect(screen.getByText('120%')).toBeInTheDocument()
    expect(screen.getByText('180%')).toBeInTheDocument()
    expect(screen.getByText(t('budgets.overBy', { amount: '$300.00' }))).toBeInTheDocument()
  })

  it('counts a category once when two budgets share it', async () => {
    api.budgets.list.mockResolvedValue([budget('b1', 'food', 500), budget('b2', 'food', 300)])
    api.budgets.comparison.mockResolvedValue([comparisonRow('food', 800, 400)])

    renderWithProviders(<BudgetsPage />)

    expect(await screen.findByText('$400.00 / $800.00')).toBeInTheDocument()
    expect(screen.getByText(t('budgets.remaining', { amount: '$400.00' }))).toBeInTheDocument()
  })

  it('shows an error instead of zero spending when spending fails to load', async () => {
    api.budgets.comparison.mockRejectedValue(new Error('boom'))

    renderWithProviders(<BudgetsPage />)

    expect(await screen.findByRole('alert')).toHaveTextContent(t('budgets.spendingUnavailable'))
    expect(screen.getByText('$500.00')).toBeInTheDocument()
    expect(screen.queryByText('0%')).not.toBeInTheDocument()
    expect(screen.queryByText(t('budgets.monthTotal'))).not.toBeInTheDocument()
  })
})

describe('BudgetsPage amount validation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.categories.list.mockResolvedValue([{ id: 'food', name: 'Food', group_id: null }])
    api.categories.listIncludingHidden.mockResolvedValue([])
    api.categoryGroups.list.mockResolvedValue([])
    api.budgets.list.mockResolvedValue([])
    api.budgets.comparison.mockResolvedValue([])
  })

  it.each(['0', '-5'])('rejects a budget amount of %s', async (value) => {
    renderWithProviders(<BudgetsPage />)

    fireEvent.click(await screen.findByRole('button', { name: new RegExp(t('budgets.add')) }))
    const dialog = await screen.findByRole('dialog')
    const select = dialog.querySelector('select[name="category_id"]') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'food' } })
    fireEvent.change(dialog.querySelector('input[name="amount"]') as HTMLInputElement, { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: t('common.save') }))

    expect(toast.error).toHaveBeenCalledWith(t('common.invalidAmount'))
    expect(api.budgets.create).not.toHaveBeenCalled()
  })
})
