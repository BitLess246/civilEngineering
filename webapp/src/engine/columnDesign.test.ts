import { describe, it, expect } from 'vitest'
import {
  designAxialColumn, interaction, capacityAtEccentricity, breslerReciprocal, barLayers,
  momentMagnificationNonsway, columnDetailingNotes, pmAtDepth,
  type AxialColumnInput, type InteractionInput,
} from './columnDesign'

describe('axial — tied (review Concrete 7, Problem 2)', () => {
  // 400 sq tied, D=1400 kN, L=790 kN → Pu = 1.2D + 1.6L = 2944 kN; 28 mm bars.
  const Pu = 1.2 * 1400 + 1.6 * 790
  const r = designAxialColumn({
    shape: 'tied', b: 400, h: 400, cover: 40, barDia: 28, tieDia: 10,
    fc: 28, fy: 415, Pu,
  })

  it('factored load and required bars (8 ⌀28)', () => {
    expect(Pu).toBeCloseTo(2944, 6)
    expect(r.bars).toBe(8)
    expect(r.axialOK).toBe(true)
    expect(r.rhoOK).toBe(true)
  })

  it('§425.7.2 spacing = min(16×28=448, 48×10=480, 400) = 400 mm', () => {
    expect(r.tieSpacing).toBe(400)
    expect(r.tieGovern).toBe('least dim')
    expect(r.tieSpacingFinal).toBe(400)   // gravity → same as §425.7.2
  })
})

describe('axial — tied, SMF seismic §418.7.5', () => {
  // 500×500 column, barDia=25, tieDia=10, Lu=3000 mm, hx=200 (lateral tie spacing)
  const r = designAxialColumn({
    shape: 'tied', b: 500, h: 500, cover: 40, barDia: 25, tieDia: 10,
    fc: 28, fy: 415, Pu: 2000,
    system: 'smf', columnLength: 3000, hx: 200,
  })

  it('§425.7.2 gives ≥300 mm but SMF conf. governs', () => {
    expect(r.tieSpacing).toBeGreaterThanOrEqual(300)
    expect(r.seismicSConf).toBeDefined()
    expect(r.tieSpacingFinal).toBeLessThan(r.tieSpacing)
    expect(r.tieSpacingLabel).toContain('SMF')
  })

  it('SMF conf. spacing ≤ min(bMin/4, 6db, so)', () => {
    const bMin = 500, db = 25, hx = 200
    const so = Math.min(Math.max(100 + (350 - hx) / 3, 100), 150)
    const expected = Math.min(bMin / 4, 6 * db, so)
    expect(r.seismicSConf).toBeCloseTo(expected, 6)
  })

  it('so = clamp(100 + (350−hx)/3, 100, 150) for hx = 200', () => {
    // so = 100 + (350-200)/3 = 100 + 50 = 150 mm
    expect(r.seismicSConf!).toBeCloseTo(Math.min(500 / 4, 6 * 25, 150), 6)
  })

  it('SMF confinement zone lo ≥ max(bMax, Lu/6, 450)', () => {
    // max(500, 3000/6=500, 450) = 500
    expect(r.seismicLoZone).toBeCloseTo(Math.max(500, 3000 / 6, 450), 6)
  })

  it('outside confinement zone: s ≤ min(6db, 150)', () => {
    expect(r.seismicSOut).toBeCloseTo(Math.min(6 * 25, 150), 6)
  })
})

describe('axial — tied, IMF seismic §418.4.3', () => {
  const r = designAxialColumn({
    shape: 'tied', b: 400, h: 400, cover: 40, barDia: 25, tieDia: 10,
    fc: 28, fy: 415, Pu: 1500, system: 'imf',
  })

  it('IMF conf. spacing = min(8db, 24dt, bMin/2, 300)', () => {
    const expected = Math.min(8 * 25, 24 * 10, 400 / 2, 300)
    expect(r.seismicSConf).toBeCloseTo(expected, 6)
  })

  it('IMF hinge zone lo = max(clear span/6, bMax, 450) — §418.4.3.3 (e)(f)(g)', () => {
    // The clear-span term was missing, and this test encoded its absence. On a
    // 4 m column 300 square the clause asks for 4000/6 = 667 and the code gave
    // max(300, 450) = 450 — a confined length a third short of the rule.
    expect(r.seismicLoZone).toBeCloseTo(Math.max(3000 / 6, 400, 450), 6)
    const tall = designAxialColumn({
      shape: 'tied', b: 300, h: 300, cover: 40, barDia: 20, tieDia: 10,
      fc: 28, fy: 415, Pu: 800, numBars: 8, system: 'imf', columnLength: 4000,
    })
    expect(tall.seismicLoZone).toBeCloseTo(4000 / 6, 6)
    expect(tall.seismicLoZone!).toBeGreaterThan(450)
  })
})

