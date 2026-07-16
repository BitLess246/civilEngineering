import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads, removeNode, enforceSectionHierarchy, refreshSelfWeight, splitSharedSections, barContinuityGroups } from './modelBuilder'
import { designStructure, optimizeStructure, selectBarDiameters, designOK, withEv, RC_LIMITS, type LateralCase } from './pipeline'
import { nextHeavierW } from './aiscSections'
import { computeSeismic } from './seismic'
import { nscpCombos } from './beamAnalysis'
import { validateMesh } from './meshValidation'
import type { RectSection, ModelLoad } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeModel() {
  // 200-mm slabs: the 6×5 m panel satisfies §424.2 deflection (150 mm does not,
  // now that slab serviceability gates designOK).
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200 })
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
    expect(r.totals.concreteSlabs).toBeCloseTo(6 * 5 * 0.20, 6)
  })

  it('no plan → no combined footings, designOK reflects the schedules', () => {
    expect(r.combined).toHaveLength(0)
    expect(designOK(r)).toBe(
      r.beams.every((b) => b.ok) && r.columns.every((c) => c.ok) && r.footings.every((f) => f.ok),
    )
  })

  it('P-Δ non-convergence gates designOK (fail-loud, never silently designed)', () => {
    expect(r.pDeltaIssues).toEqual([])   // first-order runs carry no P-Δ status
    expect(designOK({ ...r, pDeltaIssues: ['1.2D+1.6L+E(+X)'] })).toBe(false)
  })
})

describe('steel design pipeline (AISC routing + base plates)', () => {
  // all members steel: W310x79 (a stocky W that passes a single-bay grid)
  function steelModel() {
    const m = makeModel()
    m.sections = m.sections.map((s) => ({ ...s, material: 'steel' as const, shape: 'W310x79', steelFy: 345, steelFu: 448 }))
    return m
  }
  const r = designStructure(steelModel(), soil)!

  it('routes members to the steel schedules, not the concrete ones', () => {
    expect(r.beams).toHaveLength(0)
    expect(r.columns).toHaveLength(0)
    expect(r.steelBeams).toHaveLength(4)     // 2 beams + 2 girders
    expect(r.steelColumns).toHaveLength(4)
  })

  it('steel beams carry φMn/φVn and an LTB zone', () => {
    for (const b of r.steelBeams) {
      expect(b.shape).toBe('W310x79')
      expect(b.phiMn).toBeGreaterThan(0)
      expect(b.phiVn).toBeGreaterThan(0)
      expect(['plastic', 'inelastic', 'elastic']).toContain(b.ltbZone)
      expect(b.Mu).toBeGreaterThan(0)
    }
  })

  it('steel beam rows include §L2 serviceability deflection check', () => {
    for (const b of r.steelBeams) {
      expect(b.defl).toBeGreaterThanOrEqual(0)
      expect(b.deflLim).toBeCloseTo(b.L * 1000 / 240, 4)
      expect(typeof b.deflOK).toBe('boolean')
    }
  })

  it('steel beam deflection matches 5·Mu·L²/(48·E·Ix) formula (SS bound)', () => {
    const E = 200000  // N/mm²
    for (const b of r.steelBeams) {
      const L_mm = b.L * 1000
      const expected = (5 * b.Mu * 1e6 * L_mm ** 2) / (48 * E * b.Ix)
      expect(b.defl).toBeCloseTo(expected, 4)
    }
  })

  it('steel columns use §H1-1 combined interaction', () => {
    for (const c of r.steelColumns) {
      expect(c.phiPn).toBeGreaterThan(0)
      expect(['H1-1a', 'H1-1b']).toContain(c.equation)
      expect(c.Pu).toBeGreaterThan(0)
      expect(c.ratio).toBeGreaterThan(0)
    }
  })

  it('designs a base plate under every steel column support', () => {
    expect(r.basePlates).toHaveLength(4)
    for (const p of r.basePlates) {
      expect(p.shape).toBe('W310x79')
      expect(p.Pu).toBeGreaterThan(0)
      expect(p.design.N).toBeGreaterThanOrEqual(306)   // ≥ column depth
      expect(p.tAdopt).toBeGreaterThanOrEqual(p.design.tReq)
    }
  })

  it('reports steel tonnage and no concrete member volume', () => {
    expect(r.totals.steelKg).toBeGreaterThan(0)
    expect(r.totals.concreteMembers).toBeCloseTo(0, 6)
    // 34 m of W310x79 (A = 10000 mm²) at 7850 kg/m³
    expect(r.totals.steelKg).toBeCloseTo(34 * (10000 / 1e6) * 7850, 0)
  })
})

