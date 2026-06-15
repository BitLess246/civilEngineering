import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads, removeNode, enforceSectionHierarchy, refreshSelfWeight, splitSharedSections } from './modelBuilder'
import { designStructure, optimizeStructure, designOK, type LateralCase } from './pipeline'
import { computeSeismic } from './seismic'
import type { RectSection, ModelLoad } from './model'

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

// big +X seismic case so the lateral system is exercised
function seismicXcase(m: ReturnType<typeof makeModel>): LateralCase {
  const base = computeSeismic(m, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!.loads
  return {
    name: 'E+X', kind: 'E',
    loads: base.map((l) => ({ kind: 'node', node: (l as { node: string }).node, Fx: Math.abs((l as { Fx?: number }).Fx ?? 0) * 40, cat: 'E' })),
  }
}

describe('shear-wall schedule (in-plane shear from struts)', () => {
  it('designs a tagged shear wall and Vu stays within the applied story shear', () => {
    const m = makeModel()
    m.walls = [{ id: 'w0', member: 'bx0.0.1', height: 3, thickness: 200, shearWall: true }]
    const eX = seismicXcase(m)
    const r = designStructure(m, soil, {}, { lateral: [eX] })!
    expect(r.walls).toHaveLength(1)
    const w = r.walls[0]
    const totalE = eX.loads.reduce((s, l) => s + Math.abs((l as { Fx?: number }).Fx ?? 0), 0)
    expect(w.Vu).toBeGreaterThan(0)
    expect(w.Vu).toBeLessThanOrEqual(totalE + 1e-6)   // a single wall can't exceed the story shear
    expect(w.design.horiz.rho).toBeGreaterThanOrEqual(0.0025)
    expect(typeof w.design.shearOK).toBe('boolean')
  })

  it('a non-shear wall produces no wall-design row', () => {
    const m = makeModel()
    m.walls = [{ id: 'w0', member: 'bx0.0.1', height: 3, thickness: 200, shearWall: false }]
    const r = designStructure(m, soil)!
    expect(r.walls).toHaveLength(0)
  })
})

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

describe('beam critical sections — interior is the sagging peak', () => {
  it('a continuous multi-bay frame still sags at mid-span (not all hogging)', () => {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section })
    m.loads = buildGravityLoads(m, 1.5, 2.4)
    const r = designStructure(m, soil)!
    const withInterior = r.beams.filter((b) => b.sections.some((s) => s.label.startsWith('Interior')))
    expect(withInterior.length).toBeGreaterThan(0)
    for (const b of withInterior) {
      const interior = b.sections.find((s) => s.label.startsWith('Interior'))!
      expect(interior.Mu).toBeGreaterThan(0)     // sagging (+M), bottom steel
      expect(interior.hogging).toBe(false)
      const ends = b.sections.filter((s) => s.label.startsWith('End'))
      expect(ends.some((s) => s.hogging)).toBe(true)   // ends still hog
    }
    // governing-case diagrams are carried for the worked solution
    expect(r.beams.every((b) => b.diag && b.diag.xs.length > 2)).toBe(true)
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

describe('directional lateral load cases (STAAD-style envelope)', () => {
  // four seismic directions, scaled large so lateral governs the columns
  const dirCases = (): LateralCase[] => {
    const m = makeModel()
    const base = computeSeismic(m, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!.loads
    const mag = (l: ModelLoad) => Math.abs((l as { Fx?: number }).Fx ?? 0) * 40
    const mk = (name: string, axis: 'Fx' | 'Fz', sign: number): LateralCase => ({
      name, kind: 'E',
      loads: base.map((l) => ({ kind: 'node', node: (l as { node: string }).node, [axis]: sign * mag(l), cat: 'E' })),
    })
    return [mk('E+X', 'Fx', 1), mk('E-X', 'Fx', -1), mk('E+Z', 'Fz', 1), mk('E-Z', 'Fz', -1)]
  }

  it('expands the two E-combos over four directions (13 runs) and envelopes per member', () => {
    const r = designStructure(makeModel(), soil, {}, { lateral: dirCases() })!
    // 7 combos: 2 with E → ×4 = 8; 3 with W (no W cases) → 3; 2 gravity → 2  = 13
    expect(r.cases).toHaveLength(13)
    expect(r.cases.some((c) => c.includes('E+X'))).toBe(true)
    expect(r.cases.some((c) => c.includes('E-Z'))).toBe(true)
    // a column is governed by a seismic direction, recorded on the row
    expect(r.columns.some((c) => /E[+-][XZ]/.test(c.gov ?? ''))).toBe(true)
  })

  it('gravity-only model still runs exactly the 7 NSCP combinations', () => {
    const r = designStructure(makeModel(), soil)!
    expect(r.cases).toHaveLength(7)
    expect(r.beams.every((b) => (b.gov ?? '').length > 0)).toBe(true)
  })
})

describe('optimizeStructure', () => {
  it('passing start → converges and never grows a passing design', () => {
    const m = makeModel()
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    expect(designOK(r.design)).toBe(true)
    expect(r.model.sections.every((s) => s.h <= 500)).toBe(true)
    expect(r.steps[0].ok).toBe(true)
    expect(r.steps[r.steps.length - 1].ok).toBe(true)
  })

  it('failing start → grows the sections until everything passes', () => {
    const m = makeModel()
    // shrink every member section to an undersized start
    m.sections = m.sections.map((s) => ({ ...s, b: 200, h: 250, name: '200×250' }))
    const first = designStructure(m, soil)!
    expect(designOK(first)).toBe(false)
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    expect(designOK(r.design)).toBe(true)
    expect(r.model.sections.some((s) => s.h > 250 || s.b > 200)).toBe(true)
    expect(r.steps.some((s) => !s.ok)).toBe(true)   // log shows the failing iterations
  })

  it('grows only the failing members, leaving the others alone', () => {
    const m = makeModel()
    // undersize ONLY the beams; columns & girders stay 300×500
    const beamSecs = new Set(m.members.filter((x) => x.role === 'beam').map((x) => x.section))
    m.sections = m.sections.map((s) => (beamSecs.has(s.id) ? { ...s, b: 200, h: 250, name: '200×250' } : s))
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    // the column was never GROWN by the beam failures (width/height ≤ start);
    // shrink may trim it, but beam failures must not enlarge it.
    const col = r.model.sections.find((s) => s.id === m.members.find((x) => x.role === 'column')!.section)!
    expect(col.b).toBe(300)
    expect(col.h).toBeLessThanOrEqual(500)
    expect(designOK(r.design)).toBe(true)
  })
})

describe('self-weight refresh', () => {
  it('recomputes member-udl D from the current section, keeping other loads', () => {
    const m = makeModel()                       // area D/L only (no member SW yet)
    expect(refreshSelfWeight(m)).toBe(m)        // no-op when there is no member SW
    const withSW = { ...m, loads: buildGravityLoads(m, 1.5, 2.4) }
    // grow every section and refresh — self-weight must scale with b·h
    const big = { ...withSW, sections: withSW.sections.map((s) => ({ ...s, b: 600, h: 800 })) }
    const r = refreshSelfWeight(big)
    const sw = r.loads.filter((l) => l.kind === 'member-udl' && l.cat === 'D')
    expect(sw.length).toBe(m.members.length)
    for (const l of sw) expect((l as { w: number }).w).toBeCloseTo(0.6 * 0.8 * 24, 9)
    // area + live loads survive untouched
    expect(r.loads.filter((l) => l.kind === 'area').length)
      .toBe(withSW.loads.filter((l) => l.kind === 'area').length)
  })
})

describe('splitSharedSections (pre-per-member migration)', () => {
  it('gives every member its own section cloned from the shared one', () => {
    // emulate an old model: one section shared by all members
    const m = makeModel()
    const shared = { ...section, id: 'S1', name: '300×500' }
    const old = { ...m, sections: [shared], members: m.members.map((x) => ({ ...x, section: 'S1' })) }
    const split = splitSharedSections(old)
    expect(split.sections.length).toBe(old.members.length)
    expect(split.members.every((x) => x.section === x.id)).toBe(true)
    // dimensions preserved from the shared section
    expect(split.sections.every((s) => s.b === 300 && s.h === 500)).toBe(true)
    // now optimisation can move members independently
    expect(splitSharedSections(split)).toBe(split)   // idempotent
  })
})

describe('strong column–weak beam hierarchy', () => {
  it('bumps widths so column ≥ girder ≥ beam at every shared node', () => {
    // start with a girder WIDER than the column (violates the hierarchy)
    const m = generateGridModel({
      baysX: [6], baysZ: [5], storeyH: [3],
      column: { ...section, b: 300, h: 300, name: '300×300' },
      girder: { ...section, b: 350, h: 500, name: '350×500' },
      beam: { ...section, b: 250, h: 450, name: '250×450' },
    })
    const e = enforceSectionHierarchy(m)
    const secOf = (id: string) => e.sections.find((s) => s.id === id)!
    for (const col of e.members.filter((x) => x.role === 'column')) {
      const cb = secOf(col.section).b
      const conn = e.members.filter((x) =>
        (x.role === 'girder' || x.role === 'beam') && (x.i === col.i || x.j === col.i || x.i === col.j || x.j === col.j))
      for (const x of conn) expect(cb).toBeGreaterThanOrEqual(secOf(x.section).b)
    }
    // a column picked up the 350 girder width and stayed square-or-taller
    const anyCol = secOf(e.members.find((x) => x.role === 'column')!.section)
    expect(anyCol.b).toBeGreaterThanOrEqual(350)
    expect(anyCol.h).toBeGreaterThanOrEqual(anyCol.b)
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
