import { describe, expect, it } from 'vitest'
import { stairDetail, runPast, type Pt } from './stairDetail'

/** Even-odd point-in-polygon. */
function inside(poly: Pt[], [x, z]: Pt): boolean {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j]
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) c = !c
  }
  return c
}
/** Sample a polyline every `step` mm. */
function samples(line: Pt[], step = 20): Pt[] {
  const out: Pt[] = []
  for (let k = 0; k < line.length - 1; k++) {
    const [ax, az] = line[k], [bx, bz] = line[k + 1]
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step))
    for (let i = 0; i <= n; i++) out.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n])
  }
  return out
}

const base = { L: 3500, t: 150, R: 150, G: 300, cover: 20, db: 12 }

describe('stair flight with landings', () => {
  const g = stairDetail({ ...base, ld: 450 })

  it('stands the upper landing on the last riser and the beams on the bearing lines', () => {
    expect(g.n).toBe(12)
    expect(g.zTop).toBe(1800)
    const [lo, up] = g.beams
    expect((lo[0] + lo[2]) / 2).toBe(0)
    expect((up[0] + up[2]) / 2).toBe(3500)
    expect(up[3]).toBe(g.zTop)                 // beam top = landing top
  })

  it('keeps every bar inside the concrete', () => {
    for (const bar of [g.flightBottom, g.upperLandingBottom, g.lowerLandingTop, g.flightTopLower, g.flightTopUpper]) {
      for (const p of samples(bar)) expect(inside(g.outline, p), `bar point ${p} outside`).toBe(true)
    }
  })

  it('crosses the bars at both reentrant corners, each running ℓd past it', () => {
    // upper (soffit reentrant): main bars and the landing's bottom bars
    expect(runPast(g.flightBottom, g.crossUpper)).toBeGreaterThanOrEqual(450 - 1)
    expect(runPast(g.upperLandingBottom, g.crossUpper)).toBeGreaterThanOrEqual(450 - 1)
    // lower (top face reentrant): landing top bars and the flight's top bars
    expect(runPast(g.lowerLandingTop, g.crossLower)).toBeGreaterThanOrEqual(450 - 1)
    expect(runPast(g.flightTopLower, g.crossLower)).toBeGreaterThanOrEqual(450 - 1)
  })

  it('bends the main bars round the CONVEX soffit corner at the bottom (continuous, no crossing)', () => {
    const [p0, p1, p2] = g.flightBottom
    expect(p0[1]).toBe(p1[1])                  // horizontal in the landing
    expect(p2[1]).toBeGreaterThan(p1[1])       // then up the slope
  })

  it('defaults ℓd to 40 db', () => {
    expect(stairDetail(base).ld).toBe(480)
  })
})