describe('axial — spiral (review Concrete 7, Problem 3 / key 2,423.70 kN)', () => {
  const r = designAxialColumn({
    shape: 'spiral', D: 400, cover: 40, barDia: 25, tieDia: 10,
    fc: 21, fy: 415, Pu: 1000, numBars: 8,
  })

  it('Po and design strength φPn = 0.75·0.85·Po', () => {
    expect(r.phiPnMax).toBeCloseTo(2424.2, 0)   // key rounds π to 2423.70
    expect(r.phi).toBe(0.75)
    expect(r.alpha).toBe(0.85)
  })

  it('spiral ratio ≥ max[0.45(Ag/Ach−1), 0.12]·f′c/fyt and clear pitch 25–75', () => {
    const Ag = (Math.PI / 4) * 400 ** 2
    const Ach = (Math.PI / 4) * 320 ** 2
    const expected = Math.max(0.45 * (Ag / Ach - 1), 0.12) * (21 / 415)
    expect(r.rhoS).toBeCloseTo(expected, 9)
    const clear = r.spiralPitch - 10
    expect(clear).toBeGreaterThanOrEqual(25 - 1e-9)
    expect(clear).toBeLessThanOrEqual(75 + 1e-9)
  })
})

describe('interaction — balanced condition (review Concrete 8, Problem 4 keys)', () => {
  // 300×400, f'c = 21, fy = 415, 6 ⌀28 (3 per 300 mm face), cover to centroid 60.
  // Keys: Pb = 881.87 kN, Mb = 314.86 kN·m, eb = 357.03 mm.
  const inp = {
    b: 300, h: 400, cover: 40, barDia: 28, tieDia: 6,  // 40+6+14 = 60 to centroid
    fc: 21, fy: 415, numBars: 6,
  }

  it('Pb, Mb, eb match the answer key', () => {
    const r = interaction(inp)
    expect(r.dPrime).toBeCloseTo(60, 9)
    expect(r.balanced.Pb).toBeCloseTo(881.87, 0)
    expect(r.balanced.Mb).toBeCloseTo(314.86, 0)
    expect(r.balanced.eb * 1000).toBeCloseTo(357.03, 0)
  })

  it('the curve passes through Po at large c and φ transitions 0.65 → 0.90', () => {
    const r = interaction(inp)
    const top = r.curve[r.curve.length - 1]
    expect(top.Pn).toBeCloseTo(r.Po, 0)
    expect(top.phi).toBe(0.65)
    const bottom = r.curve[0]
    expect(bottom.phi).toBeCloseTo(0.90, 9)
  })

  it('capacityAtEccentricity recovers the balanced point at e = eb', () => {
    const r = interaction(inp)
    const p = capacityAtEccentricity(inp, r.balanced.eb)
    expect(p.Pn).toBeCloseTo(r.balanced.Pb, 0)
    expect(p.Mn).toBeCloseTo(r.balanced.Mb, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// E4 — THIS ROW USED TO VERIFY THE CODE AGAINST A COPY OF ITSELF.
//
// The assertion was
//     breslerReciprocal(2000, 1500, 4000) ≈ 1 / (1/2000 + 1/1500 − 1/4000)
// against an implementation that IS `1 / (1/Pnx + 1/Pny − 1/Po)`. The expected
// value is the implementation retyped, so it can only catch a transcription
// slip: if the formula itself were wrong, the test would have been written
// wrong in the same way and agreed with it. The closed form IS the definition
// of Bresler's reciprocal method, so there is no independent algebra to check
// it against — which is exactly why the row needed something else.
//
// What replaces it are PROPERTIES a wrong implementation fails. The set was
// checked against three plausible wrong formulas rather than assumed to
// discriminate — every one is caught, and no single property catches all three:
//
//   formula                    sym   Pny=Po  Pnx=Po  bound  Po↑   Po→∞
//   CORRECT                    pass  pass    pass    pass   pass  pass
//   1/x + 1/y + 1/po  (sign)   pass  FAIL    FAIL    pass   FAIL  pass
//   1/x − 1/y + 1/po  (swap)   FAIL  pass    FAIL    FAIL   pass  FAIL
//   1/x + 1/y         (drop)   pass  FAIL    FAIL    pass   FAIL  pass
//
// Note the swap survives symmetry's companion — the Pny = Po degenerate — and
// the Po-monotonicity check, which is why both degenerate cases and the
// symmetry check all have to be here.
//
// The external PCA/spColumn cross-check (ValidationMap C003) is still open and
// is what would close the row fully; this makes the row's INTERNAL evidence
// real, it does not make it an independent reference.
// ─────────────────────────────────────────────────────────────────────────
describe('Bresler reciprocal — properties, not a restatement', () => {
  it('is symmetric in the two axes', () => {
    // Rules out `1/Pnx − 1/Pny + 1/Po`, which survives the Pny = Po degenerate
    // case below and the Po-monotonicity check, but is not symmetric.
    expect(breslerReciprocal(2000, 1500, 4000))
      .toBeCloseTo(breslerReciprocal(1500, 2000, 4000), 9)
  })

  it('collapses to the uniaxial capacity when the other axis reaches Po', () => {
    // 1/Pn = 1/Pnx + 1/Po − 1/Po = 1/Pnx. Rules out the sign error
    // `+ 1/Po`, which gives 1000 here instead of 2000.
    expect(breslerReciprocal(2000, 4000, 4000)).toBeCloseTo(2000, 6)
    expect(breslerReciprocal(4000, 1500, 4000)).toBeCloseTo(1500, 6)
  })

  it('is never stronger than the weaker of the two uniaxial capacities', () => {
    // Biaxial bending cannot buy capacity: adding a second eccentricity can
    // only take it away.
    for (const [x, y, po] of [[2000, 1500, 4000], [3000, 900, 5000], [1200, 1200, 3000]]) {
      expect(breslerReciprocal(x, y, po)).toBeLessThan(Math.min(x, y))
    }
  })

  it('rises with either uniaxial capacity and falls as Po grows', () => {
    // Monotonicity in each argument, with the Po direction being the one a
    // dropped or misplaced term gets backwards.
    expect(breslerReciprocal(2200, 1500, 4000)).toBeGreaterThan(breslerReciprocal(2000, 1500, 4000))
    expect(breslerReciprocal(2000, 1700, 4000)).toBeGreaterThan(breslerReciprocal(2000, 1500, 4000))
    expect(breslerReciprocal(2000, 1500, 9000)).toBeLessThan(breslerReciprocal(2000, 1500, 4000))
  })

  it('approaches the pure harmonic combination as Po → ∞', () => {
    // With no axial term left, 1/Pn → 1/Pnx + 1/Pny. The limit is what pins
    // the −1/Po term as a CORRECTION rather than a principal term.
    const harmonic = 1 / (1 / 2000 + 1 / 1500)          // 857.142857…
    expect(breslerReciprocal(2000, 1500, 1e15)).toBeCloseTo(harmonic, 6)
    // and it approaches from ABOVE, monotonically — subtracting 1/Po makes the
    // reciprocal smaller, so Pn larger, by less and less as Po grows.
    const at = (po: number) => breslerReciprocal(2000, 1500, po)
    expect(at(4000)).toBeGreaterThan(at(40_000))
    expect(at(40_000)).toBeGreaterThan(at(400_000))
    expect(at(400_000)).toBeGreaterThan(harmonic)
  })
})

describe('slenderness — nonsway moment magnification (RC-06 conventions)', () => {
  it('limit 34 + 12(M1/M2) ≤ 40; single curvature (−) lowers it', () => {
    const single = momentMagnificationNonsway({
      Pu: 500, M1: -100, M2: 100, k: 1, Lu: 3, h: 300, EI: 910000 / 1000,
    })
    expect(single.limit).toBeCloseTo(22, 9)      // 34 − 12
    expect(single.Cm).toBeCloseTo(1.0, 9)        // 0.6 + 0.4
    const dbl = momentMagnificationNonsway({
      Pu: 500, M1: 100, M2: 100, k: 1, Lu: 3, h: 300, EI: 910000 / 1000,
    })
    expect(dbl.limit).toBeCloseTo(40, 9)         // 34 + 12 capped at 40 → 46 → 40
    expect(dbl.Cm).toBeCloseTo(0.2, 9)
  })

  it('Euler load, δ ≥ 1 and M2,min = Pu(15 + 0.03h)', () => {
    const r = momentMagnificationNonsway({
      Pu: 1000, M1: -80, M2: 100, k: 0.8, Lu: 4, h: 400, EI: 50000,
    })
    expect(r.Pc).toBeCloseTo((Math.PI ** 2 * 50000) / (0.8 * 4) ** 2, 3)
    expect(r.stable).toBe(true)
    expect(r.delta).toBeGreaterThanOrEqual(1)
    expect(r.M2min).toBeCloseTo((1000 * (15 + 12)) / 1000, 6)   // 27 kN·m
    expect(r.Mc).toBeCloseTo(r.delta * 100, 6)
  })

  it('Pu ≥ 0.75Pc → stable=false with δ, Mc = ∞ (no silent clamp to 1.0)', () => {
    // EI = 10 000 kN·m², kLu = 5 m → Pc = π²·10000/25 ≈ 3947.8 kN; 0.75Pc ≈ 2960.9 kN
    const base = { M1: -80, M2: 100, k: 1, Lu: 5, h: 400, EI: 10000 }
    const Pc = (Math.PI ** 2 * 10000) / 25
    const unstable = momentMagnificationNonsway({ ...base, Pu: 0.80 * Pc })
    expect(unstable.stable).toBe(false)          // Pu = 0.80Pc > 0.75Pc
    expect(unstable.delta).toBe(Infinity)
    expect(unstable.Mc).toBe(Infinity)
    // just below the threshold the magnifier is finite and large, not clamped
    const nearLimit = momentMagnificationNonsway({ ...base, Pu: 0.70 * Pc })
    expect(nearLimit.stable).toBe(true)
    expect(Number.isFinite(nearLimit.delta)).toBe(true)
    expect(nearLimit.delta).toBeGreaterThan(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// PUBLISHED EXAMPLE — StructurePoint, "Slenderness Effects for Columns in
// Non-Sway Frame — Moment Magnification Method (ACI 318-14)" (Nov-14-2019),
// after Wang et al., Reinforced Concrete Design 8th ed., Example 13.17.3,
// with spColumn's results beside the hand solution. US units, converted.
//   17 × 17 in tied, 10-#9 on two faces (Ise = 360 in⁴), f'c = 3 ksi,
//   Ec = 57 000√f'c = 3122 ksi, Es = 29 000 ksi; lu = 12 ft − 24 in beam = 120 in;
//   k = 0.959 (Fig. R6.2.5, ψA = 4.32, ψB = ∞); βdns = 0.40
//   Pu = 525 kip, M2 = 105 kip·ft (top), M1 = 0
// Published (hand | spColumn): kLu/r = 23.45 < 34 → slenderness may be
// neglected; (EI)eff = 10.56×10⁶ | 10.57×10⁶ kip·in²; Pc = 7871 | 7850 kip;
// Cm = 0.6; δns = 0.66 → 1.00; M2,min = 48.56 kip·ft; Mc = 105 kip·ft.
// ─────────────────────────────────────────────────────────────────────────
describe('StructurePoint / spColumn — non-sway slender column, ACI 318-14 (published)', () => {
  const inch = 25.4, kip = 4.4482216, ksi = (kip * 1000) / (inch * inch)
  const kipFt = kip * 0.3048                            // kN·m
  const kipIn2 = kip * (inch / 1000) ** 2               // kN·m²
  const r = momentMagnificationNonsway({
    Pu: 525 * kip, M1: 0, M2: 105 * kipFt, k: 0.959, Lu: (120 * inch) / 1000, h: 17 * inch, b: 17 * inch,
    shape: 'tied', r: 'exact', fc: 3 * ksi, Ec: 3122 * ksi, Es: 29_000 * ksi, Ise: 360 * inch ** 4, betaD: 0.4,
  })

  it('Ise = 360 in⁴ is ten #9 bars at 6.0 in from the axis', () => {
    expect(10 * 1.0 * 6.0 ** 2).toBe(360)
  })

  it('kLu/r = 0.959·120/4.91 = 23.45 ≤ 34 − 12(0) — slenderness may be neglected (§6.2.5)', () => {
    expect(r.r / inch).toBeCloseTo(4.91, 2)
    expect(r.kLuOverR).toBeCloseTo(23.45, 2)
    expect(r.limit).toBe(34)
    expect(r.slender).toBe(false)
  })

  it('(EI)eff by §6.6.4.4.4(b) = 10.56×10⁶ kip·in² (spColumn 10.57×10⁶)', () => {
    expect(r.EI / kipIn2 / 1e6).toBeCloseTo(10.56, 2)
    expect(Math.abs(r.EI / kipIn2 / 10.57e6 - 1)).toBeLessThan(0.002)
  })

  it('Pc = π²(EI)eff/(klu)² = 7871 kip (spColumn 7850, with its k = 0.960)', () => {
    expect(r.Pc / kip).toBeCloseTo(7871, 0)
    expect(Math.abs(r.Pc / kip / 7850 - 1)).toBeLessThan(0.003)
  })

  it('Cm = 0.6, δns = 0.66 → 1.00, Mc = 105 kip·ft', () => {
    expect(r.Cm).toBeCloseTo(0.6, 9)
    expect(r.Cm / (1 - 525 / (0.75 * r.Pc / kip))).toBeCloseTo(0.66, 2)
    expect(r.delta).toBe(1)
    expect(r.Mc / kipFt).toBeCloseTo(105, 6)
  })

  it('M2,min = Pu(0.6 + 0.03h) = 48.56 kip·ft — SI’s 15 mm (= 0.591 in) reads 0.8 % lower', () => {
    expect(Math.abs(r.M2min / kipFt / 48.56 - 1)).toBeLessThan(0.01)
    expect(r.M2min / kipFt).toBeCloseTo(525 * (15 / inch + 0.03 * 17) / 12, 6)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// PUBLISHED EXAMPLE — StructurePoint, "Slenderness Effects Using spColumn —
// Examples", Example 1 (after Pincheira et al., Reinforced Concrete Design
// 9th ed., Example 13.17.5): the spColumn v10.30 report's own numbers.
//   14 × 20 in tied, 6-#11 (two per 20 in face at the corners, one mid-side
//   each 14 in face), clear cover 2.005 in; f'c = 4.5 ksi (Ec = 3823.68 ksi),
//   Es = 29 000 ksi; lu = 22.5 ft, k = 1.00, nonsway; βdns = 0 (all live)
//   Pu = 115 kip; My = 279 kip·ft top and bottom, single curvature; Mx = 0
// Report: kLu/r 66.81 (X) | 46.77 (Y); 0.2EcIg + EsIse 6.83e6 | 2.16e7 kip·in²;
//   Pc 924.39 | 2919.31 kip; Cm 1.000 | 1.000; δ 1.199 | 1.055;
//   Mmin 9.78 | 11.50 kip·ft; Mc 11.72 | 294.47 kip·ft.
// ─────────────────────────────────────────────────────────────────────────
describe('spColumn report — slender nonsway column with δ > 1 (StructurePoint Example 1, published)', () => {
  const inch = 25.4, kip = 4.4482216, ksi = (kip * 1000) / (inch * inch)
  const kipFt = kip * 0.3048, kipIn2 = kip * (inch / 1000) ** 2
  const As = 1.56                                        // #11, in²
  const arm = (half: number) => half - 2.005 - 1.41 / 2  // bar centre from the axis, in
  const common = { Pu: 115 * kip, k: 1, Lu: (270 * inch) / 1000, shape: 'tied' as const, r: 'exact' as const,
    fc: 4.5 * ksi, Ec: (57 * Math.sqrt(4500)) * ksi, Es: 29_000 * ksi, betaD: 0 }
  // Y axis: bending across the 20 in depth; all six bars at 7.29 in
  const y = momentMagnificationNonsway({ ...common, M1: -279 * kipFt, M2: 279 * kipFt, h: 20 * inch, b: 14 * inch,
    Ise: 6 * As * arm(10) ** 2 * inch ** 4 })
  // X axis: across the 14 in depth; the four corner bars at 4.29 in, the mid-side two on the axis
  const x = momentMagnificationNonsway({ ...common, M1: 0, M2: 0, h: 14 * inch, b: 20 * inch,
    Ise: 4 * As * arm(7) ** 2 * inch ** 4 })

  it('kLu/r = 66.81 (X) and 46.77 (Y) — both past 34 − 12(1) = 22, so slender', () => {
    expect(x.kLuOverR).toBeCloseTo(66.81, 2)
    expect(y.kLuOverR).toBeCloseTo(46.77, 2)
    expect(y.limit).toBe(22)
    expect(x.slender && y.slender).toBe(true)
  })

  it('(EI)eff = 0.2EcIg + EsIse with βdns = 0: 6.83e6 (X) and 2.16e7 (Y) kip·in²', () => {
    expect(x.EI / kipIn2 / 1e6).toBeCloseTo(6.83, 2)
    expect(y.EI / kipIn2 / 1e7).toBeCloseTo(2.16, 2)
  })

  it('Pc = 924.39 (X) and 2919.31 (Y) kip', () => {
    expect(Math.abs(x.Pc / kip / 924.39 - 1)).toBeLessThan(1e-4)
    expect(Math.abs(y.Pc / kip / 2919.31 - 1)).toBeLessThan(1e-4)
  })

  it('Cm = 1.000 both ways — single curvature (Y), and M2,min governing (X, §6.6.4.5.4)', () => {
    expect(y.Cm).toBe(1)
    expect(x.Cm).toBe(1)
  })

  it('δ = 1.199 (X) and 1.055 (Y)', () => {
    expect(x.delta).toBeCloseTo(1.199, 3)
    expect(y.delta).toBeCloseTo(1.055, 3)
  })

  it('Mc = δ·M2 = 294.47 kip·ft (Y); X magnifies M2,min — spColumn 11.72, SI’s 15 mm reads ~1 % lower', () => {
    expect(y.Mc / kipFt).toBeCloseTo(294.47, 1)
    expect(Math.abs(x.Mc / kipFt / 11.72 - 1)).toBeLessThan(0.012)
    expect(x.Mc).toBeCloseTo(x.delta * x.M2min, 9)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// PUBLISHED — spColumn v10.30's own "Control Points" table, StructurePoint
// "Slenderness Effects Using spColumn — Examples", Example 1 report §9:
// 14 × 20 in, 6-#11 (As = 1.56 in² each; two per 20 in face, one mid-side on
// each 14 in face), clear cover 2.005 in → bar rows at 2.71 / 7.00 / 11.29 in
// (X) and 2.71 / 17.29 in (Y); f'c = 4.5 ksi, fy = 60 ksi, Es = 29 000 ksi.
//
//          c, in   φPn, kip   φMn, kip·ft   φ          (X | Y)
//   fs = 0      11.29 | 17.29   636.4 | 667.4   131.15 | 222.47   0.65
//   fs = ½fy     8.40 | 12.86   424.6 | 448.8   163.20 | 303.75   0.65
//   balanced     6.68 | 10.23   241.1 | 282.2   175.16 | 356.20   0.65
//   tension ctl  4.20 |  6.43   −17.3 | 198.7   192.02 | 429.02   0.90
//   pure bending 4.29 |  3.92     0   |   0     191.64 | 321.26   0.8856 | 0.90
//   max compression 1037.9 = 0.65·Po; allowable 830.3 = 0.80·0.65·Po
//
// Two things differ by CODE, not by error, and are carried explicitly:
//   · β1 — the US row gives 0.825 at 4.5 ksi, the SI row 0.8284 at 31.03 MPa;
//     with β1 = 0.825 every point lands on the report's printed digits;
//   · the run is ACI 318-19 (tension control at εty + 0.003 = 0.00507), the
//     engine 318-14 (0.005) — so the tension-side points are compared on Pn,
//     Mn at the report's own c, times the report's φ.
// ─────────────────────────────────────────────────────────────────────────
describe('spColumn control points — P–M strain compatibility (StructurePoint Example 1 report, published)', () => {
  const inch = 25.4, kip = 4.4482216, ksi = (kip * 1000) / (inch * inch), kipFt = kip * 0.3048
  const As = 1.56 * inch * inch, ey = 60 / 29_000
  const base = { cover: 0, barDia: 0, tieDia: 0, fc: 4.5 * ksi, fy: 60 * ksi, numBars: 6 }
  const X: InteractionInput = { ...base, b: 20 * inch, h: 14 * inch,
    layers: [{ d: 2.71 * inch, n: 2, As: 2 * As }, { d: 7 * inch, n: 2, As: 2 * As }, { d: 11.29 * inch, n: 2, As: 2 * As }] }
  const Y: InteractionInput = { ...base, b: 14 * inch, h: 20 * inch,
    layers: [{ d: 2.71 * inch, n: 3, As: 3 * As }, { d: 17.29 * inch, n: 3, As: 3 * As }] }
  const at = (i: InteractionInput, cIn: number, phi: number) => {
    const p = pmAtDepth(i, cIn * inch)
    return { P: (phi * p.Pn) / kip, M: (phi * p.Mn) / kipFt, phi: p.phi }
  }
  /** neutral-axis depth, in, at which the extreme row's strain is εt */
  const cFor = (dt: number, et: number) => (0.003 * dt) / (0.003 + et)
  const pureBending = (i: InteractionInput, dt: number) => {
    let lo = 0.5, hi = dt
    for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (pmAtDepth(i, m * inch).Pn > 0) hi = m; else lo = m }
    return (lo + hi) / 2
  }
  const rows: [string, InteractionInput, number, [string, number, number, number, number][]][] = [
    ['X', X, 11.29, [['fs = 0', 0, 0.65, 636.4, 131.15], ['fs = ½fy', -0.5 * ey, 0.65, 424.6, 163.20],
      ['balanced', -ey, 0.65, 241.1, 175.16], ['tension control (318-19)', ey + 0.003, 0.90, -17.3, 192.02]]],
    ['Y', Y, 17.29, [['fs = 0', 0, 0.65, 667.4, 222.47], ['fs = ½fy', -0.5 * ey, 0.65, 448.8, 303.75],
      ['balanced', -ey, 0.65, 282.2, 356.20], ['tension control (318-19)', ey + 0.003, 0.90, 198.7, 429.02]]],
  ]
  for (const [axis, i, dt, pts] of rows) {
    for (const [name, et, phi, P, M] of pts) {
      // εt < 0 marks a compression-side point: fs = 0 has εt = 0, ½fy and
      // balanced put the extreme row at that TENSILE strain — c by its magnitude
      it(`${axis} — ${name}: φPn = ${P}, φMn = ${M} (β1 = 0.825)`, () => {
        const c = cFor(dt, Math.abs(et))
        const r = at({ ...i, beta1: 0.825 }, c, phi)
        expect(Math.abs(r.P - P)).toBeLessThan(0.15)
        expect(Math.abs(r.M / M - 1)).toBeLessThan(3e-4)
      })
    }
  }

  it('pure bending: c = 4.29 / 3.92 in, φMn = 191.64 (φ 0.8856 by 318-19) / 321.26 kip·ft', () => {
    const cx = pureBending({ ...X, beta1: 0.825 }, 11.29), cy = pureBending({ ...Y, beta1: 0.825 }, 17.29)
    expect(cx).toBeCloseTo(4.29, 2)
    expect(cy).toBeCloseTo(3.92, 2)
    expect(Math.abs(at({ ...X, beta1: 0.825 }, cx, 0.8856).M / 191.64 - 1)).toBeLessThan(3e-4)
    expect(Math.abs(at({ ...Y, beta1: 0.825 }, cy, 0.90).M / 321.26 - 1)).toBeLessThan(3e-4)
    // the engine's own φ there is 318-14's: εt = 0.003(11.29 − 4.29)/4.29 = 0.00489 → 0.65 + 0.25(εt − εy)/(0.005 − εy)
    const et = (0.003 * (11.29 - cx)) / cx, eyS = (60 * ksi) / 200_000
    expect(at(X, cx, 1).phi).toBeCloseTo(0.65 + (0.25 * (et - eyS)) / (0.005 - eyS), 3)
  })

  it('max compression 0.65·Po = 1037.9 kip; allowable 0.80·0.65·Po = 830.3 kip', () => {
    const r = interaction(Y)
    expect((0.65 * r.Po) / kip).toBeCloseTo(1037.9, 0)
    expect((0.65 * r.PnMax) / kip).toBeCloseTo(830.3, 0)
  })

  it('with the SI β1 (0.8284) the same points sit within 0.6 % — the code-unit difference, stated', () => {
    for (const [, i, dt, pts] of rows) for (const [, et, phi, P, M] of pts.slice(0, 3)) {
      const r = at(i, cFor(dt, Math.abs(et)), phi)
      expect(Math.abs(r.P / P - 1)).toBeLessThan(0.006)
      expect(Math.abs(r.M / M - 1)).toBeLessThan(0.006)
    }
  })

  it('explicit rows replace the bar count: the X section keeps its mid-depth row', () => {
    expect(barLayers(X).layers.map((L) => L.d / inch)).toEqual([2.71, 7, 11.29].map((d) => expect.closeTo(d, 9)))
    expect(interaction(X).dt / inch).toBeCloseTo(11.29, 9)
  })
})

// ── All-around bar distribution (multi-layer strain compatibility) ──────────
describe('interaction — all-around bar layout', () => {
  const base = { b: 450, h: 450, cover: 40, barDia: 25, tieDia: 10, fc: 28, fy: 415 }
  const Ab = (Math.PI / 4) * 25 ** 2

  it('8 bars on a square: 3 per face, one 2-bar intermediate row (d′/mid/dt)', () => {
    const r = interaction({ ...base, numBars: 8, layout: 'all-around' })
    expect(r.nx).toBe(3)
    expect(r.ny).toBe(3)
    expect(r.layers.map((L) => L.n)).toEqual([3, 2, 3])
    expect(r.layers[0].d).toBeCloseTo(62.5, 9)          // 40 + 10 + 25/2
    expect(r.layers[1].d).toBeCloseTo(225, 9)           // mid-depth
    expect(r.layers[2].d).toBeCloseTo(387.5, 9)
    expect(r.layers.reduce((s, L) => s + L.As, 0)).toBeCloseTo(8 * Ab, 6)
  })

  it('12 bars on 600×400 (bending about h): more bars on the wide faces', () => {
    const r = interaction({ ...base, b: 600, h: 400, numBars: 12, layout: 'all-around' })
    // centre-line sides: bw = 600−125 = 475, hw = 400−2·62.5−? → dt−d′ = 275
    // interior 8 → per b-face round(4·475/750) = 3 → nx = 5, ny = 3
    expect(r.nx).toBe(5)
    expect(r.ny).toBe(3)
    expect(2 * r.nx + 2 * r.ny - 4).toBe(12)
  })

  it('4 bars: all-around degenerates to the two-face layout exactly', () => {
    const a = interaction({ ...base, numBars: 4, layout: 'all-around' })
    const b2 = interaction({ ...base, numBars: 4 })
    expect(a.balanced.Pb).toBeCloseTo(b2.balanced.Pb, 9)
    expect(a.balanced.Mb).toBeCloseTo(b2.balanced.Mb, 9)
    for (let k = 0; k < a.curve.length; k += 10) {
      expect(a.curve[k].Pn).toBeCloseTo(b2.curve[k].Pn, 9)
      expect(a.curve[k].Mn).toBeCloseTo(b2.curve[k].Mn, 9)
    }
  })

  it('balanced point matches the hand calc (8⌀25, 450², fc 28, fy 415)', () => {
    // cb = 600/(1015)·387.5 = 229.064 mm; a = 194.704 mm
    // Cc = 0.85·28·194.704·450 = 2085.3 kN
    // top (3 bars, 1472.6 mm²): fs = 600(cb−62.5)/cb = 436 → fy, −0.85f′c displaced → +576.1 kN
    // mid (2 bars, 981.7 mm²): fs = 600(cb−225)/cb = 10.6 MPa → +10.4 kN
    // bottom (3 bars): fs → −fy → −611.1 kN
    // Pb ≈ 2060.7 kN; Mb ≈ 2085.3·0.12765 + 576.1·0.1625 + 611.1·0.1625 ≈ 459.1 kN·m
    const r = interaction({ ...base, numBars: 8, layout: 'all-around' })
    expect(r.balanced.c).toBeCloseTo(229.064, 2)
    expect(r.balanced.Pb).toBeCloseTo(2060.7, 0)
    expect(r.balanced.Mb).toBeCloseTo(459.1, 0)
  })

  it('same bars all-around give LOWER Mb than the 2-face idealisation, same Po', () => {
    const all = interaction({ ...base, numBars: 8, layout: 'all-around' })
    const two = interaction({ ...base, numBars: 8 })
    expect(all.balanced.Mb).toBeLessThan(two.balanced.Mb)
    expect(all.Po).toBeCloseTo(two.Po, 6)
    expect(all.curve[all.curve.length - 1].Pn).toBeCloseTo(all.Po, 0)   // closes at Po
  })

  it('capacityAtEccentricity on the all-around curve recovers the balanced point at e = eb', () => {
    const r = interaction({ ...base, numBars: 8, layout: 'all-around' })
    const p = capacityAtEccentricity({ ...base, numBars: 8, layout: 'all-around' }, r.balanced.eb)
    expect(p.Pn).toBeCloseTo(r.balanced.Pb, 0)
    expect(p.Mn).toBeCloseTo(r.balanced.Mb, 0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// A VERDICT THAT CANNOT FAIL — the column section.
//
// `axialOK` is φPn,max ≥ Pu, and in DESIGN mode the engine SIZES the steel to
// meet Pu — so it passes almost by construction, and `rhoOK` was the only
// thing standing between a nonsense section and a green page. That was not
// enough: f'c = 0 simply bought thirty bars and reported BOTH verdicts true,
// and a zero-width column (A_g = 0) reported φPn,max = 2045 kN against
// Pu = 2000 kN.
//
// The errors run unconservative through d′ = cover + d_tie + d_b/2: a negative
// cover pushes the outer bars OUTWARD and lengthens the lever arm, lifting the
// balanced point of a 400×400 with 8-⌀20 from (Pb 1596 kN, Mb 328 kN·m) to
// (1979, 413) — an envelope a quarter larger than the column has.
// ─────────────────────────────────────────────────────────────────────────
describe('non-physical column sections', () => {
  const base: AxialColumnInput = {
    shape: 'tied', b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10,
    fc: 28, fy: 415, Pu: 2000,
  }

  it('the reference column passes both verdicts', () => {
    const r = designAxialColumn(base)
    expect(r.inputNotes).toEqual([])
    expect(r.axialOK).toBe(true)
    expect(r.rhoOK).toBe(true)
  })

  it("zero-strength concrete no longer passes by buying bars", () => {
    // MEASURED before the guard: axialOK true, rhoOK true, 30 bars, ρ = 5.9%.
    const r = designAxialColumn({ ...base, fc: 0 })
    expect(r.axialOK).toBe(false)
    expect(r.rhoOK).toBe(false)
    expect(r.inputNotes.join(' ')).toMatch(/f'c/)
  })

  it('a column with no cross-section cannot carry its load', () => {
    // MEASURED: A_g = 0 reported φPn,max = 2045 kN ≥ Pu = 2000 kN.
    const r = designAxialColumn({ ...base, b: 0 })
    expect(r.axialOK).toBe(false)
  })

  it('negative cover is refused, not rewarded with lever arm', () => {
    expect(designAxialColumn({ ...base, cover: -40 }).axialOK).toBe(false)
    // The interaction curve is where it actually paid: d′ = cover + d_t + d_b/2.
    const pm = { b: 400, h: 400, cover: 40, barDia: 20, tieDia: 10, fc: 28, fy: 415, numBars: 8 }
    const good = interaction(pm)
    const bad = interaction({ ...pm, cover: -40 })
    expect(bad.balanced.Mb).toBeGreaterThan(good.balanced.Mb * 1.2)
  })

  it('a negative bar or tie Ø is refused — squaring hid the sign', () => {
    // A_b = π(−20)²/4 is the area of a ⌀20 bar, so only d′ carried the sign,
    // and tie spacing came out at −320 mm.
    expect(designAxialColumn({ ...base, barDia: -20 }).axialOK).toBe(false)
    expect(designAxialColumn({ ...base, tieDia: 0 }).axialOK).toBe(false)
  })

  it('a supplied bar count below the code minimum is refused, not rounded up', () => {
    // numBars 0 and −4 both became 4 silently: the column CHECKED was not the
    // column asked for.
    expect(designAxialColumn({ ...base, numBars: 0 }).axialOK).toBe(false)
    expect(designAxialColumn({ ...base, numBars: -4 }).axialOK).toBe(false)
    expect(designAxialColumn({ ...base, numBars: 8 }).axialOK).toBe(true)
  })

  it('a spiral column needs its diameter', () => {
    const { b: _b, h: _h, ...noRect } = base
    expect(designAxialColumn({ ...noRect, shape: 'spiral' }).axialOK).toBe(false)
    expect(designAxialColumn({ ...noRect, shape: 'spiral', D: 450 }).axialOK).toBe(true)
  })

  it('the covers must leave room for a cage', () => {
    // 2·(190 + 10 + 10) = 420 > 400: the two faces have crossed.
    expect(designAxialColumn({ ...base, cover: 190 }).inputNotes.join(' '))
      .toMatch(/no room for a cage/)
    expect(designAxialColumn({ ...base, cover: 40 }).inputNotes).toEqual([])
  })

  it('omitting the optional inputs is not an error', () => {
    // The guard rejects what cannot exist, not what the caller left to the
    // engine: numBars and fyt are both derived when absent.
    expect(columnDetailingNotes(base)).toEqual([])
  })
})
