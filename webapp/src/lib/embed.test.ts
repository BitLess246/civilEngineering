import { describe, it, expect } from 'vitest'
import { isEmbedSearch, isEmbedLocation, EMBED_ROUTE } from './embed'
import requireAuthSrc from '../components/RequireAuth.tsx?raw'
import appShellSrc from '../components/AppShell.tsx?raw'
import appSrc from '../App.tsx?raw'
import previewSrc from '../components/ModelSpacePreview.tsx?raw'

// ?embed=1 — the landing page's scaled-down Model Space iframe. Three
// components read the flag (AppShell, App, RequireAuth), so the parse lives in
// one helper, and the pieces that make the preview work are pinned here: the
// parse itself, the gate bypass INSIDE RequireAuth, and — the part that had no
// real evidence — that the bypass reaches ONLY the route built to be public.

describe('isEmbedSearch', () => {
  it('reads the preview iframe\'s address', () => {
    expect(isEmbedSearch('?embed=1')).toBe(true)
  })

  it('survives company on the query string', () => {
    expect(isEmbedSearch('?embed=1&frame=2')).toBe(true)
    expect(isEmbedSearch('?frame=2&embed=1')).toBe(true)
  })

  it('is false for the workbench address — no flag, no embed', () => {
    expect(isEmbedSearch('')).toBe(false)
    expect(isEmbedSearch('?')).toBe(false)
    expect(isEmbedSearch('?frame=2')).toBe(false)
  })

  it('requires the literal value 1', () => {
    expect(isEmbedSearch('?embed=0')).toBe(false)
    expect(isEmbedSearch('?embed=true')).toBe(false)
    expect(isEmbedSearch('?embed=')).toBe(false)
  })
})

describe('isEmbedLocation — the bypass is one door, not a skeleton key', () => {
  // `RequireAuth` returns its children outright on this predicate, before the
  // session check, before `gateRoute` and before `canRun` (whose ONLY
  // enforcement point in the app is that component). What makes that safe is
  // the lockdown in `EMBED` — inert shell, no persistence, viewport and
  // walkthrough only — and `EMBED` exists in ModelSpace.tsx alone. So the
  // predicate has to be false everywhere else, and "everywhere else" is read
  // off App.tsx rather than typed out, so a route added later is covered the
  // day it is added.
  const gatedRoutes = (() => {
    const out: string[] = []
    for (const chunk of appSrc.split('<Route ').slice(1)) {
      const m = /^path="([^"]+)"/.exec(chunk.trim())
      if (m && chunk.includes('RequireAuth')) out.push(m[1])
    }
    return out
  })()

  it('found the gated routes to check against', () => {
    // If the parse breaks, the sweep below passes vacuously — which is exactly
    // the shape of the test this replaces.
    expect(gatedRoutes.length).toBeGreaterThan(10)
    expect(gatedRoutes).toContain(EMBED_ROUTE)
    expect(gatedRoutes).toContain('/schedule')
  })

  it('opens the embed route', () => {
    expect(isEmbedLocation({ pathname: EMBED_ROUTE, search: '?embed=1' })).toBe(true)
    expect(isEmbedLocation({ pathname: EMBED_ROUTE, search: '?embed=1&frame=2' })).toBe(true)
  })

  it('opens NOTHING else, on every other route behind the gate', () => {
    const others = gatedRoutes.filter((r) => r !== EMBED_ROUTE)
    expect(others.length).toBeGreaterThan(10)
    for (const route of others)
      expect(isEmbedLocation({ pathname: route, search: '?embed=1' })).toBe(false)
  })

  it('still needs the flag on the embed route itself', () => {
    expect(isEmbedLocation({ pathname: EMBED_ROUTE, search: '' })).toBe(false)
    expect(isEmbedLocation({ pathname: EMBED_ROUTE, search: '?embed=0' })).toBe(false)
  })

  it('does not match a route that merely starts with the embed route', () => {
    // '/model-lite?embed=1' is a different page with no lockdown; prefix
    // matching here would hand it the same public door.
    expect(isEmbedLocation({ pathname: '/model-lite', search: '?embed=1' })).toBe(false)
    expect(isEmbedLocation({ pathname: '/model/sub', search: '?embed=1' })).toBe(false)
  })
})

describe('embed wiring', () => {
  // Source guards, in the style guestRoute.test.ts established: the repo has
  // no DOM test harness, and placement is the entire design here.

  it('RequireAuth steps aside for the embed BEFORE any session work', () => {
    // Ordering IS the bypass: after the `configured` check an unconfigured
    // deploy would mask it, and after `loading` the poster would flash
    // "Checking your session…" on every landing-page visit. The gate must
    // yield on the flag alone.
    const bypass = requireAuthSrc.indexOf('isEmbedLocation(loc)')
    const configured = requireAuthSrc.indexOf('if (!configured)')
    const loading = requireAuthSrc.indexOf('if (loading)')
    expect(bypass).toBeGreaterThan(-1)
    expect(configured).toBeGreaterThan(bypass)
    expect(loading).toBeGreaterThan(configured)
  })

  it('the gate asks the ROUTE-SCOPED question, never the search-only one', () => {
    // `isEmbedSearch` is true for '/schedule?embed=1'. Reaching for it here is
    // the original defect, so the narrower predicate is barred from the gate.
    expect(requireAuthSrc).not.toContain('isEmbedSearch')
  })

  it('the shell and the app root read the flag through the shared helper', () => {
    // A second spelling of "embed is on" is how the preview ends up
    // half-locked — shell inert but gate closed, or the reverse.
    expect(appShellSrc).toContain('isEmbedLocation({ pathname, search })')
    expect(appSrc).toContain('isEmbedLocation({ pathname, search })')
    expect(appSrc).not.toContain("get('embed')")
    expect(appShellSrc).not.toContain("get('embed')")
  })

  it('the preview iframe still carries the flag, on the route the flag is for', () => {
    expect(previewSrc).toContain(`src="${EMBED_ROUTE}?embed=1"`)
  })

  it('the workbench /model route stays behind the gate', () => {
    // The bypass is for the POSTER; the real workbench address must keep
    // RequireAuth, or the demo door becomes the front door.
    const model = appSrc.indexOf(`path="${EMBED_ROUTE}"`)
    expect(model).toBeGreaterThan(-1)
    const gate = appSrc.indexOf('<RequireAuth>', model)
    const close = appSrc.indexOf('</RequireAuth>', model)
    expect(gate).toBeGreaterThan(-1)
    expect(close).toBeGreaterThan(gate)
  })
})
