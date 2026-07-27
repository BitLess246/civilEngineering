import { describe, it, expect } from 'vitest'
import { solveActiveSet, axialModes, type AxialMode } from './axialOnly'
import { solveFrame3D, rectJ, type F3Node, type F3Member, type F3Support, type F3Load } from './frame3d'
import { validateMesh } from './meshValidation'
import { emptyModel, type Member } from './model'

// A single braced bay in the X–Y plane:
//   n3 ── n4      (top)
//   │  ╲╱  │
//   │  ╱╲  │
//   n1    n2      (base, both pinned)
// diagonals d14 (n1→n4) and d23 (n2→n3) are the cross-braces.
const E = 200000, G = 76900
const col = { A: 5000, Iy: 2e7, Iz: 2e7, J: rectJ(70, 70) }
const brace = { A: 1200, Iy: 1e5, Iz: 1e5, J: rectJ(30, 30) }

const nodes: F3Node[] = [
  { id: 'n1', x: 0, y: 0, z: 0 }, { id: 'n2', x: 4, y: 0, z: 0 },
  { id: 'n3', x: 0, y: 3, z: 0 }, { id: 'n4', x: 4, y: 3, z: 0 },
]
const members: F3Member[] = [
  { id: 'c13', i: 'n1', j: 'n3', E, G, ...col },
  { id: 'c24', i: 'n2', j: 'n4', E, G, ...col },
  { id: 'b34', i: 'n3', j: 'n4', E, G, ...col },
  { id: 'd14', i: 'n1', j: 'n4', E, G, ...brace },
  { id: 'd23', i: 'n2', j: 'n3', E, G, ...brace },
]
const supports: F3Support[] = [
  { node: 'n1', fixity: 'fixed' }, { node: 'n2', fixity: 'fixed' },
]
/** Lateral push at the top-left node, +X. */
const push = (P: number): F3Load[] => [{ kind: 'node', node: 'n3', Fx: P, cat: 'E' }]

const axialOf = (r: { members: { id: string; N: number[] }[] }, id: string) =>
  r.members.find((m) => m.id === id)?.N[0] ?? 0

describe('axialOnly — active-set solve', () => {
  const tensionOnly = new Map<string, AxialMode>([['d14', 'tension-only'], ['d23', 'tension-only']])

  it('with no limited members it is a plain linear solve', () => {
    const a = solveActiveSet(nodes, members, supports, push(50), new Map())!
    const b = solveFrame3D(nodes, members, supports, push(50))!
    expect(a.inactive).toEqual([])
    expect(a.converged).toBe(true)
    expect(a.result.d[0]).toBeCloseTo(b.d[0], 12)
  })

  it('drops the compressed diagonal of a cross-braced bay', () => {
    const r = solveActiveSet(nodes, members, supports, push(50), tensionOnly)!
    expect(r.converged).toBe(true)
    expect(r.inactive).toHaveLength(1)              // exactly one diagonal buckles out
    // the surviving diagonal must be in tension
    const kept = r.inactive[0] === 'd14' ? 'd23' : 'd14'
    expect(axialOf(r.result, kept)).toBeGreaterThan(0)
  })

  it('reversing the load swaps which diagonal is active', () => {
    const fwd = solveActiveSet(nodes, members, supports, push(50), tensionOnly)!
    const rev = solveActiveSet(nodes, members, supports, push(-50), tensionOnly)!
    expect(fwd.inactive).toHaveLength(1)
    expect(rev.inactive).toHaveLength(1)
    expect(rev.inactive[0]).not.toBe(fwd.inactive[0])   // the OTHER brace deactivates
  })

  it('re-activation works — a latched-off iteration would keep both braces off', () => {
    // both diagonals start conceptually "off"; the solver must switch the
    // tension one back on rather than leaving the bay unbraced
    const r = solveActiveSet(nodes, members, supports, push(50), tensionOnly)!
    expect(r.inactive).not.toContain('d14' as never)
    expect(r.inactive.length).toBeLessThan(2)
  })

  it('the braced bay is stiffer than the same bay with both braces removed', () => {
    const braced = solveActiveSet(nodes, members, supports, push(50), tensionOnly)!
    const bare = solveFrame3D(nodes, members.filter((m) => !m.id.startsWith('d')), supports, push(50))!
    expect(Math.abs(braced.result.d[6 * 2])).toBeLessThan(Math.abs(bare.d[6 * 2]))
  })

  it('compression-only struts drop under a pull instead', () => {
    const compOnly = new Map<string, AxialMode>([['d14', 'compression-only'], ['d23', 'compression-only']])
    const r = solveActiveSet(nodes, members, supports, push(50), compOnly)!
    expect(r.converged).toBe(true)
    expect(r.inactive).toHaveLength(1)
    const kept = r.inactive[0] === 'd14' ? 'd23' : 'd14'
    expect(axialOf(r.result, kept)).toBeLessThan(0)   // the survivor is in compression
  })

  it('equilibrium still holds after members deactivate (ΣR = ΣF)', () => {
    // the invariant that matters most: dropping a member must not leave
    // unbalanced force. Checked in both load directions and at two magnitudes.
    for (const P of [50, -50, 120]) {
      const r = solveActiveSet(nodes, members, supports, push(P), tensionOnly)!
      const R = r.result.reactions.reduce(
        (acc, q) => [acc[0] + q.F[0], acc[1] + q.F[1], acc[2] + q.F[2]], [0, 0, 0])
      expect(r.inactive).toHaveLength(1)          // a member really did drop out
      expect(R[0]).toBeCloseTo(-P, 9)             // reactions balance the push
      expect(R[1]).toBeCloseTo(0, 9)
      expect(R[2]).toBeCloseTo(0, 9)
    }
  })

  it('response scales linearly while the active set is unchanged', () => {
    // within one active set the problem is linear again — a useful guard that
    // the iteration is not injecting spurious state between solves
    const a = solveActiveSet(nodes, members, supports, push(50), tensionOnly)!
    const b = solveActiveSet(nodes, members, supports, push(120), tensionOnly)!
    expect(b.inactive).toEqual(a.inactive)
    expect(axialOf(b.result, 'd14') / axialOf(a.result, 'd14')).toBeCloseTo(120 / 50, 9)
  })

  it('converges in a handful of iterations', () => {
    const r = solveActiveSet(nodes, members, supports, push(50), tensionOnly)!
    expect(r.iterations).toBeGreaterThan(0)
    expect(r.iterations).toBeLessThanOrEqual(5)
  })
})

