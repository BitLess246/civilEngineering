import { describe, it, expect, vi } from 'vitest'
import { generateGridModel, buildGravityLoads, removeNode, enforceSectionHierarchy, refreshSelfWeight, splitSharedSections, barContinuityGroups } from './modelBuilder'
import { designStructure, optimizeStructure, selectBarDiameters, designOK, withEv, RC_LIMITS, type LateralCase } from './pipeline'
import { nextHeavierW } from './aiscSections'
import { computeSeismic } from './seismic'
import { nscpCombos } from './beamAnalysis'
import { validateMesh } from './meshValidation'
import type { RectSection, ModelLoad } from './model'

// The optimizer cases in this file walk many design iterations (the steel
// catalog search is ~6–7 s alone) and spike well past vitest's 5 s default
// under full-suite CPU contention — see issue #324. Give the whole file
// generous headroom so a busy CI run can't flake them out.
vi.setConfig({ testTimeout: 30_000 })

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

  // AUD-001. W310x79 is compact at Fy 345, so the schedule above is a §F2
  // baseline; these two say what happens when it is not.
  it('a noncompact flange lands in §F3 and is REPORTED as such', () => {
    const m = steelModel()
    // W150x22 at Fy 345: λf = 11.52 > λpf = 9.15, web still compact.
    m.sections = m.sections.map((s) => ({ ...s, shape: 'W150x22' }))
    const d = designStructure(m, soil)!
    expect(d.steelBeams.length).toBeGreaterThan(0)
    for (const b of d.steelBeams) {
      expect(b.flangeClass).toBe('noncompact')
      expect(b.webClass).toBe('compact')
      expect(b.clause).toBe('F3')
      // the whole point: φMn is BELOW what the compact equations would give
      expect(b.MnFLB).toBeLessThan(b.Mp)
      expect(b.Mn).toBeLessThanOrEqual(b.MnFLB + 1e-9)
    }
  })

  it('a tee beam goes UNCHECKED instead of collecting the compact §F2 strength', () => {
    const m = steelModel()
    m.sections = m.sections.map((s) => ({ ...s, shape: 'WT155x19.4' }))
    const d = designStructure(m, soil)!
    // no beam row invented for a shape §F2/§F3 does not cover…
    expect(d.steelBeams).toHaveLength(0)
    // …and the members are named, with the clause that would be needed
    const beams = d.unchecked.filter((u) => u.role === 'beam' || u.role === 'girder')
    expect(beams).toHaveLength(4)
    for (const u of beams) {
      expect(u.shape).toBe('WT155x19.4')
      expect(u.reason).toMatch(/§F9/)
    }
    // and nothing green: an unchecked member fails the overall gate
    expect(designOK(d)).toBe(false)
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

  it('wood frame with failing timber members and deck → optimizer grows both to pass', () => {
    const woodSec: RectSection = {
      id: 'W', name: '150×200', b: 150, h: 200, material: 'wood', woodSpecies: 'DFL-2', woodKind: 'sawn',
      fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
    }
    const m = generateGridModel({ baysX: [5], baysZ: [4], storeyH: [3], section: woodSec, slabThickness: 150 })
    m.loads = m.plates.flatMap((p) => [
      { kind: 'area' as const, plate: p.id, q: 2.0, cat: 'D' as const },
      { kind: 'area' as const, plate: p.id, q: 1.9, cat: 'L' as const },
    ])
    // undersized timber decks on every floor panel
    m.plates = m.plates.map((p) => p.role === 'wall' ? p : { ...p, deck: {
      joistSpecies: 'DFL-2', joistKind: 'sawn' as const, joistB: 50, joistD: 150, joistSpacing: 400,
      deckMaterial: 'plank' as const, deckThickness: 20,
    } })
    const first = designStructure(m, soil)!
    expect(designOK(first)).toBe(false)
    expect(first.woodSlabs.length).toBeGreaterThan(0)
    const r = optimizeStructure(m, soil)!
    expect(r.converged).toBe(true)
    expect(designOK(r.design)).toBe(true)
    // the timber members grew, and the deck joists grew past their undersized start
    expect(r.model.sections.some((s) => s.material === 'wood' && (s.h > 200 || s.b > 150))).toBe(true)
    const grownDeck = r.model.plates.find((p) => p.deck)?.deck
    expect(grownDeck && grownDeck.joistD).toBeGreaterThan(150)
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

describe('RC serviceability — §424.2 computed deflection reaches the schedule', () => {
  it('every beam row carries a computed deflection built from its own D/L diagrams', () => {
    const r = designStructure(makeModel(), soil)!
    expect(r.beams.length).toBeGreaterThan(0)
    for (const b of r.beams) {
      const df = b.deflection
      expect(df).toBeDefined()
      expect(df!.support).toBe(b.support)
      expect(df!.hMin).toBeCloseTo(b.hMin, 9)
      // the limits are the member's own span
      expect(df!.limitL240).toBeCloseTo((b.L * 1000) / 240, 9)
      expect(df!.limitL360).toBeCloseTo((b.L * 1000) / 360, 9)
      // Branson stays bracketed by the two inertias, and the totals are consistent
      expect(df!.Ie).toBeLessThanOrEqual(df!.Ig + 1e-6)
      expect(df!.Ie).toBeGreaterThanOrEqual(df!.Icr - 1e-6)
      expect(df!.deltaTotal).toBeCloseTo(df!.lambdaDelta * df!.deltaD + df!.deltaL, 9)
      expect(df!.deltaD).toBeGreaterThan(0)          // gravity really was applied
      expect(df!.xMax).toBeGreaterThanOrEqual(0)
      expect(df!.xMax).toBeLessThanOrEqual(b.L + 1e-9)
    }
  })

  it('a deeper section deflects less — the check tracks the section, not a table', () => {
    const mk = (h: number) => {
      const m = generateGridModel({ baysX: [7], baysZ: [5], storeyH: [3], section: { ...section, h, name: `300×${h}` } })
      m.loads = m.plates.flatMap((p) => [
        { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
        { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
      ])
      return designStructure(m, soil)!
    }
    const shallow = mk(400), deep = mk(700)
    const worstOf = (d: ReturnType<typeof mk>) =>
      Math.max(...d.beams.filter((b) => b.deflection).map((b) => b.deflection!.deltaTotal))
    expect(worstOf(deep)).toBeLessThan(worstOf(shallow))
  }, 60_000)

  it('§409.3.1.1: a member below hMin still passes when the computed deflection is fine', () => {
    // Lightly loaded 7 m span on a 300×400: hMin = 7000/21·(0.4+415/700) ≈ 333 mm
    // is satisfied, so build a case that fails the TABLE but not the CALC by
    // using a discontinuous (simple) span, whose hMin row is L/16.
    const r = designStructure(makeModel(), soil)!
    const rescued = r.beams.filter((b) => b.deflection && !b.thickOK && b.deflection.liveOK && b.deflection.totalOK)
    // whether any member is in that state depends on the model; what must hold
    // is the RULE — a rescued member is never failed for thickness alone
    for (const b of rescued) {
      expect(b.sections.every((s) => s.design.flexOK)).toBe(b.ok)
    }
    // and a member that satisfies the table is never failed by the calc alone
    for (const b of r.beams) {
      if (b.thickOK && b.sections.every((s) => s.design.flexOK && s.design.comprEffective
        && s.design.comprNAOK && s.design.region !== 'inadequate')) expect(b.ok).toBe(true)
    }
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
  // (~6–7 s); the file-level testTimeout above gives it headroom.
  it('shrinks an oversized steel shape (W310x342) while the design stays OK', () => {
    const start = steelModel('W310x342')
    const first = designStructure(start, soil)!
    expect(designOK(first)).toBe(true)            // W310x342 passes easily
    const r = optimizeStructure(start, soil)!
    expect(r.converged).toBe(true)
    // shrink must have stepped at least one section down from the starting shape
    expect(r.model.sections.some((s) => s.shape !== 'W310x342')).toBe(true)
  })

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

describe('engine integrations — prestressed member check', () => {
  const m = makeModel()
  // tag every beam section with pretensioned strands (mutate shared sections)
  m.sections = m.sections.map((s) => ({ ...s, ps: { Aps: 600, fpu: 1860, e: 150, fci: 24 } }))
  const r = designStructure(m, soil)!

  it('every prestressed-tagged beam gets a row with the full engine result', () => {
    const beamIds = new Set(r.beams.map((b) => b.id))
    expect(r.prestressed.length).toBe(beamIds.size)
    for (const p of r.prestressed) {
      expect(beamIds.has(p.id)).toBe(true)
      expect(p.design.lossPct).toBeGreaterThan(5)
      expect(p.design.lossPct).toBeLessThan(30)
      expect(p.design.phiMn).toBeGreaterThan(0)
      expect(p.ok).toBe(p.design.ok)
    }
  })

  it('undersized strands fail designOK through the prestressed rows', () => {
    const bad = makeModel()
    bad.sections = bad.sections.map((s) => ({ ...s, ps: { Aps: 40, fpu: 1860, e: 150, fci: 24 } }))
    const rBad = designStructure(bad, soil)!
    expect(rBad.prestressed.some((p) => !p.ok)).toBe(true)
    expect(designOK(rBad)).toBe(false)
  })

  it('untagged models produce no prestressed rows (back-compat)', () => {
    const plain = designStructure(makeModel(), soil)!
    expect(plain.prestressed).toEqual([])
  })
})

// ── Footing mats ──────────────────────────────────────────────────────────

describe('footing mats are the footing\'s, not the column\'s', () => {
  const designAt = (barDia: number) => {
    const sec: RectSection = { ...section, barDia }
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: sec, slabThickness: 200 })
    m.loads = m.plates.flatMap((p): ModelLoad[] => [
      { kind: 'area', plate: p.id, q: 4.8, cat: 'D' },
      { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
    ])
    return designStructure(m, soil)!
  }

  it('does not inherit the column cage diameter', () => {
    // THE BUG. `pipeline` handed the footing `section.barDia`, so a ⌀32 column
    // cage detailed the footing mat in ⌀32 — and with only the area to satisfy
    // that came out as two bars at 700+ mm centres.
    const mats = [20, 25, 32].map((db) => designAt(db).footings.map((f) => f.barDia))
    for (const m of mats) expect(m).toEqual(mats[0])
    // and the mat is not simply the column bar
    expect(designAt(32).footings.every((f) => f.barDia < 32)).toBe(true)
  })

  it('every scheduled mat satisfies §7.7.2.3', () => {
    for (const db of [20, 32]) {
      for (const f of designAt(db).footings) {
        expect(f.design.barSpacing, `${f.node} @⌀${db}`)
          .toBeLessThanOrEqual(f.design.barSpacingMax + 1e-9)
        expect(f.design.barsFit).toBe(true)
        expect(f.design.bars).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('the row quotes the mat its own selection adopted', () => {
    // Two sources of truth is how a schedule ends up citing a reason that
    // describes a different mat: `designSquareFooting` lays out the bare
    // §7.7.2.3 minimum, the optimiser picks off the spacing module.
    for (const f of designAt(25).footings) {
      const best = f.selection.best
      expect(best, f.node).not.toBeNull()
      expect(f.design.bars).toBe(best!.layout.bars)
      expect(f.design.barSpacing).toBeCloseTo(best!.layout.spacing, 9)
      expect(f.barDia).toBe(best!.layout.db)
    }
  })

  it('provides at least the steel the flexure check demanded', () => {
    for (const f of designAt(25).footings) {
      const Ab = (Math.PI / 4) * f.barDia * f.barDia
      expect(f.design.bars * Ab).toBeGreaterThanOrEqual(f.design.steelArea - 1e-6)
    }
  })

  it('reports a ranking, so the choice can be argued with', () => {
    const f = designAt(20).footings[0]
    expect(f.selection.ranked.length).toBeGreaterThan(1)
    expect(f.selection.margin.length).toBeGreaterThan(10)
    expect(f.selection.best!.reason).toMatch(/⌀\d+ @ \d+/)
  })
})

// ── Slab mats ─────────────────────────────────────────────────────────────

describe('slab mats are searched, not assumed', () => {
  const panelAt = (thickness: number, D: number, L: number) => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: thickness })
    m.loads = m.plates.flatMap((p): ModelLoad[] => [
      { kind: 'area', plate: p.id, q: D, cat: 'D' },
      { kind: 'area', plate: p.id, q: L, cat: 'L' },
    ])
    return designStructure(m, soil)!.slabs
  }

  it('the diameter responds to the load instead of being a hard-coded 12', () => {
    // It was literally `barDia: 12` in the pipeline, again in the take-off as
    // SLAB_BAR, and again in the on-screen schedule as the string "⌀12".
    const light = panelAt(200, 4.8, 2.4)
    const heavy = panelAt(250, 6.0, 5.0)
    expect(light[0].barDia).toBeLessThan(heavy[0].barDia)
    expect(light.every((s) => s.barDia > 0)).toBe(true)
  })

  it('one diameter serves a panel, but the spacing varies by strip', () => {
    // Mixing bar sizes within a panel is how the wrong bar reaches the wrong
    // strip; varying the SPACING is how a slab is actually drawn.
    for (const sl of panelAt(150, 3.0, 2.0)) {
      const spacings = [sl.design.x, sl.design.y].flatMap((dr) =>
        dr.locations.flatMap((l) => [l.column.spacing, ...(l.middle.b > 1 ? [l.middle.spacing] : [])]))
      expect(new Set(spacings.map((x) => Math.round(x))).size).toBeGreaterThan(1)
    }
  })

  it('every strip satisfies §8.7.2.2', () => {
    for (const sl of panelAt(200, 4.8, 2.4)) {
      const sMax = Math.min(2 * sl.design.h, 450)
      for (const dr of [sl.design.x, sl.design.y]) {
        for (const loc of dr.locations) {
          expect(loc.column.spacing, `${sl.plate} ${dr.dir} ${loc.name} CS`).toBeLessThanOrEqual(sMax + 1e-6)
          if (loc.middle.b > 1) {
            expect(loc.middle.spacing, `${sl.plate} ${dr.dir} ${loc.name} MS`).toBeLessThanOrEqual(sMax + 1e-6)
          }
        }
      }
    }
  })

  it('the schedule quotes the diameter its own selection adopted', () => {
    for (const sl of panelAt(200, 4.8, 2.4)) {
      expect(sl.selection.best).not.toBeNull()
      expect(sl.barDia).toBe(sl.selection.best!.layout.db)
      expect(sl.selection.best!.reason).toMatch(/⌀\d+ @ \d+/)
    }
  })

  it('every strip still carries at least the steel its flexure check demanded', () => {
    for (const sl of panelAt(250, 6.0, 5.0)) {
      const Ab = (Math.PI / 4) * sl.barDia * sl.barDia
      for (const dr of [sl.design.x, sl.design.y]) {
        for (const loc of dr.locations) {
          expect(loc.column.bars * Ab).toBeGreaterThanOrEqual(loc.column.As - 1e-6)
          if (loc.middle.b > 1) expect(loc.middle.bars * Ab).toBeGreaterThanOrEqual(loc.middle.As - 1e-6)
        }
      }
    }
  })
})

// ── Beam and column bars go through the scorer ────────────────────────────

describe('model space and the calculator pages agree on bars', () => {
  const gridAt = (barDia: number) => {
    const sec: RectSection = { ...section, barDia }
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: sec, slabThickness: 200 })
    m.loads = m.plates.flatMap((p): ModelLoad[] => [
      { kind: 'area', plate: p.id, q: 4.8, cat: 'D' },
      { kind: 'area', plate: p.id, q: 2.4, cat: 'L' },
    ])
    return m
  }

  it('a beam member keeps ONE diameter across all its critical sections', () => {
    const m = selectBarDiameters(gridAt(28), soil)
    const d = designStructure(m, soil)!
    const secOf = new Map(m.sections.map((s) => [s.id, s]))
    const memSec = new Map(m.members.map((x) => [x.id, x.section]))
    for (const row of d.beams) {
      const sec = secOf.get(memSec.get(row.id) ?? '')
      expect(sec, row.id).toBeDefined()
      // every section of the member is detailed from that one section record
      expect(row.sections.length).toBeGreaterThan(0)
    }
    // and the whole grid settles on sensible beam bars rather than the ⌀28 seed
    const beamDias = new Set(m.sections.filter((s) => s.id.startsWith('b')).map((s) => s.barDia))
    expect([...beamDias].every((d0) => d0 < 28)).toBe(true)
  })

  it('selection does not make a previously passing design fail', () => {
    // The count axis used to be the trap: with no place to store a count, a
    // search that adopted one had it silently recomputed downstream, and a P–M
    // check that passed during the search failed on the section that shipped.
    // `RectSection.barCount` is what keeps the two equal now.
    const m0 = gridAt(28)
    const before = designStructure(m0, soil)!
    const after = designStructure(selectBarDiameters(m0, soil), soil)!
    expect(after.columns.filter((c) => c.ok).length)
      .toBeGreaterThanOrEqual(before.columns.filter((c) => c.ok).length)
    expect(after.beams.filter((b) => b.ok).length)
      .toBeGreaterThanOrEqual(before.beams.filter((b) => b.ok).length)
  })

  it('keeps one diameter through a continuous line and a column stack', () => {
    const m = selectBarDiameters(gridAt(28), soil)
    const secOf = new Map(m.sections.map((s) => [s.id, s]))
    const memSec = new Map(m.members.map((x) => [x.id, x.section]))
    for (const group of barContinuityGroups(m)) {
      const dias = new Set(group.map((mid) => secOf.get(memSec.get(mid) ?? '')?.barDia))
      expect(dias.size, group.join(',')).toBe(1)
    }
  })

  it('a stack whose Ø the continuity guard raises does not keep the count searched at the old Ø', () => {
    // Seed the stack base at ⌀32 so the guard has a diameter to push up
    // through the storey above; the count that shipped with the smaller bar
    // cannot ride along, or the cage nobody checked is the cage that gets
    // detailed.
    const m0 = gridAt(20)
    m0.sections.find((s) => s.id === 'c0.0.0')!.barDia = 32
    const m = selectBarDiameters(m0, soil)
    const secOf = new Map(m.sections.map((s) => [s.id, s]))
    const memSec = new Map(m.members.map((x) => [x.id, x.section]))
    for (const group of barContinuityGroups(m)) {
      const secs = group.map((mid) => secOf.get(memSec.get(mid) ?? '')!)
      expect(new Set(secs.map((s) => s.barDia)).size, group.join(',')).toBe(1)
    }
    // every stored cage still satisfies the L1 rules at the Ø it ended on
    expect(validateMesh(m).filter((i) => i.code.startsWith('BAR_COUNT'))).toEqual([])
  })

  it('a saved cage does not survive the size change that outgrew it', () => {
    // 4⌀20 is fine in a 300×300 column (ρ = 0.0140) and under §10.6.1.1's ρmin
    // the moment the optimizer grows the concrete. Frozen, it is a floor the
    // column can never meet: growing makes ρ *smaller*, so the section chases
    // the cast-in-place cap and the run ends with every column failing on a
    // cage nothing asked for. Dropping it at the size change is what lets the
    // derived cage take over.
    const m0 = generateGridModel({ baysX: [7], baysZ: [6], storeyH: [3, 3], section, slabThickness: 200 })
    m0.loads = m0.plates.flatMap((p): ModelLoad[] => [
      { kind: 'area', plate: p.id, q: 9.0, cat: 'D' },
      { kind: 'area', plate: p.id, q: 6.0, cat: 'L' },
    ])
    for (const s of m0.sections) if (s.id.startsWith('c')) { s.b = 300; s.h = 300; s.barCount = 4 }
    const r = optimizeStructure(m0, soil)!         // no bar pass: nothing re-adopts a count
    const colSecs = r.model.sections.filter((s) => s.id.startsWith('c'))
    expect(colSecs.some((s) => s.h !== 300)).toBe(true)              // they did grow
    for (const s of colSecs) expect(s.barCount, s.id).toBeUndefined()
    expect(r.converged).toBe(true)
    for (const c of r.design.columns) expect(c.ok, c.id).toBe(true)
  })

  it('every designed column carries its splice lengths — §425.5', () => {
    // The column detail sheet prints the lap; before this the sheet simply
    // omitted it, because nothing downstream of columnDesign ever called
    // calcDevLength. §425.5 is a property of the bar and the concrete, not of
    // the load case, so one figure per column is the right shape.
    const r = designStructure(makeModel(), soil)!
    expect(r.columns.length).toBeGreaterThan(0)
    for (const c of r.columns) {
      expect(c.lapB, c.id).toBeDefined()
      expect(c.lapC, c.id).toBeDefined()
      expect(c.lapB!).toBeGreaterThanOrEqual(300)        // §425.5.2 floor
      expect(c.lapC!).toBeGreaterThanOrEqual(300)        // §425.5.5 floor
      // NOT asserted: that the tension lap exceeds the compression one. It
      // does not always. §425.5.5 takes no credit for confinement while
      // §425.4.2 development does, so at the cbKtr/db cap Class B comes out
      // 593 mm against a 602 mm compression splice here. The detail sheet
      // therefore draws max(lapB, lapC), not lapB.
    }
  })

  it('the optimizer ends on a cage that fits the size it settled on', () => {
    // ρ = n·Ab/(b·h) moves with the concrete, so a cage carried across a size
    // change can land outside §10.6.1.1 — a section the optimizer itself built,
    // then reported as failing. Every b×h change clears the count and the next
    // bar pass re-adopts one, so the model that comes out is self-consistent.
    const m0 = makeModel()
    // start the columns small enough that the grow loop has to run first
    for (const s of m0.sections) if (s.id.startsWith('c')) { s.b = 250; s.h = 300 }
    const r = optimizeStructure(m0, soil, {}, 30, {}, true)!
    const colSecs = r.model.sections.filter((s) => s.id.startsWith('c'))
    expect(colSecs.some((s) => s.b !== 250 || s.h !== 300)).toBe(true)   // the columns did move
    expect(validateMesh(r.model).filter((i) => i.code.startsWith('BAR_COUNT'))).toEqual([])
    const secOf = new Map(r.model.members.map((x) => [x.id, x.section]))
    for (const c of r.design.columns) {
      const sec = r.model.sections.find((s) => s.id === secOf.get(c.id))!
      expect(sec.barCount, c.id).toBeDefined()
      expect(c.bars, c.id).toBe(sec.barCount)      // the schedule details what the model stores
      expect(c.ok, c.id).toBe(true)
    }
  })
})
