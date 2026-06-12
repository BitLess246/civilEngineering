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

/** Remove a node and everything attached to it: members, plates, supports
 *  and loads (immutably, cascading). */
export function removeNode(model: StructuralModel, nodeId: string): StructuralModel {
  const deadMembers = new Set(model.members.filter((m) => m.i === nodeId || m.j === nodeId).map((m) => m.id))
  const deadPlates = new Set(model.plates.filter((p) => p.corners.includes(nodeId)).map((p) => p.id))
  const cascaded = removeElements(model, new Set([...deadMembers, ...deadPlates]))
  return {
    ...cascaded,
    nodes: cascaded.nodes.filter((n) => n.id !== nodeId),
    supports: cascaded.supports.filter((s) => s.node !== nodeId),
    loads: cascaded.loads.filter((l) => (l.kind === 'node' ? l.node !== nodeId : true)),
  }
}

const GAMMA_C = 24 // kN/m³

/**
 * Build the gravity load set: member SELF-WEIGHT (D, kN/m from the section),
 * slab SELF-WEIGHT + superimposed dead load (D, kPa), and live load (L, kPa).
 * Loads of other categories (e.g. seismic E) are preserved from the model.
 */
export function buildGravityLoads(model: StructuralModel, sdl: number, ll: number): StructuralModel['loads'] {
  const sec = model.sections[0]
  const wSelf = sec ? (sec.b / 1000) * (sec.h / 1000) * GAMMA_C : 0
  const kept = model.loads.filter((l) => l.cat !== 'D' && l.cat !== 'L')
  const memberSW: StructuralModel['loads'] = wSelf > 0
    ? model.members.map((m) => ({ kind: 'member-udl' as const, member: m.id, w: wSelf, cat: 'D' as const }))
    : []
  const plateLoads: StructuralModel['loads'] = model.plates.flatMap((p) => {
    const qSW = (p.thickness / 1000) * GAMMA_C
    return [
      { kind: 'area' as const, plate: p.id, q: qSW + sdl, cat: 'D' as const },
      ...(ll > 0 ? [{ kind: 'area' as const, plate: p.id, q: ll, cat: 'L' as const }] : []),
    ]
  })
  return [...memberSW, ...plateLoads, ...kept]
}
