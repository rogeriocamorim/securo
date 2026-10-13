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
