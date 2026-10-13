import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'

import {
  markLoginForUpdatePrompt,
  useLoginUpdatePrompt,
} from '@/hooks/use-login-update-prompt'
import { createTestQueryClient } from '@/test/utils'

vi.mock('@/lib/build-info', () => ({
  APP_VERSION: 'v0.1.0',
  RELEASE_REPO: 'securo-finance/securo',
}))

const fetchMock = vi.fn()

function releaseResponse(tagName: string) {
  return new Response(
    JSON.stringify({
      tag_name: tagName,
      html_url: `https://github.com/securo-finance/securo/releases/tag/${tagName}`,
    }),
  )
}

function setup() {
  const queryClient = createTestQueryClient()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLoginUpdatePrompt', () => {
  it('opens the prompt once after a login when a newer release exists', async () => {
    fetchMock.mockResolvedValue(releaseResponse('v0.2.0'))
    const { queryClient, wrapper } = setup()
    const onPrompt = vi.fn()

    markLoginForUpdatePrompt(queryClient)
    const { rerender } = renderHook(() => useLoginUpdatePrompt(onPrompt), {
      wrapper,
    })

    await waitFor(() => expect(onPrompt).toHaveBeenCalledTimes(1))
    rerender()
    expect(onPrompt).toHaveBeenCalledTimes(1)
    expect(sessionStorage.getItem('updatePromptPending')).toBeNull()
  })

  it('stays quiet on session restore without a fresh login', async () => {
    fetchMock.mockResolvedValue(releaseResponse('v0.2.0'))
    const { wrapper } = setup()
    const onPrompt = vi.fn()

    renderHook(() => useLoginUpdatePrompt(onPrompt), { wrapper })

    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(onPrompt).not.toHaveBeenCalled()
  })

  it('stays quiet after login when already on the latest release', async () => {
    fetchMock.mockResolvedValue(releaseResponse('v0.1.0'))
    const { queryClient, wrapper } = setup()
    const onPrompt = vi.fn()

    markLoginForUpdatePrompt(queryClient)
    renderHook(() => useLoginUpdatePrompt(onPrompt), { wrapper })

    await waitFor(() =>
      expect(sessionStorage.getItem('updatePromptPending')).toBeNull(),
    )
    expect(onPrompt).not.toHaveBeenCalled()
  })

  it('stays quiet after login when the user turned the check off', () => {
    localStorage.setItem('updateCheckEnabled', 'false')
    const { queryClient, wrapper } = setup()
    const onPrompt = vi.fn()

    markLoginForUpdatePrompt(queryClient)
    renderHook(() => useLoginUpdatePrompt(onPrompt), { wrapper })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(onPrompt).not.toHaveBeenCalled()
    expect(sessionStorage.getItem('updatePromptPending')).toBeNull()
  })
})
