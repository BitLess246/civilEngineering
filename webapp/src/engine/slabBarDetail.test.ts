import { describe, it, expect } from 'vitest'
import {
  slabBarRuns, tempSteelArea, tempSpacingMax, DEFAULT_EXT, type BarRun,
} from './slabBarDetail'

// 6 m centres, 400 mm columns → ℓn = 5.6 m, faces at 0.2 and 5.8 m.
const L1 = 6, C = 0.4, H = 200, COVER = 20
const layout = (strip: 'column' | 'middle' = 'column') =>
  slabBarRuns(L1, C, H, COVER, DEFAULT_EXT[strip])

const top = (r: BarRun[]) => r.filter((x) => x.mat === 'top')
const bottom = (r: BarRun[]) => r.filter((x) => x.mat === 'bottom')

describe('slabBarRuns', () => {
  it('derives the clear span from centres and support width', () => {
    const l = layout()
    expect(l.ln).toBeCloseTo(5.6, 9)
    expect(l.support).toBe(C)
  })

  it('measures top-bar cut-offs from the FACE of support, not the centreline', () => {
    // The distinction is the whole point of the figure. Measuring from the
    // centreline would put every cut-off 200 mm further into the span here.
    const t = top(layout().runs)
    const long = t.find((r) => r.x1 === 0)!
    expect(long.x2).toBeCloseTo(0.2 + 0.30 * 5.6, 9)   // face + 0.30ℓn
  })

  it('puts a top run at each end, mirrored about mid-span', () => {
    const t = top(layout().runs)
    expect(t).toHaveLength(4)
    for (const r of t) {
      const mirrored = t.find((o) => Math.abs((L1 - o.x2) - r.x1) < 1e-9 && Math.abs((L1 - o.x1) - r.x2) < 1e-9)
      expect(mirrored).toBeTruthy()
    }
  })

  it('leaves the middle of the span with no top steel', () => {
    // A flat plate's top mat stops in the span; if the runs met at mid-span the
    // drawing would be showing a continuous top mat, which is a different detail.
    const t = top(layout().runs)
    const reachRight = Math.max(...t.filter((r) => r.x1 === 0).map((r) => r.x2))
    const reachLeft = Math.min(...t.filter((r) => r.x2 === L1).map((r) => r.x1))
    expect(reachRight).toBeLessThan(reachLeft)
  })

  it('runs the continuous bottom bar through both supports', () => {
    const b = bottom(layout().runs)
    const cont = b.find((r) => r.label.startsWith('continuous'))!
    // 150 mm past the face, i.e. into the support, at both ends.
    expect(cont.x1).toBeCloseTo(0.2 - 0.15, 9)
    expect(cont.x2).toBeCloseTo(5.8 + 0.15, 9)
  })

  it('never lets the embedment overshoot the support centreline', () => {
    // A 100 mm wall with 150 mm of embedment would otherwise draw the bar
    // sticking out the far side of its own support.
    const l = slabBarRuns(6, 0.1, H, COVER, DEFAULT_EXT.column)
    const cont = bottom(l.runs).find((r) => r.label.startsWith('continuous'))!
    expect(cont.x1).toBeGreaterThanOrEqual(0)
    expect(cont.x2).toBeLessThanOrEqual(6)
  })

  it('stops the discontinuous bottom bars short of the supports', () => {
    const b = bottom(layout().runs)
    const short = b.find((r) => r.label.includes('from face'))!
    expect(short.x1).toBeCloseTo(0.2 + 0.20 * 5.6, 9)
    expect(short.x2).toBeCloseTo(5.8 - 0.20 * 5.6, 9)
    // …and that they still overlap mid-span rather than leaving a gap.
    expect(short.x1).toBeLessThan(short.x2)
  })

  it('gives the middle strip shorter top runs than the column strip', () => {
    // Column strip 0.30ℓn versus middle strip 0.22ℓn — the reason the two
    // strips are drawn separately at all.
    const col = Math.max(...top(layout('column').runs).map((r) => r.x2 - r.x1))
    const mid = Math.max(...top(layout('middle').runs).map((r) => r.x2 - r.x1))
    expect(mid).toBeLessThan(col)
  })

  it('places the mats at the cover faces', () => {
    const l = layout()
    expect(l.topCover).toBe(COVER)
    expect(l.bottomCover).toBe(H - COVER)
  })

  it('survives a degenerate span without producing negative geometry', () => {
    const l = slabBarRuns(0.3, 0.4, H, COVER, DEFAULT_EXT.column)
    expect(l.ln).toBe(0)
    for (const r of l.runs) expect(Number.isFinite(r.x1) && Number.isFinite(r.x2)).toBe(true)
  })
})

describe('tempSteelArea — §24.4.3.2', () => {
  it('uses 0.0020 for Grade 280 and 350', () => {
    expect(tempSteelArea(200, 280).rho).toBeCloseTo(0.0020, 9)
    expect(tempSteelArea(200, 350).rho).toBeCloseTo(0.0020, 9)
  })

  it('uses 0.0018 for Grade 420 — the common case', () => {
    const t = tempSteelArea(200, 420)
    expect(t.rho).toBeCloseTo(0.0018, 9)
    expect(t.As).toBeCloseTo(0.0018 * 1000 * 200, 6)   // mm² per metre width
  })

  it('scales above Grade 420 but never below the 0.0014 floor', () => {
    expect(tempSteelArea(200, 520).rho).toBeCloseTo((0.0018 * 420) / 520, 9)
    // 0.0018·420/fy falls under 0.0014 at fy = 540; the floor takes over.
    expect(tempSteelArea(200, 700).rho).toBeCloseTo(0.0014, 9)
    expect(tempSteelArea(200, 5000).rho).toBeCloseTo(0.0014, 9)
  })
})

describe('tempSpacingMax — §24.4.3.3', () => {
  it('is the lesser of 5h and 450 mm', () => {
    expect(tempSpacingMax(80)).toBe(400)    // 5h governs on a thin slab
    expect(tempSpacingMax(200)).toBe(450)   // the 450 cap governs
    expect(tempSpacingMax(90)).toBe(450)    // 5h = 450, the boundary
  })
})
