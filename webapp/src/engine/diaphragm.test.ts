import { describe, it, expect } from 'vitest'
import { buildDiaphragmGroups } from './diaphragm'
import { emptyModel, type StructuralModel } from './model'

function model(nodes: Array<[string, number, number, number]>, elevations: number[]): StructuralModel {
  return {
    ...emptyModel('t'),
    nodes: nodes.map(([id, x, y, z]) => ({ id, x, y, z })),
    storeys: elevations.map((e, i) => ({ id: `s${i}`, name: `L${i + 1}`, elevation: e })),
  }
}

describe('buildDiaphragmGroups — rigid floor diaphragm node grouping', () => {
  it('returns no groups when the model has no storeys', () => {
    const m = model([['a', 0, 3, 0], ['b', 4, 3, 0]], [])
    expect(buildDiaphragmGroups(m)).toEqual([])
  })

  it('groups all nodes at a storey elevation: first = master, rest = slaves', () => {
    const m = model([['a', 0, 3, 0], ['b', 4, 3, 0], ['c', 4, 3, 5], ['base', 0, 0, 0]], [3])
    const g = buildDiaphragmGroups(m)
    expect(g).toHaveLength(1)
    expect(g[0].masterNode).toBe('a')
    expect(g[0].slaveNodes).toEqual(['b', 'c'])
  })

  it('skips storeys with fewer than 2 nodes at that elevation (nothing to tie)', () => {
    const m = model([['a', 0, 3, 0], ['lone', 0, 6, 0]], [3, 6])
    const g = buildDiaphragmGroups(m)
    expect(g).toHaveLength(0)   // one node per level — no constraint possible
  })

  it('produces one group per storey in a multi-storey model', () => {
    const m = model(
      [['a1', 0, 3, 0], ['b1', 4, 3, 0], ['a2', 0, 6, 0], ['b2', 4, 6, 0], ['base', 0, 0, 0]],
      [3, 6],
    )
    const g = buildDiaphragmGroups(m)
    expect(g).toHaveLength(2)
    expect(g[0]).toEqual({ masterNode: 'a1', slaveNodes: ['b1'] })
    expect(g[1]).toEqual({ masterNode: 'a2', slaveNodes: ['b2'] })
  })

  it('matches elevations within the tolerance but not beyond it', () => {
    // 1e-5 m off is inside YTOL = 1e-4; 1e-3 m off is outside.
    const m = model([['a', 0, 3, 0], ['near', 4, 3 + 1e-5, 0], ['far', 8, 3 + 1e-3, 0]], [3])
    const g = buildDiaphragmGroups(m)
    expect(g).toHaveLength(1)
    expect(g[0].slaveNodes).toEqual(['near'])
  })
})