describe('Lb bracing override per member (A3)', () => {
  // W310x79, Fy=345: Lp ≈ 1.76·ry·√(E/Fy) = 1.76×49×√(200000/345) ≈ 2076 mm ≈ 2.08 m
  // Full 6 m beam → Lb=6000 > Lp → inelastic/elastic zone.
  // Setting Lb: 1.0 m on the member → Lb=1000 < Lp → plastic zone.
  function steelModelLb(lbMetres?: number) {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    m.loads = m.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    m.sections = m.sections.map((s) => ({ ...s, material: 'steel' as const, shape: 'W310x79', steelFy: 345, steelFu: 448 }))
    if (lbMetres !== undefined)
      m.members = m.members.map((mb) => mb.role === 'beam' ? { ...mb, Lb: lbMetres } : mb)
    return m
  }

  it('Lb field in schedule row reflects the override in mm', () => {
    const r = designStructure(steelModelLb(1.0), soil)!
    const beam = r.steelBeams.find((b) => b.role === 'beam')!
    expect(beam).toBeDefined()
    expect(beam.Lb).toBeCloseTo(1000, 1)          // 1.0 m → 1000 mm
  })

  it('short Lb (< Lp) forces plastic zone; long Lb gives inelastic/elastic', () => {
    const rShort = designStructure(steelModelLb(1.0), soil)!
    const rFull  = designStructure(steelModelLb(), soil)!
    const beamShort = rShort.steelBeams.find((b) => b.role === 'beam')!
    const beamFull  = rFull.steelBeams.find((b) => b.role === 'beam')!
    expect(beamShort.ltbZone).toBe('plastic')
    expect(['inelastic', 'elastic']).toContain(beamFull.ltbZone)
  })

  it('short Lb gives higher or equal φMn than full-length Lb', () => {
    const rShort = designStructure(steelModelLb(1.0), soil)!
    const rFull  = designStructure(steelModelLb(), soil)!
    const beamShort = rShort.steelBeams.find((b) => b.role === 'beam')!
    const beamFull  = rFull.steelBeams.find((b) => b.role === 'beam')!
    expect(beamShort.phiMn).toBeGreaterThanOrEqual(beamFull.phiMn - 1e-6)
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

  it('model-derived E loads get a reversed-sign companion and a symmetric envelope (§208.5.1.1)', () => {
    const m = makeModel()
    m.loads = [...m.loads, ...seismicXcase(m).loads]   // +X node loads ONLY in the model
    const r = designStructure(m, soil)!                // no opts.lateral → default path
    // 7 combos: 2 with E → ×2 (E+/E-) = 4; 3 with W (no W loads) → 3; 2 gravity → 2 = 9
    expect(r.cases).toHaveLength(9)
    expect(r.cases.filter((c) => c.includes('· E+'))).toHaveLength(2)
    expect(r.cases.filter((c) => c.includes('· E-'))).toHaveLength(2)
    // the reversal is actually enveloped: both senses govern somewhere (windward
    // columns are governed by E-, leeward by E+ — one direction alone can't do both)
    expect(r.columns.some((c) => (c.gov ?? '').includes('E+'))).toBe(true)
    expect(r.columns.some((c) => (c.gov ?? '').includes('E-'))).toBe(true)
    // symmetric structure + ±X seismic → mirrored columns see identical extremes
    const col = (id: string) => r.columns.find((c) => c.id === id)!
    for (const [a, b] of [['c0.0.0', 'c1.0.0'], ['c0.1.0', 'c1.1.0']] as const) {
      expect(col(a).Pu).toBeCloseTo(col(b).Pu, 5)
      expect(col(a).Mu).toBeCloseTo(col(b).Mu, 5)
      expect(col(a).util).toBeCloseTo(col(b).util, 6)
    }
    // footing axials envelope both sway senses too (0.9D+E uplift side included)
    const foot = (n: string) => r.footings.find((f) => f.node === n)!
    expect(foot('n0.0.0').Pu).toBeCloseTo(foot('n1.0.0').Pu, 5)
    expect(foot('n0.1.0').Pu).toBeCloseTo(foot('n1.1.0').Pu, 5)
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
    expect(col.b).toBeLessThanOrEqual(300)   // not grown by beam failures; shrink may reduce it
    expect(col.h).toBeLessThanOrEqual(500)
    expect(designOK(r.design)).toBe(true)
  })
})

describe('RC serviceability — NSCP Table 409.3.1.1 minimum thickness gate', () => {
  it('grid beams classify as both-ends continuous with hMin = (L/21)·(0.4 + fy/700)', () => {
    const r = designStructure(makeModel(), soil)!
    expect(r.beams.length).toBeGreaterThan(0)
    for (const b of r.beams) {
      expect(b.support).toBe('both-ends')
      expect(b.hMin).toBeCloseTo(((b.L * 1000) / 21) * (0.4 + 415 / 700), 6)
      expect(b.thickOK).toBe(true)          // 300×500 on ≤6 m spans satisfies the table
    }
  })

  it('a long-span shallow beam fails the gate and the optimizer deepens it past hMin', () => {
    const m = generateGridModel({ baysX: [11], baysZ: [5], storeyH: [3], section: { ...section, h: 400, name: '300×400' } })
    m.loads = m.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    const first = designStructure(m, soil)!
    const span11 = first.beams.filter((b) => b.L > 10)
    expect(span11.some((b) => !b.thickOK)).toBe(true)      // 400 < hMin ≈ 520 mm
    expect(designOK(first)).toBe(false)
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    for (const b of r.design.beams) expect(b.thickOK).toBe(true)
  }, 120_000)

  it('an overhang beam classifies as a cantilever (L/8 table row)', () => {
    const m = makeModel()
    // overhang off node n1.0.0 (a corner column joint): 2 m to a free tip
    const corner = m.nodes.find((n) => n.y > 0)!
    m.nodes.push({ id: 'tip', x: corner.x + 2, y: corner.y, z: corner.z })
    m.members.push({ id: 'ovh', i: corner.id, j: 'tip', role: 'beam', section: m.members.find((x) => x.role === 'beam')!.section })
    m.loads.push({ kind: 'member-udl', member: 'ovh', w: 10, cat: 'D' })
    const r = designStructure(m, soil)!
    const row = r.beams.find((b) => b.id === 'ovh')!
    expect(row.support).toBe('cantilever')
    expect(row.hMin).toBeCloseTo(((row.L * 1000) / 8) * (0.4 + 415 / 700), 6)
  })
})

describe('optimizer covers every design check (slabs, walls, SCWB)', () => {
  it('slab §424.2 deflection failure gates designOK and the optimizer thickens the panel', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    m.loads = m.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    const first = designStructure(m, soil)!
    expect(first.slabs[0].ok).toBe(false)          // 150 mm on 6×5 m violates ℓn/240
    expect(designOK(first)).toBe(false)
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    expect(r.model.plates[0].thickness).toBeGreaterThan(150)
    expect(r.design.slabs.every((s) => s.ok)).toBe(true)
    // the slab self-weight delta rode along into the panel's area-D load
    const areaD = r.model.loads.find((l) => l.kind === 'area' && l.cat === 'D') as { q: number }
    const dt = (r.model.plates[0].thickness - 150) / 1000
    expect(areaD.q).toBeCloseTo(4.8 + dt * 24, 6)
  }, 120_000)

  it('failing SCWB joints (§418.7.3.2) gate designOK and the optimizer grows the columns', () => {
    const m = generateGridModel({
      baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200,
      beam: { ...section, h: 600, name: '300×600' }, column: { ...section, b: 300, h: 300, name: '300×300' },
    })
    m.loads = m.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    const first = designStructure(m, soil, {}, { seismicSystem: 'smf' })!
    expect(first.scwb.some((j) => !j.ok)).toBe(true)   // 300×300 cols vs 300×600 beams
    expect(designOK(first)).toBe(false)
    const r = optimizeStructure(m, soil, {}, 30, { seismicSystem: 'smf' })!
    expect(r.converged).toBe(true)
    expect(r.design.scwb.every((j) => j.ok)).toBe(true)
  }, 120_000)

  it('a failing shear wall gates designOK and the optimizer thickens the panel', () => {
    // With the RC size caps, the old ×400 seismic case can no longer converge
    // (that unbounded convergence was the bug the caps fix). This milder case
    // exercises the same mechanism: the thin wall fails DURING the loop as the
    // stiffening frame sheds shear into it, and the optimizer thickens it.
    const m = makeModel()
    m.walls = [{ id: 'w0', member: 'bx0.0.1', height: 3, thickness: 50, shearWall: true }]
    const base = computeSeismic(m, { Ca: 0.44, Cv: 0.64, I: 1, R: 8.5, dir: 'x' })!.loads
    const eX: LateralCase = {
      name: 'E+X', kind: 'E',
      loads: base.map((l) => ({ kind: 'node', node: (l as { node: string }).node, Fx: Math.abs((l as { Fx?: number }).Fx ?? 0) * 45, cat: 'E' })),
    }
    const r = optimizeStructure(m, soil, {}, 30, { lateral: [eX] })!
    expect(r.converged).toBe(true)
    expect(r.model.walls![0].thickness).toBeGreaterThan(50)   // grew to pass
    expect(r.design.walls.every((w) => w.ok)).toBe(true)
  }, 120_000)
})

describe('refreshSelfWeight — sw marker semantics', () => {
  it('preserves user-applied dead line loads when generated SW is marked', () => {
    const m = makeModel()
    m.loads = [
      ...buildGravityLoads(m, 1.5, 2.4),                                          // marked sw
      { kind: 'member-udl' as const, member: 'bx0.0.1', w: 12, cat: 'D' as const }, // user cladding load
    ]
    const out = refreshSelfWeight(m)
    const user = out.loads.filter((l) => l.kind === 'member-udl' && l.cat === 'D' && !(l as { sw?: boolean }).sw)
    expect(user).toHaveLength(1)
    expect((user[0] as { w: number }).w).toBe(12)
  })

  it('re-derives wall self-weight from the current thickness instead of dropping it', () => {
    const m = makeModel()
    m.walls = [{ id: 'w0', member: 'bx0.0.1', height: 3, thickness: 200, shearWall: false }]
    m.loads = buildGravityLoads(m, 1.5, 2.4)
    m.walls = [{ ...m.walls[0], thickness: 300 }]           // wall thickened after load build
    const out = refreshSelfWeight(m)
    const onBeam = out.loads.find((l) => l.kind === 'member-udl' && (l as { member: string }).member === 'bx0.0.1') as { w: number }
    // member SW (0.3·0.5·24 = 3.6) + wall SW at the CURRENT 300 mm (0.3·3·24 = 21.6)
    expect(onBeam.w).toBeCloseTo(3.6 + 21.6, 9)
  })
})

describe('unchecked members — unsupported steel beam families must not read as OK', () => {
  function channelBeamModel() {
    const m = makeModel()
    const beamSecs = new Set(m.members.filter((x) => x.role === 'beam' || x.role === 'girder').map((x) => x.section))
    m.sections = m.sections.map((s) =>
      beamSecs.has(s.id)
        ? { ...s, material: 'steel' as const, shape: 'C75x8.9', steelFy: 345, steelFu: 448 }
        : { ...s, material: 'steel' as const, shape: 'W310x97', steelFy: 345, steelFu: 448 })
    return m
  }

  it('C-shape beams land in design.unchecked and fail designOK', () => {
    const d = designStructure(channelBeamModel(), soil)!
    // previously: no steelBeams row at all and designOK could read true
    expect(d.steelBeams).toHaveLength(0)
    expect(d.unchecked).toHaveLength(4)                    // 2 beams + 2 girders
    expect(d.unchecked.every((u) => u.shape === 'C75x8.9')).toBe(true)
    expect(designOK(d)).toBe(false)
  })

  it('the optimizer reports converged=false instead of "fixing" what it never checked', () => {
    const r = optimizeStructure(channelBeamModel(), soil)!
    expect(r.converged).toBe(false)
    expect(r.design.unchecked).toHaveLength(4)
    expect(r.stopReason).toContain('4 unchecked members')
  })

  it('a full W/WT steel model has no unchecked members (regression)', () => {
    const m = makeModel()
    m.sections = m.sections.map((s) => ({ ...s, material: 'steel' as const, shape: 'W310x97', steelFy: 345, steelFu: 448 }))
    const d = designStructure(m, soil)!
    expect(d.unchecked).toHaveLength(0)
  })
})

describe('optimizeStructure — termination guards (hierarchy revert / catalog top)', () => {
  it('square columns > 300 wide do not hang the batch-shrink loop', () => {
    // enforceSectionHierarchy clamps a column square-or-taller, silently reverting
    // the h−25 batch proposal; before the sectionsChanged guard this spun forever.
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: { ...section, b: 450, h: 450, name: '450×450' } })
    m.loads = m.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 3, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 1.5, cat: 'L' as const },
    ])
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    expect(designOK(r.design)).toBe(true)
    // columns stay square-or-taller per the hierarchy
    for (const mem of r.model.members.filter((x) => x.role === 'column')) {
      const s = r.model.sections.find((x) => x.id === mem.section)!
      expect(s.h).toBeGreaterThanOrEqual(s.b)
    }
  }, 120_000)

  it('an un-growable failing design exits the grow loop early instead of burning maxIter', () => {
    // heaviest W in the catalog under an absurd load: jumpSection cannot step up,
    // so the grow loop must break on the first no-change iteration.
    let top = 'W310x342'
    for (let n = nextHeavierW(top); n; n = nextHeavierW(top)) top = n.name
    const m = generateGridModel({ baysX: [12], baysZ: [10], storeyH: [3], section })
    m.sections = m.sections.map((s) => ({ ...s, material: 'steel' as const, shape: top, steelFy: 345, steelFu: 448 }))
    // member POINT loads (not area/udl): keeps slabs out of the design and
    // survives refreshSelfWeight, so the ONLY failing checks are the
    // un-growable steel members — the early exit under test
    m.loads = m.members.filter((x) => x.role !== 'column')
      .map((x) => ({ kind: 'member-point' as const, member: x.id, t: 0.5, P: 4000, cat: 'D' as const }))
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(false)
    expect(r.steps.length).toBeLessThanOrEqual(2)   // initial + the single no-progress attempt
    expect(r.model.sections.every((s) => s.shape === top)).toBe(true)
    expect(r.stopReason).toContain('grow')
  }, 120_000)

  it('failures the sections cannot fix (footings on bad soil) get an explanatory stopReason', () => {
    // qAllow below the overburden ⇒ every isolated footing fails (qNet ≤ 0)
    // while all members pass: the grow loop must bail with a reason, not iterate.
    const r = optimizeStructure(makeModel(), { ...soil, qAllow: 5 })!
    expect(r.converged).toBe(false)
    expect(r.design.footings.every((f) => !f.ok)).toBe(true)
    expect(r.design.beams.every((b) => b.ok)).toBe(true)
    expect(r.stopReason).toContain('cannot fix')
    expect(r.stopReason).toContain('footing')
  })
})

