import { describe, it, expect } from 'vitest'
import { generateGridModel, removeElements, nodeId } from './modelBuilder'
import type { RectSection } from './model'

const sec: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

describe('grid model generator', () => {
  // 2 bays × 1 bay × 2 storeys → 3×2 grid points, 3 levels
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: sec })

  it('node / member / plate / support counts', () => {
    expect(m.nodes).toHaveLength(3 * 2 * 3)                  // 18
    expect(m.members.filter((x) => x.role === 'column')).toHaveLength(6 * 2)   // grid pts × storeys
    expect(m.members.filter((x) => x.role === 'beam')).toHaveLength(2 * 2 * 2) // baysX × nz × levels
    expect(m.members.filter((x) => x.role === 'girder')).toHaveLength(3 * 1 * 2)
    expect(m.plates).toHaveLength(2 * 1 * 2)
    expect(m.supports).toHaveLength(6)
    expect(m.supports.every((s) => s.fixity === 'fixed')).toBe(true)
    expect(m.storeys.map((s) => s.elevation)).toEqual([3.5, 6.5])
  })

  it('connectivity: every member endpoint and plate corner is a real node', () => {
    const ids = new Set(m.nodes.map((n) => n.id))
    expect(m.members.every((x) => ids.has(x.i) && ids.has(x.j))).toBe(true)
    expect(m.plates.every((p) => p.corners.every((c) => ids.has(c)))).toBe(true)
  })

  it('geometry: columns are vertical, beams along x, girders along z', () => {
    const byId = new Map(m.nodes.map((n) => [n.id, n]))
    for (const mb of m.members) {
      const a = byId.get(mb.i)!, b2 = byId.get(mb.j)!
      if (mb.role === 'column') { expect(a.x).toBe(b2.x); expect(a.z).toBe(b2.z); expect(b2.y).toBeGreaterThan(a.y) }
      if (mb.role === 'beam') { expect(a.y).toBe(b2.y); expect(a.z).toBe(b2.z); expect(b2.x).toBeGreaterThan(a.x) }
      if (mb.role === 'girder') { expect(a.y).toBe(b2.y); expect(a.x).toBe(b2.x); expect(b2.z).toBeGreaterThan(a.z) }
    }
  })

  it('JSON round-trips', () => {
    const back = JSON.parse(JSON.stringify(m))
    expect(back).toEqual(m)
  })
})

describe('removeElements', () => {
  it('drops members/plates and their attached loads, keeps the rest', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: sec })
    const slab = m.plates[0].id
    const beam = m.members.find((x) => x.role === 'beam')!.id
    const withLoads = {
      ...m,
      loads: [
        { kind: 'area' as const, plate: slab, q: 4.8, cat: 'D' as const },
        { kind: 'member-udl' as const, member: beam, w: 10, cat: 'D' as const },
        { kind: 'node' as const, node: nodeId(0, 0, 1), Fx: 20, cat: 'W' as const },
      ],
    }
    const out = removeElements(withLoads, new Set([slab, beam]))
    expect(out.plates.find((p) => p.id === slab)).toBeUndefined()
    expect(out.members.find((x) => x.id === beam)).toBeUndefined()
    expect(out.loads).toHaveLength(1)
    expect(out.loads[0].kind).toBe('node')
    // untouched collections preserved
    expect(out.nodes).toEqual(m.nodes)
    expect(out.supports).toEqual(m.supports)
  })
})
