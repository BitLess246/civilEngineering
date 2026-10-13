import { describe, it, expect } from 'vitest'
import { planGridLines, uniqueCoords } from './planGrid'
import { generateGridModel } from './modelBuilder'
import type { RectSection, StructuralModel } from './model'

const S: RectSection = { id: 's', name: 's', b: 300, h: 300, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

describe('plan grid — bubbles on the columns only', () => {
  const base = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: S })

  it('a plain grid frame keeps its lines A–C, 1–2', () => {
    expect(planGridLines(base)).toEqual({ xs: [0, 6, 12], zs: [0, 5] })
  })

  it('slab-mesh nodes every 0.6 m (an imported STAAD model) add no lines', () => {
    const mesh: StructuralModel = { ...base, nodes: [...base.nodes] }
    for (let x = 0.6; x < 12; x += 0.6) for (let z = 0.5; z < 5; z += 0.5) mesh.nodes.push({ id: `m${x}-${z}`, x, y: 3.5, z })
    expect(planGridLines(mesh)).toEqual({ xs: [0, 6, 12], zs: [0, 5] })
  })

  it('an off-grid column gets its own line; a beam-only node does not', () => {
    const m: StructuralModel = { ...base, nodes: [...base.nodes, { id: 'a', x: 3, y: 0, z: 2 }, { id: 'b', x: 3, y: 3.5, z: 2 }, { id: 'c', x: 9, y: 3.5, z: 4 }] }
    m.members = [...base.members, { id: 'cx', i: 'a', j: 'b', role: 'column', section: 'c0.0.0' }]
    expect(planGridLines(m)).toEqual({ xs: [0, 3, 6, 12], zs: [0, 2, 5] })
  })

  it('a column leaning to its top sets out from its base — the top adds no line', () => {
    const m: StructuralModel = { ...base, nodes: base.nodes.map((n) => (n.id === 'n1.1.1' ? { ...n, z: n.z + 1 } : n.id === 'n0.0.1' ? { ...n, x: n.x - 1 } : n)) }
    expect(planGridLines(m)).toEqual({ xs: [0, 6, 12], zs: [0, 5] })
  })

  it('no columns: the supports set the grid; nothing at all: the nodes', () => {
    const truss: StructuralModel = { ...base, members: base.members.filter((q) => q.role !== 'column') }
    expect(planGridLines(truss)).toEqual({ xs: [0, 6, 12], zs: [0, 5] })
    expect(planGridLines({ nodes: [{ id: 'p', x: 1, y: 0, z: 2 }], members: [], supports: [] })).toEqual({ xs: [1], zs: [2] })
  })

  it('merges coordinates within 50 mm', () => {
    expect(uniqueCoords([6.00001, 0, 6, 12.04])).toEqual([0, 6, 12.04])
  })
})
