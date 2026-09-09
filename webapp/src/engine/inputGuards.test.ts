import { describe, it, expect } from 'vitest'
import { compact, positive, nonNegative, atLeast, inRange, finite, effectiveDepth } from './inputGuards'
import { designBeam, type BeamDesignInput } from './beamDesign'
import { designAxialColumn, type AxialColumnInput } from './columnDesign'
import { designRetainingWall, type RetainingWallInput } from './retainingWall'
import { designPileCap, type PileCapInput } from './pileCap'
import { designSlabDDM, type SlabInput } from './slabDDM'

describe('the guard predicates', () => {
  it('positive accepts only finite values above zero', () => {
    expect(positive(1, 'x')).toBeNull()
    for (const v of [0, -1, NaN, Infinity, -Infinity, undefined]) {
      expect(positive(v, 'x')).toMatch(/greater than zero/)
    }
  })

  it('nonNegative admits zero, which positive does not', () => {
    // The distinction carries real meaning: a cover of 0 and a surcharge of 0
    // are things a designer chooses; a bar Ø of 0 is not a bar.
    expect(nonNegative(0, 'x')).toBeNull()
    expect(positive(0, 'x')).not.toBeNull()
    expect(nonNegative(-0.001, 'x')).toMatch(/cannot be negative/)
  })

  it('inRange excludes its upper bound', () => {
    // φ = 90° is the case this exists for: it makes Ka zero and every factor
    // of safety infinite, so it must be OUT while φ = 0 stays in.
    expect(inRange(0, 0, 90, 'φ')).toBeNull()
    expect(inRange(89.9, 0, 90, 'φ')).toBeNull()
    expect(inRange(90, 0, 90, 'φ')).not.toBeNull()
    expect(inRange(-1, 0, 90, 'φ')).not.toBeNull()
  })

  it('atLeast and finite behave at their edges', () => {
    expect(atLeast(2, 2, 'legs')).toBeNull()
    expect(atLeast(1.9, 2, 'legs')).toMatch(/at least 2/)
    expect(finite(-5, 'Mu')).toBeNull()      // a negative demand is real
    expect(finite(NaN, 'Mu')).toMatch(/not a number/)
  })

  it('effectiveDepth fails exactly when nothing is left', () => {
    expect(effectiveDepth(500, 40, 10, 20)).toBeNull()          // 440 mm
    expect(effectiveDepth(50, 40, 10, 20)).not.toBeNull()       // −10 mm
    expect(effectiveDepth(50, 40, 0, 20)).not.toBeNull()        // exactly 0
  })

  it('compact drops the nulls and keeps the order', () => {
    expect(compact([null, 'a', null, 'b'])).toEqual(['a', 'b'])
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE REGISTRY — one row per guarded engine.
//
// This defect was found independently in the beam, the column, three footings
// and the retaining wall, and each was fixed on its own. This table is what
// stops the seventh engine repeating it: adding a row is the last step of
// guarding an engine, and the sweep below then holds it to the same contract.
//
// Engines NOT yet in this table, measured to have the same defect (each its
// own change). Add the row when the guard lands.
//
//   waterTank  t = −250 reports `thicknessOK` TRUE with d = −125 mm: the crack
//              check is fct = T/(1000·t + (n−1)·As), and a negative t flips the
//              denominator, so fct comes out negative and "passes". H = −4
//              gives hoopAs = −1509 mm² (negative steel) and sigmaSt = 0 gives
//              Infinity, both with `thicknessOK` and `freeboardOK` true.
//   stair      span = 0 is the ONLY input in the sweep that reports ok = true
//              AND tMinOK = true; fy = 0 gives AsMain = Infinity; cover = −20
//              lifts d from 124 to 164 mm.
//   torsion    cover = −40 lifts d 440 → 520 mm, and ⌀0 bar, ⌀0 stirrup,
//              fyt = 0, legs = 0 and a negative Tu all keep `interactionOK`
//              true. b = 0, h = 0 and f'c = 0 are already caught.
//   shearWall  hw = 0, fy = 0, ⌀0 bar and a negative Vu all keep `shearOK` and
//              `capOK` true. A zero or negative thickness or length is already
//              caught (Acv goes to zero or negative, and the ratios with it).
// ─────────────────────────────────────────────────────────────────────────
interface Guarded<I> {
  name: string
  /** A section that is real, so the sweep can prove the guard is not simply
   *  refusing everything. */
  base: I
  /** Every verdict the engine publishes. ALL of them must fall together. */
  verdicts: (i: I) => boolean[]
  /** The engine's own list of reasons. */
  notes: (i: I) => string[]
  /** Degenerate overrides this engine should refuse, by name. */
  bad: Record<string, Partial<I>>
}

const beam: Guarded<BeamDesignInput> = {
  name: 'designBeam',
  base: {
    b: 300, h: 500, cover: 40, barDia: 20, comprBarDia: 16, stirrupDia: 10,
    legs: 2, fc: 28, fy: 415, fyt: 415, Mu: 150, Vu: 90,
  },
  verdicts: (i) => [designBeam(i).flexOK],
  notes: (i) => designBeam(i).flexNotes,
  bad: {
    'zero bar Ø': { barDia: 0 },
    'negative cover': { cover: -40 },
    'zero strength': { fc: 0 },
    'no depth': { h: 0 },
  },
}

const column: Guarded<AxialColumnInput> = {
  name: 'designAxialColumn',
  base: {
    shape: 'tied', b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10,
    fc: 28, fy: 415, Pu: 2000,
  },
  verdicts: (i) => { const r = designAxialColumn(i); return [r.axialOK, r.rhoOK] },
  notes: (i) => designAxialColumn(i).inputNotes,
  bad: {
    'zero bar Ø': { barDia: 0 },
    'negative cover': { cover: -40 },
    'zero strength': { fc: 0 },
    'no section': { b: 0 },
  },
}

const wall: Guarded<RetainingWallInput> = {
  name: 'designRetainingWall',
  base: {
    Hs: 3500, tb: 400, ts: 350, bt: 900, bh: 1800,
    gamma_s: 18, phi_deg: 32, q_sur: 10, mu: 0.5, qa: 200,
    fc: 21, fy: 415, cover: 50, barDia: 16,
  },
  verdicts: (i) => {
    const r = designRetainingWall(i)
    return [r.stableOT, r.stableSL, r.bearingOK, r.tensionOK, r.shearOK]
  },
  notes: (i) => designRetainingWall(i).inputNotes,
  bad: {
    'zero bar Ø': { barDia: 0 },
    'negative cover': { cover: -50 },
    'zero strength': { fc: 0 },
    'impossible friction angle': { phi_deg: 90 },
  },
}

const pileCap: Guarded<PileCapInput> = {
  name: 'designPileCap',
  base: {
    serviceLoad: 2000, serviceMomX: 50, serviceMomY: 30,
    ultimateLoad: 2800, ultimateMomX: 70, ultimateMomY: 42,
    nPiles: 4, pileDia: 400, pileCapacity: 700, spacing: 1200, edgeDist: 400,
    colX: 400, colY: 400, fc: 28, fy: 415, cover: 75, barDia: 20, pileEmbed: 100,
  },
  verdicts: (i) => {
    const r = designPileCap(i)
    return [r.capacityOK, r.punchColOK, r.punchPileOK, r.beamXOK, r.beamYOK, r.ldOK]
  },
  notes: (i) => designPileCap(i).inputNotes,
  bad: {
    'zero bar Ø': { barDia: 0 },
    'negative cover': { cover: -75 },
    'zero-yield steel': { fy: 0 },
    'piles stacked on one point': { spacing: 0 },
  },
}

const slab: Guarded<SlabInput> = {
  name: 'designSlabDDM',
  base: { lx: 5, ly: 6, colWidth: 400, D: 3, L: 2, fc: 28, fy: 415 },
  verdicts: (i) => {
    const r = designSlabDDM(i)
    return [r.applicable, r.tensionControlled]
  },
  notes: (i) => designSlabDDM(i).inputNotes,
  bad: {
    'zero bar Ø': { barDia: 0 },
    'negative cover': { cover: -20 },
    'zero-yield steel': { fy: 0 },
    'negative live load': { L: -2 },
  },
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const REGISTRY: Guarded<any>[] = [beam, column, wall, pileCap, slab]

describe.each(REGISTRY)('$name honours the guard contract', (e) => {
  it('passes its own reference input with no notes', () => {
    // Without this the sweep below would be satisfied by an engine that
    // refuses everything.
    expect(e.notes(e.base)).toEqual([])
    expect(e.verdicts(e.base).every(Boolean)).toBe(true)
  })

  for (const [label, override] of Object.entries(e.bad)) {
    it(`refuses ${label} — every verdict falls, with a reason`, () => {
      const bad = { ...e.base, ...(override as object) }
      // A verdict left standing is the whole defect: a page ANDs some subset
      // of these, so one that stays true keeps the page green.
      expect(e.verdicts(bad)).toEqual(e.verdicts(bad).map(() => false))
      // And silence is not a verdict — the page has to be able to say why.
      expect(e.notes(bad).length).toBeGreaterThan(0)
    })
  }
})
