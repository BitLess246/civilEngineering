import { describe, it, expect } from 'vitest'
import { biaxialPoint, biaxialPo, biaxialAtLoad, biaxialAtLoadAndDirection, biaxialAlongRay, rectCageBars, type BiaxialSection } from './biaxialColumn'
import { capacityAtEccentricity, breslerReciprocal, interaction, barLayers, type InteractionInput } from './columnDesign'
import { pmCapacityBiaxial } from './pipeline'
import { biaxialColumnSolution } from '../lib/columnSolution'

// ─────────────────────────────────────────────────────────────────────────
// PUBLISHED EXAMPLE — StructurePoint, "Manual Design Procedure for Columns
// and Walls with Biaxial Bending (ACI 318-11/14/19)", after PCA Notes on ACI
// 318 Example 7.8, with spColumn's results. US units, converted.
//   24 × 24 in, 4-#11 (1.56 in² each) at 2.0 in from each face (bar centres),
//   f′c = 5 ksi (β1 = 0.80), fy = 60 ksi, Es = 29 000 ksi
// Published: Po = 2796 kip; balanced Pb = 1049.2 kip; at Pn = 1846 kip the
//   uniaxial Mnox = 682.8 kip·ft; Pox = 2241 kip at Mnx = 461.5, Poy = 2579.5
//   at Mny = 192.3 (both read off spColumn's uniaxial diagram); Bresler
//   reciprocal Pn = 2100.0 kip; EXACT biaxial at c = 25.11 in, α = 25.24°:
//   Pn = 1846 kip, Mnx = 608 kip·ft, Mny = 245.4 kip·ft.
// ─────────────────────────────────────────────────────────────────────────
const inch = 25.4, kip = 4.4482216, ksi = (kip * 1000) / (inch * inch), kipFt = kip * 0.3048
const As = 1.56 * inch * inch, at = 10 * inch
const sec: BiaxialSection = {
  b: 24 * inch, h: 24 * inch, fc: 5 * ksi, fy: 60 * ksi, Es: 29_000 * ksi, beta1: 0.8,
  bars: [[at, at], [-at, at], [at, -at], [-at, -at]].map(([x, y]) => ({ x, y, As })),
}

