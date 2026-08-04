import { describe, it, expect } from 'vitest'
import type { SolutionStep } from './solution'
import { designPunchingShear } from '../engine/punchingShear'
import { designTorsion } from '../engine/torsionDesign'
import { calcDevLength } from '../engine/devLength'
import { buildPunchingSolution } from './punchingSolution'
import { buildTorsionSolution } from './torsionSolution'
import { buildDevLengthSolution } from './devLengthSolution'
import { designSlabDDM } from '../engine/slabDDM'
import { designStair } from '../engine/stair'
import { designCircularTank } from '../engine/waterTank'
import { buildSlabSolution } from './slabSolution'
import { buildStairSolution } from './stairSolution'
import { buildWaterTankSolution } from './waterTankSolution'
import { designSoilNail } from '../engine/soilNail'
import { designMicropile } from '../engine/micropile'
import { designRockAnchor } from '../engine/rockAnchor'
import { designFacing } from '../engine/shotcreteFacing'
import {
  buildSoilNailSolution, buildMicropileSolution, buildRockAnchorSolution, buildFacingSolution,
} from './geotechSolutions'
import {
  consolidationSettlement, elasticSettlement, schmertmannSettlement, effectiveStress,
  timeToConsolidation, consolidationAfter, type SoilLayer,
} from '../engine/settlement'
import { buildSettlementSolution } from './settlementSolution'
import { searchCriticalCircle, type Pt, type SlopeSoil } from '../engine/slopeStability'
import { buildSlopeSolution } from './slopeSolution'
import { bromsClay, pyAnalysis } from '../engine/lateralPile'
import { buildLateralPileSolution } from './lateralPileSolution'
import { designRetainingWall } from '../engine/retainingWall'
import { buildRetainingWallSolution } from './retainingWallSolution'

// ─────────────────────────────────────────────────────────────────────────
// What a worked solution has to be, applied to every builder at once.
//
// The complaint these exist to prevent: a report that prints answers without
// showing the formula, the substituted values, or the units — which is a
// results table, not a calculation sheet an engineer can check.
// ─────────────────────────────────────────────────────────────────────────

const punchIn = { c1: 400, c2: 400, d: 165, fc: 28, lambda: 1, Vu: 500, position: 'interior' as const }
const torsIn = {
  b: 400, h: 600, cover: 40, stirrupDia: 12, barDia: 20,
  fc: 28, fy: 415, fyt: 415, Tu: 80, Vu: 200, legs: 2, lambda: 1,
}
const devIn = {
  db: 20, fc: 28, fy: 415, topBar: false,
  epoxy: 'none' as const, lambda: 1, cbKtr_db: 1.5,
}

const slabIn = {
  lx: 6, ly: 6, colWidth: 400, D: 5, L: 2, fc: 28, fy: 415,
  cover: 20, barDia: 12,
}
const stairIn = {
  span: 3.5, t: 150, R: 150, G: 300, fc: 28, fy: 415,
  barDia: 12, cover: 20, finishes: 1.5, live: 4.8, support: 'simple' as const,
}
const tankIn = {
  H: 4, D: 10, t: 250, freeboard: 0.3, fc: 28,
  sigmaSt: 130, sigmaCt: 1.3, cover: 40, barDia: 16,
}

// ── Geotechnical ─────────────────────────────────────────────────────────
const nailIn = {
  z: 5, Sh: 1.5, Sv: 1.5, gamma: 18, phiDeg: 30, surcharge: 10,
  barDia: 25, fy: 415, drillDia: 150, bondLength: 8, qu: 100,
}
const mpSection = { barDia: 32, fyBar: 517, groutDia: 200, fcGrout: 28 }
const mpIn = {
  mode: 'compression' as const, ...mpSection,
  casing: false, casingOD: 0, casingID: 0, fyCasing: 248,
  bondDia: 200, bondLength: 10, alphaBond: 200, P: 600,
}
const anchorIn = {
  fpu: 1860, Aps: 1400, holeDia: 150, bondLength: 6, tauUlt: 700, T: 800,
}
const facingIn = {
  SH: 1.5, SV: 1.5, hc: 150, cover: 40, AsVert: 335, AsHoriz: 335,
  fc: 21, fy: 415, bearingPlate: 0.225, nailHeadForce: 60,
}

