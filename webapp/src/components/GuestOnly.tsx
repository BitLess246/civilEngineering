import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '../lib/auth/authContext'
import { guestRouteView } from '../lib/auth/guestRoute'

/**
 * The inverse of RequireAuth, for the auth pages themselves.
 *
 * /signin, /signup and /forgot-password are for people without a session.
 * A signed-in visitor who lands on one — a stale bookmark, the back button
 * after signing in, an old email link — was shown the full form, which reads
 * as "your login did not take" and offers a second login that can clobber the
 * first. Wrapped in GuestOnly, they are sent home instead.
 *
 * `/reset-password` is deliberately NOT wrapped: it is opened by following a
 * fresh recovery link from an email, which is exactly the situation where a
 * still-signed-in session says nothing about what the visitor came to do. The
 * page validates its own token.
 *
 * The placeholder matches RequireAuth's — the same "checking" beat appears
 * wherever a route waits out the session lookup, so no route feels like it
 * loads slower than another.
 */
export function GuestOnly({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth()
  const view = guestRouteView({ configured, loading, signedIn: !!user })
  if (view === 'checking') {
    return (
      <div className="mx-auto max-w-md px-5 py-20 text-center text-sm text-slate-500">
        Checking your session…
      </div>
    )
  }
  if (view === 'redirect-home') return <Navigate to="/" replace />
  return <>{children}</>
}