describe('axialOnly — axialModes helper', () => {
  it('collects only the limited members', () => {
    const m = axialModes([
      { id: 'a', axialMode: 'tension-only' }, { id: 'b', axialMode: 'both' },
      { id: 'c' }, { id: 'd', axialMode: 'compression-only' },
    ])
    expect([...m.keys()].sort()).toEqual(['a', 'd'])
    expect(m.get('a')).toBe('tension-only')
  })
})

describe('meshValidation — axial-mode rules', () => {
  const base = () => {
    const m = emptyModel('t')
    m.nodes = [{ id: 'n1', x: 0, y: 0, z: 0 }, { id: 'n2', x: 4, y: 3, z: 0 }]
    m.sections = [{ id: 'S', name: 's', b: 100, h: 100, fc: 28, fy: 415, barDia: 16, tieDia: 10, cover: 40 }]
    m.supports = [{ node: 'n1', fixity: 'fixed' }]
    return m
  }

  it('rejects an axial release on a tension-only member', () => {
    const m = base()
    m.members = [{
      id: 'd', i: 'n1', j: 'n2', role: 'brace', section: 'S',
      axialMode: 'tension-only', releases: { iEnd: { Fx: true } },
    } as Member]
    expect(validateMesh(m).some((i) => i.code === 'AXIAL_MODE_RELEASED' && i.severity === 'error')).toBe(true)
  })

  it('warns when a node hangs only from limited members', () => {
    const m = base()
    m.members = [{ id: 'd', i: 'n1', j: 'n2', role: 'brace', section: 'S', axialMode: 'tension-only' } as Member]
    const w = validateMesh(m).filter((i) => i.code === 'AXIAL_MODE_ISOLATED')
    expect(w).toHaveLength(1)          // n2 only; n1 is supported
    expect(w[0].refs).toContain('n2')
  })

  it('stays quiet for ordinary two-way members', () => {
    const m = base()
    m.members = [{ id: 'd', i: 'n1', j: 'n2', role: 'brace', section: 'S' } as Member]
    expect(validateMesh(m).some((i) => i.code.startsWith('AXIAL_MODE'))).toBe(false)
  })
})
