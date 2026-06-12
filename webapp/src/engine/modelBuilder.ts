// ─────────────────────────────────────────────────────────────────────────
// Building-grid model generator — Phase 4 of the 3D roadmap. Produces a
// StructuralModel (engine/model.ts) for a regular frame: column grid from
// the bay lists, storeys from the height list, beams (X) + girders (Z) at
// every level, a slab per bay per level, fixed supports at the base.
// Coordinates: x = plan east, z = plan north, y = elevation (up) — matching
// the three.js viewport.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection, Node, Member, Plate, NodeSupport } from './model'

export interface GridSpec {
  baysX: number[]      // bay widths along x, m
  baysZ: number[]      // bay widths along z, m
  storeyH: number[]    // storey heights bottom-up, m
  section: RectSection
}

const acc = (bays: number[]): number[] => {
  const out = [0]
  for (const b of bays) out.push(out[out.length - 1] + b)
  return out
}

export const nodeId = (i: number, j: number, k: number) => `n${i}.${j}.${k}`

export function generateGridModel(spec: GridSpec, name = 'Grid frame'): StructuralModel {
  const xs = acc(spec.baysX)
  const zs = acc(spec.baysZ)
  const ys = acc(spec.storeyH)
  const nx = xs.length, nz = zs.length, ny = ys.length

  const nodes: Node[] = []
  for (let k = 0; k < ny; k++)
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++)
        nodes.push({ id: nodeId(i, j, k), x: xs[i], y: ys[k], z: zs[j] })

  const members: Member[] = []
  // columns between consecutive levels at every grid point
  for (let k = 0; k < ny - 1; k++)
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++)
        members.push({ id: `c${i}.${j}.${k}`, i: nodeId(i, j, k), j: nodeId(i, j, k + 1), role: 'column', section: spec.section.id })
  // beams along X and girders along Z at every elevated level
  for (let k = 1; k < ny; k++) {
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx - 1; i++)
        members.push({ id: `bx${i}.${j}.${k}`, i: nodeId(i, j, k), j: nodeId(i + 1, j, k), role: 'beam', section: spec.section.id })
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx; i++)
        members.push({ id: `bz${i}.${j}.${k}`, i: nodeId(i, j, k), j: nodeId(i, j + 1, k), role: 'girder', section: spec.section.id })
  }

  const plates: Plate[] = []
  for (let k = 1; k < ny; k++)
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++)
        plates.push({
          id: `s${i}.${j}.${k}`,
          corners: [nodeId(i, j, k), nodeId(i + 1, j, k), nodeId(i + 1, j + 1, k), nodeId(i, j + 1, k)],
          role: 'slab',
          thickness: 150,
        })

  const supports: NodeSupport[] = []
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++)
      supports.push({ node: nodeId(i, j, 0), fixity: 'fixed' })

  return {
    version: 1,
    name,
    nodes,
    sections: [spec.section],
    members,
    plates,
    supports,
    loads: [],
    storeys: ys.slice(1).map((y, k) => ({ id: `st${k + 1}`, name: `Level ${k + 1}`, elevation: y })),
  }
}

/** Drop a set of member/plate ids from the model (immutably). */
export function removeElements(model: StructuralModel, ids: Set<string>): StructuralModel {
  return {
    ...model,
    members: model.members.filter((m) => !ids.has(m.id)),
    plates: model.plates.filter((p) => !ids.has(p.id)),
    loads: model.loads.filter((l) =>
      l.kind === 'node' ? true
        : l.kind === 'area' ? !ids.has(l.plate)
          : !ids.has(l.member)),
  }
}
