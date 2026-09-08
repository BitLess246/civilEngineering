/**
 * What the /signin, /signup and /forgot-password routes render, given the
 * session state.
 *
 * Those pages exist for people who are NOT signed in. Showing a sign-in form
 * to someone who already has a session misfires in both directions — it reads
 * as "your login did not take", and signing in again can quietly clobber the
 * session the visitor already had. components/GuestOnly.tsx consumes this.
 *
 * The branch order mirrors RequireAuth's, deliberately:
 *   - an unconfigured deployment renders the page — a missing env var must not
 *     brick a route, and there is no session to be signed in with anyway;
 *   - `loading` is waited out, because deciding on `signedIn: false` while the
 *     lookup is still running would bounce a signed-in visitor mid-refresh.
 */
export type GuestRouteView = 'children' | 'checking' | 'redirect-home'

export function guestRouteView(p: {
  configured: boolean
  loading: boolean
  signedIn: boolean
}): GuestRouteView {
  if (!p.configured) return 'children'
  if (p.loading) return 'checking'
  if (p.signedIn) return 'redirect-home'
  return 'children'
}
