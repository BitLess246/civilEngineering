import { describe, it, expect } from 'vitest'
import { SOILS_TOUR, TOUR_ANCHORS, stepAt, nextIndex, prevIndex, isLast } from './soilsTour'

// ─────────────────────────────────────────────────────────────────────────
// A walkthrough is the screen a STUCK user reaches for, so its failure mode
// matters more than most: a step pointing at an element that no longer exists
// leaves a dimmed page and a card describing a button nobody can see.
//
// Anchors are matched against the page SOURCE rather than a rendered DOM.
// That is deliberate — the anchors live on elements behind tab conditions and
// empty-state guards, so half of them are absent from any single render, and
// a render-based test would either pass vacuously or need the whole page
// driven through nine tabs to say something a grep says exactly.
// ─────────────────────────────────────────────────────────────────────────

// Read through Vite's `?raw` glob, as `trialQuota.test.ts` and
// `solverCoverage.test.ts` already do — `node:fs` is not in this tsconfig's
// types, and a test that only `vitest` can compile is a test `tsc -b` cannot
// defend.
const PAGE = Object.values(
  import.meta.glob('../pages/SoilInvestigation.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>,
)[0]

describe('every step points at something that exists', () => {
  it('has a data-tour attribute in the page for each anchor', () => {
    const missing = TOUR_ANCHORS.filter((a) => !PAGE.includes(`data-tour="${a}"`))
    expect(missing, `anchors with no element: ${missing.join(', ')}`).toEqual([])
  })

  it('does not leave an anchor in the page that no step uses', () => {
    // The other direction: a stale attribute is harmless but misleading to the
    // next person deciding whether it is safe to delete.
    const inPage = [...PAGE.matchAll(/data-tour="([^"]+)"/g)].map((m) => m[1])
    const orphans = inPage.filter((a) => !TOUR_ANCHORS.includes(a))
    expect(orphans, `anchors no step uses: ${orphans.join(', ')}`).toEqual([])
  })

  it('names only tabs the page actually has', () => {
    const tabs = new Set(SOILS_TOUR.map((s) => s.tab))
    for (const t of tabs) expect(PAGE, t).toContain(`tab === '${t}'`)
  })
})

describe('the walkthrough covers the order that trips people up', () => {
  it('reaches the sample step before the laboratory step', () => {
    // The whole reason the tour exists: tests are booked against a SAMPLE, and
    // the control for it is two tabs away from where a user looks for it.
    const sample = SOILS_TOUR.findIndex((s) => s.id === 'sample')
    const lab = SOILS_TOUR.findIndex((s) => s.id === 'lab')
    expect(sample).toBeGreaterThan(-1)
    expect(lab).toBeGreaterThan(sample)
  })

  it('walks the dependency order: borehole → layer → sample', () => {
    const at = (id: string) => SOILS_TOUR.findIndex((s) => s.id === id)
    expect(at('borehole')).toBeLessThan(at('layers'))
    expect(at('layers')).toBeLessThan(at('sample'))
  })

  it('gives every step a title and a body worth reading', () => {
    for (const s of SOILS_TOUR) {
      expect(s.title.length, s.id).toBeGreaterThan(8)
      expect(s.body.length, s.id).toBeGreaterThan(40)
    }
  })

  it('uses each step id once', () => {
    expect(new Set(SOILS_TOUR.map((s) => s.id)).size).toBe(SOILS_TOUR.length)
  })
})

describe('navigation stops at the ends rather than wrapping', () => {
  it('clamps forwards and backwards', () => {
    expect(prevIndex(0)).toBe(0)
    expect(nextIndex(SOILS_TOUR.length - 1)).toBe(SOILS_TOUR.length - 1)
    expect(nextIndex(0)).toBe(1)
    expect(prevIndex(3)).toBe(2)
  })

  it('reports the last step, so the button can read Done', () => {
    expect(isLast(SOILS_TOUR.length - 1)).toBe(true)
    expect(isLast(0)).toBe(false)
  })

  it('never returns undefined for an out-of-range index', () => {
    expect(stepAt(-5)).toBe(SOILS_TOUR[0])
    expect(stepAt(999)).toBe(SOILS_TOUR[SOILS_TOUR.length - 1])
  })
})
