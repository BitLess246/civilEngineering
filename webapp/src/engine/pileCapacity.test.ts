import { describe, it, expect } from 'vitest'
import { pileCapacity, alphaFor, NqOf, pileGeometry } from './pileCapacity'

describe('pile geometry', () => {
  it('circular: perimeter πd, area πd²/4', () => {
    const g = pileGeometry({ kind: 'circular', d: 0.4 })
    expect(g.perimeter).toBeCloseTo(Math.PI * 0.4, 12)
    expect(g.area).toBeCloseTo(Math.PI * 0.16 / 4, 12)
  })

  it('square: 4b and b²', () => {
    const g = pileGeometry({ kind: 'square', b: 0.3 })
    expect(g.perimeter).toBe(1.2)
    expect(g.area).toBeCloseTo(0.09, 12)
  })

  it('pipe: gross plugged area, wall kept for the record', () => {
    const g = pileGeometry({ kind: 'pipe', d: 0.5, t: 0.02 })
    expect(g.perimeter).toBeCloseTo(Math.PI * 0.5, 12)
    expect(g.area).toBeCloseTo(Math.PI * 0.25 / 4, 12)
    expect(() => pileGeometry({ kind: 'pipe', d: 0.5, t: 0.3 })).toThrow(/wall/)
  })
})

describe('α relation and Nq', () => {
  it('α = 1 at cu ≤ 25, 0.5 at cu ≥ 70, linear between', () => {
    expect(alphaFor(20)).toBe(1.0)
    expect(alphaFor(25)).toBe(1.0)
    expect(alphaFor(100)).toBe(0.5)
    expect(alphaFor(47.5)).toBeCloseTo(0.75, 12) // 1 − 22.5/90
  })

  it('Meyerhof Nq at φ = 30° equals e^{π·tan30}·tan²60', () => {
    expect(NqOf(30)).toBeCloseTo(Math.exp(Math.PI * Math.tan(Math.PI / 6)) * 3, 9)
  })
})

describe('single pile in clay (α method + 9·cu tip)', () => {
  // 0.4 m circular pile, 10 m into cu = 50 kPa clay, dry, FS = 3
  const res = pileCapacity({
    layers: [{ thickness: 10, kind: 'clay', cu: 50, gamma: 18 }],
    section: { kind: 'circular', d: 0.4 },
    FS: 3,
  })

  it('shaft: α·cu over the full embedment', () => {
    expect(res.perimeter).toBeCloseTo(Math.PI * 0.4, 12)
    expect(res.segments[0].f).toBeCloseTo(50 * (1 - 25 / 90), 9) // α(50) = 0.7222…
    expect(res.Qs).toBeCloseTo(Math.PI * 0.4 * (50 * (1 - 25 / 90)) * 10, 4) // 453.78
  })

  it('tip: qp = 9·cu = 450 kPa', () => {
    expect(res.qp).toBeCloseTo(450, 9)
    expect(res.Qp).toBeCloseTo(450 * Math.PI * 0.16 / 4, 6) // 56.55
    expect(res.capped).toBe(false)
  })

  it('allowable = (Qp + Qs)/FS', () => {
    expect(res.Qult).toBeCloseTo(res.Qp + res.Qs, 9)
    expect(res.Qall).toBeCloseTo((res.Qp + res.Qs) / 3, 9)
  })
})

