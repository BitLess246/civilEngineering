// ─────────────────────────────────────────────────────────────────────────
// COMPOSITION TESTS — does the pipeline actually USE the engines it imports?
//
// This file exists because of a specific failure. Three functions —
// `weakAxisFlexure`, `breslerReciprocal` and `columnKFactors` — were correct,
// tested, and passing. The pipeline that is supposed to consume them either
// never called them or called them with a placeholder, and 4067 tests stayed
// green the whole time, because every one of those tests exercised a function
// IN ISOLATION and nothing exercised the composition.
//
// So these assertions deliberately do not check a number against a hand calc —
// `steelDesign.test.ts` and `columnDesign.test.ts` already do that well. They
// check that information SURVIVES THE JOURNEY from the solver, through the
// bridge, into the design row. Each one fails loudly if a future refactor goes
// back to reading a display summary where a per-axis value belongs.
// ─────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest'
import { designSteelColumnRowForTest as designRow } from './pipeline'
// `?raw` rather than node:fs — the app project carries no @types/node.
import pipelineSrc from './pipeline.ts?raw'
import { shapeByName } from './aiscSections'
import type { F3MemberResult } from './frame3d'
import type { RectSection } from './model'
import type { ColumnK } from './effectiveLength'

const steelSection: RectSection = {
  id: 'C1', name: 'W310x52', b: 300, h: 500, fc: 28, fy: 415,
  barDia: 20, tieDia: 10, cover: 40, material: 'steel', shape: 'W310x52', steelFy: 248,
}

/** A member result carrying explicit per-axis moment diagrams. */
function member(Mz: number, My: number, N = -300): F3MemberResult {
  return {
    id: 'C1', L: 3.5,
    f: new Array(12).fill(0),
    xs: [0, 1],
    N: [N, N], Vy: [0, 0], Vz: [0, 0], T: [0, 0],
    My: [My, 0], Mz: [Mz, 0],
    Nmax: Math.abs(N), Vmax: 0, Tmax: 0,
    Mmax: Math.max(Math.abs(My), Math.abs(Mz)),
  }
}

describe('the steel column check sees BOTH bending axes', () => {
  it('reports a higher ratio for biaxial bending than for the strong axis alone', () => {
    // THE ASSERTION THAT WOULD HAVE CAUGHT IT. Adding a second orthogonal
    // moment cannot leave the interaction ratio unchanged; when it did, the
    // weak-axis term was being discarded.
    const uniaxial = designRow(member(60, 0), steelSection)!
    const biaxial = designRow(member(60, 40), steelSection)!
    expect(biaxial.ratio).toBeGreaterThan(uniaxial.ratio)
  })

  it('does not divide a weak-axis moment by strong-axis capacity', () => {
    // The second half of the old defect: `Mmax` took whichever moment was
    // larger and compared it against φMnx. A moment applied about the WEAK
    // axis must therefore cost far more ratio than the same magnitude about
    // the strong axis, because φMny is 2–4× smaller for a W-shape.
    const strong = designRow(member(60, 0), steelSection)!
    const weak = designRow(member(0, 60), steelSection)!
    expect(weak.ratio).toBeGreaterThan(strong.ratio * 1.5)
  })

  it('reports both demands and both capacities, so the row can be hand-checked', () => {
    const r = designRow(member(60, 40), steelSection)!
    expect(r.Mu).toBeCloseTo(60, 6)     // strong axis, from Mz
    expect(r.Muy).toBeCloseTo(40, 6)    // weak axis, from My
    expect(r.phiMny).toBeGreaterThan(0)
    expect(r.phiMny).toBeLessThan(r.phiMn)
  })

  it('takes the strong-axis demand from Mz and the weak from My, not from Mmax', () => {
    // Axis identity, pinned. `modelBridge` maps the section's strong axis to
    // Iz, so a swap here would silently exchange the two capacities and the
    // ratio would still look plausible.
    const r = designRow(member(20, 60), steelSection)!
    expect(r.Mu).toBeCloseTo(20, 6)
    expect(r.Muy).toBeCloseTo(60, 6)
  })

  it('the shipped §H1-1 ratio for a known biaxial case fails as it should', () => {
    // Pu = 300 kN, 60 kN·m weak, 20 kN·m strong on a W310x52 — the case that
    // reported 0.645 (pass) before the fix. Anything under 1.0 here means the
    // weak-axis term has gone missing again.
    const r = designRow(member(20, 60), steelSection)!
    expect(r.ratio).toBeGreaterThan(1.0)
    expect(r.ok).toBe(false)
  })
})

