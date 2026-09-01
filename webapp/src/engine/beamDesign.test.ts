import { describe, it, expect } from 'vitest'
import { designBeam, beamServiceDeflection, type BeamDesignInput, type BeamDeflectionInput } from './beamDesign'
import { beta1 } from './loads'

const base: BeamDesignInput = {
  b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10,
  fc: 28, fy: 415, Mu: 180, Vu: 150,
}

describe('beam design — ρ limits (reference formulas)', () => {
  it("ρ_max,TC = (0.85 f'c/fy · β1)(3/8)(dt/d)", () => {
    const r = designBeam(base)
    const expected = 0.85 * (28 / 415) * beta1(28) * (3 / 8) * (r.dt / r.d)
    expect(r.rhoMax).toBeCloseTo(expected, 12)
  })

  it('ρ_b carries the dt/d factor', () => {
    const r = designBeam(base)
    const expected = 0.85 * beta1(28) * (28 / 415) * (600 / (600 + 415)) * (r.dt / r.d)
    expect(r.rhoB).toBeCloseTo(expected, 12)
  })
})

describe('beam design — SRRB', () => {
  it('moderate moment stays singly reinforced, single layer, d = dt', () => {
    const r = designBeam(base)
    expect(r.mode).toBe('SRRB')
    expect(r.layers).toHaveLength(1)
    expect(r.d).toBeCloseTo(r.dt)             // one layer → centroid at the layer
    expect(r.dt).toBeCloseTo(500 - 40 - 10 - 10)
    expect(r.rho).toBeGreaterThanOrEqual(r.rhoMin)
    expect(r.sClear).toBeGreaterThanOrEqual(r.sMinClear - 1e-9)
  })

  it('tiny moment falls back to ρ_min', () => {
    const r = designBeam({ ...base, Mu: 10 })
    expect(r.usedMin).toBe(true)
  })
})

describe('beam design — bar layout & layers (§407.7, Varignon)', () => {
  it('adds a second layer when one layer cannot fit the bars, lowering d', () => {
    // Narrow web + big moment → more bars than one layer can hold.
    const r = designBeam({ ...base, b: 250, h: 600, Mu: 520, barDia: 20 })
    expect(r.layers.length).toBeGreaterThanOrEqual(2)
    expect(r.bars).toBe(r.layers.reduce((s, k) => s + k, 0))
    // Varignon: centroid rises above the extreme layer → d < dt
    expect(r.yBar).toBeGreaterThan(0)
    expect(r.d).toBeCloseTo(r.dt - r.yBar, 9)
    expect(r.layerIters).toBeGreaterThanOrEqual(2)   // re-ran at the new d
    // every layer respects the per-layer cap
    expect(r.layers.every((k) => k <= r.maxPerLayer)).toBe(true)
  })

  it('maxPerLayer honours s_min = max(db, 25): n·db + (n−1)s ≤ b − 2(cover+ds)', () => {
    const r = designBeam(base)
    const bw = 300 - 2 * (40 + 10)
    const fits = r.maxPerLayer * 20 + (r.maxPerLayer - 1) * r.sMinClear
    const oneMore = (r.maxPerLayer + 1) * 20 + r.maxPerLayer * r.sMinClear
    expect(fits).toBeLessThanOrEqual(bw + 1e-9)
    expect(oneMore).toBeGreaterThan(bw)
  })

  it('never leaves a lone bar in an upper layer — pairs it (2 bars beside the stirrups)', () => {
    // Sweep demands that land on odd totals; a multi-layer result must never
    // end in a single-bar top layer, and bars must stay consistent with layers.
    for (let Mu = 200; Mu <= 900; Mu += 20) {
      const r = designBeam({ ...base, b: 250, h: 650, Mu, barDia: 20 })
      if (r.layers.length > 1) expect(r.layers[r.layers.length - 1]).toBeGreaterThanOrEqual(2)
      expect(r.bars).toBe(r.layers.reduce((s, k) => s + k, 0))
    }
  })
})

