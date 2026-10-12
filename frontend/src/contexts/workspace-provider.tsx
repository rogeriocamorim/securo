import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/contexts/auth-context'
import { workspaces as workspacesApi, WORKSPACE_STORAGE_KEY } from '@/lib/api'
import type { ModuleId } from '@/lib/modules'
import type { Workspace } from '@/types'
import { WorkspaceContext } from '@/contexts/workspace-context'


export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { user, token, isLoading: authLoading } = useAuth()
  const [list, setList] = useState<Workspace[]>([])
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(WORKSPACE_STORAGE_KEY))
  const [isLoading, setIsLoading] = useState(true)
  const queryClient = useQueryClient()

  // Fetches and reconciles; state only changes once the request settles.
  // `isCurrent` lets an effect drop a response for a session that ended.
  const fetchWorkspaces = useCallback(
    (isCurrent: () => boolean = () => true) =>
      workspacesApi
        .list()
        .then(
          (fetched) => {
            if (!isCurrent()) return
            setList(fetched)
            // Reconcile the stored selection against what's actually accessible.
            // If the stored ID is stale (workspace archived, user removed, etc.)
            // fall back to the first one.
            const storedId = localStorage.getItem(WORKSPACE_STORAGE_KEY)
            const found = fetched.find((w) => w.id === storedId)
            if (found) {
              setCurrentId(found.id)
            } else if (fetched.length > 0) {
              const fallbackId = fetched[0].id
              localStorage.setItem(WORKSPACE_STORAGE_KEY, fallbackId)
              setCurrentId(fallbackId)
            } else {
              localStorage.removeItem(WORKSPACE_STORAGE_KEY)
              setCurrentId(null)
            }
          },
          () => {
            // 401s are handled by the global interceptor; other failures we
            // just surface as no-data — the user can retry from the UI.
            if (isCurrent()) setList([])
          },
        )
        .finally(() => {
          if (isCurrent()) setIsLoading(false)
        }),
    [],
  )

  const loadWorkspaces = useCallback(async () => {
    setIsLoading(true)
    await fetchWorkspaces()
  }, [fetchWorkspaces])

  // Stay in the loading state until auth has settled. Reporting "done,
  // no workspaces" while the token is still being restored is a lie
  // that lasts one render — long enough for anything gated on
  // `hasModule` to decide the module is off and redirect away.
  const session = authLoading ? 'pending' : user && token ? 'signed-in' : 'signed-out'

  // Session changes adjust the state while rendering: signing out clears the
  // workspaces, signing in shows the spinner until the effect's fetch lands.
  // Starts at 'pending' so the first settled state also counts as a change
  // (an app that loads signed out must still leave the loading state).
  const [prevSession, setPrevSession] = useState<typeof session>('pending')
  if (prevSession !== session) {
    setPrevSession(session)
    if (session === 'signed-out') {
      setList([])
      setCurrentId(null)
      setIsLoading(false)
    } else if (session === 'signed-in') {
      setIsLoading(true)
    }
  }

  useEffect(() => {
    if (session !== 'signed-in') return
    let current = true
    void fetchWorkspaces(() => current)
    return () => { current = false }
  }, [session, user, token, fetchWorkspaces])

  const switchWorkspace = useCallback(
    async (id: string) => {
      if (id === currentId) return
      // Persist FIRST so the axios interceptor sends the new
      // workspace_id on every refetch fired below.
      localStorage.setItem(WORKSPACE_STORAGE_KEY, id)
      setCurrentId(id)
      // Every cached query was scoped to the previous workspace.
      // `resetQueries` flushes cached data AND refetches active
      // observers in one call — `clear()` alone removed data without
      // triggering refetches (mounted components kept their previous
      // render until a manual reload).
      await queryClient.resetQueries()
    },
    [currentId, queryClient],
  )

  const current = useMemo(
    () => list.find((w) => w.id === currentId) ?? null,
    [list, currentId],
  )

  const role = current?.role ?? null
  const canManage = role === 'owner' || role === 'manager'
  const canWrite = role === 'owner' || role === 'manager' || role === 'editor'

  const enabledModules = useMemo(
    () => (current?.enabled_modules ?? []) as ModuleId[],
    [current],
  )
  const hasModule = useCallback(
    (id: ModuleId) => enabledModules.includes(id),
    [enabledModules],
  )

  return (
    <WorkspaceContext.Provider
      value={{
        current,
        workspaces: list,
        isLoading,
        switchWorkspace,
        refresh: loadWorkspaces,
        role,
        canManage,
        canWrite,
        enabledModules,
        hasModule,
      }}
    >
      {children}
    </WorkspaceContext.Provider>
  )
}
