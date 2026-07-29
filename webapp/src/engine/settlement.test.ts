import { describe, it, expect } from 'vitest'
import {
  boussinesqCorner, stressUnderRect, stress2to1, effectiveStress,
  consolidationSettlement, timeFactor, degreeOfConsolidation,
  timeToConsolidation, consolidationAfter, drainagePath,
  elasticSettlement, schmertmannSettlement,
  type SoilLayer,
} from './settlement'

describe('boussinesqCorner', () => {
  it('matches published influence-factor values', () => {
    // Das, Table 5.x (m, n interchangeable)
    expect(boussinesqCorner(1, 1)).toBeCloseTo(0.1752, 4)
    expect(boussinesqCorner(0.5, 0.5)).toBeCloseTo(0.0840, 4)
    expect(boussinesqCorner(1, 2)).toBeCloseTo(0.1999, 4)
    expect(boussinesqCorner(0.6, 1.2)).toBeCloseTo(0.1431, 4)
  })

  it('is symmetric in m and n', () => {
    for (const [m, n] of [[0.4, 1.7], [2.5, 0.9], [3, 6]]) {
      expect(boussinesqCorner(m, n)).toBeCloseTo(boussinesqCorner(n, m), 12)
    }
  })

  it('tends to 1/4 for a very large loaded area — the arctan branch check', () => {
    // With m²n² > m²+n²+1 the atan denominator goes negative; without the +π
    // shift the factor silently collapses. A quarter of the load is the exact
    // limit, since four corners must reconstruct the full q.
    expect(boussinesqCorner(50, 50)).toBeCloseTo(0.25, 3)
    expect(boussinesqCorner(500, 500)).toBeCloseTo(0.25, 4)
    // and it must increase monotonically toward it, never dip
    let prev = 0
    for (const m of [0.5, 1, 2, 4, 8, 16, 32, 64]) {
      const I = boussinesqCorner(m, m)
      expect(I).toBeGreaterThan(prev)
      prev = I
    }
  })

  it('vanishes at zero size', () => {
    expect(boussinesqCorner(0, 5)).toBe(0)
    expect(boussinesqCorner(5, 0)).toBe(0)
  })
})

describe('stressUnderRect', () => {
  it('gives the full pressure at the loaded plane', () => {
    expect(stressUnderRect(150, 2, 3, 0)).toBe(150)
  })

  it('centre is four quarter-rectangles — and exceeds the corner', () => {
    const q = 100, B = 2, L = 4, z = 1.5
    expect(stressUnderRect(q, B, L, z, 'center'))
      .toBeCloseTo(4 * q * boussinesqCorner(B / 2 / z, L / 2 / z), 12)
    expect(stressUnderRect(q, B, L, z, 'center')).toBeGreaterThan(stressUnderRect(q, B, L, z, 'corner'))
  })

  it('decays with depth and never exceeds the applied pressure', () => {
    let prev = Infinity
    for (const z of [0.5, 1, 2, 4, 8, 16]) {
      const s = stressUnderRect(120, 2, 2, z)
      expect(s).toBeLessThan(prev)
      expect(s).toBeLessThanOrEqual(120)
      prev = s
    }
  })

  it('exceeds the 2:1 spread, and converges toward it with depth', () => {
    // Not the same quantity: 2:1 is the AVERAGE stress over the spread area,
    // Boussinesq-centre is the PEAK under the middle. So the centre must always
    // be the larger, and the gap must close as the bulb spreads out — 55% at
    // z = B/2 down to 22% at z = 1.5B on this footing.
    const q = 100, B = 2, L = 3
    let prevGap = Infinity
    for (const z of [1, 2, 3]) {
      const b = stressUnderRect(q, B, L, z), t = stress2to1(q, B, L, z)
      expect(b).toBeGreaterThan(t)
      const gap = (b - t) / t
      expect(gap).toBeLessThan(prevGap)
      prevGap = gap
    }
    expect(stress2to1(100, 2, 2, 0)).toBe(100)
  })
})

describe('effectiveStress', () => {
  const layers: SoilLayer[] = [
    { H: 3, gamma: 17, gammaSat: 19 },
    { H: 4, gamma: 18, gammaSat: 20 },
  ]

  it('is the dry overburden above the water table', () => {
    expect(effectiveStress(layers, 2, 3)).toBeCloseTo(2 * 17, 9)
    expect(effectiveStress(layers, 3, 3)).toBeCloseTo(3 * 17, 9)
  })

  it('subtracts pore pressure below the water table', () => {
    // 3 m dry at 17 + 2 m saturated at 20, minus 2 m of water
    expect(effectiveStress(layers, 5, 3)).toBeCloseTo(3 * 17 + 2 * 20 - 2 * 9.81, 9)
  })

  it('uses the bulk unit weight throughout when the profile is dry', () => {
    expect(effectiveStress(layers, 5)).toBeCloseTo(3 * 17 + 2 * 18, 9)
  })
})