describe('beam design — DRRB (compression steel)', () => {
  it("Mu beyond φMn_max designs A's with the displaced-concrete term", () => {
    const r = designBeam({ ...base, Mu: 400 })
    expect(r.mode).toBe('DRRB')
    expect(r.flexOK).toBe(true)
    expect(r.As).toBeCloseTo(r.As1 + r.As2, 6)
    // f's = 600(1 − d'/c) ≤ fy
    const fsExpect = Math.min(415, 600 * (1 - r.dPrime / r.cNA))
    expect(r.fsPrime).toBeCloseTo(fsExpect, 9)
    // A's = As2·fy / (f's − 0.85f'c) > As2 even when the steel yields
    expect(r.AsPrime).toBeCloseTo((r.As2 * 415) / (r.fsPrime - 0.85 * 28), 6)
    expect(r.AsPrime).toBeGreaterThan(r.As2)
    expect(r.comprBars).toBeGreaterThanOrEqual(2)
  })

  it('classification is consistent with the converged φMn_max', () => {
    // Layering can shift d (hence φMn_max) between runs, so the invariant is
    // on each converged result, across a sweep of demands.
    for (const Mu of [100, 200, 300, 340, 380, 450]) {
      const r = designBeam({ ...base, Mu })
      if (r.mode === 'SRRB') expect(Mu).toBeLessThanOrEqual(r.phiMnMax + 1e-9)
      else expect(Mu).toBeGreaterThan(r.phiMnMax - 1e-9)
    }
  })

  it('flags flexOK = false when the layout diverges (over-demanded section)', () => {
    const r = designBeam({ ...base, b: 250, h: 400, Mu: 450 })
    expect(r.flexOK).toBe(false)
  })
})

describe('stirrup legs — width-driven (hx limit) + shear bump', () => {
  it('normal beams stay at 2 legs; wide beams add legs; seismic hx tightens it', () => {
    expect(designBeam({ ...base, b: 300 }).legs).toBe(2)                    // normal gravity → 2
    expect(designBeam({ ...base, b: 900 }).legs).toBe(3)                    // wide gravity (hx 600) → 3
    expect(designBeam({ ...base, b: 900, legSpacingLimit: 350 }).legs).toBe(4)  // seismic hx 350 → 4
    expect(designBeam({ ...base, b: 400, legSpacingLimit: 350 }).legs).toBe(2)  // normal seismic → still 2
    expect(designBeam({ ...base, b: 900, legs: 2 }).legs).toBe(2)           // explicit override wins
    expect(designBeam({ ...base, b: 900 }).legSpacingLimit).toBe(600)       // limit echoed on the result
  })

  it('a very high Vs bumps the leg count even on a normal-width beam', () => {
    const hi = designBeam({ ...base, b: 300, h: 550, Mu: 100, Vu: 450 })
    expect(hi.region).toBe('designed')
    expect(hi.legs).toBeGreaterThanOrEqual(3)                              // shear bump beyond width's 2
    // the adopted legs keep the required spacing at/above the practical minimum
    expect((hi.Av * (base.fyt ?? base.fy) * hi.d) / (hi.VsReq * 1000)).toBeGreaterThanOrEqual(75 - 1e-6)
    expect(hi.Av).toBeCloseTo(hi.legs * (Math.PI / 4) * 10 * 10, 6)
  })
})

describe('beam design — shear', () => {
  it('regions: none / minimum / designed / inadequate', () => {
    const r = designBeam(base)
    expect(designBeam({ ...base, Vu: r.phiVc * 0.4 }).region).toBe('none')
    expect(designBeam({ ...base, Vu: r.phiVc * 0.9 }).region).toBe('minimum')
    const hi = designBeam({ ...base, Vu: 280 })
    expect(hi.region).toBe('designed')
    expect(hi.sAdopt).toBeLessThanOrEqual(hi.sMax)
    expect(designBeam({ ...base, b: 200, h: 350, Vu: 600 }).region).toBe('inadequate')
  })
})