describe('bar-diameter continuity guard (selectBarDiameters)', () => {
  it('a continuous beam line and each column stack end with ONE bar Ø (count may differ)', () => {
    // 2×1 bays, 2 storeys: multi-span beam lines + column stacks; mixed start Øs
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 200 })
    m.loads = m.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
    ])
    m.sections.find((s) => s.id === 'bx0.0.1')!.barDia = 25   // one span Ø25, its continuation Ø20
    m.sections.find((s) => s.id === 'c0.0.0')!.barDia = 28    // stack base Ø28, upper Ø20
    const out = selectBarDiameters(m, soil)
    const secOf = (id: string) => out.sections.find((s) => s.id === id)!
    for (const g of barContinuityGroups(out)) {
      const dias = new Set(g.map((mid) => secOf(out.members.find((x) => x.id === mid)!.section).barDia))
      expect(dias.size).toBe(1)
    }
  }, 120_000)
})

describe('meshValidation — bar-diameter discontinuity warning', () => {
  it('flags a continuous run mixing Ø25 and Ø20; silent when uniform', () => {
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section })
    expect(validateMesh(m).filter((i) => i.code === 'bar-dia-discontinuity')).toHaveLength(0)
    m.sections.find((s) => s.id === 'bx0.0.1')!.barDia = 25
    const issues = validateMesh(m).filter((i) => i.code === 'bar-dia-discontinuity')
    expect(issues.length).toBeGreaterThanOrEqual(1)
    expect(issues[0].severity).toBe('warning')
    expect(issues[0].refs).toContain('bx0.0.1')
    expect(issues[0].message).toContain('⌀20')
    expect(issues[0].message).toContain('⌀25')
  })
})

