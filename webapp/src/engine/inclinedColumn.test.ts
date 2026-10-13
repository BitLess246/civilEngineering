import { describe, it, expect } from 'vitest'
import { defaultAxisRotation, localAxes, solveFrame3D, type V3 } from './frame3d'
import { modelToFrame3D } from './modelBridge'
import type { StructuralModel } from './model'
import { memberFrame } from '../lib/memberFrame'

const depthDir = (d: V3, role = 'column') => localAxes(d, defaultAxisRotation(d, undefined, role))[1]

describe('an inclined column keeps its section orientation (depth on global X)', () => {
  it('plumb: 90°, unchanged', () => {
    expect(defaultAxisRotation([0, 3, 0], undefined, 'column')).toBe(90)
    expect(depthDir([0, 3, 0])[0]).toBeCloseTo(1, 12)
  })
  it('leaning in the X–Y plane: 0°, the answer it always had', () => {
    expect(defaultAxisRotation([0.3, 3, 0], undefined, 'column')).toBe(0)
    expect(defaultAxisRotation([0.3, 3, 0])).toBe(0)
  })
  it('leaning toward Z: the depth stays on X — it used to turn onto Z', () => {
    const d: V3 = [0, 3, 0.3]
    expect(Math.abs(depthDir(d)[0])).toBeCloseTo(1, 12)
    expect(Math.abs(depthDir(d, 'beam')[2])).toBeGreaterThan(0.99)      // the beam default, for the record
  })
  it('leaning on the diagonal: the depth is X projected off the axis, not the 45° line', () => {
    const d: V3 = [0.3, 3, 0.3], y = depthDir(d)
    const L = Math.hypot(...d), x = d.map((v) => v / L)
    const g = [1 - x[0] * x[0], -x[0] * x[1], -x[0] * x[2]], gl = Math.hypot(...g)
    expect(Math.abs(y[0] * g[0] + y[1] * g[1] + y[2] * g[2]) / gl).toBeCloseTo(1, 12)
    expect(Math.abs(y[2])).toBeLessThan(0.02)
  })
  it('continuous through the 2.56° "vertical" threshold', () => {
    for (const lean of [0.13, 0.135, 0.14]) expect(Math.abs(depthDir([0, 3, lean])[0])).toBeGreaterThan(0.999)
  })
  it('an explicit rotation still wins', () => {
    expect(defaultAxisRotation([0, 3, 0.3], 15, 'column')).toBe(15)
  })
  it('the 3D frame is the solver frame', () => {
    const f = memberFrame([0, 0, 0], [0, 3, 0.3], 'column')
    expect(f[1]).toEqual(depthDir([0, 3, 0.3]))
  })
})

describe('…so the analysis sees the column that is drawn', () => {
  // A 300 × 600 cantilever (depth 600 on X), 20 kN along X at the top.
  const cantilever = (top: V3): StructuralModel => ({
    version: 1, name: 'c', storeys: [], plates: [],
    nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: top[0], y: top[1], z: top[2] }],
    sections: [{ id: 's', name: 's', b: 300, h: 600, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }],
    members: [{ id: 'm', i: 'a', j: 'b', role: 'column', section: 's' }],
    supports: [{ node: 'a', fixity: 'fixed' }],
    loads: [{ kind: 'node', node: 'b', Fx: 20, cat: 'D' }],
  })
  const tipX = (top: V3) => {
    const br = modelToFrame3D(cantilever(top))
    const r = solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
    return r.d[br.nodes.findIndex((n) => n.id === 'b') * 6]
  }
  it('leaning toward Z bends about the STRONG axis under an X load, like leaning toward X', () => {
    const lx = tipX([0.3, 3, 0]), lz = tipX([0, 3, 0.3]), plumb = tipX([0, 3, 0])
    // plumb closed form: PL³/3EI with I = 300·600³/12 (+ a little axial/shear)
    expect(lz / lx).toBeCloseTo(1, 1)
    expect(lz / plumb).toBeCloseTo(1, 1)
    // weak-axis bending would be (600/300)² = 4× softer — what it was before
    expect(lz / plumb).toBeLessThan(1.5)
  })
})