describe('beam design — compression-bar layout & stirrup detailing', () => {
  it("compression bars get the same spacing/layer treatment; d' deepens (Varignon)", () => {
    // Heavy DRRB → two compression layers. The old fixture was a 300 mm web
    // at Mu = 460, which only fitted 5 bars per layer because the layout
    // omitted §25.2.1's 4/3·d_agg term: 5⌀20 needs 100 + 4(26.7) = 206.7 mm of
    // a 200 mm web. It is 400 mm now, and genuinely fits.
    const r = designBeam({ ...base, b: 400, Mu: 600, comprBarDia: 16 })
    expect(r.mode).toBe('DRRB')
    expect(r.flexOK).toBe(true)
    expect(r.comprLayers.length).toBeGreaterThanOrEqual(2)
    expect(r.comprBars).toBe(r.comprLayers.reduce((s, k) => s + k, 0))
    expect(r.comprLayers.every((k) => k <= r.comprMaxPerLayer)).toBe(true)
    expect(r.comprYBar).toBeGreaterThan(0)
    // d' = base + centroid drop (Varignon on the compression group)
    expect(r.dPrime).toBeCloseTo(40 + 10 + 16 / 2 + r.comprYBar, 9)
    expect(r.comprSClear).toBeGreaterThanOrEqual(r.comprSMinClear - 1e-9)
  })

  it('flags divergence when compression layers run away', () => {
    const r = designBeam({ ...base, Mu: 520, comprBarDia: 16 })
    expect(r.flexOK).toBe(false)
  })

  it('SRRB has no compression layers', () => {
    const r = designBeam(base)
    expect(r.comprLayers).toEqual([])
    expect(r.comprYBar).toBe(0)
  })

  it('stirrup bend = 4ds and 135° hook extension = max(6ds, 75)', () => {
    const r10 = designBeam(base)                          // ds = 10
    expect(r10.stirrupBendDia).toBe(40)
    expect(r10.stirrupHookExt).toBe(75)                   // 6·10 = 60 < 75
    const r16 = designBeam({ ...base, stirrupDia: 16 })   // ds = 16
    expect(r16.stirrupBendDia).toBe(64)
    expect(r16.stirrupHookExt).toBe(96)                   // 6·16 = 96 > 75
  })
})

describe('beamServiceDeflection — ACI 318-14 §24.2', () => {
  const base: BeamDeflectionInput = {
    b: 300, h: 500, d: 440,
    As: 1884,   // 6⌀20 mm bars
    fc: 28, span: 6, wD: 20, wL: 15,
  }

  it('computes positive immediate and total deflections', () => {
    const r = beamServiceDeflection(base)
    expect(r.deltaD).toBeGreaterThan(0)
    expect(r.deltaL).toBeGreaterThan(0)
    expect(r.deltaTotal).toBeGreaterThan(r.deltaL)
  })

  it('Ie = Ig when section is uncracked (Ma ≤ Mcr)', () => {
    const r = beamServiceDeflection({ ...base, wD: 0.1, wL: 0.1 })
    expect(r.Ie).toBeCloseTo(r.Ig, 0)
  })

  it('Icr < Ig always', () => {
    const r = beamServiceDeflection(base)
    expect(r.Icr).toBeLessThan(r.Ig)
  })

  it('limits are L/360 and L/240', () => {
    const r = beamServiceDeflection(base)
    expect(r.limitL360).toBeCloseTo(6000 / 360, 6)
    expect(r.limitL240).toBeCloseTo(6000 / 240, 6)
  })

  it('λΔ = 2.0 with no compression steel (§24.2.4.1.1)', () => {
    const r = beamServiceDeflection(base)
    expect(r.lambdaDelta).toBeCloseTo(2.0, 9)
  })

  it('λΔ decreases with compression steel', () => {
    const noCompr = beamServiceDeflection(base)
    const withCompr = beamServiceDeflection({ ...base, AsPrime: 942 })  // 3⌀20
    expect(withCompr.lambdaDelta).toBeLessThan(noCompr.lambdaDelta)
    const rhoP = 942 / (300 * 440)
    expect(withCompr.lambdaDelta).toBeCloseTo(2.0 / (1 + 50 * rhoP), 9)
  })

  it('live-load check: liveOK = (deltaL ≤ L/360)', () => {
    const r = beamServiceDeflection(base)
    expect(r.liveOK).toBe(r.deltaL <= r.limitL360)
  })

  it('total check: totalOK = (deltaTotal ≤ L/240)', () => {
    const r = beamServiceDeflection(base)
    expect(r.totalOK).toBe(r.deltaTotal <= r.limitL240)
  })
})

