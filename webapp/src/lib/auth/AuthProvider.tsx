// NAMED AuthProvider, NOT AuthContext — the sibling holding the context object
// is `authContext.ts`, and two files differing only in capitalisation cannot
// coexist on Windows or macOS. `./AuthContext` resolved to `authContext.ts`
// there, which exports no component, so `npm run build` failed on every
// case-insensitive filesystem while Linux CI stayed green.
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { currentUser, onAuthChange, signOut as doSignOut, isAuthConfigured, type AuthUser } from './authClient'
import { accessFor, loadUsage, recordRun, saveUsage } from '../trialQuota'
import { consumeRemote, mergeUsage, peekRemote } from '../guestTrials'
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

  /**
   * Fold the server's record of this visitor into the local one.
   *
   * `mergeUsage` takes the higher count per route, so this can only ever raise
   * a count — a stale or partial answer cannot give back a spent run. The
   * result is written straight to localStorage as a cache, so the next load
   * starts from the merged truth even before the network answers.
   */
  const absorb = useCallback((remote: Record<string, number>) => {
    setUsage((prev) => {
      const next = mergeUsage(prev, remote)
      saveUsage(next)
      return next
    })
  }, [])

  // Ask the server what it already knows, ONCE, for visitors without an
  // account. This is what stops "clear site data" handing out a fresh
  // allowance: the durable count lives server-side and is merged back in here.
  // Members skip it — the counter does not apply to them, and asking would
  // spend a request to learn nothing.
  const peeked = useRef(false)
  useEffect(() => {
    if (!configured || loading || user || peeked.current) return
    peeked.current = true
    let alive = true
    peekRemote().then((r) => { if (alive && r.kind === 'ok') absorb(r.usage) })
    return () => { alive = false }
  }, [configured, loading, user, absorb])

  const signOut = useCallback(async () => {
    await doSignOut()
    setUser(null)
    // Signing out makes this browser a guest again, so the server's record
    // becomes relevant again. Re-arm the one-shot peek rather than leaving the
    // session's stale (empty) view in place until a reload.
    peeked.current = false
  }, [])

  const access = useCallback(
    (route: string) => accessFor(route, !!user, usage),
    [user, usage],
  )

  /**
   * Spend one trial run.
   *
   * The local increment happens FIRST and unconditionally: it must not depend
   * on a network round trip, or a slow connection would hand out free runs and
   * an offline visitor would get unlimited ones. The server call then returns
   * its own record, which merges in and can only raise the count.
   */
  const spendTrial = useCallback((route: string) => {
    if (user) return
    setUsage((prev) => {
      const next = recordRun(route, prev)
      saveUsage(next)
      return next
    })
    void consumeRemote(route).then((r) => { if (r.kind === 'ok') absorb(r.usage) })
  }, [user, absorb])

  const value = useMemo(
    () => ({ user, loading, configured, signOut, access, spendTrial }),
    [user, loading, configured, signOut, access, spendTrial],
  )
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}
