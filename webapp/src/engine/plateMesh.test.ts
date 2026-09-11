import { describe, it, expect } from 'vitest'
import { meshPlates, meshPrefix, emptyPlateMesh } from './plateMesh'
import { generateGridModel } from './modelBuilder'
import type { RectSection, StructuralModel } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const MAT = { E: 24870, nu: 0.2 }

/** One 6 × 5 m panel in the X–Z plane at y = 0, on its own four nodes. */
const onePanel = (): StructuralModel => ({
  version: 1,
  name: 'panel',
  nodes: [
    { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 6, y: 0, z: 0 },
    { id: 'c', x: 6, y: 0, z: 5 }, { id: 'd', x: 0, y: 0, z: 5 },
  ],
  sections: [section],
  members: [],
  plates: [{ id: 'p1', corners: ['a', 'b', 'c', 'd'], role: 'slab', thickness: 150 }],
  walls: [],
  supports: [],
  loads: [],
  storeys: [{ id: 's0', name: 'L0', elevation: 0 }],
})

const area = (m: ReturnType<typeof meshPlates>) =>
  [...m.areaByElem.values()].reduce((s, a) => s + a, 0)

describe('meshPlates — the grid', () => {
  it('n = 1 is the classic two triangles on the panel’s own corners', () => {
    // The substitution control: the whole point of defaulting to 1 is that it
    // is not a new mesh at all. Same two triangles, same c0–c2 diagonal, and
    // NO new nodes — every vertex is already a model node.
    const m = meshPlates(onePanel(), { subdiv: 1, ...MAT })
    expect(m.shells).toHaveLength(2)
    expect(m.shells.map((s) => s.nodes)).toEqual([['a', 'b', 'c'], ['a', 'c', 'd']])
    expect(m.nodes).toHaveLength(0)
    expect(area(m)).toBeCloseTo(30, 9)
  })

  it('n × n gives 2n² elements and (n+1)² − 4 new nodes', () => {
    for (const n of [2, 3, 4, 6]) {
      const m = meshPlates(onePanel(), { subdiv: n, ...MAT })
      expect(m.shells).toHaveLength(2 * n * n)
      expect(m.nodes).toHaveLength((n + 1) * (n + 1) - 4)   // the 4 corners are reused
      expect(m.elemsByPlate.get('p1')).toHaveLength(2 * n * n)
    }
  })

  it('the meshed area equals the panel area at every density', () => {
    // The load invariant rests on this: the bridge lumps q·A/3 per element, so
    // if Σ A drifted from the panel the applied load would drift with it.
    for (const n of [1, 2, 3, 4, 5, 6])
      expect(area(meshPlates(onePanel(), { subdiv: n, ...MAT }))).toBeCloseTo(30, 9)
  })

  it('reuses the model’s own nodes wherever the mesh lands on one', () => {
    // A node the user drew at a panel edge midpoint must stay ONE node, or the
    // slab and whatever else attaches there quietly come apart.
    const model = onePanel()
    model.nodes.push({ id: 'mid', x: 3, y: 0, z: 0 })     // midpoint of edge a→b
    const m = meshPlates(model, { subdiv: 2, ...MAT })
    const used = new Set(m.shells.flatMap((s) => s.nodes))
    expect(used.has('mid')).toBe(true)
    expect(m.nodes.some((q) => q.id === 'mid')).toBe(false)   // not re-created
  })

  it('adjacent panels share their common edge nodes', () => {
    // Conforming, or the two panels slide past each other along the shared line.
    const model = onePanel()
    model.nodes.push({ id: 'e', x: 12, y: 0, z: 0 }, { id: 'f', x: 12, y: 0, z: 5 })
    model.plates.push({ id: 'p2', corners: ['b', 'e', 'f', 'c'], role: 'slab', thickness: 150 })
    const m = meshPlates(model, { subdiv: 4, ...MAT })
    const of = (id: string) => new Set((m.elemsByPlate.get(id) ?? [])
      .flatMap((e) => m.nodesByElem.get(e) ?? []))
    const shared = [...of('p1')].filter((id) => of('p2').has(id))
    // the whole b→c edge: 5 grid points at n = 4
    expect(shared).toHaveLength(5)
    // and the mesh has one node per grid point, not two
    expect(m.nodes.length + model.nodes.length).toBe(5 * 5 + 5 * 4)
  })

  it('skips a panel with a missing corner or no area, and says nothing', () => {
    // Both already carry a meshValidation rule, so the user has been told; the
    // mesher's job is to not produce a degenerate element.
    const ghost = onePanel()
    ghost.plates[0] = { ...ghost.plates[0], corners: ['a', 'b', 'c', 'ghost'] }
    expect(meshPlates(ghost, { subdiv: 4, ...MAT }).shells).toHaveLength(0)

    const flat = onePanel()
    flat.nodes = flat.nodes.map((q, i) => ({ ...q, x: i * 2, z: 0 }))   // collinear
    expect(meshPlates(flat, { subdiv: 4, ...MAT }).shells).toHaveLength(0)
  })

  it('a model with no plates returns the empty mesh', () => {
    const bare = { ...onePanel(), plates: [] }
    expect(meshPlates(bare, { subdiv: 4, ...MAT })).toEqual(emptyPlateMesh())
  })
})