describe('optimizeStructure — RC cast-in-place size limits (like the W-catalog top)', () => {
  it('an un-growable failing RC design stops AT the cap with an honest reason', () => {
    // 12 m span under an absurd point load: no cast-in-place beam can work.
    const m = generateGridModel({ baysX: [12], baysZ: [10], storeyH: [3], section })
    m.loads = m.members.filter((x) => x.role !== 'column')
      .map((x) => ({ kind: 'member-point' as const, member: x.id, t: 0.5, P: 12000, cat: 'D' as const }))
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(false)
    expect(r.stopReason).toContain('cast-in-place size limit')
    for (const s of r.model.sections) {
      const lim = m.members.find((x) => x.id === s.id)?.role === 'column' ? RC_LIMITS.column : RC_LIMITS.flexural
      expect(s.b).toBeLessThanOrEqual(lim.b)
      expect(s.h).toBeLessThanOrEqual(lim.h)
    }
  }, 120_000)

  it('normal growth never exceeds the caps', () => {
    const m = makeModel()
    m.sections = m.sections.map((s) => ({ ...s, b: 200, h: 250, name: '200×250' }))
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    for (const s of r.model.sections) {
      expect(s.b).toBeLessThanOrEqual(RC_LIMITS.column.b)
      expect(s.h).toBeLessThanOrEqual(RC_LIMITS.flexural.h)
    }
  }, 120_000)
})

