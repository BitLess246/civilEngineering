import { describe, it, expect } from 'vitest'
import {
  precomputeFrame, solveWithGeometry, solveFrame3D, serializePrecomp, deserializePrecomp,
  type F3Node, type F3Member, type F3Support, type F3Load, type F3Shell,
} from './frame3d'
import { solveShell, type ShellNode, type ShellElem, type ShellSupport, type ShellNodeLoad } from './shell'

const E = 25000, nu = 0.3, t = 200

// 2×1 m plate (X-Y plane) as two triangles; left edge (x=0) fixed, tip loaded −z.
const nodes: F3Node[] = [
  { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 2, y: 0, z: 0 },
  { id: 'c', x: 2, y: 1, z: 0 }, { id: 'd', x: 0, y: 1, z: 0 },
]
const shells: F3Shell[] = [
  { id: 's0', nodes: ['a', 'b', 'c'], E, nu, t },
  { id: 's1', nodes: ['a', 'c', 'd'], E, nu, t },
]
const supports: F3Support[] = [
  { node: 'a', fixity: 'fixed' }, { node: 'd', fixity: 'fixed' },
]
const loads: F3Load[] = [
  { kind: 'node', node: 'b', Fz: -3, cat: 'D' }, { kind: 'node', node: 'c', Fz: -3, cat: 'D' },
]

describe('frame3d shell integration', () => {
  it('matches the standalone solveShell displacements (same elements & loads)', () => {
    const r = solveFrame3D(nodes, [], supports, loads, undefined, shells)!
    expect(r).toBeTruthy()

    const sn: ShellNode[] = nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, z: n.z }))
    const se: ShellElem[] = shells.map((s) => ({ id: s.id, nodes: s.nodes, E, nu, t }))
    const ss: ShellSupport[] = [
      { node: 'a', ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
      { node: 'd', ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
    ]
    const sl: ShellNodeLoad[] = [{ node: 'b', Fz: -3 }, { node: 'c', Fz: -3 }]
    const rs = solveShell(sn, se, ss, sl)!

    const i = (id: string) => nodes.findIndex((n) => n.id === id)
    for (const id of ['b', 'c']) {
      expect(r.d[6 * i(id) + 2]).toBeCloseTo(rs.disp.get(id)![2], 9)   // w
      expect(r.d[6 * i(id) + 0]).toBeCloseTo(rs.disp.get(id)![0], 9)   // u
    }
  })

  it('reactions balance the applied load (ΣFz = +6 kN up)', () => {
    const r = solveFrame3D(nodes, [], supports, loads, undefined, shells)!
    const sumFz = r.reactions.reduce((s, rx) => s + rx.F[2], 0)
    expect(sumFz).toBeCloseTo(6, 6)   // resists the two −3 kN tip loads
  })

  it('a shell stiffens a frame model — combined tip deflection < bare beam', () => {
    // beam a→b with a,c,d fixed and b loaded; adding the shell panel (which also
    // ties b to the fixed corners a,c) must reduce b's deflection.
    const beam: F3Member = { id: 'm', i: 'a', j: 'b', E, G: E / 2.4, A: 90000, Iy: 6.75e8, Iz: 6.75e8, J: 1e9 }
    const sup: F3Support[] = [
      { node: 'a', fixity: 'fixed' }, { node: 'c', fixity: 'fixed' }, { node: 'd', fixity: 'fixed' },
    ]
    const ld: F3Load[] = [{ kind: 'node', node: 'b', Fz: -5, cat: 'D' }]
    const bare = solveFrame3D(nodes, [beam], sup, ld)!
    const withShell = solveFrame3D(nodes, [beam], sup, ld, undefined, shells)!
    const bi = nodes.findIndex((n) => n.id === 'b')
    expect(Math.abs(withShell.d[6 * bi + 2])).toBeLessThan(Math.abs(bare.d[6 * bi + 2]))
  })

  it('no shells → identical result to the pre-shell solver (backward compatible)', () => {
    const ab: F3Node[] = [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 2, y: 0, z: 0 }]
    const beam: F3Member = { id: 'm', i: 'a', j: 'b', E, G: E / 2.4, A: 90000, Iy: 6.75e8, Iz: 6.75e8, J: 1e9 }
    const sup: F3Support[] = [{ node: 'a', fixity: 'fixed' }]
    const ld: F3Load[] = [{ kind: 'node', node: 'b', Fz: -5, cat: 'D' }]
    const r1 = solveFrame3D(ab, [beam], sup, ld)!
    const r2 = solveFrame3D(ab, [beam], sup, ld, undefined, [])!
    expect(r2.d).toEqual(r1.d)
  })

  it('serializes shell geometry across the worker boundary', () => {
    const p = precomputeFrame(nodes, [], supports, undefined, shells)
    const q = deserializePrecomp(serializePrecomp(p))
    expect(q.shellGeoms.length).toBe(2)
    const r1 = solveWithGeometry(p, loads)!
    const r2 = solveWithGeometry(q, loads)!
    expect(r2.d).toEqual(r1.d)
  })
})
