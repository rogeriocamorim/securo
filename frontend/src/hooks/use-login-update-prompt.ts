import { useEffect } from 'react'
import type { QueryClient } from '@tanstack/react-query'
import { APP_VERSION } from '@/lib/build-info'
import { useAutoUpdateCheck } from '@/hooks/use-auto-update-check'
import { useLatestRelease } from '@/hooks/use-latest-release'
import { isUpdateAvailable } from '@/lib/semver'

const PENDING_KEY = 'updatePromptPending'

// Called on a fresh sign-in, not on session restore, so a reload never
// re-opens the prompt. Dropping the cached release forces a new check.
export function markLoginForUpdatePrompt(queryClient: QueryClient) {
  sessionStorage.setItem(PENDING_KEY, 'true')
  queryClient.removeQueries({ queryKey: ['latest-release'] })
}

export function useLoginUpdatePrompt(onPrompt: () => void) {
  const { enabled } = useAutoUpdateCheck()
  const { data, isFetched } = useLatestRelease()

  useEffect(() => {
    if (sessionStorage.getItem(PENDING_KEY) !== 'true') return
    if (!enabled) {
      sessionStorage.removeItem(PENDING_KEY)
      return
    }
    if (!isFetched) return
    sessionStorage.removeItem(PENDING_KEY)
    if (data && isUpdateAvailable(APP_VERSION, data.tagName)) onPrompt()
  }, [enabled, data, isFetched, onPrompt])
}
