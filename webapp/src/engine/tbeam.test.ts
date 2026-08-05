import { describe, it, expect } from 'vitest'
import { designTBeam, effectiveFlange, tBeamCapacity, beta1 } from './tbeam'

// Base: interior T, bw 300, h 600, hf 100, cover 40, ⌀10 stirrups, ⌀25 bars,
// f'c 21, fy 415, ln 6 m, sw 2.7 m → dt = 600−40−10−12.5 = 537.5 mm.
const base = {
  kind: 'interior' as const, bw: 300, h: 600, hf: 100,
  ln: 6, sw: 2.7, cover: 40, stirrupDia: 10, barDia: 25,
  fc: 21, fy: 415, Mu: 400,
}

describe('effective flange width — ACI Table 6.3.2.1', () => {
  it('interior: bw + 2·min(8hf, sw/2, ln/8)', () => {
    // 8hf = 800, sw/2 = 1350, ln/8 = 750 → overhang 750 → bf = 300+1500 = 1800? no:
    // min = 750 (ln/8) → bf = 300 + 2·750 = 1800
    const { bf, govern } = effectiveFlange(base)
    expect(bf).toBeCloseTo(300 + 2 * 750, 9)
    expect(govern).toContain('ln/8')
  })
  it('8hf governs when the slab is thin', () => {
    const { bf, govern } = effectiveFlange({ ...base, hf: 75 })
    expect(bf).toBeCloseTo(300 + 2 * 8 * 75, 9)
    expect(govern).toContain('8hf')
  })
  it('edge (L) beam: one overhang, ln/12', () => {
    const { bf } = effectiveFlange({ ...base, kind: 'edge' })
    expect(bf).toBeCloseTo(300 + Math.min(6 * 100, 1350, 500), 9)
  })
  it('isolated: bf ≤ 4bw and hf ≥ bw/2 flag', () => {
    const r = effectiveFlange({ ...base, kind: 'isolated', bfGiven: 1500 })
    expect(r.bf).toBe(1200)
    expect(r.isolatedOK).toBe(false)       // hf 100 < bw/2 = 150
    expect(effectiveFlange({ ...base, kind: 'isolated', hf: 150, bfGiven: 1000 }).isolatedOK).toBe(true)
  })
})

describe('designTBeam — rectangular behaviour (a ≤ hf)', () => {
  const r = designTBeam(base)   // Mu = 400 kN·m
  it('block stays in the flange and the capacity covers Mu', () => {
    expect(r.tBehavior).toBe(false)
    expect(r.a).toBeLessThanOrEqual(base.hf)
    expect(r.phiMn).toBeGreaterThanOrEqual(400)
    expect(r.ok).toBe(true)
  })
  it('hand calc: Rn with b = bf = 1800, at the CONVERGED d', () => {
    // 5 bars are needed and only 4 fit per layer, so the cage is [4, 2] and the
    // Varignon centroid sits (2·50)/6 = 16.667 mm above the extreme layer:
    // d = 537.5 − 16.667 = 520.833, NOT dt. Solving at dt and then dropping d
    // is the bug this case now pins — it left the section short of its own Mu.
    const dConv = 537.5 - (2 * (25 + 25)) / 6
    expect(r.d).toBeCloseTo(dConv, 9)
    const Rn = 400e6 / (0.9 * 1800 * dConv ** 2)
    const rho = ((0.85 * 21) / 415) * (1 - Math.sqrt(1 - (2 * Rn) / (0.85 * 21)))
    expect(r.As).toBeCloseTo(Math.max(rho * 1800 * dConv, r.AsMin), 6)
  })
  it('εt ≥ 0.005 → φ = 0.90 (shallow block, tension-controlled)', () => {
    expect(r.et).toBeGreaterThan(0.005)
    expect(r.phi).toBeCloseTo(0.90, 9)
  })
})

describe('designTBeam — true T behaviour (a > hf)', () => {
  // Push the demand up and shrink the flange so the block enters the web.
  const inp = { ...base, bfGiven: 700, hf: 75, Mu: 520, h: 650 }  // dt = 587.5
  const r = designTBeam(inp)
  it('splits into flange couple Asf + web remainder', () => {
    expect(r.tBehavior).toBe(true)
    expect(r.a).toBeGreaterThan(inp.hf)
    // Asf = 0.85·f'c·(bf−bw)·hf/fy = 0.85·21·400·75/415
    expect(r.Asf).toBeCloseTo((0.85 * 21 * (700 - 300) * 75) / 415, 3)
    expect(r.As).toBeGreaterThan(r.Asf)
  })
  it('capacity from equilibrium covers the demand', () => {
    expect(r.phiMn).toBeGreaterThanOrEqual(520 * 0.999)
  })
  it('capacity function is consistent: recompute at the provided steel', () => {
    const cap = tBeamCapacity(inp, r.bf, r.d, r.dt, r.bars * ((Math.PI / 4) * 25 ** 2))
    expect(cap.phiMn).toBeCloseTo(r.phiMn, 6)
    expect(cap.a).toBeGreaterThan(inp.hf)
  })
})

