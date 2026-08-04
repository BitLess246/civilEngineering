import { describe, it, expect } from 'vitest'
import {
  slabBarRuns, tempSteelArea, tempSpacingMax, DEFAULT_EXT, DROP_PANEL_EXT, type BarRun,
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

  it('gives the COLUMN strip no short bottom run — its bottom mat is 100% continuous', () => {
    // Fig. 8.7.4.1.3(a): the column-strip bottom row reads "100% …
    // Continuous bars", with splices permitted only in the mid-span region.
    // An earlier version cut these at 0.20ℓn from each face — a run the
    // figure does not contain, and one that would have removed the very bars
    // §8.7.4.2 keeps through the column core.
    expect(DEFAULT_EXT.column.bottomShort).toBeNull()
    const b = bottom(layout('column').runs)
    expect(b).toHaveLength(1)
    expect(b[0].label).toMatch(/^continuous/)
  })

  it('stops the MIDDLE strip remainder at 0.15ℓn from the support centreline', () => {
    const b = bottom(layout('middle').runs)
    const short = b.find((r) => r.label.includes('0.15'))!
    // Measured from the CENTRELINE (x = 0 and x = L1), not the face.
    expect(short.x1).toBeCloseTo(0.15 * 5.6, 9)
    expect(short.x2).toBeCloseTo(6 - 0.15 * 5.6, 9)
    // …and it still spans mid-span rather than leaving a gap.
    expect(short.x1).toBeLessThan(short.x2)
    // It must reach CLOSER to the support than a face-datum reading would,
    // which is the conservative direction if the datum were misread.
    expect(short.x1).toBeLessThan(0.2 + 0.15 * 5.6)
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

// ─────────────────────────────────────────────────────────────────────────
// Every number pinned to ACI 318-14 Fig. 8.7.4.1.3(a), so a future edit that
// drifts from the figure fails here rather than on a drawing.
// ─────────────────────────────────────────────────────────────────────────
describe('the extensions match Fig. 8.7.4.1.3(a)', () => {
  it('column strip, without drop panels: top 0.30 / 0.20, bottom continuous', () => {
    expect(DEFAULT_EXT.column.topLong).toBe(0.30)
    expect(DEFAULT_EXT.column.topShort).toBe(0.20)
    expect(DEFAULT_EXT.column.bottomShort).toBeNull()
  })

  it('middle strip: top 100% at 0.22, bottom remainder at 0.15', () => {
    // The figure gives ONE top extension for the middle strip at 100%, so
    // both runs carry the same fraction rather than a long/short split.
    expect(DEFAULT_EXT.middle.topLong).toBe(0.22)
    expect(DEFAULT_EXT.middle.topShort).toBe(0.22)
    expect(DEFAULT_EXT.middle.bottomShort).toBe(0.15)
  })

  it('carries the 6 in. embedment as 150 mm in both strips', () => {
    expect(DEFAULT_EXT.column.supportEmbed).toBe(150)
    expect(DEFAULT_EXT.middle.supportEmbed).toBe(150)
  })

  it('with drop panels, ONLY the column-strip long top run moves — 0.30 → 0.33', () => {
    expect(DROP_PANEL_EXT.column.topLong).toBe(0.33)
    expect(DROP_PANEL_EXT.column.topShort).toBe(DEFAULT_EXT.column.topShort)
    expect(DROP_PANEL_EXT.column.bottomShort).toBeNull()
    expect(DROP_PANEL_EXT.middle).toEqual(DEFAULT_EXT.middle)
  })

  it('the drop panel lengthens the top steel — it does not shorten it', () => {
    const noDrop = slabBarRuns(L1, C, H, COVER, DEFAULT_EXT.column)
    const drop = slabBarRuns(L1, C, H, COVER, DROP_PANEL_EXT.column)
    const longest = (r: BarRun[]) => Math.max(...top(r).map((x) => x.x2 - x.x1))
    expect(longest(drop.runs)).toBeGreaterThan(longest(noDrop.runs))
  })

  it('labels say which datum each cut-off is measured from', () => {
    // A cut-off length on a drawing is useless without its datum, and the
    // two mats use different ones: top from the face, bottom from the ℄.
    const mid = layout('middle').runs
    expect(bottom(mid).find((r) => r.label.includes('0.15'))!.label).toContain('℄')
    expect(top(mid)[0].label).toMatch(/ℓn/)
  })
})