describe('consolidationSettlement', () => {
  const clay = (o: Partial<SoilLayer> = {}): SoilLayer =>
    ({ H: 4, gamma: 18, gammaSat: 18, e0: 0.9, Cc: 0.3, cv: 2, ...o })

  it('matches the closed-form Terzaghi formula for a single NC layer', () => {
    // One slice ⇒ the engine evaluates exactly at mid-height, which is what the
    // textbook formula does, so the two must agree to machine precision.
    const layers = [clay({ H: 2 })]
    const r = consolidationSettlement({ layers, q: 100, B: 2, L: 2, slices: 1 })
    const zMid = 1
    const sigma0 = effectiveStress(layers, zMid)
    const dSig = stressUnderRect(100, 2, 2, zMid)
    const want = ((0.3 * 2) / (1 + 0.9)) * Math.log10((sigma0 + dSig) / sigma0) * 1000
    expect(r.total).toBeCloseTo(want, 9)
    expect(r.layers[0].branch).toBe('normally-consolidated')
  })

  it('settles far less when the layer is overconsolidated', () => {
    const nc = consolidationSettlement({ layers: [clay()], q: 80, B: 2, L: 2 })
    // σ′p well above the final stress ⇒ pure recompression on Cr = Cc/6
    const oc = consolidationSettlement({ layers: [clay({ sigmaP: 400 })], q: 80, B: 2, L: 2 })
    expect(oc.layers[0].branch).toBe('recompression')
    expect(oc.total).toBeCloseTo(nc.total / 6, 6)      // Cr defaults to Cc/6
    expect(oc.total).toBeLessThan(nc.total)
  })

  it('splits recompression and virgin compression when Δσ crosses σ′p', () => {
    const layers = [clay({ H: 2, sigmaP: 60 })]
    const r = consolidationSettlement({ layers, q: 150, B: 2, L: 2, slices: 1 })
    expect(r.layers[0].branch).toBe('recompression+virgin')
    const zMid = 1
    const s0 = effectiveStress(layers, zMid)
    const sf = s0 + stressUnderRect(150, 2, 2, zMid)
    const f = 2 / (1 + 0.9)
    const want = ((0.3 / 6) * f * Math.log10(60 / s0) + 0.3 * f * Math.log10(sf / 60)) * 1000
    expect(r.total).toBeCloseTo(want, 9)
    // and it must sit between the two pure branches
    const pureNC = consolidationSettlement({ layers: [clay({ H: 2 })], q: 150, B: 2, L: 2, slices: 1 })
    expect(r.total).toBeLessThan(pureNC.total)
  })

  it('ignores layers with no compressibility data, and reports them as such', () => {
    const r = consolidationSettlement({
      layers: [{ H: 3, gamma: 19 }, clay({ H: 3 })],
      q: 100, B: 2, L: 2,
    })
    expect(r.layers[0].branch).toBe('none')
    expect(r.layers[0].settlement).toBe(0)
    expect(r.layers[1].settlement).toBeGreaterThan(0)
    expect(r.total).toBeCloseTo(r.layers[1].settlement, 9)
  })

  it('converges as the slicing is refined', () => {
    const layers = [clay({ H: 6 })]
    const at = (slices: number) => consolidationSettlement({ layers, q: 120, B: 2, L: 2, slices }).total
    const coarse = at(4), fine = at(40), finer = at(120)
    expect(Math.abs(fine - finer) / finer).toBeLessThan(Math.abs(coarse - finer) / finer)
    expect(Math.abs(fine - finer) / finer).toBeLessThan(1e-2)
  })

  it('excludes soil above founding level', () => {
    const layers = [clay({ H: 6 })]
    const shallow = consolidationSettlement({ layers, q: 100, B: 2, L: 2, Df: 0, slices: 60 })
    const deep = consolidationSettlement({ layers, q: 100, B: 2, L: 2, Df: 3, slices: 60 })
    expect(deep.total).toBeLessThan(shallow.total)
  })
})

describe('time rate of consolidation', () => {
  it('reproduces the published closed-form fit, and is honest about its error', () => {
    // The parabola is an APPROXIMATION to Terzaghi's series: 0.1963 against the
    // tabulated 0.197. Asserting the tabulated value here would be asserting an
    // exactness the formula does not have, so both are pinned.
    expect(timeFactor(0.5)).toBeCloseTo(0.19635, 5)
    expect(Math.abs(timeFactor(0.5) - 0.197) / 0.197).toBeLessThan(0.005)
    expect(timeFactor(0.9)).toBeCloseTo(0.848, 5)
    // the branches do not meet exactly at 60% — a property of the published fit
    const below = timeFactor(0.6), above = timeFactor(0.6001)
    expect(below).toBeCloseTo(0.28274, 5)
    expect(above).toBeGreaterThan(below)
    expect((above - below) / below).toBeLessThan(0.02)
  })

  it('inverts itself', () => {
    for (const U of [0.1, 0.3, 0.5, 0.6, 0.75, 0.9, 0.95]) {
      expect(degreeOfConsolidation(timeFactor(U))).toBeCloseTo(U, 6)
    }
    expect(degreeOfConsolidation(0)).toBe(0)
  })

  it('halves the drainage path when both faces drain — quartering the time', () => {
    const both: SoilLayer = { H: 4, gamma: 18, cv: 2 }
    const one: SoilLayer = { ...both, drainage: 'one' }
    expect(drainagePath(both)).toBe(2)
    expect(drainagePath(one)).toBe(4)
    // t ∝ H_dr², so single-face drainage takes 4× as long
    expect(timeToConsolidation(one, 0.9) / timeToConsolidation(both, 0.9)).toBeCloseTo(4, 9)
  })

  it('round-trips time against degree of consolidation', () => {
    const l: SoilLayer = { H: 4, gamma: 18, cv: 1.5 }
    for (const U of [0.3, 0.5, 0.9]) {
      expect(consolidationAfter(l, timeToConsolidation(l, U))).toBeCloseTo(U, 6)
    }
  })

  it('never finishes without a coefficient of consolidation', () => {
    const l: SoilLayer = { H: 4, gamma: 18 }
    expect(timeToConsolidation(l, 0.9)).toBe(Infinity)
    expect(consolidationAfter(l, 10)).toBe(0)
  })
})

