import { describe, it, expect } from 'vitest'
import { memberDiagramDrawing, guardedRange, HEADROOM } from './memberDiagramDrawing'
import type { PlanPrimitive } from './planRenderer'

/** Every coordinate a primitive puts on paper (text by its anchor point). */
function points(p: PlanPrimitive): [number, number][] {
  switch (p.kind) {
    case 'line': return [[p.x1, p.y1], [p.x2, p.y2]]
    case 'rect': return [[p.x, p.y], [p.x + p.w, p.y + p.h]]
    case 'circle': return [[p.cx - p.r, p.cy - p.r], [p.cx + p.r, p.cy + p.r]]
    case 'text': return [[p.x, p.y]]
    case 'dim': return [[p.x1, p.y1], [p.x2, p.y2]]
    case 'path': return p.cmds.map((c) => [c.x, c.y])
  }
}

describe('memberDiagramDrawing — guarded against clipping', () => {
  // a continuous beam's moment: sagging, then a hogging peak, then back up
  const xs = Array.from({ length: 61 }, (_, i) => (i * 6) / 60)
  const M = xs.map((x) => 8.8 * x * (4.5 - x) - 8 * Math.max(0, x - 4.5) ** 2 * 3)

  it('keeps every primitive inside its own bounds', () => {
    const d = memberDiagramDrawing(xs, M, { title: 'B1 · MOMENT', unit: 'kN·m', color: '#d62728' })
    const b = d.bounds
    for (const p of d.primitives) for (const [x, y] of points(p)) {
      expect(x).toBeGreaterThanOrEqual(b.minX - 1e-9); expect(x).toBeLessThanOrEqual(b.maxX + 1e-9)
      expect(y).toBeGreaterThanOrEqual(b.minY - 1e-9); expect(y).toBeLessThanOrEqual(b.maxY + 1e-9)
    }
  })

  it('leaves headroom past both peaks, so the markers sit inside the plot', () => {
    const r = guardedRange(M)
    const hi = Math.max(...M), lo = Math.min(...M)
    expect(r.hi).toBeCloseTo(hi + (hi - lo) * HEADROOM, 9)
    expect(r.lo).toBeCloseTo(lo - (hi - lo) * HEADROOM, 9)
    // one-signed data keeps zero as its edge — no empty band below a positive-only diagram
    expect(guardedRange([0, 3, 5]).lo).toBe(0)
    // a flat zero diagram still gets a range
    expect(guardedRange([0, 0])).toEqual({ lo: -1 - 2 * HEADROOM, hi: 1 + 2 * HEADROOM })
  })

  it('labels both extremes with value and station', () => {
    const d = memberDiagramDrawing(xs, M, { title: 'B1', unit: 'kN·m', color: '#d62728' })
    const labels = d.primitives.filter((p): p is Extract<PlanPrimitive, { kind: 'text' }> => p.kind === 'text').map((t) => t.text)
    const iMax = M.indexOf(Math.max(...M)), iMin = M.indexOf(Math.min(...M))
    expect(labels).toContain(`${M[iMax].toFixed(1)} @ ${xs[iMax].toFixed(2)} m`)
    expect(labels).toContain(`${M[iMin].toFixed(1)} @ ${xs[iMin].toFixed(2)} m`)
  })
})
