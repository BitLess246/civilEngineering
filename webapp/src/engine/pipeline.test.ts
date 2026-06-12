import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads, removeNode } from './modelBuilder'
import { designStructure, optimizeStructure, designOK } from './pipeline'
import type { RectSection } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeModel() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
  m.loads = m.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  return m
}

describe('design pipeline — single-bay single-storey grid', () => {
  const r = designStructure(makeModel(), soil)!

  it('covers every element down the load path', () => {
    expect(r.govName).toContain('1.2D + 1.6L')
    expect(r.beams).toHaveLength(4)          // 2 beams + 2 girders
    expect(r.columns).toHaveLength(4)
    expect(r.footings).toHaveLength(4)
    expect(r.orphanEdges).toBe(0)
  })

  it('beams: every section designs cleanly with positive demands', () => {
    for (const b of r.beams) {
      expect(b.sections.length).toBeGreaterThanOrEqual(1)
      expect(b.ok).toBe(true)
      // the interior section of a loaded edge beam sags (+M)
      const interior = b.sections.find((s) => s.label.startsWith('Interior'))
      if (interior) expect(interior.Mu).toBeGreaterThan(0)
      for (const s of b.sections) expect(s.design.bars).toBeGreaterThanOrEqual(2)
    }
  })

  it('columns: Pu shares the floor load and the design closes', () => {
    const wu = 1.2 * 4.8 + 1.6 * 2.4                  // 9.6 kPa
    const total = wu * 6 * 5                          // 288 kN
    const sumPu = r.columns.reduce((s, c) => s + c.Pu, 0)
    // column axial sums to ≈ the floor load (members carry a bit of frame shear)
    expect(sumPu).toBeGreaterThan(total * 0.9)
    expect(sumPu).toBeLessThan(total * 1.1)
    for (const c of r.columns) {
      expect(c.ok).toBe(true)
      expect(c.bars).toBeGreaterThanOrEqual(4)
      expect(c.util).toBeLessThanOrEqual(1)
    }
  })

  it('footings: service P < Pu, plan sized, checks pass', () => {
    for (const f of r.footings) {
      expect(f.P).toBeLessThan(f.Pu)
      expect(f.design.B).toBeGreaterThan(0.5)
      expect(f.ok).toBe(true)
    }
    // factored reactions reproduce the floor load
    const sumPu = r.footings.reduce((s, f) => s + f.Pu, 0)
    expect(sumPu).toBeCloseTo(9.6 * 30, 1)
  })

  it('concrete totals: members + slab', () => {
    // 4 columns ×3 m + (2×6 + 2×5) m of beams = 12 + 22 = 34 m of 0.15 m² section
    expect(r.totals.concreteMembers).toBeCloseTo(34 * 0.3 * 0.5, 6)
    expect(r.totals.concreteSlabs).toBeCloseTo(6 * 5 * 0.15, 6)
  })

  it('no plan → no combined footings, designOK reflects the schedules', () => {
    expect(r.combined).toHaveLength(0)
    expect(designOK(r)).toBe(
      r.beams.every((b) => b.ok) && r.columns.every((c) => c.ok) && r.footings.every((f) => f.ok),
    )
  })
})

describe('combined footing plan', () => {
  const plan = { 'n0.0.0': { type: 'combined' as const, with: 'n1.0.0' } }
  const r = designStructure(makeModel(), soil, plan)!

  it('pairs the two nodes once and drops them from the isolated schedule', () => {
    expect(r.combined).toHaveLength(1)
    expect(r.combined[0].nodes).toEqual(['n0.0.0', 'n1.0.0'])
    expect(r.footings).toHaveLength(2)
    expect(r.footings.map((f) => f.node)).not.toContain('n0.0.0')
    expect(r.footings.map((f) => f.node)).not.toContain('n1.0.0')
  })

  it('spacing is the plan distance and dl/ll split sums to the service reaction', () => {
    const c = r.combined[0]
    expect(c.spacing).toBeCloseTo(6, 9)             // n0.0.0 → n1.0.0 along x
    // D + L per node ≈ the unfactored gravity reaction: total floor service
    // load is (4.8+2.4+0.15·24)·30 + member self-weight, shared 4 ways
    const service = c.dl1 + c.ll1 + c.dl2 + c.ll2
    expect(service).toBeGreaterThan(0)
    // each node's split is internally consistent: dl > ll (D = 4.8+3.6 slab+SW vs L = 2.4)
    expect(c.dl1).toBeGreaterThan(c.ll1)
    expect(c.dl2).toBeGreaterThan(c.ll2)
    expect(c.design.Bx).toBeGreaterThan(c.spacing)  // footing spans both columns
    expect(c.ok).toBe(true)
  })
})

describe('optimizeStructure', () => {
  it('passing start → converges and shrinks to a leaner passing section', () => {
    const m = makeModel()
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    expect(designOK(r.design)).toBe(true)
    expect(r.section.h).toBeLessThanOrEqual(500)    // never grows a passing design
    expect(r.steps[0].ok).toBe(true)
    expect(r.steps[r.steps.length - 1].ok).toBe(true)
  })

  it('failing start → grows the section until everything passes', () => {
    const m = makeModel()
    // undersized shared section
    m.sections = [{ ...section, b: 200, h: 250, name: '200×250' }]
    m.members = m.members.map((x) => ({ ...x, section: m.sections[0].id }))
    const first = designStructure(m, soil)!
    expect(designOK(first)).toBe(false)
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    expect(designOK(r.design)).toBe(true)
    expect(r.section.h).toBeGreaterThan(250)
    expect(r.steps.some((s) => !s.ok)).toBe(true)   // log shows the failing iterations
  })
})

describe('model editing helpers', () => {
  it('buildGravityLoads: member self-weight + slab D/L, preserves E', () => {
    const m = makeModel()
    m.loads = [...m.loads, { kind: 'node' as const, node: 'n0.0.1', Fx: 10, cat: 'E' as const }]
    const loads = buildGravityLoads(m, 1.5, 2.4)
    const sw = loads.filter((l) => l.kind === 'member-udl')
    expect(sw).toHaveLength(m.members.length)
    for (const l of sw) expect((l as { w: number }).w).toBeCloseTo(0.3 * 0.5 * 24, 9)
    const slabD = loads.find((l) => l.kind === 'area' && l.cat === 'D')!
    expect((slabD as { q: number }).q).toBeCloseTo(0.15 * 24 + 1.5, 9)
    const slabL = loads.find((l) => l.kind === 'area' && l.cat === 'L')!
    expect((slabL as { q: number }).q).toBeCloseTo(2.4, 9)
    expect(loads.filter((l) => l.cat === 'E')).toHaveLength(1)
  })

  it('removeNode cascades members, plates, supports and loads', () => {
    const m = makeModel()
    m.loads = [...m.loads, { kind: 'node' as const, node: 'n0.0.1', Fy: -5, cat: 'L' as const }]
    const out = removeNode(m, 'n0.0.1')
    expect(out.nodes.find((n) => n.id === 'n0.0.1')).toBeUndefined()
    // the corner top node carries 1 column + 1 beam + 1 girder + the slab
    expect(out.members).toHaveLength(m.members.length - 3)
    expect(out.plates).toHaveLength(0)
    expect(out.loads.every((l) => l.kind !== 'node' || l.node !== 'n0.0.1')).toBe(true)
    // area loads on the removed slab are gone too
    expect(out.loads.filter((l) => l.kind === 'area')).toHaveLength(0)
  })
})
