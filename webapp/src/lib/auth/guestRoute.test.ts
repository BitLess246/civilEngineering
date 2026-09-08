import { describe, it, expect } from 'vitest'
import { guestRouteView } from './guestRoute'
import appSrc from '../../App.tsx?raw'
import homeSrc from '../../pages/Home.tsx?raw'

// The auth pages (/signin, /signup, /forgot-password) exist for people without
// a session. This pins both halves of that: the decision itself, and the fact
// that the routes actually route through it.

describe('guestRouteView', () => {
  it('renders the page for a guest', () => {
    expect(guestRouteView({ configured: true, loading: false, signedIn: false }))
      .toBe('children')
  })

  it('sends a signed-in visitor home instead of showing the form again', () => {
    expect(guestRouteView({ configured: true, loading: false, signedIn: true }))
      .toBe('redirect-home')
  })

  it('waits out the session lookup — deciding on a not-yet-known session would bounce a signed-in visitor mid-refresh', () => {
    expect(guestRouteView({ configured: true, loading: true, signedIn: false }))
      .toBe('checking')
    expect(guestRouteView({ configured: true, loading: true, signedIn: true }))
      .toBe('checking')
  })

  it('renders the page when auth is not configured — no session can exist, and a missing env var must not brick the route', () => {
    expect(guestRouteView({ configured: false, loading: true, signedIn: true }))
      .toBe('children')
    expect(guestRouteView({ configured: false, loading: false, signedIn: false }))
      .toBe('children')
  })
})

describe('route wiring', () => {
  // Source guards, in the style ErrorBoundary.test.tsx established: the repo
  // has no DOM test harness, and placement is the entire design here.

  it('wraps the three guest-only auth routes in GuestOnly', () => {
    expect(appSrc).toContain('<Route path="/signin" element={<GuestOnly><SignIn /></GuestOnly>} />')
    expect(appSrc).toContain('<Route path="/signup" element={<GuestOnly><SignUp /></GuestOnly>} />')
    expect(appSrc).toContain('<Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />')
  })

  it('leaves /reset-password open — it is opened by following a fresh recovery link, which a signed-in session says nothing about', () => {
    expect(appSrc).toContain('<Route path="/reset-password" element={<ResetPassword />} />')
  })

  it('home no longer offers account creation unconditionally — the CTA band asks by session state', () => {
    expect(homeSrc).toMatch(/const \{ user, loading \} = useAuth\(\)/)
    expect(homeSrc).toContain('Open the workbench')
    // Still offered to the people it is for.
    expect(homeSrc).toContain('Create free account')
  })
})