describe('how `a` is derived — C = T in both branches', () => {
  // `a` is never assumed; it is solved FROM horizontal equilibrium, and the two
  // branches differ only in which area the compression acts on:
  //
  //   a ≤ hf  the block is entirely inside the flange, so the section behaves as
  //           a rectangle of width bf:      C = 0.85 f'c bf a       → a = T/(0.85 f'c bf)
  //   a > hf  the flange alone cannot carry T. The overhangs are FULL at depth
  //           hf and only the web carries the remainder:
  //           C = 0.85 f'c (bf−bw) hf + 0.85 f'c bw a
  //                                        → a = (T − C_over)/(0.85 f'c bw)
  //
  // Hogging passes bf = bw, which makes C_over = 0 and degenerates the second
  // form back into the first — one equation, not a special case.
  const compression = (bf: number, bw: number, hf: number, fc: number, a: number) =>
    a <= hf ? 0.85 * fc * bf * a : 0.85 * fc * ((bf - bw) * hf + bw * a)

  it('equilibrium holds exactly, flange block and web block alike', () => {
    const sec = { bw: 300, hf: 100, fc: 21, fy: 415 }
    for (const bf of [300, 600, 1200, 1800]) {          // 300 = the hogging case
      for (const As of [1500, 3000, 4500, 8000, 12000]) {
        const cap = tBeamCapacity(sec, bf, 600, 620, As)
        const T = As * sec.fy
        expect(compression(bf, sec.bw, sec.hf, sec.fc, cap.a)).toBeCloseTo(T, 6)
        expect(cap.tBehavior).toBe(cap.a > sec.hf)
        expect(cap.c * beta1(sec.fc)).toBeCloseTo(cap.a, 9)   // a = β1·c
      }
    }
  })

  it('β1 is the ACI Table 22.2.2.4.3 step, not the sloped row clamped', () => {
    // The sloped row evaluated at 55 MPa gives 0.657; the table says a flat 0.65
    // from 55 MPa up. This module used to carry its own `max(0.65, slope)` copy.
    expect(beta1(28)).toBeCloseTo(0.85, 9)
    expect(beta1(35)).toBeCloseTo(0.80, 9)
    expect(beta1(55)).toBe(0.65)
    expect(beta1(80)).toBe(0.65)
  })
})

describe('minimum steel and hogging (flange in tension)', () => {
  it('As,min = max(0.25√f\'c, 1.4)/fy·bw·d governs tiny moments', () => {
    const r = designTBeam({ ...base, Mu: 20 })
    expect(r.minGoverns).toBe(true)
    expect(r.As).toBeCloseTo((Math.max(0.25 * Math.sqrt(21), 1.4) / 415) * 300 * r.d, 3)
  })
  it('hogging is never reported as T behaviour, however deep the web block gets', () => {
    // The flange is in TENSION here, so there is no flange couple to speak of.
    // `tBeamCapacity` is handed bf = bw, which zeroes the overhang term and
    // degenerates it to the rectangle — but its own `a > hf` flag then compares
    // a web block depth against a flange thickness that plays no part. A 700 mm
    // flange, 75 mm thick, under Mu = −150 came out "true T" on that accident.
    const r = designTBeam({ ...base, bfGiven: 700, hf: 75, h: 650, Mu: -150 })
    expect(r.a).toBeGreaterThan(75)               // the block IS deeper than hf
    expect(r.tBehavior).toBe(false)               // and that means nothing here
    // a still comes from the plain rectangle b = bw, as the hogging case demands
    expect(r.a).toBeCloseTo((r.bars * (Math.PI / 4) * 25 ** 2 * 415) / (0.85 * 21 * 300), 6)
  })

  it('negative moment designs the web rectangle (b = bw) and doubles bw,min when determinate', () => {
    const r = designTBeam({ ...base, Mu: -150 })
    expect(r.tBehavior).toBe(false)
    const rDet = designTBeam({ ...base, Mu: -20, determinate: true })
    const rInd = designTBeam({ ...base, Mu: -20 })
    expect(rDet.AsMin).toBeCloseTo(2 * rInd.AsMin, 3)   // min(2bw, bf) = 600
  })
})