describe('the steel column check uses a real effective length', () => {
  const K = (kx: number, kz: number): ColumnK => ({
    memberId: 'C1',
    Gi: { x: 1, z: 1 }, Gj: { x: 1, z: 1 },
    Kx: { braced: 0.8, sway: kx },
    Kz: { braced: 0.8, sway: kz },
  })

  it('a sway column has a lower capacity than the same column braced', () => {
    // The assertion that catches a return to the hardcoded K.
    const sway = designRow(member(20, 0), steelSection, K(1.9, 1.6), false)!
    const braced = designRow(member(20, 0), steelSection, K(1.9, 1.6), true)!
    expect(sway.phiPn).toBeLessThan(braced.phiPn)
    expect(sway.slenderness).toBeGreaterThan(braced.slenderness)
  })

  it('defaults to sway when no bracing is declared', () => {
    const explicitSway = designRow(member(20, 0), steelSection, K(1.9, 1.6), false)!
    const defaulted = designRow(member(20, 0), steelSection, K(1.9, 1.6))!
    expect(defaulted.phiPn).toBeCloseTo(explicitSway.phiPn, 9)
    expect(defaulted.braced).toBe(false)
  })

  it('maps K to the axis it actually restrains', () => {
    // `ColumnK` is named for the SWAY DIRECTION, not the bending axis: Kz
    // bends the column about Iz (strong) and therefore pairs with rx. Crossing
    // them is invisible in the ratio but wrong in the slenderness, so pin it.
    const shape = shapeByName('W310x52')!
    const r = designRow(member(20, 0), steelSection, K(2.0, 1.0), false)!
    // Kx = 2.0 restrains the WEAK axis → drives slendernessY through ry.
    expect(r.Ky).toBeCloseTo(2.0, 9)
    expect(r.Kx).toBeCloseTo(1.0, 9)
    expect(r.slendernessY).toBeCloseTo((2.0 * 3500) / shape.ry, 6)
    expect(r.slendernessX).toBeCloseTo((1.0 * 3500) / shape.rx, 6)
  })

  it('falls back to K = 1.0 only when the model gives no K at all', () => {
    const r = designRow(member(20, 0), steelSection)!
    expect(r.Kx).toBe(1.0)
    expect(r.Ky).toBe(1.0)
  })

  it('reports the K it used, so the schedule can show the assumption', () => {
    const r = designRow(member(20, 0), steelSection, K(1.9, 1.6), false)!
    expect(r.Kx).toBeCloseTo(1.6, 9)   // strong axis ← Kz
    expect(r.Ky).toBeCloseTo(1.9, 9)   // weak axis   ← Kx
  })
})

describe('no design path reads the Mmax display summary', () => {
  it('the steel column row derives its demands from per-axis arrays', () => {
    // A guard in the style of `featureGate.ts`, which greps the worker source
    // to keep its solver-kind table honest. `Mmax` is the max of two
    // ORTHOGONAL moments — a legitimate thing to display and never a
    // legitimate design input. If this fails, read why before deleting it.
    const fn = pipelineSrc.slice(
      pipelineSrc.indexOf('function designSteelColumnRow'),
      pipelineSrc.indexOf('const beamOK ='),
    )
    expect(fn).not.toMatch(/\bmr\.Mmax\b/)
    expect(fn).toMatch(/mr\.Mz\.map/)
    expect(fn).toMatch(/mr\.My\.map/)
  })
})
