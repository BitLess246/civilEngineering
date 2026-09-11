import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { columnShares, centreOfRigidity, shiftResultantLoads } from './storeyDistribution'
import type { ModelLoad, RectSection, StructuralModel } from './model'

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

describe('centreOfRigidity + shiftResultantLoads — where the resultant acts', () => {
  const uniform = grid(C('S', 400, 400))
  const top = Math.max(...uniform.storeys.map((s) => s.elevation))
  // z = 0 line stiffened to 400×900; pushed along X that is (900/400)³ = 11.39
  // times the stiffness of the other two lines, so the rigidity centre of a
  // 0/6/12 m plan collapses from 6.0 m to 0.0747·(6+12) = 1.344 m.
  const skew = restyle(uniform, C('BIG', 400, 900), (n) => Math.abs(n.z) < 1e-6)

  it('a symmetric plan has its rigidity centre at mid-plan', () => {
    expect(centreOfRigidity(uniform, top, 'x')).toBeCloseTo(6, 9)
    expect(centreOfRigidity(uniform, top, 'z')).toBeCloseTo(6, 9)
  })

  it('stiffening one frame line drags the rigidity centre onto it', () => {
    const r = (900 / 400) ** 3
    expect(centreOfRigidity(skew, top, 'x')).toBeCloseTo((6 + 12) / (r + 2), 9)
    // the stiffened line runs along X, so a push along Z is unaffected in plan
    expect(centreOfRigidity(skew, top, 'z')).toBeCloseTo(6, 9)
  })

  it('reports nothing when no column carries stiffness below the level', () => {
    const noCols = { ...uniform, members: uniform.members.filter((m) => m.role !== 'column') }
    expect(centreOfRigidity(noCols, top, 'x')).toBeNull()
  })

  /** Perp coordinate of the resultant of a node-load set at one level. */
  const line = (m: StructuralModel, loads: ModelLoad[], dir: 'x' | 'z', y: number) => {
    const nm = new Map(m.nodes.map((n) => [n.id, n]))
    let F = 0, M = 0
    for (const l of loads) {
      if (l.kind !== 'node') continue
      const n = nm.get(l.node)
      if (!n || Math.abs(n.y - y) > 1e-6) continue
      const f = (dir === 'x' ? l.Fx : l.Fz) ?? 0
      F += f; M += f * (dir === 'x' ? n.z : n.x)
    }
    return { F, at: M / F }
  }

  /** The stiffness-weighted pattern `columnShares` produces for force `F`. */
  const pattern = (m: StructuralModel, y: number, dir: 'x' | 'z', F: number): ModelLoad[] => {
    const cs = columnShares(m, y, dir)
    return [...cs.share].map(([node, s]) => (dir === 'x'
      ? { kind: 'node' as const, node, Fx: F * s, cat: 'E' as const }
      : { kind: 'node' as const, node, Fz: F * s, cat: 'E' as const }))
  }

  it('an EI-weighted pattern really does land on the rigidity centre', () => {
    // The premise of the correction: without it the applied force acts at CR,
    // where it twists nothing. If this ever stops holding the fix is moot.
    const p = pattern(skew, top, 'x', 100)
    expect(line(skew, p, 'x', top).at).toBeCloseTo(centreOfRigidity(skew, top, 'x')!, 9)
  })

  it('the couple moves the line of action onto the target, force unchanged', () => {
    const p = pattern(skew, top, 'x', 100)
    const w = (id: string) => (columnShares(skew, top, 'x').share.get(id) ?? 0)
    const fix = shiftResultantLoads(skew, p, 'x', 'E', () => 6, w)
    expect(line(skew, fix, 'x', top).F).toBeCloseTo(0, 9)          // self-equilibrating
    const both = line(skew, [...p, ...fix], 'x', top)
    expect(both.F).toBeCloseTo(100, 9)                              // ΣF untouched
    expect(both.at).toBeCloseTo(6, 9)                               // line of action moved
  })

  it('adds nothing when the pattern already acts on the target', () => {
    const p = pattern(uniform, top, 'x', 100)
    const w = (id: string) => (columnShares(uniform, top, 'x').share.get(id) ?? 0)
    expect(shiftResultantLoads(uniform, p, 'x', 'E', () => 6, w)).toEqual([])
  })

  it('a level with no torsional lever is left alone rather than mis-loaded', () => {
    // One frame line: Σw·d² = 0, so no couple can be built. Applying part of
    // one would change ΣF, which is worse than declining.
    const single = grid(C('S', 400, 400), [])
    const y = Math.max(...single.storeys.map((s) => s.elevation))
    const p = pattern(single, y, 'x', 100)
    expect(shiftResultantLoads(single, p, 'x', 'E', () => 99, (id) => (columnShares(single, y, 'x').share.get(id) ?? 0)))
      .toEqual([])
  })

  it('a null target leaves that level untouched', () => {
    const p = pattern(skew, top, 'x', 100)
    const w = (id: string) => (columnShares(skew, top, 'x').share.get(id) ?? 0)
    expect(shiftResultantLoads(skew, p, 'x', 'E', () => null, w)).toEqual([])
  })
})