describe('meshPrefix — synthetic ids must not collide with the user’s', () => {
  it('avoids any prefix an existing node id starts with', () => {
    const model = onePanel()
    expect(meshPrefix(model)).toBe('~p')
    model.nodes.push({ id: '~p0', x: 1, y: 0, z: 1 })
    expect(meshPrefix(model)).toBe('~p~')
    model.nodes.push({ id: '~p~9', x: 2, y: 0, z: 1 })
    expect(meshPrefix(model)).toBe('~p~~')
  })

  it('a user node named like a synthetic one does not get absorbed', () => {
    // The failure this prevents is silent: colliding ids MERGE two distinct
    // nodes, welding unrelated parts of the structure together.
    const model = onePanel()
    model.nodes.push({ id: '~p0', x: 99, y: 0, z: 99 })   // nowhere near the panel
    const m = meshPlates(model, { subdiv: 2, ...MAT })
    const used = new Set(m.shells.flatMap((s) => s.nodes))
    expect(used.has('~p0')).toBe(false)
    expect(m.nodes.every((q) => q.id !== '~p0')).toBe(true)
  })
})

describe('meshPlates — edge splits', () => {
  it('finds the mesh nodes lying inside each edge member, ordered i→j', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    const m = meshPlates(model, { subdiv: 4, ...MAT })
    const nm = new Map([...model.nodes, ...m.nodes].map((q) => [q.id, q]))
    let edges = 0
    for (const mem of model.members) {
      const hits = m.edgeSplits.get(mem.id)
      if (!hits) continue
      edges++
      expect(hits).toHaveLength(3)                      // n − 1 interior points
      // strictly increasing along i→j, and every hit really is on the line
      const a = nm.get(mem.i)!, b = nm.get(mem.j)!
      const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
      const ts = hits.map((id) => {
        const p = nm.get(id)!
        return ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y) + (p.z - a.z) * (b.z - a.z)) / (L * L)
      })
      expect(ts).toEqual([...ts].sort((x, y) => x - y))
      for (const t of ts) { expect(t).toBeGreaterThan(0); expect(t).toBeLessThan(1) }
    }
    expect(edges).toBe(4)          // the four beams bounding the single panel
  })

  it('reports nothing at n = 1 — there are no interior nodes to attach', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 150 })
    expect(meshPlates(model, { subdiv: 1, ...MAT }).edgeSplits.size).toBe(0)
  })

  it('picks up a beam crossing the panel interior, not just its edges', () => {
    // Deliberately generic: a secondary beam drawn across a slab is exactly the
    // member you want tied to the mesh.
    const model = onePanel()
    model.nodes.push({ id: 'm0', x: 0, y: 0, z: 2.5 }, { id: 'm1', x: 6, y: 0, z: 2.5 })
    model.members.push({ id: 'sec', i: 'm0', j: 'm1', role: 'beam', section: 'S1' })
    const m = meshPlates(model, { subdiv: 4, ...MAT })
    // the z = 2.5 grid line has 5 points; 2 are the member's own ends
    expect(m.edgeSplits.get('sec')).toHaveLength(3)
  })
})
