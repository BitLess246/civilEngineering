/**
 * Routes stay split.
 *
 * 62 of the 64 pages were STATIC imports, so a visitor who opened the landing
 * page to read the pitch downloaded all 53 calculators and their engines
 * first — a 2,428 kB entry chunk, 758 kB over the wire. Converting them to
 * `lazy()` took that to 543 kB / 160 kB.
 *
 * The regression is silent and one line wide: a page added with a plain
 * `import` works perfectly, and quietly puts itself back in the entry chunk.
 * Nothing in the build output says so unless someone is watching the number.
 */
import { describe, it, expect } from 'vitest'
import app from '../App.tsx?raw'

/**
 * Pages that load with the app, and why each is worth its bytes.
 *
 * Home is the first paint for most arrivals, so lazily loading it trades
 * entry-chunk size for a round trip on the one render that must not wait.
 * NotFound is the catch-all — a spinner on the way to telling someone their
 * URL is wrong is worse than the few kB.
 */
const EAGER = ['Home', 'NotFound']

const staticPageImports = (src: string) =>
  [...src.matchAll(/^import (\w+) from '\.\/pages\/[^']+'$/gm)].map((m) => m[1])

const lazyPages = (src: string) =>
  [...src.matchAll(/^const (\w+) = lazy\(\(\) => import\('\.\/pages\/[^']+'\)\)$/gm)].map((m) => m[1])

describe('the source actually loaded', () => {
  it('is App.tsx', () => {
    expect(app.length).toBeGreaterThan(4000)
    expect(app).toContain('<Routes>')
  })
})

describe('route-level code splitting', () => {
  it('imports no page statically beyond the two that earn it', () => {
    expect(staticPageImports(app).sort()).toEqual([...EAGER].sort())
  })

  it('keeps the rest lazy — and there are many of them', () => {
    // A count, so deleting the lazy block and leaving one page behind cannot
    // pass this file by satisfying only the assertion above.
    expect(lazyPages(app).length).toBeGreaterThanOrEqual(55)
  })

  it('gives them a Suspense boundary to resolve into', () => {
    // `lazy()` without a boundary above it throws at render rather than
    // showing a fallback, so the two belong in the same assertion.
    expect(app).toMatch(/<Suspense fallback=\{<RouteLoading \/>\}>/)
  })

  it('names the tool it is fetching rather than saying "Loading…"', () => {
    expect(app).toContain("routeName(pathname) ?? 'the page'")
  })

  it('keeps the auth gate OUTSIDE the lazy boundary', () => {
    // RequireAuth renders a redirect before its child mounts, so a signed-out
    // visitor never starts the import. Inverting the nesting would fetch the
    // chunk before the gate has an answer.
    for (const m of app.matchAll(/<Route path="([^"]+)" element=\{\s*<RequireAuth>/g)) {
      const after = app.slice(app.indexOf(m[0]) + m[0].length, app.indexOf(m[0]) + m[0].length + 400)
      expect(after.indexOf('</RequireAuth>'), m[1]).toBeGreaterThan(-1)
    }
    expect(app).not.toMatch(/<Suspense[^>]*>\s*<RequireAuth>/)
  })
})