describe('exact biaxial — StructurePoint manual-procedure example (published)', () => {
  it('Po = 0.85f′c(Ag − Ast) + fy·Ast = 2796 kip', () => {
    expect(biaxialPo(sec) / kip).toBeCloseTo(2795.9, 0)
  })

  it('uniaxial (α = 0) balanced point: c = 87/(87 + 60)·22 in, Pb = 1049.2 kip', () => {
    const p = biaxialPoint(sec, (87 / 147) * 22 * inch, 0)
    expect(p.Pn / kip).toBeCloseTo(1049.2, 1)
    expect(p.Mny).toBeCloseTo(0, 6)
  })

  it('uniaxial at Pn = 1846 kip: Mnox = 682.8 kip·ft', () => {
    expect(Math.abs(biaxialAtLoad(sec, 1846 * kip, 0)!.Mnx / kipFt / 682.8 - 1)).toBeLessThan(2e-3)
  })

  it('Pox = 2241 kip where the uniaxial diagram reaches Mnx = 461.5 kip·ft (compression branch)', () => {
    // bisect on Pn between the balanced load and Po: Mn falls as Pn rises
    const PatM = (M: number) => {
      let lo = 1049.2 * kip, hi = biaxialPo(sec) * 0.999
      for (let k = 0; k < 80; k++) { const mid = (lo + hi) / 2; if (biaxialAtLoad(sec, mid, 0)!.Mnx > M * kipFt) lo = mid; else hi = mid }
      return (lo + hi) / 2 / kip
    }
    expect(Math.abs(PatM(461.5) / 2241 - 1)).toBeLessThan(2e-3)
    expect(Math.abs(PatM(192.3) / 2579.5 - 1)).toBeLessThan(2e-3)
    // and the reciprocal sum the paper writes out
    expect(breslerReciprocal(2241, 2579.5, 2796)).toBeCloseTo(2100.0, 0)
  })

  it('EXACT biaxial at the paper’s c = 25.11 in, α = 25.24°: Pn ≈ 1846, Mnx ≈ 608, Mny ≈ 245.4 (c, α rounded to 2 dp)', () => {
    const p = biaxialPoint(sec, 25.11 * inch, 25.24)
    expect(Math.abs(p.Pn / kip / 1846 - 1)).toBeLessThan(2e-3)
    expect(Math.abs(p.Mnx / kipFt / 608 - 1)).toBeLessThan(3e-3)
    expect(Math.abs(p.Mny / kipFt / 245.4 - 1)).toBeLessThan(5e-3)
  })

  it('solved the other way — Pn = 1846 kip at α = 25.24° — lands on the same point', () => {
    const p = biaxialAtLoad(sec, 1846 * kip, 25.24)!
    expect(p.c / inch).toBeCloseTo(25.11, 1)
    expect(Math.abs(p.Mnx / kipFt / 608 - 1)).toBeLessThan(3e-3)
    expect(Math.abs(p.Mny / kipFt / 245.4 - 1)).toBeLessThan(5e-3)
  })

  it('symmetry: α = 90° is the uniaxial strength about y; α = 45° on a square section gives Mnx = Mny', () => {
    const x = biaxialAtLoad(sec, 1846 * kip, 0)!, y = biaxialAtLoad(sec, 1846 * kip, 90)!
    expect(y.Mny).toBeCloseTo(x.Mnx, 6)
    const d = biaxialAtLoad(sec, 1846 * kip, 45)!
    expect(d.Mnx).toBeCloseTo(d.Mny, 6)
    expect(biaxialAtLoadAndDirection(sec, 1846 * kip, 45)!.alpha).toBeCloseTo(45, 3)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// BRESLER AGAINST THE EXACT SURFACE — the engine's own design route
// (`capacityAtEccentricity` along each uniaxial ray, `breslerReciprocal`) on
// the same section, against the exact capacity along the SAME load ray (Es =
// 200 GPa in both, so the two routes differ only by method). The paper's
// demand — Pu = 1200 kip, Mux = 300, Muy = 125 kip·ft — is ex = 3.0 in,
// ey = 1.25 in.
//
// MEASURED, and the reason this module exists: above the balanced load
// (Pb ≈ 1049 kip) the reciprocal method is conservative by 4–6 %; BELOW it —
// still above the 0.1f′cAg = 288 kip the design check switches on at — it
// OVERESTIMATES the exact capacity by about 3.5 %. Bresler's own caveat (PCA
// Notes Ch. 7: "reasonably accurate when flexure does not govern") is the
// whole story; 0.1f′cAg does not keep flexure from governing.
// ─────────────────────────────────────────────────────────────────────────
describe('Bresler reciprocal (the design check) against the exact surface', () => {
  const ui: InteractionInput = { b: 24 * inch, h: 24 * inch, cover: 0, barDia: 0, tieDia: 0, fc: 5 * ksi, fy: 60 * ksi, numBars: 4, beta1: 0.8,
    layers: [{ d: 2 * inch, n: 2, As: 2 * As }, { d: 22 * inch, n: 2, As: 2 * As }] }
  const s200 = { ...sec, Es: 200_000 }
  const both = (exIn: number, eyIn: number) => {
    const ex = exIn * inch, ey = eyIn * inch
    const bres = breslerReciprocal(capacityAtEccentricity(ui, ex / 1000).Pn, capacityAtEccentricity(ui, ey / 1000).Pn, interaction(ui).Po)   // e in m
    const exact = biaxialAlongRay(s200, ex, ey)!
    return { ex, ey, bres, exact }
  }

  it.each([
    ['the paper’s demand, ex = 3.0 in, ey = 1.25 in', 3.0, 1.25],
    ['a diagonal ray, ex = ey = 2 in', 2, 2],
    ['a flatter ray, ex = 1 in, ey = 4 in', 1, 4],
  ])('compression governing — %s: conservative, by under 7 per cent', (_, exIn, eyIn) => {
    const { ex, ey, bres, exact } = both(exIn, eyIn)
    expect(exact.Mnx / exact.Pn).toBeCloseTo(ex / 1000, 4)          // on the ray
    expect(exact.Mny / exact.Pn).toBeCloseTo(ey / 1000, 4)
    expect(exact.Pn / kip).toBeGreaterThan(1049.2)
    expect(bres).toBeLessThan(exact.Pn)
    expect(bres / exact.Pn).toBeGreaterThan(0.93)
  })

  it.each([
    ['ex = 8 in, ey = 6 in', 8, 6],
    ['ex = 12 in, ey = 3 in', 12, 3],
  ])('below the balanced load — %s: UNCONSERVATIVE by about 3.5 per cent though above 0.1f′cAg', (_, exIn, eyIn) => {
    const { bres, exact } = both(exIn, eyIn)
    expect(exact.Pn / kip).toBeLessThan(1049.2)
    expect(exact.Pn / kip).toBeGreaterThan(0.1 * 5 * 24 * 24)
    expect(bres / exact.Pn).toBeGreaterThan(1.02)
    expect(bres / exact.Pn).toBeLessThan(1.05)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE DESIGN CHECK, CAPPED — `pmCapacityBiaxial` evaluates the column's own
// cage along the demand's own ray and reports the smaller capacity.
// 400 × 400, 8⌀20 all-around, f′c 28, fy 415.
// ─────────────────────────────────────────────────────────────────────────
describe('pmCapacityBiaxial — the exact surface caps the approximation', () => {
  const rc = { id: 's', name: 'C', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const cage = { b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10, fc: 28, fy: 415, numBars: 8, layout: 'all-around' as const }
  const cap = 0.65 * interaction(cage).PnMax
  const exactOf = (Pu: number, Mx: number, My: number) => {
    const { nx, ny } = barLayers(cage)
    return biaxialAlongRay({ b: 400, h: 400, fc: 28, fy: 415, bars: rectCageBars(cage, nx, ny) }, (Mx / Pu) * 1000, (My / Pu) * 1000)!
  }

  it('the cage helper places 8 bars: 3 per b-face and one mid-side each side', () => {
    const { nx, ny } = barLayers(cage)
    const bars = rectCageBars(cage, nx, ny)
    expect(bars.length).toBe(8)
    expect(new Set(bars.map((b) => b.y.toFixed(3))).size).toBe(3)        // top, middle, bottom rows
  })

  it('below the balanced load Bresler overestimates — the exact strength is reported, on the demand ray', () => {
    const r = pmCapacityBiaxial(rc, 20, 8, 900, 160, 120, cap, 'all-around')
    expect(r.method).toBe('exact')
    expect(r.detail.approxMethod).toBe('bresler')
    expect(r.detail.approxPhiPn!).toBeGreaterThan(r.phiPn)
    const x = r.detail.exact!
    expect(x.Mnx / x.Pn).toBeCloseTo(160 / 900, 6)
    expect(x.Mny / x.Pn).toBeCloseTo(120 / 900, 6)
    expect(r.phiPn).toBeCloseTo(Math.min(x.phi * x.Pn, cap), 9)
    expect(r.util).toBeCloseTo(900 / r.phiPn, 12)
  })

  it('where Bresler is the smaller it stands — the exact surface only ever lowers a capacity', () => {
    const r = pmCapacityBiaxial(rc, 20, 8, 1500, 150, 110, cap, 'all-around')
    expect(r.method).toBe('bresler')
    const x = exactOf(1500, 150, 110)
    expect(Math.min(x.phi * x.Pn, cap)).toBeGreaterThanOrEqual(r.phiPn)
  })

  it('the worked solution says which governed, and cites §22.2', () => {
    const r = pmCapacityBiaxial(rc, 20, 8, 900, 160, 120, cap, 'all-around')
    const t = JSON.stringify(biaxialColumnSolution(900, 160, 120, r.phiPn, r.util, r.method, r.detail))
    expect(t).toContain('exact strain compatibility')
    expect(t).toContain('§22.2')
    expect(t).toContain("Bresler's reciprocal load would allow")
  })
})
