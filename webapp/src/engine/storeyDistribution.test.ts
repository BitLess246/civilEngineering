import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { columnShares } from './storeyDistribution'
import type { RectSection, StructuralModel } from './model'

const base = { cover: 40, barDia: 20, tieDia: 10, fc: 28, fy: 415, material: 'concrete' as const }
const C = (id: string, b: number, h: number): RectSection => ({ ...base, id, name: id, b, h })

const grid = (sec: RectSection, baysZ = [6, 6]) =>
  generateGridModel({ baysX: [6, 6], baysZ, storeyH: [3, 3], section: sec })

/** Swap the section of every column whose BASE node satisfies `pick`. */
const restyle = (m: StructuralModel, s: RectSection, pick: (n: { x: number; z: number }) => boolean): StructuralModel => {
  const nm = new Map(m.nodes.map((n) => [n.id, n]))
  return {
    ...m,
    sections: [...m.sections, s],
    members: m.members.map((x) => {
      if (x.role !== 'column') return x
      const a = nm.get(x.i)
      return a && pick(a) ? { ...x, section: s.id } : x
    }),
  }
}

describe('columnShares — a level’s force by the stiffness under it', () => {
  const uniform = grid(C('S', 400, 400))
  const top = Math.max(...uniform.storeys.map((s) => s.elevation))

  it('a uniform grid shares equally — the old split, unchanged', () => {
    // The regression control. Weighting by stiffness must not move a regular
    // building's numbers at all, or every published result shifts for nothing.
    const cs = columnShares(uniform, top, 'x')
    expect(cs.usable).toBe(true)
    const vals = [...cs.share.values()]
    expect(vals).toHaveLength(9)
    for (const v of vals) expect(v).toBeCloseTo(1 / 9, 12)
  })

  it('shares sum to one, in both directions and at every level', () => {
    for (const e of [...new Set(uniform.storeys.map((s) => s.elevation))]) {
      for (const d of ['x', 'z'] as const) {
        const cs = columnShares(uniform, e, d)
        expect([...cs.share.values()].reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
      }
    }
  })

  it('a stiffer column takes more, in the ratio of its own EI', () => {
    // 400x900 against 400x400, pushed along X. A column's depth h lies on
    // global X by the vertical default, so X bending uses Iz = b·h³/12 and the
    // ratio is (900/400)³ = 11.39.
    const m = restyle(uniform, C('BIG', 400, 900), (n) => Math.abs(n.z) < 1e-6)
    const cs = columnShares(m, top, 'x')
    const at = (x: number, z: number) => {
      const n = m.nodes.find((q) => Math.abs(q.y - top) < 1e-6 && Math.abs(q.x - x) < 1e-6 && Math.abs(q.z - z) < 1e-6)!
      return cs.share.get(n.id)!
    }
    expect(at(0, 0) / at(0, 6)).toBeCloseTo((900 / 400) ** 3, 6)
  })

  it('the SAME column counts differently for a push across it', () => {
    // A 400x900 is stiffer than a 400x400 in BOTH axes — Iy = h·b³/12 grows
    // with h as well, just linearly. What the direction changes is HOW MUCH:
    // (900/400)³ = 11.39 against the push it is deep to, and 900/400 = 2.25
    // across it. So the assertion is the ratio, not a reversal — the first
    // draft of this test expected the deep column to come out SOFTER in Z,
    // which is simply not true of a bigger rectangle.
    const m = restyle(uniform, C('BIG', 400, 900), (n) => Math.abs(n.z) < 1e-6)
    const ratio = (cs: ReturnType<typeof columnShares>) => {
      const big = m.nodes.find((q) => Math.abs(q.y - top) < 1e-6 && Math.abs(q.x) < 1e-6 && Math.abs(q.z) < 1e-6)!
      const std = m.nodes.find((q) => Math.abs(q.y - top) < 1e-6 && Math.abs(q.x) < 1e-6 && Math.abs(q.z - 6) < 1e-6)!
      return cs.share.get(big.id)! / cs.share.get(std.id)!
    }
    expect(ratio(columnShares(m, top, 'x'))).toBeCloseTo((900 / 400) ** 3, 6)
    expect(ratio(columnShares(m, top, 'z'))).toBeCloseTo(900 / 400, 6)
  })

  it('respects an explicit axis rotation rather than assuming the default', () => {
    // Turning the deep column 90° swaps which axis meets the push, so its
    // share in X must fall back to the plain 400x400 value.
    const m = restyle(uniform, C('BIG', 400, 900), (n) => Math.abs(n.z) < 1e-6)
    const turned = { ...m, members: m.members.map((x) => (x.section === 'BIG' ? { ...x, axisRotation: 0 } : x)) }
    const id = m.nodes.find((q) => Math.abs(q.y - top) < 1e-6 && Math.abs(q.x) < 1e-6 && Math.abs(q.z) < 1e-6)!.id
    expect(columnShares(m, top, 'x').share.get(id)!)
      .toBeGreaterThan(columnShares(turned, top, 'x').share.get(id)!)
  })

  it('reports unusable when nothing below the level can carry it', () => {
    // The caller then keeps the equal split: applying nothing would silently
    // drop a storey force.
    const noCols = { ...uniform, members: uniform.members.filter((x) => x.role !== 'column') }
    expect(columnShares(noCols, top, 'x').usable).toBe(false)
    // …and an elevation with no nodes at all is simply not a level.
    expect(columnShares(uniform, 999, 'x').usable).toBe(false)
  })

  it('flags a level whose columns do not share a height', () => {
    // E·I is proportional to the lateral stiffness 12·E·I/h³ only when h³ is a
    // constant of the level, so a caller has to be able to know when it is not.
    expect(columnShares(uniform, top, 'x').equalHeights).toBe(true)
    const nm = new Map(uniform.nodes.map((n) => [n.id, n]))
    const raised = {
      ...uniform,
      nodes: uniform.nodes.map((n) => (Math.abs(n.y - 3) < 1e-6 && Math.abs(n.z) < 1e-6 ? { ...n, y: 3.5 } : n)),
    }
    void nm
    expect(columnShares(raised, 6, 'x').equalHeights).toBe(false)
  })
})
