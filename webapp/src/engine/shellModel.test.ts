import { describe, it, expect } from 'vitest'
import { solveModelShells, designModelSlabsFE, meshModelShells } from './shellModel'
import type { StructuralModel } from './model'

// A single 6×5 m slab panel, clamped at its four corners, under area D + L.
function panel(thickness = 150): StructuralModel {
  return {
    version: 1, name: 'panel',
    nodes: [
      { id: 'n0', x: 0, y: 0, z: 0 }, { id: 'n1', x: 6, y: 0, z: 0 },
      { id: 'n2', x: 6, y: 0, z: 5 }, { id: 'n3', x: 0, y: 0, z: 5 },
    ],
    sections: [], members: [],
    plates: [{ id: 's0', corners: ['n0', 'n1', 'n2', 'n3'], role: 'slab', thickness }],
    walls: [],
    supports: [
      { node: 'n0', fixity: 'fixed' }, { node: 'n1', fixity: 'fixed' },
      { node: 'n2', fixity: 'fixed' }, { node: 'n3', fixity: 'fixed' },
    ],
    loads: [
      { kind: 'area', plate: 's0', q: 6, cat: 'D' },
      { kind: 'area', plate: 's0', q: 4, cat: 'L' },
    ],
    storeys: [],
    shellElements: true,
  }
}

describe('meshModelShells', () => {
  it('reuses the model corner node ids and meshes n×n cells', () => {
    const { nodes, elems } = meshModelShells(panel(), 4)
    // 4×4 grid ⇒ 25 nodes, 2·16 = 32 triangles
    expect(nodes).toHaveLength(25)
    expect(elems).toHaveLength(32)
    for (const id of ['n0', 'n1', 'n2', 'n3']) expect(nodes.some((n) => n.id === id)).toBe(true)
    // every element id is prefixed by its plate id
    expect(elems.every((e) => e.id.startsWith('s0_'))).toBe(true)
  })
})

describe('solveModelShells', () => {
  it('returns null when the model has no plates', () => {
    expect(solveModelShells({ ...panel(), plates: [] })).toBeNull()
  })

  it('recovers a non-trivial bending field under area load', () => {
    const r = solveModelShells(panel(), { subdiv: 4 })!
    expect(r).toBeTruthy()
    expect(r.stresses).toHaveLength(32)
    const peakM = Math.max(...r.stresses.map((s) => Math.max(Math.abs(s.Mx), Math.abs(s.My))))
    expect(peakM).toBeGreaterThan(0)
  })

  it('factored field scales linearly with the load factors', () => {
    const svc = solveModelShells(panel(), { subdiv: 3, dFactor: 1, lFactor: 1 })!
    const fac = solveModelShells(panel(), { subdiv: 3, dFactor: 2, lFactor: 2 })!
    const peak = (r: typeof svc) => Math.max(...r.stresses.map((s) => Math.abs(s.Mx)))
    expect(peak(fac)).toBeCloseTo(2 * peak(svc), 6)
  })
})

describe('designModelSlabsFE — Wood-Armer reinforcement from the FE field', () => {
  it('designs one row per slab with positive reinforcement', () => {
    const out = designModelSlabsFE(panel(), { subdiv: 4 })!
    expect(out.rows).toHaveLength(1)
    const row = out.rows[0]
    expect(row.plate).toBe('s0')
    expect(row.thickness).toBe(150)
    // at least one face/direction needs flexural steel beyond the minimum
    const strips = [row.design.bottomX, row.design.bottomY, row.design.topX, row.design.topY]
    expect(strips.every((s) => s.As > 0 && s.spacing > 0)).toBe(true)
    expect(strips.some((s) => !s.usedMin)).toBe(true)
    // governing elements belong to this plate
    expect(row.design.govBottom.startsWith('s0_')).toBe(true)
    expect(row.design.govTop.startsWith('s0_')).toBe(true)
  })

  it('uses the NSCP 1.2D + 1.6L factored field by default (heavier than service)', () => {
    const factored = designModelSlabsFE(panel(), { subdiv: 4 })!
    const service = designModelSlabsFE(panel(), { subdiv: 4, dFactor: 1, lFactor: 1 })!
    const env = (o: typeof factored) => o.rows[0].design.moments.mxBottom + o.rows[0].design.moments.myBottom
    expect(env(factored)).toBeGreaterThan(env(service))
  })

  it('factored design never needs less steel than the service field', () => {
    const factored = designModelSlabsFE(panel(), { subdiv: 4 })!.rows[0]
    const service = designModelSlabsFE(panel(), { subdiv: 4, dFactor: 1, lFactor: 1 })!.rows[0]
    expect(factored.design.bottomX.As).toBeGreaterThanOrEqual(service.design.bottomX.As - 1e-6)
    expect(factored.design.topY.As).toBeGreaterThanOrEqual(service.design.topY.As - 1e-6)
  })

  it('skips wall panels', () => {
    const m = panel()
    m.plates[0].role = 'wall'
    const out = designModelSlabsFE(m, { subdiv: 3 })!
    expect(out.rows).toHaveLength(0)
  })
})