describe('elasticSettlement', () => {
  it('follows Se = q·B·(1−ν²)·If/Es', () => {
    const got = elasticSettlement({ q: 150, B: 2, L: 2, Es: 20000, nu: 0.3 })
    expect(got).toBeCloseTo((150 * 2 * (1 - 0.09) * 1.12) / 20000 * 1000, 9)
  })

  it('scales linearly with pressure and inversely with modulus', () => {
    const base = elasticSettlement({ q: 100, B: 2, Es: 20000 })
    expect(elasticSettlement({ q: 200, B: 2, Es: 20000 })).toBeCloseTo(2 * base, 9)
    expect(elasticSettlement({ q: 100, B: 2, Es: 40000 })).toBeCloseTo(base / 2, 9)
  })

  it('grows with L/B and shrinks for a rigid base', () => {
    const sq = elasticSettlement({ q: 100, B: 2, L: 2, Es: 20000 })
    const strip = elasticSettlement({ q: 100, B: 2, L: 10, Es: 20000 })
    expect(strip).toBeGreaterThan(sq)
    expect(elasticSettlement({ q: 100, B: 2, L: 2, Es: 20000, rigid: true })).toBeCloseTo(0.93 * sq, 9)
  })

  it('returns zero for a degenerate modulus', () => {
    expect(elasticSettlement({ q: 100, B: 2, Es: 0 })).toBe(0)
  })
})

describe('schmertmannSettlement', () => {
  const sub = (n: number, H: number, Es: number) => Array.from({ length: n }, () => ({ H, Es }))

  it('puts the influence peak below the footing, not at it', () => {
    // The physical point of the method: a square footing strains most at ~B/2.
    const B = 2
    const r = schmertmannSettlement({
      dp: 150, B, L: B, sigma0: 30, gamma: 18, layers: sub(20, 0.2, 15000),
    })
    expect(r.zInfluence).toBeCloseTo(2 * B, 9)
    expect(r.Izp).toBeGreaterThan(0.5)
    expect(r.settlement).toBeGreaterThan(0)
  })

  it('uses the strip diagram — deeper influence — at large L/B', () => {
    const B = 2
    const common = { dp: 150, B, sigma0: 30, gamma: 18, layers: sub(40, 0.2, 15000) }
    const square = schmertmannSettlement({ ...common, L: B })
    const strip = schmertmannSettlement({ ...common, L: 40 * B })
    expect(strip.zInfluence).toBeCloseTo(4 * B, 9)
    expect(strip.settlement).toBeGreaterThan(square.settlement)
  })

  it('applies C₁ depth relief and C₂ creep as stated', () => {
    const p = { dp: 200, B: 2, L: 2, sigma0: 50, gamma: 18, layers: sub(20, 0.2, 15000) }
    const r1 = schmertmannSettlement({ ...p, years: 1 })
    expect(r1.C1).toBeCloseTo(1 - 0.5 * (50 / 200), 9)
    expect(r1.C2).toBeCloseTo(1 + 0.2 * Math.log10(1 / 0.1), 9)
    // creep grows the settlement with time, by exactly the C₂ ratio
    const r10 = schmertmannSettlement({ ...p, years: 10 })
    expect(r10.settlement / r1.settlement).toBeCloseTo(r10.C2 / r1.C2, 9)
  })

  it('floors C₁ at 0.5 for a deeply founded footing', () => {
    const r = schmertmannSettlement({
      dp: 50, B: 2, L: 2, sigma0: 500, gamma: 18, layers: sub(20, 0.2, 15000),
    })
    expect(r.C1).toBe(0.5)
  })

  it('ignores sublayers below the influence depth', () => {
    const p = { dp: 150, B: 2, L: 2, sigma0: 30, gamma: 18 }
    const short = schmertmannSettlement({ ...p, layers: sub(20, 0.2, 15000) })     // 4 m = 2B
    const long = schmertmannSettlement({ ...p, layers: sub(60, 0.2, 15000) })      // 12 m
    expect(long.settlement).toBeCloseTo(short.settlement, 9)
  })
})
