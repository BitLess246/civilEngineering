import { describe, it, expect } from 'vitest'
import { TOURS } from './tours'
import { anchorsOf, nextIndex, prevIndex, isLast, stepAt } from './tour'
import { SOILS_STEPS } from './soilsTour'
import { MODEL_STEPS } from './modelTour'

// ─────────────────────────────────────────────────────────────────────────
// A walkthrough is the screen a STUCK user reaches for, so its failure mode
// matters more than most: a step pointing at an element that no longer exists
// leaves a dimmed page and a card describing a button nobody can see.
//
// Anchors are matched against the page SOURCE rather than a rendered DOM.
// That is deliberate — anchors live behind tab conditions and empty-state
// guards, so no single render contains more than a few of them, and a
// render-based test would either pass vacuously or need every page driven
// through all its tabs to say what a grep says exactly.
// ─────────────────────────────────────────────────────────────────────────

const SRC = import.meta.glob('../pages/*.tsx', {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>

// `./*Tour.ts` also matches `useTour.ts`, which is the hook rather than a
// tour — filtered by name so adding a real tour still trips the count.
const TOUR_MODULES = Object.fromEntries(
  Object.entries(import.meta.glob('./*Tour.ts', { eager: true }) as Record<string, unknown>)
    .filter(([path]) => !path.endsWith('/useTour.ts')),
)

const pageSource = (page: string): string => {
  const hit = Object.entries(SRC).find(([path]) => path.endsWith(page.replace(/^pages\//, '')))
  if (!hit) throw new Error(`no page source for ${page}`)
  return hit[1]
}

describe.each(TOURS.map((t) => [t.id, t] as const))('the %s walkthrough', (_id, tour) => {
  const page = pageSource(tour.page)

  it('points every step at an element that exists', () => {
    const missing = anchorsOf(tour.steps).filter((a) => !page.includes(`data-tour="${a}"`))
    expect(missing, `anchors with no element: ${missing.join(', ')}`).toEqual([])
  })

  it('leaves no anchor in the page that no step uses', () => {
    // The other direction: a stale attribute is harmless but misleading to the
    // next person deciding whether it is safe to delete.
    const used = anchorsOf(tour.steps)
    const orphans = [...page.matchAll(/data-tour="([^"]+)"/g)]
      .map((m) => m[1]).filter((a) => !used.includes(a))
    expect(orphans, `anchors no step uses: ${orphans.join(', ')}`).toEqual([])
  })

  it('names only tabs the page actually has', () => {
    for (const s of tour.steps) {
      if (s.tab) expect(page, `${s.id} → ${s.tab}`).toContain(`tab === '${s.tab}'`)
    }
  })

  it('gives every step a unique id, a title and a body worth reading', () => {
    expect(new Set(tour.steps.map((s) => s.id)).size).toBe(tour.steps.length)
    for (const s of tour.steps) {
      expect(s.title.length, s.id).toBeGreaterThan(8)
      expect(s.body.length, s.id).toBeGreaterThan(40)
    }
  })

  it('walks its tabs in the page’s own tab order, never backwards', () => {
    // A tour that jumps back to an earlier tab teaches the wrong mental model
    // of a page whose whole difficulty IS the order.
    const order = [...page.matchAll(/tab === '([a-z-]+)'/g)].map((m) => m[1])
    const seen = tour.steps.map((s) => s.tab).filter((t): t is string => Boolean(t))
      .map((t) => order.indexOf(t))
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i], `${tour.steps[i].id} goes back a tab`).toBeGreaterThanOrEqual(seen[i - 1])
    }
  })
})

describe('the registry', () => {
  it('lists every tour module in lib/, so none escapes the anchor check', () => {
    const registered = new Set(TOURS.map((t) => t.id))
    const declared = Object.values(TOURS).length
    expect(Object.keys(TOUR_MODULES).length).toBe(declared)
    expect(registered.size).toBe(declared)
  })

  it('gives each tour a distinct id and page', () => {
    expect(new Set(TOURS.map((t) => t.id)).size).toBe(TOURS.length)
    expect(new Set(TOURS.map((t) => t.page)).size).toBe(TOURS.length)
  })
})

describe('the sequences that trip people up', () => {
  it('soils reaches the sample step before the laboratory step', () => {
    const at = (id: string) => SOILS_STEPS.findIndex((s) => s.id === id)
    expect(at('borehole')).toBeLessThan(at('layers'))
    expect(at('layers')).toBeLessThan(at('sample'))
    expect(at('sample')).toBeLessThan(at('lab'))
  })

  it('model space puts supports before analysis, and analysis before design', () => {
    // The two stalls the tour exists for: no supports means a singular
    // stiffness matrix, and the design pipeline has nothing to consume until
    // an analysis has run.
    const at = (id: string) => MODEL_STEPS.findIndex((s) => s.id === id)
    expect(at('supports')).toBeLessThan(at('analyse'))
    expect(at('analyse')).toBeLessThan(at('design'))
  })

  it('model space skips the advanced analyses', () => {
    // Modal, pushover and nonlinear are not steps on the way to a designed
    // structure, and walking a beginner through them is how a guide gets shut.
    const tabs = MODEL_STEPS.map((s) => s.tab)
    expect(tabs).not.toContain('modal')
    expect(tabs).not.toContain('pushover')
    expect(tabs).not.toContain('nonlinear')
  })
})

describe('navigation stops at the ends rather than wrapping', () => {
  it('clamps forwards and backwards', () => {
    expect(prevIndex(0)).toBe(0)
    expect(nextIndex(4, 5)).toBe(4)
    expect(nextIndex(0, 5)).toBe(1)
    expect(prevIndex(3)).toBe(2)
  })

  it('reports the last step, so the button can read Done', () => {
    expect(isLast(4, 5)).toBe(true)
    expect(isLast(0, 5)).toBe(false)
  })

  it('never returns undefined for an out-of-range index', () => {
    expect(stepAt(SOILS_STEPS, -5)).toBe(SOILS_STEPS[0])
    expect(stepAt(SOILS_STEPS, 999)).toBe(SOILS_STEPS[SOILS_STEPS.length - 1])
  })
})
