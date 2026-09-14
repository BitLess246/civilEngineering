import { describe, it, expect } from 'vitest'
import { isEmbedSearch } from './embed'
import requireAuthSrc from '../components/RequireAuth.tsx?raw'
import appShellSrc from '../components/AppShell.tsx?raw'
import appSrc from '../App.tsx?raw'
import previewSrc from '../components/ModelSpacePreview.tsx?raw'

// ?embed=1 — the landing page's scaled-down Model Space iframe. Three
// components read the flag (AppShell, App, RequireAuth), so the parse lives in
// one helper, and the pieces that make the preview work are pinned here:
// the parse itself, the gate bypass INSIDE RequireAuth, and the fact that the
// workbench address without the flag keeps its gate.

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

describe('embed wiring', () => {
  // Source guards, in the style guestRoute.test.ts established: the repo has
  // no DOM test harness, and placement is the entire design here.

  it('RequireAuth steps aside for the embed BEFORE any session work', () => {
    // Ordering IS the bypass: after the `configured` check an unconfigured
    // deploy would mask it, and after `loading` the poster would flash
    // "Checking your session…" on every landing-page visit. The gate must
    // yield on the flag alone.
    const bypass = requireAuthSrc.indexOf('isEmbedSearch(loc.search)')
    const configured = requireAuthSrc.indexOf('if (!configured)')
    const loading = requireAuthSrc.indexOf('if (loading)')
    expect(bypass).toBeGreaterThan(-1)
    expect(configured).toBeGreaterThan(bypass)
    expect(loading).toBeGreaterThan(configured)
  })

  it('the shell and the app root read the flag through the shared helper', () => {
    // A second spelling of "embed is on" is how the preview ends up
    // half-locked — shell inert but gate closed, or the reverse.
    expect(appShellSrc).toContain('isEmbedSearch(search)')
    expect(appSrc).toContain('isEmbedSearch(search)')
    expect(appSrc).not.toContain("get('embed')")
    expect(appShellSrc).not.toContain("get('embed')")
  })

  it('the preview iframe still carries the flag', () => {
    expect(previewSrc).toContain('src="/model?embed=1"')
  })

  it('the workbench /model route stays behind the gate', () => {
    // The bypass is for the POSTER; the real workbench address must keep
    // RequireAuth, or the demo door becomes the front door.
    const model = appSrc.indexOf('path="/model"')
    expect(model).toBeGreaterThan(-1)
    const gate = appSrc.indexOf('<RequireAuth>', model)
    const close = appSrc.indexOf('</RequireAuth>', model)
    expect(gate).toBeGreaterThan(-1)
    expect(close).toBeGreaterThan(gate)
  })
})