describe('single pile in sand (K·σ′·tanδ shaft, capped Meyerhof tip)', () => {
  // 0.4 m circular pile, 10 m of φ = 32° sand, γ = 18, water table at 3 m
  const res = pileCapacity({
    layers: [{ thickness: 10, kind: 'sand', phi: 32, gamma: 18 }],
    section: { kind: 'circular', d: 0.4 },
    waterTable: 3,
    FS: 3,
  })

  it('uses submerged weight below the water table', () => {
    expect(res.sigmaTip).toBeCloseTo(3 * 18 + 7 * (18 - 9.81), 6) // 111.33
  })

  it('caps the tip at ql = 0.5·pa·Nq·tanφ', () => {
    const Nq = NqOf(32)
    const ql = 0.5 * 100 * Nq * Math.tan(32 * Math.PI / 180)
    expect(res.capped).toBe(true)
    expect(res.qp).toBeCloseTo(ql, 6) // 723.99
    expect(res.Qp).toBeCloseTo(ql * Math.PI * 0.16 / 4, 5) // 90.98
    expect(res.warnings[0]).toMatch(/capped/)
  })

  it('one segment per soil layer — the WT split stays inside its layer', () => {
    // A single sand layer crossed by the water table reports ONE segment
    // whose Q is the whole shaft (pieces at f1 then f2, coalesced)
    expect(res.segments).toHaveLength(1)
    expect(res.segments[0].Q).toBeCloseTo(res.Qs, 9)
    const K = 1 - Math.sin(32 * Math.PI / 180)
    const tanDelta = Math.tan(27 * Math.PI / 180)
    const f1 = K * 27 * tanDelta // σ′mid = 1.5·18
    const f2 = K * (54 + 3.5 * (18 - 9.81)) * tanDelta // σ′mid = 3·18 + 3.5·8.19 (6.5 m depth)
    expect(res.Qs).toBeCloseTo(Math.PI * 0.4 * (f1 * 3 + f2 * 7), 3)
  })

  it('two sand layers report their own mid-depth frictions', () => {
    const res2 = pileCapacity({
      layers: [
        { thickness: 3, kind: 'sand', phi: 32, gamma: 18 },
        { thickness: 7, kind: 'sand', phi: 32, gamma: 18 },
      ],
      section: { kind: 'circular', d: 0.4 },
      waterTable: 3,
    })
    const K = 1 - Math.sin(32 * Math.PI / 180)
    const tanDelta = Math.tan(27 * Math.PI / 180)
    expect(res2.segments[0].f).toBeCloseTo(K * 27 * tanDelta, 9) // σ′mid = 1.5·18
    expect(res2.segments[1].f).toBeCloseTo(K * (54 + 3.5 * (18 - 9.81)) * tanDelta, 9)
    expect(res2.Qs).toBeCloseTo(res.Qs, 4) // same profile, same total
  })

  it('assembles Qult and Qall', () => {
    expect(res.Qult).toBeCloseTo(res.Qp + res.Qs, 9)
    expect(res.Qall).toBeCloseTo(res.Qult / 3, 9)
  })
})

describe('layered profile', () => {
  it('walks clay over sand and takes the tip in the bottom layer', () => {
    const res = pileCapacity({
      layers: [
        { thickness: 4, kind: 'clay', cu: 30, gamma: 17 },
        { thickness: 6, kind: 'sand', phi: 35, gamma: 19, gammaSat: 20 },
      ],
      section: { kind: 'square', b: 0.3 },
      waterTable: 5,
      FS: 2.5,
    })
    expect(res.segments).toHaveLength(2)
    expect(res.segments[0].kind).toBe('clay')
    expect(res.segments[0].f).toBeCloseTo(30 * (1 - 5 / 90), 9) // α(30) = 1 − 5/90
    expect(res.segments[1].kind).toBe('sand')
    // tip effective stress: 4·17 + 1·19 + 5·(20 − 9.81) = 68 + 19 + 50.95 = 137.95
    expect(res.sigmaTip).toBeCloseTo(137.95, 3)
    // q′·Nq = 137.95·33.3 = 4594 kPa vs ql = 0.5·100·33.3·tan35 = 1166 → the cap governs
    expect(res.capped).toBe(true)
    const Nq = NqOf(35)
    expect(res.qp).toBeCloseTo(0.5 * 100 * Nq * Math.tan(35 * Math.PI / 180), 6)
    expect(res.Qall).toBeCloseTo(res.Qult / 2.5, 9)
  })

  it('respects a partial embedment ending inside a layer', () => {
    const res = pileCapacity({
      layers: [
        { thickness: 4, kind: 'clay', cu: 30, gamma: 17 },
        { thickness: 6, kind: 'sand', phi: 35, gamma: 19 },
      ],
      section: { kind: 'circular', d: 0.4 },
      embedDepth: 4,
    })
    expect(res.embedDepth).toBe(4)
    expect(res.segments).toHaveLength(1)
    // tip lands on the clay layer: qp = 9·30 = 270 kPa
    expect(res.qp).toBeCloseTo(270, 9)
  })
})

describe('input guards', () => {
  it('rejects degenerate inputs', () => {
    expect(() => pileCapacity({
      layers: [],
      section: { kind: 'circular', d: 0.4 },
    })).toThrow(/At least one/)
    expect(() => pileCapacity({
      layers: [{ thickness: 5, kind: 'clay', gamma: 18 }],
      section: { kind: 'circular', d: 0.4 },
    })).toThrow(/cu/)
    expect(() => pileCapacity({
      layers: [{ thickness: 5, kind: 'sand', gamma: 18 }],
      section: { kind: 'circular', d: 0.4 },
    })).toThrow(/φ/)
    expect(() => pileCapacity({
      layers: [{ thickness: 5, kind: 'clay', cu: 40, gamma: 18 }],
      section: { kind: 'circular', d: 0.4 },
      FS: 1,
    })).toThrow(/Factor of safety/)
  })
})