describe('beam design — compression NA check', () => {
  it('deepest layer depth = base + (nLayers−1)·pitch; above NA passes', () => {
    const r = designBeam({ ...base, b: 400, Mu: 600, comprBarDia: 16 })  // compr layers [7,3]
    const expected = (40 + 10 + 8) + (r.comprLayers.length - 1) * (16 + 25)
    expect(r.dPrimeExtreme).toBeCloseTo(expected, 9)
    expect(r.dPrimeExtreme).toBeLessThan(r.cNA)
    expect(r.comprNAOK).toBe(true)
  })

  it('SRRB: NA check is vacuously OK', () => {
    const r = designBeam(base)
    expect(r.comprNAOK).toBe(true)
    expect(r.dPrimeExtreme).toBe(0)
  })
})

describe('hinge-zone confinement — §418.6.4.4 (SMF) / §418.4.2.4 (IMF)', () => {
  // A 300 × 500 beam, lightly loaded: the shear rules are satisfied by the
  // §409.7.6.2.2 gravity maximum of d/2 = 220 and say nothing at all about the
  // hinge. That is the case this exists for — on a special moment frame the
  // beam was detailed exactly like a gravity beam.
  const base = {
    b: 300, h: 500, cover: 40, barDia: 20, stirrupDia: 10,
    fc: 28, fy: 415, Mu: 120, Vu: 72,
  }

  it('leaves a gravity beam exactly as it was', () => {
    const r = designBeam(base)
    expect(r.seismicSConf).toBeUndefined()
    expect(r.sHinge).toBe(r.sAdopt)
    expect(r.hingeGovern).toBeUndefined()
  })

  it('caps an SMF beam at min(d/4, 6db, 150)', () => {
    const r = designBeam({ ...base, system: 'smf' })
    expect(r.sAdopt).toBe(220)                        // what shear alone asked for
    const want = Math.min(r.d / 4, 6 * 20, 150)
    expect(r.seismicSConf).toBeCloseTo(want, 6)
    expect(want).toBeCloseTo(110, 6)                  // d/4 governs on this section
    expect(r.sHinge).toBe(110)
    expect(r.hingeGovern).toContain('§418.6.4.4')
  })

  it('caps an IMF beam at min(d/4, 8db, 24·dh, 300)', () => {
    const r = designBeam({ ...base, system: 'imf' })
    expect(r.seismicSConf).toBeCloseTo(Math.min(r.d / 4, 8 * 20, 24 * 10, 300), 6)
    expect(r.sHinge).toBe(110)
    expect(r.hingeGovern).toContain("§418.4.2.4")
  })

  it('lets shear demand govern when it is tighter than the cap', () => {
    // A heavily loaded beam already needs closer hoops than the detailing
    // limit; the cap is a maximum, not a target.
    const r = designBeam({ ...base, Vu: 420, system: 'smf' })
    expect(r.sAdopt).toBeGreaterThan(0)
    expect(r.sAdopt).toBeLessThan(r.seismicSConf!)
    expect(r.sHinge).toBe(r.sAdopt)
    expect(r.hingeGovern).toBe('shear demand')
  })

  it('still confines a zone that needs NO shear steel at all', () => {
    // The confinement is required by the hinge, not by Vu. A beam whose shear
    // is under ½φVc gets sAdopt = 0, and taking that literally would leave the
    // hinge with no hoops in the one place they matter most.
    const r = designBeam({ ...base, Vu: 1, system: 'smf' })
    expect(r.region).toBe('none')
    expect(r.sAdopt).toBe(0)
    expect(r.sHinge).toBe(110)
    expect(r.hingeGovern).toContain('§418.6.4.4')
  })

  it('scales with the section, not with a constant', () => {
    // A shallow beam is capped by d/4; a deep one by 6db or the 150 floor.
    const shallow = designBeam({ ...base, h: 350, system: 'smf' })
    const deep = designBeam({ ...base, h: 900, system: 'smf' })
    expect(shallow.seismicSConf).toBeCloseTo(shallow.d / 4, 6)
    expect(deep.seismicSConf).toBeCloseTo(Math.min(6 * 20, 150), 6)
    expect(shallow.seismicSConf!).toBeLessThan(deep.seismicSConf!)
  })
})

