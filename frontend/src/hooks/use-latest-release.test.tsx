import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'

import { useLatestRelease } from '@/hooks/use-latest-release'
import { createTestQueryClient } from '@/test/utils'

vi.mock('@/lib/build-info', () => ({
  APP_VERSION: 'v0.1.0',
  RELEASE_REPO: 'someone/securo-fork',
}))

const fetchMock = vi.fn()

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={createTestQueryClient()}>
      {children}
    </QueryClientProvider>
  )
}

beforeEach(() => {
  localStorage.clear()
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useLatestRelease', () => {
  it('checks the configured release repo', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v0.2.0',
          html_url: 'https://github.com/someone/securo-fork/releases/tag/v0.2.0',
        }),
      ),
    )

    const { result } = renderHook(() => useLatestRelease(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.github.com/repos/someone/securo-fork/releases/latest',
      expect.anything(),
    )
    expect(result.current.data).toEqual({
      tagName: 'v0.2.0',
      htmlUrl: 'https://github.com/someone/securo-fork/releases/tag/v0.2.0',
    })
  })

  it('does not call GitHub when the user turned the check off', () => {
    localStorage.setItem('updateCheckEnabled', 'false')

    renderHook(() => useLatestRelease(), { wrapper })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
