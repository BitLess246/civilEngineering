import { describe, it, expect } from 'vitest'
import { TOURS } from './tours'
import { anchorsOf, nextIndex, prevIndex, isLast, stepAt, tourLifecycle } from './tour'
import { SOILS_STEPS } from './soilsTour'
import { MODEL_STEPS } from './modelTour'
import { SCHEDULE_STEPS } from './scheduleTour'
import { DAILY_STEPS } from './scheduleDailyTour'

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

  it('model space still skips pushover and nonlinear', () => {
    // Those two are not steps on the way to a designed structure, and walking
    // a beginner through them is how a guide gets shut. MODAL is different and
    // is now included: its mode-shape animation is started by clicking a row
    // in a table that gives no sign of being clickable, so it is exactly the
    // kind of thing a walkthrough is for.
    const tabs = MODEL_STEPS.map((s) => s.tab)
    expect(tabs).not.toContain('pushover')
    expect(tabs).not.toContain('nonlinear')
    expect(tabs).toContain('modal')
  })

  it('model space visits modal between the analysis and the design', () => {
    // Modal needs a solved model and the design does not need modal, so it
    // belongs after `analyse` and before `design` — which is also its position
    // in the tab bar, keeping the tour walking forwards.
    const at = (id: string) => MODEL_STEPS.findIndex((s) => s.id === id)
    expect(at('analyse')).toBeLessThan(at('modal'))
    expect(at('modal')).toBeLessThan(at('design'))
  })
})

describe('the schedule grid walkthrough opens what it points at', () => {
  // Four of its steps describe controls that exist ONLY inside an expanded
  // activity. The tour drives that state through `tab`, so a step that talks
  // about the dependency editor without asking for the detail view would show
  // the overlay's "not on screen yet" notice instead of the thing it names —
  // on the page whose entire difficulty is that the controls are hidden.
  const NEEDS_DETAIL = ['detail', 'deps', 'cpm']

  it('asks for the detail view on every step inside the panel', () => {
    for (const id of NEEDS_DETAIL) {
      const step = SCHEDULE_STEPS.find((s) => s.id === id)
      expect(step, id).toBeDefined()
      expect(step!.tab, `${id} must open the detail panel`).toBe('detail')
    }
  })

  it('shows the row expander BEFORE the panel it opens', () => {
    // Otherwise the tour explains the contents of a panel before saying how to
    // open one, which is the exact thing users miss on this page.
    const at = (id: string) => SCHEDULE_STEPS.findIndex((s) => s.id === id)
    expect(at('group')).toBeLessThan(at('row'))
    expect(at('row')).toBeLessThan(at('detail'))
    expect(at('detail')).toBeLessThan(at('deps'))
  })

  it('covers the controls a schedule cannot be built without', () => {
    const ids = SCHEDULE_STEPS.map((s) => s.id)
    for (const need of ['add', 'grid', 'row', 'deps', 'cpm']) {
      expect(ids, `no step covers ${need}`).toContain(need)
    }
  })
})

describe('the daily walkthrough leads with the irreversible step', () => {
  it('puts capturing a baseline first', () => {
    // A baseline cannot be captured retroactively, so a user who reads about
    // the progress log first and the baseline last has already lost the
    // comparison the rest of the page is built on.
    expect(DAILY_STEPS[0].id).toBe('capture')
  })
})

describe('a guide that sets something up puts it back', () => {
  // Both planning guides seed data when there is nothing to point at — the
  // schedule grid loads the worked sample, the daily page captures a baseline
  // — and both undo it on close. `tourLifecycle` is what makes that safe, so
  // the rule is asserted as a SEQUENCE here and the pages only supply the
  // create/undo pair.
  //
  // The property that matters: after any sequence of opens and closes, the
  // number of set-ups equals the number of tear-downs. Anything else is either
  // litter left behind or a teardown firing against data the guide never made.
  const replay = (actions: ('start' | 'close')[]) => {
    let started = false
    let seeded = 0            // stands in for the sample project / baseline
    for (const a of actions) {
      const t = tourLifecycle(started, a)
      started = t.started
      if (t.fire === 'start') seeded++
      if (t.fire === 'end') seeded--
    }
    return { seeded, started }
  }

  it('leaves nothing behind once the guide is closed', () => {
    expect(replay(['start', 'close']).seeded).toBe(0)
    expect(replay(['start', 'close', 'start', 'close']).seeded).toBe(0)
  })

  it('does not seed twice when the guide is reopened mid-run', () => {
    // Clicking Guide again while it is open must not capture a second baseline
    // or load a second sample project.
    expect(replay(['start', 'start', 'start', 'close']).seeded).toBe(0)
    expect(replay(['start', 'start']).seeded).toBe(1)
  })

  it('never tears down when the guide seeded nothing', () => {
    // A stray Esc on a page the user opened themselves must not delete their
    // project or their baseline.
    expect(replay(['close']).seeded).toBe(0)
    expect(replay(['close', 'close']).seeded).toBe(0)
    expect(replay(['start', 'close', 'close']).seeded).toBe(0)
  })

  it('is still balanced while the guide is open', () => {
    // Mid-tour there is exactly one thing outstanding, which is what the
    // page's `seeded` ref holds.
    expect(replay(['start']).seeded).toBe(1)
    expect(replay(['start', 'close', 'start']).seeded).toBe(1)
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

describe('the demo-model lifecycle', () => {
  // `ModelSpace` hangs a demo grid off these transitions, so getting them
  // wrong loses the user's model rather than just showing a clumsy tour.
  // Replayed as a sequence, because the bugs are all about ORDER.
  const run = (actions: ('start' | 'close')[]) => {
    let started = false
    const fired: string[] = []
    for (const a of actions) {
      const t = tourLifecycle(started, a)
      started = t.started
      if (t.fire) fired.push(t.fire)
    }
    return fired
  }

  it('pairs one start with one end', () => {
    expect(run(['start', 'close'])).toEqual(['start', 'end'])
  })

  it('does not re-load the demo when the guide is reopened mid-tour', () => {
    expect(run(['start', 'start', 'start', 'close'])).toEqual(['start', 'end'])
  })

  it('never tears down a model the tour did not create', () => {
    // A close with no start — a stray Esc, or a close handler that fires twice
    // — must not reach `save(null)`.
    expect(run(['close'])).toEqual([])
    expect(run(['start', 'close', 'close'])).toEqual(['start', 'end'])
  })

  it('a second run of the guide sets up and tears down again', () => {
    expect(run(['start', 'close', 'start', 'close'])).toEqual(['start', 'end', 'start', 'end'])
  })

  it('leaves nothing owed at the end of any balanced sequence', () => {
    for (const seq of [['start', 'close'], ['start', 'start', 'close', 'close'], ['close', 'start', 'close']] as const) {
      const fired = run([...seq])
      expect(fired.filter((f) => f === 'start').length).toBe(fired.filter((f) => f === 'end').length)
    }
  })
})