describe('AsFloor — an externally imposed minimum (§418.6.3.2 / §418.4.2.2)', () => {
  it('raises the steel and says so', () => {
    const free = designBeam(base)
    const floored = designBeam({ ...base, AsFloor: free.As * 1.5 })
    expect(free.asFloorGoverns).toBe(false)
    expect(floored.asFloorGoverns).toBe(true)
    expect(floored.As).toBeCloseTo(free.As * 1.5, 6)
    expect(floored.bars).toBeGreaterThanOrEqual(free.bars)
  })

  it('never LOWERS the steel — a floor below the demand does nothing', () => {
    const free = designBeam(base)
    const floored = designBeam({ ...base, AsFloor: free.As * 0.5 })
    expect(floored.asFloorGoverns).toBe(false)
    expect(floored.As).toBeCloseTo(free.As, 9)
  })

  it('beats the §409.6.1.2 minimum when it is the larger of the two', () => {
    // A tiny moment, so the section is min-steel governed on its own.
    const min = designBeam({ ...base, Mu: 5 })
    expect(min.usedMin).toBe(true)
    const floored = designBeam({ ...base, Mu: 5, AsFloor: min.As * 2 })
    expect(floored.usedMin).toBe(false)          // the floor took over, not ρmin
    expect(floored.asFloorGoverns).toBe(true)
    expect(floored.As).toBeCloseTo(min.As * 2, 6)
  })

  it('leaves ρ inside ρmax — the floor is a fraction of a section that already passed', () => {
    const r = designBeam({ ...base, AsFloor: 1500 })
    expect(r.rho).toBeLessThanOrEqual(r.rhoMax)
    expect(r.flexOK).toBe(true)
  })
})

describe('dGiven — the effective depth stated rather than derived', () => {
  it('is used verbatim, and pins dt with it', () => {
    const r = designBeam({ ...base, dGiven: 500 })
    expect(r.d).toBeCloseTo(500, 9)
    expect(r.dt).toBeCloseTo(500, 9)
  })
  it('holds d against a stack that would otherwise pull it down', () => {
    // A moment big enough to need two layers in a 300 mm web.
    const free = designBeam({ ...base, Mu: 700, h: 700 })
    const pinned = designBeam({ ...base, Mu: 700, h: 700, dGiven: 640 })
    expect(free.layers.length).toBeGreaterThan(1)
    expect(free.d).toBeLessThan(free.dt)
    expect(pinned.d).toBe(pinned.dt)
    expect(pinned.yBar).toBe(0)
  })
  it('changes nothing when absent or zero', () => {
    const a = designBeam(base), b = designBeam({ ...base, dGiven: 0 })
    expect(b.d).toBe(a.d); expect(b.As).toBe(a.As); expect(b.bars).toBe(a.bars)
  })
})
