// The component that runs when everything else has already failed.
//
// This project runs vitest with `environment: 'node'` and has no DOM testing
// library — 4085 tests and not one of them renders. Adding jsdom and
// @testing-library just for this file would change the testing story for the
// whole repo, which is not a call this fix gets to make. So the parts that can
// be pinned without a DOM are pinned here, and the part that cannot — does the
// boundary actually catch a throw and keep the sidebar — was verified by
// driving the real app in a browser (see the PR).
//
// What IS testable without a DOM turns out to be the contract that matters:
// the static reducer React calls, and the fact that the boundary is mounted in
// the one place it has to be.

import { describe, it, expect } from 'vitest'
import appShellSrc from './AppShell.tsx?raw'
import errorBoundarySrc from './ErrorBoundary.tsx?raw'
import { ErrorBoundary } from './ErrorBoundary'

describe('getDerivedStateFromError', () => {
  it('captures the error, which is what moves the boundary into its fallback', () => {
    const e = new Error('boom')
    expect(ErrorBoundary.getDerivedStateFromError(e)).toEqual({ error: e })
  })

  it('is a static, so React can call it during the render phase', () => {
    // An instance method here would never fire — React invokes this one on the
    // class, before any instance exists for the failed subtree.
    expect(typeof ErrorBoundary.getDerivedStateFromError).toBe('function')
    expect(Object.getOwnPropertyNames(ErrorBoundary)).toContain('getDerivedStateFromError')
  })
})

describe('where the boundary is mounted', () => {
  // A source guard, in the style `tours.test.ts` already uses. Placement is the
  // entire design here: too high and the fallback takes the navigation down
  // with it, too low and it needs fifty copies.

  it('is inside AppShell, wrapping the routed content', () => {
    expect(appShellSrc).toMatch(/<ErrorBoundary[^>]*>\s*<TrialGate>/)
  })

  it('sits INSIDE the shell chrome, so the fallback keeps the sidebar', () => {
    // If the boundary ever moves above <SidebarNav> or the <header>, a render
    // failure blanks the navigation too and the user has no way out — which is
    // exactly the bug this replaced.
    const boundaryAt = appShellSrc.indexOf('<ErrorBoundary')
    const headerAt = appShellSrc.indexOf('<header')
    expect(headerAt).toBeGreaterThanOrEqual(0)
    expect(boundaryAt).toBeGreaterThan(headerAt)
  })

  it('is keyed on the location, so navigating away clears a broken page', () => {
    // Without the key, one throw leaves the content area broken for the rest of
    // the session even after the user navigates somewhere healthy.
    expect(appShellSrc).toMatch(/<ErrorBoundary key=\{pathname\}>/)
  })
})

describe('what the fallback offers', () => {
  it('gives the user both a retry and a way off the page', () => {
    expect(errorBoundarySrc).toMatch(/Try again/)
    expect(errorBoundarySrc).toMatch(/<Link to="\/"/)
  })

  it('says the saved work is intact', () => {
    // True — the stores are separate from the screen that failed — and the
    // first assumption on hitting a broken page is that data was lost.
    expect(errorBoundarySrc).toMatch(/saved work is not affected/)
  })

  it('renders the message but never the stack', () => {
    // A stack trace in the UI reads as a crash report the user is expected to
    // act on. It goes to the console, where someone can use it.
    expect(errorBoundarySrc).toMatch(/\{error\.message\}/)
    expect(errorBoundarySrc).not.toMatch(/\{error\.stack\}/)
    expect(errorBoundarySrc).toMatch(/console\.error\('render failed:'/)
  })
})
