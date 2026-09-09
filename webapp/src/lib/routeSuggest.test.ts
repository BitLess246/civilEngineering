import { describe, it, expect } from 'vitest'
import { TOOL_CATEGORIES } from './tools'
import { PUBLIC_ROUTES } from './trialQuota'
import { nearestTools, pathScore } from './routeSuggest'

const ALL = TOOL_CATEGORIES.flatMap((c) => c.tools)

// ─────────────────────────────────────────────────────────────────────────
// A MISTYPED URL USED TO GIVE YOU A BLANK PAGE.
//
// The route table lives inside a `path="*"` wrapper that mounts the app
// shell, and the INNER table had no catch-all of its own — so any address
// matching no tool rendered the sidebar, the breadcrumb header and an empty
// content area, which reads as a broken app rather than a wrong address.
//
// There is no React renderer in this suite (`environment: 'node'`, no
// testing-library), so the wiring itself — `<Route path="*"
// element={<NotFound/>}/>` — is verified by reading the route table and by
// the production build. What is asserted here is everything that IS a pure
// function of data: the ranking the page shows, and the claim PUBLIC_ROUTES
// makes about which addresses exist.
// ─────────────────────────────────────────────────────────────────────────
describe('nearestTools — the "did you mean" behind the 404 page', () => {
  it('puts the intended page first for a plausible typo', () => {
    // one character wrong, and a second segment that exists nowhere
    expect(nearestTools('/beam-desgin', ALL)[0]?.to).toBe('/beam-design')
    expect(nearestTools('/column-desig', ALL)[0]?.to).toBe('/column-design')
  })

  it('finds the page behind a stale nested address', () => {
    // /steel/beam still exists; /steel/beams never did
    expect(nearestTools('/steel/beams', ALL).map((t) => t.to)).toContain('/steel/beam')
  })

  it('offers nothing rather than noise when the address resembles no tool', () => {
    expect(nearestTools('/wp-admin', ALL)).toEqual([])
    expect(nearestTools('/', ALL)).toEqual([])
  })

  it('never suggests the address the visitor is already on', () => {
    for (const t of ALL) {
      expect(nearestTools(t.to, ALL).map((x) => x.to)).not.toContain(t.to)
    }
  })

  it('caps the list, so a dead end never becomes a wall of links', () => {
    expect(nearestTools('/steel/beam-x', ALL).length).toBeLessThanOrEqual(4)
  })

  it('scores only on a real shared prefix, not a single letter', () => {
    // a lone matching character is coincidence, not a typo
    expect(pathScore('/beam-design', '/bxxx')).toBe(0)
    expect(pathScore('/beam-design', '/beam-x')).toBeGreaterThan(0)
  })
})

describe('the routes PUBLIC_ROUTES promises', () => {
  it('no longer lists a page that does not exist', () => {
    // '/about' sat here for a page that was never routed and is linked from
    // nowhere: a visitor who guessed the address got the blank shell AND was
    // told the route was freely readable.
    expect(PUBLIC_ROUTES).not.toContain('/about')
  })

  it('are each either a real tool or a known non-tool page', () => {
    const tools = new Set(ALL.map((t) => t.to))
    // Non-tool pages that legitimately have no catalogue entry.
    const known = new Set([
      '/', '/signin', '/signup', '/forgot-password', '/reset-password',
      '/terms', '/privacy', '/refunds', '/contact', '/profile',
      '/steel', '/geotech',
    ])
    for (const r of PUBLIC_ROUTES) {
      expect(tools.has(r) || known.has(r), `PUBLIC_ROUTES promises ${r}, which is neither a tool nor a known page`).toBe(true)
    }
  })
})