const setLayers: SoilLayer[] = [
  { name: 'Sand fill', H: 3, gamma: 18, gammaSat: 20 },
  { name: 'Soft clay', H: 6, gamma: 17, gammaSat: 18, e0: 1.1, Cc: 0.35, cv: 1.5, sigmaP: 90 },
  { name: 'Stiff clay', H: 5, gamma: 19, gammaSat: 20, e0: 0.7, Cc: 0.18, cv: 4, sigmaP: 300 },
]
const setIn = { q: 120, B: 2.5, L: 3.5, Df: 1.5, waterTable: 3, Es: 25000, nu: 0.3, years: 10, layers: setLayers }

function settlementCase() {
  const cons = consolidationSettlement({
    layers: setLayers, q: setIn.q, B: setIn.B, L: setIn.L, Df: setIn.Df,
    waterTable: setIn.waterTable, slices: 20,
  })
  const elastic = elasticSettlement({ q: setIn.q, B: setIn.B, L: setIn.L, Es: setIn.Es, nu: setIn.nu })
  const schmert = schmertmannSettlement({
    dp: setIn.q, B: setIn.B, L: setIn.L,
    sigma0: effectiveStress(setLayers, setIn.Df, setIn.waterTable), gamma: setLayers[0].gamma,
    layers: Array.from({ length: 40 }, () => ({ H: 0.2, Es: setIn.Es })), years: setIn.years,
  })
  const govLayer = cons.layers.reduce(
    (best, l, k) => (l.settlement > (cons.layers[best]?.settlement ?? -1) ? k : best), 0)
  const govSoil = setLayers[govLayer]
  return {
    cons, elastic, schmert, total: elastic + cons.total, govLayer,
    t90: timeToConsolidation(govSoil, 0.9), Uat: consolidationAfter(govSoil, setIn.years),
    sigma0: effectiveStress(setLayers, setIn.Df, setIn.waterTable),
  }
}

// 10 m slope at 30°, c-φ soil — the same default the page ships with.
const slopeGround: Pt[] = [
  { x: 0, y: 10 }, { x: 8, y: 10 },
  { x: 8 + 10 / Math.tan((30 * Math.PI) / 180), y: 0 },
  { x: 8 + 10 / Math.tan((30 * Math.PI) / 180) + 12, y: 0 },
]
const slopeSoil: SlopeSoil = { c: 20, phiDeg: 25, gamma: 18 }

const pileIn = {
  soilKind: 'clay' as const, L: 12, D: 0.6, EI: 180000, My: 900,
  H: 150, e: 0.5, head: 'free' as const,
  cu: 40, e50: 0.01, phiDeg: 33, k: 25000, gamma: 9,
}

const rwIn = {
  Hs: 3000, tb: 500, ts: 300, bt: 500, bh: 1500,
  gamma_s: 18, phi_deg: 30, q_sur: 10, mu: 0.5, qa: 200,
  fc: 28, fy: 415, cover: 75, barDia: 16,
}

const BUILDERS: [string, () => SolutionStep[]][] = [
  ['punching shear', () => buildPunchingSolution(punchIn, designPunchingShear(punchIn))],
  ['torsion', () => buildTorsionSolution(torsIn, designTorsion(torsIn))],
  ['development length', () => buildDevLengthSolution(devIn, calcDevLength(devIn))],
  ['two-way slab', () => buildSlabSolution(slabIn, designSlabDDM(slabIn))],
  ['stair', () => buildStairSolution(stairIn, designStair(stairIn))],
  ['water tank', () => buildWaterTankSolution(tankIn, designCircularTank(tankIn))],
  ['soil nail', () => buildSoilNailSolution(nailIn, designSoilNail(nailIn))],
  ['micropile', () => buildMicropileSolution(mpIn, designMicropile({ section: mpSection, ...mpIn }))],
  ['rock anchor', () => buildRockAnchorSolution(anchorIn, designRockAnchor(anchorIn))],
  ['shotcrete facing', () => buildFacingSolution(facingIn, designFacing(facingIn))],
  ['settlement', () => buildSettlementSolution(setIn, settlementCase())],
  ['slope stability', () => {
    const res = searchCriticalCircle(slopeGround, slopeSoil, { n: 30 })!
    return buildSlopeSolution(
      { H: 10, beta: 30, crestW: 8, toeW: 12, soil: slopeSoil, ru: 0, method: 'bishop' },
      res, res.critical,
    )
  }],
  ['lateral pile', () => {
    const broms = bromsClay({ L: pileIn.L, d: pileIn.D, cu: pileIn.cu, My: pileIn.My, e: pileIn.e, head: pileIn.head })
    const py = pyAnalysis({
      L: pileIn.L, D: pileIn.D, EI: pileIn.EI, H: pileIn.H, e: pileIn.e, head: pileIn.head,
      soil: { kind: 'clay', cu: pileIn.cu, gamma: pileIn.gamma, e50: pileIn.e50 }, elements: 60,
    })
    return buildLateralPileSolution(pileIn, broms, py)
  }],
  ['retaining wall', () => buildRetainingWallSolution(rwIn, designRetainingWall(rwIn))],
]

