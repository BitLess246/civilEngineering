import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { currentUser, onAuthChange, signOut as doSignOut, isAuthConfigured, type AuthUser } from './authClient'
import { accessFor, loadUsage, recordRun, saveUsage } from '../trialQuota'
import { AuthCtx } from './authContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const configured = isAuthConfigured()
  const [user, setUser] = useState<AuthUser | null>(null)
  // Starts false when there is nothing to look up, rather than being switched
  // off inside the effect — an unconfigured deployment has no session to wait
  // for, so making that the INITIAL state avoids a needless render and the
  // set-state-in-effect it would require.
  const [loading, setLoading] = useState(configured)
  const [usage, setUsage] = useState<Record<string, number>>(() => loadUsage())

  useEffect(() => {
    if (!configured) return
    let alive = true
    currentUser()
      .then((u) => { if (alive) { setUser(u); setLoading(false) } })
      .catch(() => { if (alive) setLoading(false) })
    const off = onAuthChange((u) => { if (alive) setUser(u) })
    return () => { alive = false; off() }
  }, [configured])

  const signOut = useCallback(async () => {
    await doSignOut()
    setUser(null)
  }, [])

  const access = useCallback(
    (route: string) => accessFor(route, !!user, usage),
    [user, usage],
  )

  const useTrial = useCallback((route: string) => {
    if (user) return
    setUsage((prev) => {
      const next = recordRun(route, prev)
      saveUsage(next)
      return next
    })
  }, [user])

  const value = useMemo(
    () => ({ user, loading, configured, signOut, access, useTrial }),
    [user, loading, configured, signOut, access, useTrial],
  )
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
