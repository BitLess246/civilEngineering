import { describe, it, expect } from 'vitest'
import { distributePanel, wallLineLoad } from './tributary'
import { solveFEM } from './beamAnalysis'

describe('tributary — classification & closure', () => {
  it('one-way when long/short ≥ 2: long edges carry q·lx/2 UDL, short edges nothing', () => {
    const r = distributePanel(3, 7, [{ q: 10, cat: 'D' }])    // ratio 2.33
    expect(r.behaviour).toBe('one-way')
    const long = r.edges.filter((e) => e.kind === 'long')
    const short = r.edges.filter((e) => e.kind === 'short')
    expect(long[0].peak).toBeCloseTo((10 * 3) / 2, 9)          // 15 kN/m
    expect(long[0].loads[0].type).toBe('udl')
    expect(short[0].loads).toHaveLength(0)
    // closure: 2 × 15 × 7 = 210 = q·lx·ly
    expect(r.totalDistributed).toBeCloseTo(r.totalApplied, 9)
  })

  it('two-way: triangles on short edges, trapezoids on long; closure holds', () => {
    const r = distributePanel(4, 6, [{ q: 12, cat: 'L' }])     // ratio 1.5
    expect(r.behaviour).toBe('two-way')
    const long = r.edges.find((e) => e.kind === 'long')!
    const short = r.edges.find((e) => e.kind === 'short')!
    const peak = (12 * 4) / 2                                  // 24 kN/m
    expect(long.peak).toBeCloseTo(peak, 9)
    // trapezoid total: peak·(ly − lx/2) = 24·4 = 96; triangle: peak·lx/2 = 48
    expect(long.total).toBeCloseTo(peak * (6 - 4 / 2), 6)
    expect(short.total).toBeCloseTo((peak * 4) / 2, 6)
    expect(r.totalDistributed).toBeCloseTo(12 * 4 * 6, 6)
  })

  it('square panel: four identical triangles', () => {
    const r = distributePanel(5, 5, [{ q: 8, cat: 'D' }])
    expect(r.behaviour).toBe('two-way')
    const totals = r.edges.map((e) => e.total)
    totals.forEach((t) => expect(t).toBeCloseTo(totals[0], 9))
    expect(r.totalDistributed).toBeCloseTo(8 * 25, 6)
  })

  it('categories are preserved per emitted load', () => {
    const r = distributePanel(4, 6, [{ q: 5, cat: 'D' }, { q: 3, cat: 'L' }])
    const long = r.edges.find((e) => e.kind === 'long')!
    expect(long.loads.some((l) => l.cat === 'D')).toBe(true)
    expect(long.loads.some((l) => l.cat === 'L')).toBe(true)
    expect(r.totalDistributed).toBeCloseTo(8 * 24, 6)
  })
})

describe('tributary — the emitted loads run straight through the beam FEM', () => {
  it('a long-edge trapezoid analyses without conversion and balances its reactions', () => {
    const r = distributePanel(4, 6, [{ q: 12, cat: 'D' }])
    const long = r.edges.find((e) => e.kind === 'long')!
    const fem = solveFEM(
      [{ type: 'pin', x: 0 }, { type: 'roller', x: long.length }],
      long.loads, long.length, 25000, 3.125e9)!
    const sumR = fem.reactions.reduce((s, q) => s + q.Rv, 0)
    expect(sumR).toBeCloseTo(long.total, 3)
    // symmetric trapezoid → equal reactions
    expect(fem.reactions[0].Rv).toBeCloseTo(fem.reactions[1].Rv, 3)
  })
})

describe('wall line load', () => {
  it('150 mm × 3.0 m wall at 24 kN/m³ → 10.8 kN/m', () => {
    expect(wallLineLoad(150, 3)).toBeCloseTo(10.8, 9)
  })
})
