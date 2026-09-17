import { describe, it, expect } from 'vitest'
import { groupPlates, projectNode, barycentric } from './contour'
import type { ShellNode, ShellElem } from '../../engine/shell'

// Two panels: a flat slab in the z = 0 plane and a wall standing in x = 0.
// Grouping must separate them; each must fit its own plane.
const nodes: ShellNode[] = [
  { id: 's0', x: 0, y: 0, z: 0 }, { id: 's1', x: 2, y: 0, z: 0 },
  { id: 's2', x: 2, y: 2, z: 0 }, { id: 's3', x: 0, y: 2, z: 0 },
  { id: 'w0', x: 0, y: 0, z: 0 }, { id: 'w1', x: 0, y: 2, z: 0 },
  { id: 'w2', x: 0, y: 2, z: 3 }, { id: 'w3', x: 0, y: 0, z: 3 },
]
const elems: ShellElem[] = [
  { id: 'slab_0', nodes: ['s0', 's1', 's2'], E: 25000, nu: 0.2, t: 150 },
  { id: 'slab_1', nodes: ['s0', 's2', 's3'], E: 25000, nu: 0.2, t: 150 },
  { id: 'wall_0', nodes: ['w0', 'w1', 'w2'], E: 25000, nu: 0.2, t: 200 },
  { id: 'wall_1', nodes: ['w0', 'w2', 'w3'], E: 25000, nu: 0.2, t: 200 },
]

describe('groupPlates', () => {
  it('groups elements by panel prefix and fits each panel plane', () => {
    const gs = groupPlates(nodes, elems)
    expect(gs.map((g) => g.id).sort()).toEqual(['slab', 'wall'])
    const slab = gs.find((g) => g.id === 'slab')!
    const wall = gs.find((g) => g.id === 'wall')!
    // slab normal ≈ ±Z, wall normal ≈ ±X
    expect(Math.abs(slab.frame[2][2])).toBeCloseTo(1, 9)
    expect(Math.abs(wall.frame[2][0])).toBeCloseTo(1, 9)
    // slab tile carries only its own 4 nodes — the wall no longer folds onto it
    expect(slab.nodes).toHaveLength(4)
    expect(wall.nodes).toHaveLength(4)
  })

  it('projects a node onto the panel plane (u, v)', () => {
    const slab = groupPlates(nodes, elems).find((g) => g.id === 'slab')!
    const [u, v] = projectNode(nodes[2], slab)   // s2 at (2,2,0)
    expect(u).toBeGreaterThan(0)
    expect(v).toBeGreaterThan(0)
    const [u0, v0] = projectNode(nodes[0], slab) // origin corner
    expect(u0).toBeLessThan(u)
    expect(v0).toBeLessThan(v)
  })
})

describe('barycentric', () => {
  const p0: [number, number] = [0, 0], p1: [number, number] = [1, 0], p2: [number, number] = [0, 1]
  it('is exact at the vertices', () => {
    expect(barycentric([0, 0], p0, p1, p2)).toEqual([1, 0, 0])
    expect(barycentric([1, 0], p0, p1, p2)).toEqual([0, 1, 0])
    expect(barycentric([0, 1], p0, p1, p2)).toEqual([0, 0, 1])
  })
  it('averages at the centroid', () => {
    const w = barycentric([1 / 3, 1 / 3], p0, p1, p2)!
    w.forEach((wi) => expect(wi).toBeCloseTo(1 / 3, 12))
  })
  it('returns null outside the triangle', () => {
    expect(barycentric([0.9, 0.9], p0, p1, p2)).toBeNull()
  })
})

