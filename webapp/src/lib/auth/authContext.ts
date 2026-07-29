import { createContext, useContext } from 'react'
import type { AuthUser } from './authClient'
import { canRun, type AccessVerdict } from '../trialQuota'

export interface AuthState {
  user: AuthUser | null
  /** True until the initial session lookup finishes — do not gate on `user` before this clears. */
  loading: boolean
  configured: boolean
  signOut: () => Promise<void>
  /** What the visitor may do on a route, given their session and trials used. */
  access: (route: string) => AccessVerdict
  /** Count a run against the guest allowance. No-op for members. */
  useTrial: (route: string) => void
}

/** Split from the provider component so the file exporting hooks exports no
 *  components — the repo's fast-refresh lint rule, and a sane boundary anyway. */
export const AuthCtx = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const v = useContext(AuthCtx)
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>')
  return v
}

/** Convenience: may the visitor run a calculation on this route right now? */
export function useCanRun(route: string): { allowed: boolean; verdict: AccessVerdict } {
  const { access } = useAuth()
  const verdict = access(route)
  return { allowed: canRun(verdict), verdict }
}
