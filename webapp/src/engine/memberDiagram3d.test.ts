import { describe, it, expect } from 'vitest'
import { memberDiagramRibbon, diagramScale } from './memberDiagram3d'
import type { V3 } from './frame3d'

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

describe('memberDiagramRibbon — 3D internal-force diagram geometry', () => {
  // horizontal member along +x, L = 4
  const a: V3 = [0, 0, 0], b: V3 = [4, 0, 0]
  const xs = [0, 1, 2, 3, 4]
  const ys = [0, 5, 8, 5, 0]   // a sagging-like ordinate

  it('returns one curve/base point per station', () => {
    const r = memberDiagramRibbon(a, b, xs, ys, 'Mz', 0.1)
    expect(r.curve).toHaveLength(xs.length)
    expect(r.base).toHaveLength(xs.length)
  })

  it('baseline points lie on the member axis (a→b)', () => {
    const { base } = memberDiagramRibbon(a, b, xs, ys, 'Mz', 0.1)
    base.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(xs[i], 9)  // x advances with station
      expect(p[1]).toBeCloseTo(0, 9)
      expect(p[2]).toBeCloseTo(0, 9)
    })
  })

  it('offset is perpendicular to the member axis', () => {
    const dir = sub(b, a)
    const { base, curve } = memberDiagramRibbon(a, b, xs, ys, 'Mz', 0.2)
    curve.forEach((c, i) => expect(dot(sub(c, base[i]), dir)).toBeCloseTo(0, 9))
  })

  it('zero ordinate ⇒ curve coincides with the baseline', () => {
    const { base, curve } = memberDiagramRibbon(a, b, xs, [0, 0, 0, 0, 0], 'Vy', 0.5)
    curve.forEach((c, i) => expect(sub(c, base[i])).toEqual([0, 0, 0]))
  })

  it('offset magnitude is linear in scale and ordinate', () => {
    const r1 = memberDiagramRibbon(a, b, xs, ys, 'Mz', 0.1)
    const r2 = memberDiagramRibbon(a, b, xs, ys, 'Mz', 0.2)
    const mag = (r: { base: V3[]; curve: V3[] }, i: number) => Math.hypot(...sub(r.curve[i], r.base[i]))
    // peak at i=2 (ys=8): scale 0.2 gives exactly twice the offset of scale 0.1
    expect(mag(r2, 2)).toBeCloseTo(2 * mag(r1, 2), 9)
    // and equals |ys·scale|
    expect(mag(r1, 2)).toBeCloseTo(8 * 0.1, 9)
  })

  it('Mz (x′-y′ plane) and My (x′-z′ plane) offset along different axes', () => {
    const mz = memberDiagramRibbon(a, b, xs, ys, 'Mz', 0.1)
    const my = memberDiagramRibbon(a, b, xs, ys, 'My', 0.1)
    // for a member along +x: y′ = global +y, z′ = global +z
    expect(sub(mz.curve[2], mz.base[2])[1]).not.toBeCloseTo(0, 6)  // Mz moves in y
    expect(sub(my.curve[2], my.base[2])[2]).not.toBeCloseTo(0, 6)  // My moves in z
    expect(sub(mz.curve[2], mz.base[2])[2]).toBeCloseTo(0, 9)
    expect(sub(my.curve[2], my.base[2])[1]).toBeCloseTo(0, 9)
  })

  it('fill has two triangles (18 floats) per segment', () => {
    const { fill } = memberDiagramRibbon(a, b, xs, ys, 'Mz', 0.1)
    expect(fill).toHaveLength((xs.length - 1) * 18)
  })

  it('works for a vertical column (offset stays perpendicular)', () => {
    const c: V3 = [2, 0, 1], d: V3 = [2, 3, 1]
    const cs = [0, 1.5, 3], cy = [10, 0, -10]
    const dir = sub(d, c)
    const { base, curve } = memberDiagramRibbon(c, d, cs, cy, 'Mz', 0.05)
    curve.forEach((p, i) => expect(dot(sub(p, base[i]), dir)).toBeCloseTo(0, 9))
  })
})

describe('diagramScale', () => {
  it('maps the largest |ordinate| to the target offset', () => {
    expect(diagramScale(40, 1.2)).toBeCloseTo(1.2 / 40, 12)
  })
  it('returns 0 when there is nothing to draw', () => {
    expect(diagramScale(0, 1.2)).toBe(0)
    expect(diagramScale(1e-12, 1.2)).toBe(0)
  })

  it('applied scale puts the peak at the target offset', () => {
    const a: V3 = [0, 0, 0], b: V3 = [5, 0, 0]
    const xs = [0, 2.5, 5], ys = [0, -40, 0]
    const s = diagramScale(40, 1.2)
    const { base, curve } = memberDiagramRibbon(a, b, xs, ys, 'Vy', s)
    expect(Math.hypot(...[0, 1, 2].map((k) => curve[1][k] - base[1][k]))).toBeCloseTo(1.2, 9)
  })
})
