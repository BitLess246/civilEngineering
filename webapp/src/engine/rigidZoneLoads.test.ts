import { describe, it, expect } from 'vitest'
import { rebaseLoadsOnRigidZones } from './rigidZoneLoads'
import { solveFrame3D, appliedResultant, type F3Load, type F3Member, type F3Node } from './frame3d'
import { modelToFrame3D } from './modelBridge'
import { emptyModel, type StructuralModel, type RectSection } from './model'

const nodes: F3Node[] = [{ id: 'a', x: 0, y: 3, z: 0 }, { id: 'b', x: 6, y: 3, z: 0 }]
const beam = (offI?: [number, number, number], offJ?: [number, number, number]): F3Member =>
  ({ id: 'bm', i: 'a', j: 'b', E: 25000, G: 10400, A: 150000, Iy: 1e9, Iz: 3e9, J: 1e9, ...(offI ? { offI } : {}), ...(offJ ? { offJ } : {}) })
const sumFy = (ls: F3Load[], len = (_: string) => 6) => appliedResultant(ls, len)[1]

describe('rebaseLoadsOnRigidZones', () => {
  it('passes loads through when the member has no along-axis offset', () => {
    const ls: F3Load[] = [{ kind: 'member-udl', member: 'bm', w: 10, cat: 'D' }]
    expect(rebaseLoadsOnRigidZones(ls, [beam()], nodes)).toBe(ls)
    // a pure perpendicular drop keeps the length: nothing to rebase
    expect(rebaseLoadsOnRigidZones(ls, [beam([0, -0.25, 0], [0, -0.25, 0])], nodes)).toBe(ls)
  })

  it('splits a UDL into the clear-span VDL and the two joint transfers (hand calc)', () => {
    // L = 6, aᵢ = 0.3, aⱼ = 0.2, w = 10 kN/m:
    //   zone i: F = 3 kN at x = 0.15 → Mz = −r_x·F = −0.15·3 = −0.45 kN·m
    //   clear:  w = 10 on [0, 5.5] (flexible coordinates) = 55 kN
    //   zone j: F = 2 kN at x = 5.9 → r = offJ·(0.1/0.2) = [−0.1, 0, 0] → Mz = +0.2 kN·m
    const out = rebaseLoadsOnRigidZones([{ kind: 'member-udl', member: 'bm', w: 10, cat: 'D' }], [beam([0.3, 0, 0], [-0.2, 0, 0])], nodes)
    expect(out).toHaveLength(3)
    const [ni, v, nj] = out as [Extract<F3Load, { kind: 'node' }>, Extract<F3Load, { kind: 'member-vdl' }>, Extract<F3Load, { kind: 'node' }>]
    expect(ni.node).toBe('a'); expect(ni.Fy).toBeCloseTo(-3, 9); expect(ni.Mz).toBeCloseTo(-0.45, 9)
    expect(v.x1).toBeCloseTo(0, 9); expect(v.x2).toBeCloseTo(5.5, 9); expect(v.w1).toBe(10); expect(v.w2).toBe(10)
    expect(nj.node).toBe('b'); expect(nj.Fy).toBeCloseTo(-2, 9); expect(nj.Mz).toBeCloseTo(0.2, 9)
    // the total is the node-to-node load, as the statics check counts it
    expect(sumFy(out)).toBeCloseTo(-60, 9)
  })

  it('places a trapezoid by its centroid and keeps its total', () => {
    // w rises 0 → 12 over [0, 6]; zone i holds the 0 → 0.6 sliver: F = 0.18 at x = 0.2
    const ld: F3Load = { kind: 'member-vdl', member: 'bm', x1: 0, x2: 6, w1: 0, w2: 12, cat: 'L' }
    const out = rebaseLoadsOnRigidZones([ld], [beam([0.3, 0, 0], [-0.2, 0, 0])], nodes)
    const ni = out.find((l) => l.kind === 'node' && l.node === 'a') as Extract<F3Load, { kind: 'node' }>
    expect(ni.Fy).toBeCloseTo(-0.5 * 0.6 * 0.3, 9)
    expect(ni.Mz).toBeCloseTo(-0.2 * 0.09, 9)
    expect(sumFy(out)).toBeCloseTo(-36, 9)
  })

  it('moves a point load on a zone to the node, and shifts one on the clear span', () => {
    const out = rebaseLoadsOnRigidZones([
      { kind: 'member-point', member: 'bm', a: 0.1, P: 5, cat: 'D' },
      { kind: 'member-point', member: 'bm', a: 3, P: 7, cat: 'D' },
    ], [beam([0.3, 0, 0], [-0.2, 0, 0])], nodes)
    expect(out[0]).toMatchObject({ kind: 'node', node: 'a', Fy: -5 })
    expect(out[1]).toMatchObject({ kind: 'member-point', a: 2.7, P: 7 })
  })
})

describe('rigid end zones — statics through the bridge and the solver', () => {
  const S: RectSection = { id: 'S', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const portal = (rz: boolean): StructuralModel => ({
    ...emptyModel('rz'),
    nodes: [{ id: 'p', x: 0, y: 0, z: 0 }, { id: 'q', x: 6, y: 0, z: 0 }, { id: 'a', x: 0, y: 3, z: 0 }, { id: 'b', x: 6, y: 3, z: 0 }],
    sections: [S],
    members: [
      { id: 'c1', i: 'p', j: 'a', role: 'column', section: 'S' },
      { id: 'c2', i: 'q', j: 'b', role: 'column', section: 'S' },
      { id: 'bm', i: 'a', j: 'b', role: 'beam', section: 'S' },
    ],
    supports: [{ node: 'p', fixity: 'fixed' }, { node: 'q', fixity: 'fixed' }],
    loads: [{ kind: 'member-udl', member: 'bm', w: 20, cat: 'D' }],
    rigidEndZones: rz, rigidZoneFactor: 1,
  })

  it('the supports carry the whole w·L with rigid zones on (was w·clear span)', () => {
    const br = modelToFrame3D(portal(true))
    expect(br.members.find((m) => m.id === 'bm')!.offI).toBeDefined()
    const r = solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
    const Ry = r.reactions.reduce((s, x) => s + x.F[1], 0)
    expect(Ry).toBeCloseTo(20 * 6, 6)
  })

  it('symmetric portal: each column takes half, zones on or off', () => {
    for (const rz of [false, true]) {
      const br = modelToFrame3D(portal(rz))
      const r = solveFrame3D(br.nodes, br.members, br.supports, br.loads)!
      for (const x of r.reactions) expect(x.F[1]).toBeCloseTo(60, 6)
    }
  })
})
