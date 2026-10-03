import { describe, it, expect } from 'vitest'
import { fullFlowQ, velocityAt, pickDiameter, designSewer } from './stormSewer'

describe('Manning full-flow capacity', () => {
  it('matches the hand evaluation for DN 300 at 0.5 %', () => {
    // A = 0.070686 m², R = 0.075 m, Q = 76.923·0.070686·0.177876·0.070711
    expect(fullFlowQ(0.3, 0.013, 0.005)).toBeCloseTo(0.068378, 5)
  })

  it('velocity follows Q/A', () => {
    expect(velocityAt(0.3, 0.068386)).toBeCloseTo(0.96747, 4)
  })

  it('grows with the grade and the diameter', () => {
    expect(fullFlowQ(0.3, 0.013, 0.01)).toBeGreaterThan(fullFlowQ(0.3, 0.013, 0.005))
    expect(fullFlowQ(0.6, 0.013, 0.005)).toBeGreaterThan(fullFlowQ(0.3, 0.013, 0.005))
  })
})

describe('the diameter picker', () => {
  it('takes the smallest size meeting both capacity and cleansing', () => {
    const p = pickDiameter(0.05, 0.013, 0.005, 0.75)
    expect(p.dn).toBe(300)
    expect(p.Qfull).toBeCloseTo(0.068378, 4)
    expect(p.meetsVelocity).toBe(true)
  })
  it('refuses to bless a giant pipe when the grade cannot cleanse', () => {
    // DN 300 carries 0.005 m³/s but part-full V falls as D grows, so no size
    // clears 0.75 m/s at this slope: the picker holds the smallest sufficient
    // DN 300 and says so, instead of returning a 3 m pipe as "self-cleansing".
    const p = pickDiameter(0.005, 0.013, 0.005, 0.75)
    expect(p.dn).toBe(300)
    expect(p.meetsVelocity).toBe(false)
    expect(p.Vpart).toBeLessThan(0.75)
  })
})

describe('the network ladder', () => {
  // IDF i = 800/(tc + 10)^0.75 mm/h.
  const IDF = { a: 800, b: 10, c: 0.75 }
  const runs = [
    { name: 'Line 1', upstream: -1, L: 200, slopePct: 0.5, n: 0.013,
      inlet: { name: 'Inlet A', areaHa: 2, C: 0.6, tcMin: 15 } },
    { name: 'Line 2', upstream: 0, L: 250, slopePct: 0.5, n: 0.013,
      inlet: { name: 'Inlet B', areaHa: 3, C: 0.5, tcMin: 20 } },
  ]

  it('sizes run 1 at its own inlet time', () => {
    const r = designSewer(runs, IDF)
    // tc 15 → i = 71.558 mm/h → Q = 0.6·71.558·2/360 = 0.238527
    expect(r.runs[0].Qdesign).toBeCloseTo(0.238527, 4)
    expect(r.runs[0].iDesign).toBeCloseTo(71.558, 2)
    expect(r.runs[0].dn).toBe(525)
    expect(r.runs[0].Vfull).toBeCloseTo(1.4049, 3)
  })

  it('accumulates area and shifts tc on run 2', () => {
    const r = designSewer(runs, IDF)
    // tc = max(20, 15 + 2.374) = 20 → i = 62.409; CA = 2.7 over 5 ha → C 0.54
    expect(r.runs[1].tcHead).toBeCloseTo(20, 4)
    expect(r.runs[1].Ccomp).toBeCloseTo(0.54, 4)
    expect(r.runs[1].areaHa).toBeCloseTo(5, 6)
    expect(r.runs[1].Qdesign).toBeCloseTo(0.468071, 4)
    expect(r.runs[1].dn).toBe(675)
    expect(r.runs[1].upstreamNames).toEqual(['Line 1'])
  })

  it('prices the whole catchment at the inlet time when it governs', () => {
    // A steep pipe arrives long before the downstream inlet matures.
    const fast = [{ ...runs[1], upstream: 0, inlet: { name: 'B', areaHa: 3, C: 0.5, tcMin: 5 } }]
    const r = designSewer([runs[0], fast[0]], IDF)
    // arrival = 15 + travel ≈ 17.4 > 5 → tc driven by the upstream run
    expect(r.runs[1].tcHead).toBeGreaterThan(15)
    expect(r.runs[1].tcHead).toBeCloseTo(15 + r.runs[0].travelMin, 4)
  })

  it('warns when the erosion cap is crossed', () => {
    const steep = [
      { name: 'L1', upstream: -1, L: 100, slopePct: 8, n: 0.013,
        inlet: { name: 'A', areaHa: 6, C: 0.9, tcMin: 5 } },
    ]
    const r = designSewer(steep, IDF)
    expect(r.runs[0].warnings.some((w) => w.includes('m/s'))).toBe(true)
  })

  it('refuses a run pointing forward', () => {
    expect(() => designSewer([
      { name: 'L1', upstream: 1, L: 100, slopePct: 1, n: 0.013,
        inlet: { name: 'A', areaHa: 1, C: 0.5, tcMin: 10 } },
      runs[1],
    ], IDF)).toThrow(/head-first/)
  })

  it('validates the inlet rows', () => {
    expect(() => designSewer([{
      name: 'L1', upstream: -1, L: 100, slopePct: 1, n: 0.013,
      inlet: { name: 'A', areaHa: 0, C: 0.5, tcMin: 10 },
    }], IDF)).toThrow()
    expect(() => designSewer([{
      name: 'L1', upstream: -1, L: 100, slopePct: 1, n: 0.013,
      inlet: { name: 'A', areaHa: 1, C: 1.5, tcMin: 10 },
    }], IDF)).toThrow()
  })
})