describe('tension-controlled cap', () => {
  it('AsMax corresponds to c = 3/8·dt (block may cross into the web)', () => {
    const r = designTBeam(base)
    const cTC = (3 / 8) * r.dt, aTC = beta1(21) * cTC
    const Cc = aTC <= base.hf ? 0.85 * 21 * r.bf * aTC : 0.85 * 21 * ((r.bf - 300) * 100 + 300 * aTC)
    expect(r.AsMax).toBeCloseTo(Cc / 415, 3)
  })
  it('an over-reinforced analyze case is flagged not-ok', () => {
    const r = designTBeam({ ...base, bfGiven: 400, AsGiven: 12000, Mu: 100 })
    expect(r.ok).toBe(false)
    expect(r.notes.join(' ')).toContain('tension-controlled')
  })
})

describe('bar layering — no layer carries a single bar', () => {
  // This engine used to stack bars with its own greedy loop and had no pairing
  // rule, so a T-beam could be detailed with one bar sitting alone in the top
  // layer with nothing to tie to on either side. `beamDesign` had the rule all
  // along; both now share `barLayers.splitLayers`.
  it('never produces a lone bar, across a sweep of moments and bar sizes', () => {
    for (const barDia of [16, 20, 25, 28, 32]) {
      for (let Mu = 60; Mu <= 900; Mu += 20) {
        const r = designTBeam({ ...base, barDia, Mu })
        expect(r.layers.every((n) => n >= 2)).toBe(true)
        expect(r.layers.reduce((s, n) => s + n, 0)).toBe(r.bars)
      }
    }
  })

  it('narrow webs too, where layers stack fastest', () => {
    for (const bw of [200, 250, 300, 400]) {
      for (let Mu = 100; Mu <= 700; Mu += 50) {
        const r = designTBeam({ ...base, bw, Mu })
        expect(r.layers.every((n) => n >= 2)).toBe(true)
      }
    }
  })

  it('the design covers its own demand once the cage stacks', () => {
    // The engine solved As at d = dt and only THEN dropped d to the bar-group
    // centroid, never redesigning. The cage it handed back was sized for a lever
    // arm the cage itself had destroyed, so multi-layer T-beams came back with
    // MORE steel than the As printed beside them and still φMn < Mu:
    //
    //   bf 600  hf 80  Mu 700   As 2905 → 2945 provided, φMn 690.7  ✗
    //   bf 1200 hf 100 Mu 1900  As 8153 → 8836 provided, φMn 1732.6 ✗
    //
    // These four are the true-T cases from that probe. All are tension-
    // controlled (φ = 0.90), so nothing but d explained the shortfall.
    const cases = [
      { bfGiven: 600, hf: 80, Mu: 700, h: 750 },
      { bfGiven: 600, hf: 80, Mu: 900, h: 750 },
      { bfGiven: 1200, hf: 100, Mu: 1900, h: 750 },
      { bfGiven: 700, hf: 90, Mu: 1100, h: 750 },
    ]
    for (const c of cases) {
      const r = designTBeam({ ...base, ...c })
      expect(r.tBehavior).toBe(true)
      expect(r.layers.length).toBeGreaterThan(1)      // the cage does stack
      expect(r.d).toBeLessThan(r.dt)                  // and d does drop
      if (r.ok) expect(r.phiMn).toBeGreaterThanOrEqual(c.Mu - 1e-6)
    }
  })

  it('a reported-ok design is self-consistent: recomputing at its own d reproduces φMn ≥ Mu', () => {
    // Convergence, stated as a property rather than a fixture: if the engine
    // says ok, then As solved at the RETURNED d must still fit the returned bars.
    const Ab = (Math.PI / 4) * base.barDia ** 2
    for (const bfGiven of [500, 700, 900, 1200, 1800]) {
      for (let Mu = 200; Mu <= 1200; Mu += 100) {
        const r = designTBeam({ ...base, bfGiven, Mu, h: 700 })
        if (!r.ok) continue
        expect(r.bars * Ab).toBeGreaterThanOrEqual(r.As - 1e-6)
        const cap = tBeamCapacity({ ...base, hf: base.hf }, r.bf, r.d, r.dt, r.bars * Ab)
        expect(cap.phiMn).toBeCloseTo(r.phiMn, 6)
        expect(r.phiMn).toBeGreaterThanOrEqual(Mu - 1e-6)
      }
    }
  })

  it('details at least the steel the strength calculation asked for', () => {
    // Pairing ADDS a bar, so the detailed count can only exceed the demand.
    // The direction that would matter is the other one: a schedule showing
    // fewer bars than the section needs.
    const Ab = (Math.PI / 4) * base.barDia ** 2
    for (let Mu = 200; Mu <= 800; Mu += 25) {
      const r = designTBeam({ ...base, Mu })
      expect(r.bars * Ab).toBeGreaterThanOrEqual(r.As - 1e-6)
    }
  })
})
