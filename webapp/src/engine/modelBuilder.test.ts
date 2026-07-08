import { describe, it, expect } from 'vitest'
import { generateGridModel, removeElements, nodeId, buildGravityLoads, enforceSectionHierarchy } from './modelBuilder'
import type { RectSection } from './model'

const sec: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

describe('wall self-weight as a beam line load', () => {
  it('adds a member-udl D of t·h·γc on the wall’s member', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: sec })
    const beam = m.members.find((x) => x.role === 'beam')!
    m.walls = [{ id: 'w0', member: beam.id, height: 3, thickness: 150, shearWall: false }]
    const loads = buildGravityLoads(m, 0, 0)
    const wall = loads.filter((l) => l.kind === 'member-udl' && l.member === beam.id && l.cat === 'D')
    // beam self-weight (0.3·0.5·24 = 3.6) + wall (0.15·3·24 = 10.8)
    const total = wall.reduce((s, l) => s + (l as { w: number }).w, 0)
    expect(total).toBeCloseTo(0.3 * 0.5 * 24 + 0.15 * 3 * 24, 6)
    expect(wall.some((l) => Math.abs((l as { w: number }).w - 10.8) < 1e-6)).toBe(true)  // the wall udl
    expect(wall).toHaveLength(2)   // beam self-weight + wall
  })
})

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

describe('enforceSectionHierarchy — column-stack continuity', () => {
  const rc = (id: string, b: number, h: number): RectSection =>
    ({ id, name: `${b}×${h}`, b, h, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 })

  it('a bigger LOWER column leaves the smaller upper one alone (upper ≤ lower is fine)', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 300) })
    const lower = m.sections.find((s) => s.id === 'c0.0.0')!
    lower.b = 400; lower.h = 450
    const out = enforceSectionHierarchy(m)
    const up = out.sections.find((s) => s.id === 'c0.0.1')!
    expect(up.b).toBe(300)     // stays smaller — economical and code-of-practice
    expect(up.h).toBe(300)
  })

  it('a bigger UPPER column raises the one below (a column is never larger than the one under it)', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 300) })
    const upper = m.sections.find((s) => s.id === 'c0.0.1')!
    upper.b = 400; upper.h = 450
    const out = enforceSectionHierarchy(m)
    const low = out.sections.find((s) => s.id === 'c0.0.0')!
    expect(low.b).toBeGreaterThanOrEqual(400)
    expect(low.h).toBeGreaterThanOrEqual(450)
    // a different stack is untouched
    expect(out.sections.find((s) => s.id === 'c1.0.0')!.b).toBe(300)
  })

  it('steel: a heavier shape ABOVE pulls the lower segment up; heavier BELOW leaves the top light', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 300) })
    for (const s of m.sections) Object.assign(s, { material: 'steel', shape: 'W310x38.7', steelFy: 345, steelFu: 448 })
    m.sections.find((s) => s.id === 'c0.0.1')!.shape = 'W310x97'   // heavy on top
    m.sections.find((s) => s.id === 'c1.0.0')!.shape = 'W310x97'   // heavy at bottom
    const out = enforceSectionHierarchy(m)
    expect(out.sections.find((s) => s.id === 'c0.0.0')!.shape).toBe('W310x97')   // raised
    expect(out.sections.find((s) => s.id === 'c1.0.1')!.shape).toBe('W310x38.7') // stays light
  })

  it('is idempotent', () => {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section: rc('S', 300, 300) })
    m.sections.find((s) => s.id === 'c0.0.0')!.h = 500
    const once = enforceSectionHierarchy(m)
    const twice = enforceSectionHierarchy(once)
    expect(JSON.stringify(twice.sections)).toBe(JSON.stringify(once.sections))
  })
})
