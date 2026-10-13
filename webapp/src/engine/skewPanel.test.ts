import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { modelToFrame3D } from './modelBridge'
import { appliedResultant } from './frame3d'
import type { StructuralModel } from './model'

const S0 = { id: 't', name: 't', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const total = (m: StructuralModel, useShells: boolean) => {
  const br = modelToFrame3D(m, { useShells })
  const pos = new Map(br.nodes.map((n) => [n.id, n]))
  const len = new Map(br.members.map((q) => { const a = pos.get(q.i)!, b = pos.get(q.j)!; return [q.id, Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)] }))
  return -appliedResultant(br.loads, (id) => len.get(id)!)[1]
}
const bay = (move?: { x?: number; z?: number }) => {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3.5], section: S0 })
  if (move) m.nodes = m.nodes.map((n) => (n.id === 'n0.0.1' ? { ...n, x: n.x + (move.x ?? 0), z: n.z + (move.z ?? 0) } : n))
  m.loads = [{ kind: 'area', plate: m.plates[0].id, q: 10, cat: 'L' }]
  return m
}

describe('a skewed slab panel carries q × its TRUE area (tributary path)', () => {
  it('rectangle: 10 kPa × 30 m² = 300 kN, unchanged', () => {
    expect(total(bay(), false)).toBeCloseTo(300, 9)
  })
  it('one corner node 1 m out: 10 × 32.5 m² = 325 kN — it was 339.5', () => {
    expect(total(bay({ x: -1 }), false)).toBeCloseTo(325, 9)
  })
  it('and agrees with the shell path, which always integrated the true area', () => {
    const m = bay({ x: -1, z: 0.6 })
    expect(total(m, false)).toBeCloseTo(total(m, true), 6)
  })
})
