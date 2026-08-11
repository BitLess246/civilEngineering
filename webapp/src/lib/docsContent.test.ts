import { describe, it, expect } from 'vitest'
import { DOC_TOOLS, DOC_ROUTE_ALIASES } from './docsContent'
import { DOC_GROUPS, countControls, matchesQuery } from './docsModel'

const APP_SRC = import.meta.glob('../App.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const app = Object.values(APP_SRC)[0]

/** Every `<Route path="…">` the router registers. */
const ROUTES = [...app.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== '*')

describe('docs — every routed tool is documented', () => {
  it('found the routes to check against', () => {
    expect(ROUTES.length).toBeGreaterThan(40)
    expect(ROUTES).toContain('/model')
    expect(ROUTES).toContain('/docs')
  })

  it('documents every route, directly or through a declared alias', () => {
    const byRoute = new Set(DOC_TOOLS.map((t) => t.route))
    const missing = ROUTES.filter((r) => !byRoute.has(r) && !(r in DOC_ROUTE_ALIASES))
    expect(missing, `undocumented routes — add them to docsContent*.ts: ${missing.join(', ')}`).toEqual([])
  })

  it('every alias points at a tool that exists', () => {
    const ids = new Set(DOC_TOOLS.map((t) => t.id))
    for (const [route, id] of Object.entries(DOC_ROUTE_ALIASES)) {
      expect(ids.has(id), `alias ${route} → ${id} has no such tool`).toBe(true)
    }
  })

  it('every documented route is one the router actually serves', () => {
    // catches a docs entry left behind after a page is removed or renamed
    const routes = new Set(ROUTES)
    for (const t of DOC_TOOLS) {
      expect(routes.has(t.route), `${t.id} documents ${t.route}, which the router does not serve`).toBe(true)
    }
  })
})

describe('docs — the catalogue is well formed', () => {
  it('has unique tool ids', () => {
    const ids = DOC_TOOLS.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has unique section ids within each tool', () => {
    for (const t of DOC_TOOLS) {
      const ids = t.sections.map((s) => s.id)
      expect(new Set(ids).size, `${t.id} has duplicate section ids`).toBe(ids.length)
    }
  })

  it('uses only declared groups', () => {
    for (const t of DOC_TOOLS) expect(DOC_GROUPS).toContain(t.group)
  })

  it('gives every tool a summary and at least one section', () => {
    for (const t of DOC_TOOLS) {
      expect(t.name.trim().length, `${t.id} name`).toBeGreaterThan(0)
      expect(t.summary.trim().length, `${t.id} summary`).toBeGreaterThan(20)
      expect(t.sections.length, `${t.id} sections`).toBeGreaterThan(0)
    }
  })

  it('gives every control a label and a real explanation', () => {
    for (const t of DOC_TOOLS) {
      for (const s of t.sections) {
        for (const c of s.controls ?? []) {
          expect(c.name.trim().length, `${t.id}/${s.id} control name`).toBeGreaterThan(0)
          // an explanation that is shorter than its own label is not an explanation
          expect(c.what.trim().length, `${t.id}/${s.id}/"${c.name}" is not explained`).toBeGreaterThan(25)
        }
      }
    }
  })

  it('gives every section either prose, controls or notes — never an empty shell', () => {
    for (const t of DOC_TOOLS) {
      for (const s of t.sections) {
        const filled = (s.body?.length ?? 0) > 0 || (s.controls?.length ?? 0) > 0 || (s.notes?.length ?? 0) > 0
        expect(filled, `${t.id}/${s.id} is empty`).toBe(true)
      }
    }
  })

  it('documents a substantial number of controls', () => {
    // a floor, so the page cannot be gutted without the suite noticing
    expect(countControls(DOC_TOOLS)).toBeGreaterThan(250)
  })
})

describe('docs — search', () => {
  it('matches on a control label', () => {
    const hits = DOC_TOOLS.filter((t) => matchesQuery(t, 'unbraced'))
    // "Unbraced Lb" is a beam input; since the split it is the beam page's
    // entry that owns it, not a combined "steel design" one.
    expect(hits.map((t) => t.id)).toContain('steel-beam')
  })

  it('requires every word to match', () => {
    expect(DOC_TOOLS.filter((t) => matchesQuery(t, 'punching shear')).length).toBeGreaterThan(0)
    expect(DOC_TOOLS.filter((t) => matchesQuery(t, 'punching zzzznotaword'))).toEqual([])
  })

  it('is case-insensitive and returns everything for an empty query', () => {
    expect(DOC_TOOLS.filter((t) => matchesQuery(t, 'PUNCHING')).length).toBeGreaterThan(0)
    expect(DOC_TOOLS.filter((t) => matchesQuery(t, '   ')).length).toBe(DOC_TOOLS.length)
  })

  it('finds a tool by its route', () => {
    expect(DOC_TOOLS.filter((t) => matchesQuery(t, '/retaining-wall')).map((t) => t.id))
      .toContain('retaining-wall')
  })
})
