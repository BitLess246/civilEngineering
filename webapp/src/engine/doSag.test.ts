import { describe, it, expect } from 'vitest'
import {
  doSaturation, tempCorrect, reaerationUNESCO, ultimateFromBOD5, doSag,
} from './doSag'

describe('DO saturation (Benson–Krause / USGS DOTABLES)', () => {
  it('matches the printed table values', () => {
    expect(doSaturation(0)).toBeCloseTo(14.621, 2)
    expect(doSaturation(10)).toBeCloseTo(11.288, 2)
    expect(doSaturation(20)).toBeCloseTo(9.092, 3)
    expect(doSaturation(25)).toBeCloseTo(8.263, 2)
    expect(doSaturation(30)).toBeCloseTo(7.559, 2)
  })

  it('falls monotonically with temperature', () => {
    for (let T = 1; T < 40; T++) expect(doSaturation(T)).toBeLessThan(doSaturation(T - 1))
  })
})

describe('rate corrections and helpers', () => {
  it('k(T) = k20·θ^(T−20)', () => {
    expect(tempCorrect(0.25, 1.047, 30)).toBeCloseTo(0.25 * Math.pow(1.047, 10), 10)
    expect(tempCorrect(0.45, 1.024, 30)).toBeCloseTo(0.45 * Math.pow(1.024, 10), 10)
    expect(tempCorrect(0.3, 1.047, 20)).toBeCloseTo(0.3, 10)
  })

  it('UNESCO reaeration: 2.148·v^0.878/H^1.48', () => {
    // v = 0.5 m/s, H = 2 m → k2 = 2.148·0.5^0.878·2^−1.48 = 0.419 d⁻¹
    const k = reaerationUNESCO(0.5, 2)
    expect(k).toBeCloseTo(2.148 * Math.pow(0.5, 0.878) * Math.pow(2, -1.48), 10)
    expect(k).toBeCloseTo(0.418992, 5)
    expect(reaerationUNESCO(1.0, 1.0)).toBeCloseTo(2.148, 10)
  })

  it('ultimate BOD from a 5-day bottle: y5 = 200, k = 0.1 → 508.3', () => {
    expect(ultimateFromBOD5(200, 0.1)).toBeCloseTo(200 / (1 - Math.exp(-0.5)), 2)
  })
})

describe('the textbook sag', () => {
  // River 4.0 m³/s with Lr = 20, DO 7.0; effluent 1.0 m³/s with Lw = 40,
  // DO 2.0; T = 20 °C, kd = 0.25, kr = 0.45 d⁻¹, DOsat pinned at 9.17.
  // Mixed: L0 = 24 mg/L, DOmix = 6.0 → D0 = 3.17 mg/L.
  // Hand: tc = ln[1.8·(1 − 0.714/6)]/0.2 = 2.3805 d; Dc = 7.3532 → DO 1.817.
  const input = {
    Qr: 4, Lr: 20, DOr: 7,
    Qw: 1, Lw: 40, DOw: 2,
    kd20: 0.25, kr20: 0.45, T: 20,
    DOsatOverride: 9.17, u: 0.3,
  }

  it('mixes the loads flow-weighted', () => {
    const r = doSag(input)
    expect(r.L0).toBeCloseTo(24, 6)
    expect(r.DOmix).toBeCloseTo(6.0, 6)
    expect(r.D0).toBeCloseTo(3.17, 6)
  })

  it('critical point at tc = 2.3805 d, DOcrit = 1.817 mg/L', () => {
    const r = doSag(input)
    expect(r.tc).toBeCloseTo(2.3805, 3)
    expect(r.Dcrit).toBeCloseTo(7.3532, 3)
    expect(r.DOcrit).toBeCloseTo(1.8168, 3)
    expect(r.xc).toBeCloseTo(0.3 * 86400 * 2.3805 / 1000, 2) // 61.7 km
  })

  it('curve: DO minimum sits at tc and recovers downstream', () => {
    const r = doSag(input)
    const minPt = r.curve.reduce((a, b) => (b.DO < a.DO ? b : a))
    expect(minPt.t).toBeCloseTo(r.tc!, 2)
    expect(minPt.DO).toBeCloseTo(r.DOcrit!, 2)
    // ends far healthier than the sag
    expect(r.curve[r.curve.length - 1].DO).toBeGreaterThan(5)
  })

  it('BOD decays as L0·e^(−kd·t)', () => {
    const r = doSag(input)
    const t5 = r.curve.find((p) => p.t >= 5)!
    expect(t5.BOD).toBeCloseTo(24 * Math.exp(-0.25 * 5), 1)
    expect(t5.BOD).toBeLessThan(24)
  })

  it('temperature raises kd faster than kr and deepens the sag', () => {
    const warm = doSag({ ...input, T: 30 })
    expect(warm.kd).toBeCloseTo(0.25 * Math.pow(1.047, 10), 8)
    expect(warm.kr).toBeCloseTo(0.45 * Math.pow(1.024, 10), 8)
    expect(warm.DOcrit!).toBeLessThan(doSag(input).DOcrit!)
  })

  it('a recovering river with a saturated load shows no critical point', () => {
    // D0 = 5.57 ≥ kd·L0/(kr−kd) = 2.25 → the deficit falls from the start
    const r = doSag({ ...input, Lr: 1, Lw: 5, DOr: 4, DOw: 2 })
    expect(r.tc).toBeNull()
    expect(r.D0).toBeCloseTo(9.17 - 3.6, 6)
    expect(r.notes.some((x) => x.includes('No critical point'))).toBe(true)
    // DO climbs through the whole window
    for (let i = 1; i < r.curve.length; i++) {
      expect(r.curve[i].DO).toBeGreaterThanOrEqual(r.curve[i - 1].DO - 1e-9)
    }
  })

  it('an overloaded reach turns anoxic and says so', () => {
    const r = doSag({ ...input, Lw: 400 })
    expect(r.anoxic).toBe(true)
    expect(r.DOcrit!).toBeLessThan(0)
    expect(r.notes.some((x) => x.includes('anoxic'))).toBe(true)
  })

  it('kr = kd is refused (the closed form divides by kr − kd)', () => {
    expect(() => doSag({ ...input, kr20: 0.25 })).toThrow(/differ/)
  })
})
