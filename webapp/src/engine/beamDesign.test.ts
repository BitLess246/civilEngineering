import { describe, it, expect } from 'vitest'
import { designBeam, beamServiceDeflection, stirrupLegs, type BeamDesignInput, type BeamDeflectionInput } from './beamDesign'
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

describe('stirrup legs — lateral support (§25.7.2.3)', () => {
  it('closely-spaced bars need only the 2 corner legs; crossties appear past 150 mm', () => {
    // tight spacing (40 mm clear, 20 mm bar): the corner ties reach many bars
    expect(stirrupLegs(2, 40, 20)).toBe(2)
    expect(stirrupLegs(3, 40, 20)).toBe(2)
    expect(stirrupLegs(6, 40, 20)).toBe(2)
    expect(stirrupLegs(7, 40, 20)).toBe(3)
    // wide spacing (200 mm clear): interior bars are > 150 mm from a corner
    expect(stirrupLegs(3, 200, 20)).toBe(3)   // middle bar needs a crosstie
    expect(stirrupLegs(4, 200, 20)).toBe(4)   // both interior bars need one
  })

  it('Av uses the spacing-based leg count; explicit legs override', () => {
    // wide beam, few widely-spaced bars → a crosstie (> 2 legs)
    const wide = designBeam({ ...base, b: 800, h: 600, barDia: 25, Mu: 150, Vu: 320 })
    expect(wide.legs).toBeGreaterThanOrEqual(3)
    expect(wide.Av).toBeCloseTo(wide.legs * (Math.PI / 4) * 10 * 10, 6)
    const forced = designBeam({ ...base, b: 800, h: 600, barDia: 25, Mu: 150, Vu: 320, legs: 2 })
    expect(forced.legs).toBe(2)
    expect(forced.Av).toBeLessThan(wide.Av)
    // a normal narrow beam stays at 2 legs even when it carries many bars
    expect(designBeam({ ...base, b: 300, h: 550, Mu: 320, Vu: 260 }).legs).toBe(2)
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
    // Heavy DRRB → 9 ⌀16 compression bars: two layers [5, 4].
    const r = designBeam({ ...base, Mu: 460, comprBarDia: 16 })
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
    const r = designBeam({ ...base, Mu: 460, comprBarDia: 16 })   // compr layers [5,4]
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