describe('optimizeStructure — steel sections', () => {
  function steelModel(shape: string) {
    const m = makeModel()
    m.sections = m.sections.map((s) => ({
      ...s, material: 'steel' as const, shape, steelFy: 345, steelFu: 448,
    }))
    return m
  }

  it('grows undersized steel shapes (W150x13) until the design passes', () => {
    const start = steelModel('W150x13')
    const first = designStructure(start, soil)!
    expect(designOK(first)).toBe(false)           // W150x13 fails a 6 m loaded beam
    const r = optimizeStructure(start, soil)!
    expect(r.converged).toBe(true)
    expect(designOK(r.design)).toBe(true)
    expect(r.model.sections.some((s) => s.shape !== 'W150x13')).toBe(true)
    expect(r.steps.some((s) => !s.ok)).toBe(true) // at least one failing iteration logged
  })

  // Shrinking from the heaviest W-shape walks many optimizer iterations
  // (~6–7 s), past vitest's 5 s default — give it explicit headroom.
  it('shrinks an oversized steel shape (W310x342) while the design stays OK', () => {
    const start = steelModel('W310x342')
    const first = designStructure(start, soil)!
    expect(designOK(first)).toBe(true)            // W310x342 passes easily
    const r = optimizeStructure(start, soil)!
    expect(r.converged).toBe(true)
    // shrink must have stepped at least one section down from the starting shape
    expect(r.model.sections.some((s) => s.shape !== 'W310x342')).toBe(true)
  }, 20000)

  it('steel self-weight uses shape area × 78.5 kN/m³, not bounding box × 24', () => {
    // W310x79: A = 10000 mm². Self-weight = 10000/1e6 × 78.5 = 0.785 kN/m
    const r = designStructure(steelModel('W310x79'), soil)!
    // 34 m of W310x79 (A=10 000 mm²) at 7850 kg/m³ ≈ 2669 kg
    expect(r.totals.steelKg).toBeCloseTo(34 * (10000 / 1e6) * 7850, 0)
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

  it('SCWB joint check (§418.7.3.2) is populated only for a Special Moment Frame', () => {
    const m = makeModel()
    expect(designStructure(m, soil)!.scwb).toHaveLength(0)                       // default gravity
    expect(designStructure(m, soil, {}, { seismicSystem: 'imf' })!.scwb).toHaveLength(0)
    const smf = designStructure(m, soil, {}, { seismicSystem: 'smf' })!
    expect(smf.scwb.length).toBeGreaterThan(0)
    for (const j of smf.scwb) {
      expect(j.nCols).toBeGreaterThan(0); expect(j.nBeams).toBeGreaterThan(0)
      expect(j.ok).toBe(j.ratio >= 1.2 - 1e-9)
      expect(j.ratio).toBeCloseTo(j.sumMnc / j.sumMnb, 9)
    }
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
    expect((slabD as { q: number }).q).toBeCloseTo(0.20 * 24 + 1.5, 9)
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

describe('§208.4.1 vertical seismic component Ev in the combo factors', () => {
  const Ev = 0.5 * 0.44 * 1.0   // Zone 4, I = 1 → 0.22

  it('shifts D on the E combos only: 1.2+Ev additive, 0.9−Ev uplift', () => {
    const combos = withEv(nscpCombos(1.0), Ev)
    const add = combos.find((c) => (c.f.E ?? 0) !== 0 && c.f.D! > 1)!
    const uplift = combos.find((c) => (c.f.E ?? 0) !== 0 && c.f.D! < 1)!
    expect(add.f.D).toBeCloseTo(1.2 + Ev, 9)
    expect(uplift.f.D).toBeCloseTo(0.9 - Ev, 9)
    expect(add.name).toContain('1.42D')
    expect(uplift.name).toContain('0.68D')
    // gravity/wind combos untouched
    for (const c of combos.filter((c) => !(c.f.E ?? 0))) {
      const orig = nscpCombos(1.0).find((o) => o.name === c.name)!
      expect(c.f).toEqual(orig.f)
    }
  })

  it('identity when Ev is undefined or zero', () => {
    expect(withEv(nscpCombos(1.0), undefined)).toEqual(nscpCombos(1.0))
    expect(withEv(nscpCombos(1.0), 0)).toEqual(nscpCombos(1.0))
  })

  it('uplift combo net dead-load factor drops — reactions shrink under 0.9D−Ev', () => {
    const Evd = withEv(nscpCombos(1.0), Ev)
    const up = Evd.find((c) => (c.f.E ?? 0) !== 0 && c.f.D! < 0.9)!
    expect(up.f.D).toBeLessThan(0.9)   // more severe for uplift/overturning checks
  })
})

describe('engine integrations — all-around columns & T-beam action', () => {
  const rTwo = designStructure(makeModel(), soil)!
  const rInt = designStructure(makeModel(), soil, {}, { colLayout: 'all-around', tBeamAction: true })!

  it('all-around layout is recorded on every column row and stays plausible', () => {
    expect(rInt.columns.every((c) => c.layout === 'all-around')).toBe(true)
    expect(rTwo.columns.every((c) => (c.layout ?? 'two-face') === 'two-face')).toBe(true)
    for (const c of rInt.columns) {
      const t = rTwo.columns.find((x) => x.id === c.id)!
      // side bars shift capacity along the demand ray but never wildly
      expect(c.util).toBeGreaterThan(0)
      expect(c.util / t.util).toBeGreaterThan(0.5)
      expect(c.util / t.util).toBeLessThan(2)
    }
  })

  it('T-beam action tags only sagging sections, with bf > b, never more steel', () => {
    let flanged = 0
    for (const bm of rInt.beams) {
      const two = rTwo.beams.find((x) => x.id === bm.id)!
      for (const s of bm.sections) {
        if (s.bf !== undefined) {
          flanged++
          expect(s.Mu).toBeGreaterThan(0)
          expect(s.bf).toBeGreaterThan(300)
          const sTwo = two.sections.find((x) => x.label === s.label)
          if (sTwo) expect(s.design.As).toBeLessThanOrEqual(sTwo.design.As + 1e-6)
        }
        if (s.hogging) expect(s.bf).toBeUndefined()
      }
    }
    expect(flanged).toBeGreaterThan(0)                       // slabs adjoin the grid beams
  })
})