const eqs = (steps: SolutionStep[]) =>
  steps.flatMap((s) => s.lines).filter((l): l is { tex: string } => 'tex' in l).map((l) => l.tex)
const texts = (steps: SolutionStep[]) =>
  steps.flatMap((s) => s.lines).filter((l): l is { text: string } => 'text' in l).map((l) => l.text)

describe.each(BUILDERS)('%s worked solution', (_name, build) => {
  const steps = build()

  it('has several titled steps, not one lump', () => {
    expect(steps.length).toBeGreaterThanOrEqual(3)
    for (const s of steps) expect(s.title.length).toBeGreaterThan(3)
  })

  it('cites a standard on every step', () => {
    // A clause number, a Table reference or a named standard all count — the
    // requirement is that a reader can look up WHERE the rule comes from, not
    // that the citation contains a § character. (My first version demanded §
    // and failed on "ACI 318-14 Table 9.3.1.1" and "IS 3370 / ACI 350", both
    // of which are perfectly good references.)
    const STANDARD = new RegExp([
      'ACI', 'NSCP', 'AISC', String.raw`IS \d`, 'PTI', 'FHWA', 'API RP',
      // Named methods are citations too — each is a published paper an
      // engineer can pull, which is exactly what this test is protecting.
      'Broms', 'Terzaghi', 'Boussinesq', 'Bishop', 'Fellenius', 'Janbu',
      'Schmertmann', 'Steinbrenner', 'Matlock', 'Skempton', 'Rankine', 'Coulomb',
      'working stress', 'thin-cylinder', 'Good practice',
    ].join('|'), 'i')
    for (const s of steps) {
      expect(s.clause, s.title).toBeTruthy()
      expect(s.clause!, s.title).toMatch(STANDARD)
      expect(s.clause!.length, s.title).toBeGreaterThan(5)
    }
  })

  it('explains each step in words, not only symbols', () => {
    // An engineer checking a sheet needs to know WHY a step is there.
    expect(texts(steps).length).toBeGreaterThanOrEqual(steps.length)
    for (const t of texts(steps)) expect(t.length).toBeGreaterThan(30)
  })

  it('SUBSTITUTES values — every equation shows numbers, not just symbols', () => {
    for (const t of eqs(steps)) {
      expect(t, t.slice(0, 60)).toMatch(/\d/)
    }
  })

  it('shows a substitution chain, not a bare answer', () => {
    // At least most equations should read `symbol = substitution = result`,
    // i.e. carry two '=' signs. A few one-liners (a stated factor) are fine.
    const chained = eqs(steps).filter((t) => (t.match(/=/g) ?? []).length >= 2)
    expect(chained.length / eqs(steps).length).toBeGreaterThan(0.5)
  })

  it('carries units on the results', () => {
    const united = eqs(steps).filter((t) => /\\text\{\s*(mm|kN|MPa|kN·m|m)/.test(t) || /\\text\{mm\}\^2/.test(t))
    expect(united.length).toBeGreaterThanOrEqual(3)
  })

  it('never prints NaN, undefined or an empty substitution', () => {
    for (const t of [...eqs(steps), ...texts(steps)]) {
      expect(t).not.toMatch(/NaN|undefined|Infinity/)
    }
  })
})

describe('degenerate inputs do not produce a broken sheet', () => {
  it('survives a torsion case below the threshold', () => {
    // Torsion negligible: the At/s and Al steps are skipped entirely rather
    // than printing zeros as if they were a design.
    const low = { ...torsIn, Tu: 0.5 }
    const r = designTorsion(low)
    expect(r.torsionNeeded).toBe(false)
    const steps = buildTorsionSolution(low, r)
    expect(steps.some((s) => s.title.includes('Transverse torsional'))).toBe(false)
    for (const t of eqs(steps)) expect(t).not.toMatch(/NaN|undefined/)
  })

  it('survives a section that fails the interaction limit', () => {
    const heavy = { ...torsIn, Tu: 900, Vu: 2000 }
    const r = designTorsion(heavy)
    const steps = buildTorsionSolution(heavy, r)
    const check = steps.find((s) => s.pass !== undefined)!
    expect(check.pass).toBe(r.interactionOK)
    expect(eqs(steps).join(' ')).toContain('ENLARGE')
  })

  it('reports the 300 mm floor when development length falls under it', () => {
    const short = { ...devIn, db: 10, fy: 275, cbKtr_db: 2.5 }
    const r = calcDevLength(short)
    const steps = buildDevLengthSolution(short, r)
    const ldStep = steps.find((s) => s.title.includes('tension'))!
    if (r.ld_raw < 300) expect(ldStep.note).toMatch(/300 mm floor/)
    expect(eqs(steps).join(' ')).toContain(r.ld.toFixed(0))
  })

  it('states a dry settlement profile in words instead of printing Infinity', () => {
    // waterTable: Infinity is the engine's "no water table" sentinel, and
    // sn2(Infinity) would print the word Infinity into the sheet.
    const dry = { ...setIn, waterTable: Infinity }
    const steps = buildSettlementSolution(dry, settlementCase())
    expect(eqs(steps).join(' ')).toContain('not encountered')
    for (const t of eqs(steps)) expect(t).not.toMatch(/NaN|undefined|Infinity/)
  })

  it('calls an unstable slope unstable', () => {
    // Steep and weak: the critical circle should fall well short of FS 1.5.
    const weak: SlopeSoil = { c: 5, phiDeg: 18, gamma: 19 }
    const res = searchCriticalCircle(slopeGround, weak, { n: 30 })!
    const steps = buildSlopeSolution(
      { H: 10, beta: 30, crestW: 8, toeW: 12, soil: weak, ru: 0.3, method: 'bishop' }, res, res.critical)
    const verdict = steps.find((s) => s.pass !== undefined)!
    expect(verdict.pass).toBe(res.critical.bishop.FS >= 1.5)
    expect(verdict.pass).toBe(false)
    expect(eqs(steps).join(' ')).toContain('UNSTABLE')
    // Fellenius ignores interslice forces, so it must not exceed Bishop.
    expect(res.critical.fellenius.FS).toBeLessThanOrEqual(res.critical.bishop.FS + 1e-9)
  })

  it('names the Broms mechanism that actually governs', () => {
    // A weak section yields before the soil does ⇒ long pile; a very strong
    // one cannot, so the soil governs ⇒ short pile. The sheet has to say which.
    const py = pyAnalysis({
      L: 12, D: 0.6, EI: 180000, H: 150, e: 0.5, head: 'free',
      soil: { kind: 'clay', cu: 40, gamma: 9, e50: 0.01 }, elements: 60,
    })
    for (const My of [50, 1e7]) {
      const broms = bromsClay({ L: 12, d: 0.6, cu: 40, My, e: 0.5, head: 'free' })
      const steps = buildLateralPileSolution({ ...pileIn, My }, broms, py)
      const gov = steps.find((s) => s.title.includes('Governing'))!
      expect(eqs([gov]).join(' ')).toContain(`\\text{${broms.mode} pile}`)
      for (const t of eqs(steps)) expect(t).not.toMatch(/NaN|undefined|Infinity/)
    }
    expect(bromsClay({ L: 12, d: 0.6, cu: 40, My: 50, e: 0.5, head: 'free' }).mode).toBe('long')
    expect(bromsClay({ L: 12, d: 0.6, cu: 40, My: 1e7, e: 0.5, head: 'free' }).mode).toBe('short')
  })
})
