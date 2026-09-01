import { describe, it, expect } from 'vitest'
import { designTBeam, effectiveFlange, tBeamCapacity, beta1, blockDepth } from './tbeam'

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
    // T is As·fs, NOT As·fy. This assertion used to say fy, which is only true
    // while the steel yields — so it PINNED the missing stress check: the
    // heavily reinforced rows below (bf 300 / As 12000) passed only because the
    // engine was solving the same wrong equation the test was.
    const sec = { bw: 300, hf: 100, fc: 21, fy: 415 }
    const d = 600
    for (const bf of [300, 600, 1200, 1800]) {          // 300 = the hogging case
      for (const As of [1500, 3000, 4500, 8000, 12000]) {
        const cap = tBeamCapacity(sec, bf, d, 620, As)
        expect(compression(bf, sec.bw, sec.hf, sec.fc, cap.a)).toBeCloseTo(As * cap.fs, 6)
        // …and fs is itself on the strain diagram, capped at yield.
        expect(cap.fs).toBeCloseTo(Math.min(sec.fy, (600 * (d - cap.c)) / cap.c), 9)
        expect(cap.fsYields).toBe(cap.fs >= sec.fy - 1e-9)
        expect(cap.tBehavior).toBe(cap.a > sec.hf)
        expect(cap.c * beta1(sec.fc)).toBeCloseTo(cap.a, 9)   // a = β1·c
        expect(cap.c).toBeLessThan(d)                         // steel stays in tension
      }
    }
  })

  it('covers both sides of yield — the sweep is not vacuous', () => {
    const sec = { bw: 300, hf: 100, fc: 21, fy: 415 }
    const at = (bf: number, As: number) => tBeamCapacity(sec, bf, 600, 620, As).fsYields
    expect(at(1800, 1500)).toBe(true)      // lightly reinforced: yields
    expect(at(300, 12000)).toBe(false)     // narrow web, huge As: does not
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


describe('the block is the primary unknown — a first, steel second', () => {
  const Ab = (Math.PI / 4) * base.barDia ** 2

  it('blockDepth is the Rn/ρ route stated as a depth — same number, either way', () => {
    // a = d(1 − √(1 − 2Rn/0.85f'c)) is what the ρ formula is hiding. Solving for
    // the block directly must not move the answer, only what the answer is called.
    for (const b of [300, 700, 1800]) {
      for (const d of [400, 520.8, 600]) {
        for (const Mu of [100, 250, 400, 700]) {
          const Rn = (Mu * 1e6) / (0.9 * b * d * d)
          const disc = 1 - (2 * Rn) / (0.85 * 21)
          const a = blockDepth(Mu, b, d, 21)
          if (disc <= 0) { expect(a).toBeNull(); continue }
          expect(a as number).toBeCloseTo(d * (1 - Math.sqrt(disc)), 9)
          // and the steel it implies is the ρ formula's As
          const rho = ((0.85 * 21) / 415) * (1 - Math.sqrt(disc))
          expect((0.85 * 21 * b * (a as number)) / 415).toBeCloseTo(rho * b * d, 6)
        }
      }
    }
  })

  it('returns null rather than a fake root once no block can reach the moment', () => {
    // φ·0.85f'c·b·d²/2 is the most a singly-reinforced rectangle can ever do.
    const b = 300, d = 500, fc = 21
    const ceiling = (0.9 * 0.85 * fc * b * d * d) / 2 / 1e6
    expect(blockDepth(ceiling * 0.95, b, d, fc)).not.toBeNull()
    expect(blockDepth(ceiling * 1.05, b, d, fc)).toBeNull()
  })

  it('a,req rises smoothly with Mu while the bar count steps', () => {
    // This is the ordering itself: the compression block is what responds to the
    // demand, continuously; the steel only moves when a whole bar is added. The
    // engine used to expose only the stepped quantity, so raising Mu by 50 kN·m
    // changed nothing visible until the count happened to tick over.
    let prevA = 0, steps = 0
    for (let Mu = 60; Mu <= 900; Mu += 10) {
      const r = designTBeam({ ...base, Mu })
      expect(r.aReq).toBeGreaterThan(prevA)              // strictly monotone
      expect(r.aReq - prevA).toBeLessThan(6)             // and without jumps
      if (r.bars * Ab !== steps) steps = r.bars * Ab     // the steel, meanwhile, steps
      prevA = r.aReq
    }
    // the same sweep moves the bar count in a handful of discrete jumps only
    const counts = new Set<number>()
    for (let Mu = 60; Mu <= 900; Mu += 10) counts.add(designTBeam({ ...base, Mu }).bars)
    expect(counts.size).toBeLessThan(85 / 3)
  })

  it('the flange is spent before the web: a,req passes through hf continuously', () => {
    // At Mu = φMnf the two branches must agree — the rectangular root reaches
    // exactly hf and the true-T web block starts from exactly hf. A discontinuity
    // here would mean the section jumps in size at the switch.
    const inp = { ...base, bfGiven: 700, hf: 75, h: 650 }
    const at = (Mu: number) => designTBeam({ ...inp, Mu })
    // Bisect for the switch rather than trusting one run's φMnf: φMnf is quoted
    // at that run's converged d, and d falls as the cage stacks, so the boundary
    // moves with the demand.
    let lo0 = 200, hi0 = 900
    expect(at(lo0).Asf).toBe(0)
    expect(at(hi0).Asf).toBeGreaterThan(0)
    for (let k = 0; k < 60; k++) {
      const mid = (lo0 + hi0) / 2
      if (at(mid).Asf > 0) hi0 = mid; else lo0 = mid
    }
    const lo = at(lo0), hi = at(hi0)
    expect(lo.Asf).toBe(0)                     // rectangular branch
    expect(hi.Asf).toBeGreaterThan(0)          // true-T branch
    expect(lo.aReq).toBeLessThanOrEqual(inp.hf + 1e-6)
    expect(hi.aReq).toBeGreaterThanOrEqual(inp.hf - 1e-6)
    expect(hi.aReq - lo.aReq).toBeLessThan(0.5)
    expect(hi.As - lo.As).toBeLessThan(5)      // and so does the steel
  })

  it('As is read off the block by C = T, in whichever branch ran', () => {
    for (const bfGiven of [500, 700, 1200, 1800]) {
      for (let Mu = 150; Mu <= 900; Mu += 50) {
        const r = designTBeam({ ...base, bfGiven, Mu, h: 700 })
        if (r.minGoverns || r.notes.some((n) => n.includes('inadequate') || n.includes('exceeds'))) continue
        const trueT = r.Asf > 0
        const b = trueT ? base.bw : r.bf
        const steel = (0.85 * base.fc * b * r.aReq) / base.fy + (trueT ? r.Asf : 0)
        expect(r.As).toBeCloseTo(steel, 6)
      }
    }
  })

  it('the delivered block is never shallower than the required one', () => {
    // Bars round UP, so the built section always develops at least the block the
    // moment asked for. aReq > a would mean a cage short of its own demand.
    for (const bfGiven of [500, 900, 1800]) {
      for (let Mu = 150; Mu <= 900; Mu += 25) {
        const r = designTBeam({ ...base, bfGiven, Mu, h: 700 })
        if (!r.ok) continue
        expect(r.a).toBeGreaterThanOrEqual(r.aReq - 1e-6)
      }
    }
  })

  it('hogging solves the same way, on the web rectangle', () => {
    const r = designTBeam({ ...base, Mu: -150 })
    expect(r.Asf).toBe(0)
    expect(r.aReq).toBeCloseTo(blockDepth(150, base.bw, r.d, base.fc) as number, 9)
    expect(r.As).toBeCloseTo((0.85 * base.fc * base.bw * r.aReq) / base.fy, 6)
  })

  it('aMax is the block at the tension-controlled limit, β1·(3/8)dt', () => {
    const r = designTBeam(base)
    expect(r.aMax).toBeCloseTo(beta1(base.fc) * (3 / 8) * r.dt, 9)
    // and AsMax is the steel that block balances
    const Cc = r.aMax <= base.hf
      ? 0.85 * base.fc * r.bf * r.aMax
      : 0.85 * base.fc * ((r.bf - base.bw) * base.hf + base.bw * r.aMax)
    expect(r.AsMax).toBeCloseTo(Cc / base.fy, 6)
  })

  it('analyze runs report no required block — there is no demand to solve for', () => {
    const r = designTBeam({ ...base, AsGiven: 2500 })
    expect(r.aReq).toBe(0)
    expect(r.a).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE WORKED LECTURE — one section, two steel areas, both sides of yield.
//
// bf 800 · hf 100 · bw 300 · d 435 · f'c 28 · fy 345, NSCP 2015. The pair is
// the point: MORE steel gives LESS design strength, because the section goes
// compression-controlled and φ falls 0.90 → 0.65. Any engine that gets both
// rows right has to solve for fs rather than assume it.
//
//   As = 6000  steel yields          φ = 0.90   Mu = 708.048 kN·m
//   As = 9000  fs = 322.922 < fy     φ = 0.65   Mu = 648.999 kN·m
//
// Every intermediate below is the lecture's own printed value, not a
// back-computed one — Aconc, a, c, fs and ȳ are each written on the board.
// ─────────────────────────────────────────────────────────────────────────
describe('tBeamCapacity — the worked T-beam analysis', () => {
  const sec = { bw: 300, hf: 100, fc: 28, fy: 345 }
  const bf = 800, d = 435, dt = 435
  const at = (As: number) => tBeamCapacity(sec, bf, d, dt, As)

  it('As = 6000: the steel yields and φ = 0.90 → Mu = 708.048 kN·m', () => {
    const r = at(6000)
    expect(r.fsYields).toBe(true)
    expect(r.fs).toBeCloseTo(345, 9)
    expect(r.Aconc).toBeCloseTo(86974.79, 2)
    expect(r.a).toBeCloseTo(123.249, 3)
    expect(r.c).toBeCloseTo(144.999, 3)
    expect(r.yBar).toBeCloseTo(54.942, 3)
    expect(r.phi).toBeCloseTo(0.90, 9)
    expect(r.Mn).toBeCloseTo(786.720, 3)
    expect(r.phiMn).toBeCloseTo(708.048, 3)
    expect(r.trial).toBeUndefined()                  // no correction was needed
  })

  it('As = 9000: the steel does NOT yield → fs 322.922, φ = 0.65, Mu = 648.999', () => {
    const r = at(9000)
    expect(r.fsYields).toBe(false)
    // the assumption the lecture writes down and then crosses out
    expect(r.trial!.a).toBeCloseTo(268.207, 3)
    expect(r.trial!.c).toBeCloseTo(315.538, 3)
    expect(r.trial!.fs).toBeCloseTo(227.159, 3)
    // …and what actually solves equilibrium
    expect(r.c).toBeCloseTo(282.797, 3)
    expect(r.a).toBeCloseTo(240.378, 3)
    expect(r.fs).toBeCloseTo(322.922, 3)
    expect(r.Aconc).toBeCloseTo(122113.354, 2)
    expect(r.yBar).toBeCloseTo(91.450, 3)
    expect(r.Mn).toBeCloseTo(998.460, 3)
    expect(r.phi).toBeCloseTo(0.65, 9)
    expect(r.phiMn).toBeCloseTo(648.999, 3)
  })

  it('the correction is what makes it right — the assumption alone is 3.6% HIGH', () => {
    // What the engine returned before the stress check existed: the trial block
    // carried straight through to Mn. Reconstructed here from the trial values
    // so the size and the SIGN of the error stay on the record.
    const r = at(9000)
    const Cover = 0.85 * sec.fc * (bf - sec.bw) * sec.hf
    const T = 9000 * sec.fy
    const MnAssumed = (Cover * (d - sec.hf / 2) + (T - Cover) * (d - r.trial!.a / 2)) / 1e6
    expect(0.65 * MnAssumed).toBeCloseTo(672.338, 3)
    expect(0.65 * MnAssumed).toBeGreaterThan(r.phiMn)
    expect((0.65 * MnAssumed) / r.phiMn - 1).toBeCloseTo(0.036, 3)
  })

  it('more steel, LESS design strength — the pair the lecture is built on', () => {
    expect(at(9000).Mn).toBeGreaterThan(at(6000).Mn)      // nominal still rises
    expect(at(9000).phiMn).toBeLessThan(at(6000).phiMn)   // but φ falls further
  })

  it('the two routes to Mn agree — two couples, and T(d − ȳ)', () => {
    for (const As of [3000, 6000, 9000, 12000]) {
      const r = at(As)
      expect((As * r.fs * (d - r.yBar)) / 1e6).toBeCloseTo(r.Mn, 6)
    }
  })
})

describe('dGiven — the effective depth stated rather than derived', () => {
  const base = {
    kind: 'interior' as const, bw: 300, h: 500, hf: 100, bfGiven: 800,
    cover: 40, stirrupDia: 12, barDia: 26, fc: 28, fy: 345, Mu: 500,
  }
  it('is used verbatim, and pins dt with it', () => {
    const r = designTBeam({ ...base, AsGiven: 9000, dGiven: 435 })
    expect(r.d).toBeCloseTo(435, 9)
    expect(r.dt).toBeCloseTo(435, 9)     // single-layer reading — the conservative one
  })
  it('stops the stack from moving d — 18 bars in 5 layers no longer drop it', () => {
    const free = designTBeam({ ...base, AsGiven: 9000 })
    const pinned = designTBeam({ ...base, AsGiven: 9000, dGiven: 435 })
    expect(free.layers.length).toBeGreaterThan(1)
    expect(free.d).toBeLessThan(free.dt)          // the stack pulled d down
    expect(pinned.d).toBe(pinned.dt)              // …and now it does not
  })
  it('reproduces the published pair exactly', () => {
    expect(designTBeam({ ...base, AsGiven: 6000, dGiven: 435 }).phiMn).toBeCloseTo(708.048, 3)
    expect(designTBeam({ ...base, AsGiven: 9000, dGiven: 435 }).phiMn).toBeCloseTo(648.999, 3)
  })
  it('changes nothing when absent or zero', () => {
    const a = designTBeam({ ...base, Mu: 400 })
    const b = designTBeam({ ...base, Mu: 400, dGiven: 0 })
    expect(b.d).toBe(a.d); expect(b.dt).toBe(a.dt); expect(b.phiMn).toBe(a.phiMn)
  })
})
