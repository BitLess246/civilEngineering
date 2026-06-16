// ─────────────────────────────────────────────────────────────────────────
// Building-grid model generator — Phase 4 of the 3D roadmap. Produces a
// StructuralModel (engine/model.ts) for a regular frame: column grid from
// the bay lists, storeys from the height list, beams (X) + girders (Z) at
// every level, a slab per bay per level, fixed supports at the base.
// Coordinates: x = plan east, z = plan north, y = elevation (up) — matching
// the three.js viewport.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection, Node, Member, Plate, NodeSupport, MemberRole } from './model'

export interface GridSpec {
  baysX: number[]      // bay widths along x, m
  baysZ: number[]      // bay widths along z, m
  storeyH: number[]    // storey heights bottom-up, m
  /** Shorthand: one template applied to every role. */
  section?: RectSection
  /** Per-role starting templates (material + initial b×h). Every member gets
   *  its OWN section clone (id = member id) so columns, girders and beams size
   *  independently and can be grown one at a time during optimisation. Each
   *  falls back to `section` when omitted. */
  column?: RectSection
  girder?: RectSection
  beam?: RectSection
  /** Initial slab thickness for every generated panel, mm (default 150). */
  slabThickness?: number
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
  const sections: RectSection[] = []
  const colT = spec.column ?? spec.section!
  const girT = spec.girder ?? spec.section!
  const beaT = spec.beam ?? spec.section!
  // each member owns a section whose id IS the member id, cloned from the role
  // template so the three roles (and every individual member) size separately.
  const own = (tmpl: RectSection, id: string): string => {
    sections.push({ ...tmpl, id, name: `${tmpl.b}×${tmpl.h}` })
    return id
  }
  // columns between consecutive levels at every grid point
  for (let k = 0; k < ny - 1; k++)
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const id = `c${i}.${j}.${k}`
        members.push({ id, i: nodeId(i, j, k), j: nodeId(i, j, k + 1), role: 'column', section: own(colT, id) })
      }
  // beams along X and girders along Z at every elevated level
  for (let k = 1; k < ny; k++) {
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx - 1; i++) {
        const id = `bx${i}.${j}.${k}`
        members.push({ id, i: nodeId(i, j, k), j: nodeId(i + 1, j, k), role: 'beam', section: own(beaT, id) })
      }
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx; i++) {
        const id = `bz${i}.${j}.${k}`
        members.push({ id, i: nodeId(i, j, k), j: nodeId(i, j + 1, k), role: 'girder', section: own(girT, id) })
      }
  }

  const plates: Plate[] = []
  const slabT = spec.slabThickness ?? 150
  for (let k = 1; k < ny; k++)
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++)
        plates.push({
          id: `s${i}.${j}.${k}`,
          corners: [nodeId(i, j, k), nodeId(i + 1, j, k), nodeId(i + 1, j + 1, k), nodeId(i, j + 1, k)],
          role: 'slab',
          thickness: slabT,
        })

  const supports: NodeSupport[] = []
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++)
      supports.push({ node: nodeId(i, j, 0), fixity: 'fixed' })

  return {
    version: 1,
    name,
    nodes,
    sections,
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

const GAMMA_C = 24 // kN/m³, default concrete unit weight

/**
 * Build the gravity load set: member SELF-WEIGHT (D, kN/m from the section),
 * WALL self-weight on its supporting member (D, kN/m = t·h·γc), slab
 * SELF-WEIGHT + superimposed dead load (D, kPa), and live load (L, kPa).
 * Loads of other categories (e.g. seismic E) are preserved from the model.
 * `gammaC` is the concrete unit weight (kN/m³, default 24).
 */
export function buildGravityLoads(model: StructuralModel, sdl: number, ll: number, gammaC = GAMMA_C): StructuralModel['loads'] {
  const secMap = new Map(model.sections.map((s) => [s.id, s]))
  const kept = model.loads.filter((l) => l.cat !== 'D' && l.cat !== 'L')
  // member self-weight from each member's OWN section
  const memberSW: StructuralModel['loads'] = model.members
    .map((m) => {
      const sec = secMap.get(m.section) ?? model.sections[0]
      const w = sec ? (sec.b / 1000) * (sec.h / 1000) * gammaC : 0
      return { kind: 'member-udl' as const, member: m.id, w, cat: 'D' as const }
    })
    .filter((l) => l.w > 0)
  // wall self-weight as a line load on its supporting member
  const wallSW: StructuralModel['loads'] = (model.walls ?? [])
    .map((wl) => ({ kind: 'member-udl' as const, member: wl.member, w: (wl.thickness / 1000) * wl.height * gammaC, cat: 'D' as const }))
    .filter((l) => l.w > 0)
  const plateLoads: StructuralModel['loads'] = model.plates
    .filter((p) => p.role !== 'wall')
    .flatMap((p) => {
      const qSW = (p.thickness / 1000) * gammaC
      return [
        { kind: 'area' as const, plate: p.id, q: qSW + sdl, cat: 'D' as const },
        ...(ll > 0 ? [{ kind: 'area' as const, plate: p.id, q: ll, cat: 'L' as const }] : []),
      ]
    })
  return [...memberSW, ...wallSW, ...plateLoads, ...kept]
}

/**
 * Recompute member SELF-WEIGHT (member-udl, category D) from each member's
 * CURRENT section, leaving every other load untouched. No-op when the model
 * carries no member self-weight (so user models without it are not altered).
 */
export function refreshSelfWeight(model: StructuralModel, gammaC = GAMMA_C): StructuralModel {
  const hasSW = model.loads.some((l) => l.kind === 'member-udl' && l.cat === 'D')
  if (!hasSW) return model
  const secMap = new Map(model.sections.map((s) => [s.id, s]))
  const others = model.loads.filter((l) => !(l.kind === 'member-udl' && l.cat === 'D'))
  const sw: StructuralModel['loads'] = model.members
    .map((m) => {
      const sec = secMap.get(m.section) ?? model.sections[0]
      const w = sec ? (sec.b / 1000) * (sec.h / 1000) * gammaC : 0
      return { kind: 'member-udl' as const, member: m.id, w, cat: 'D' as const }
    })
    .filter((l) => l.w > 0)
  return { ...model, loads: [...sw, ...others] }
}

/**
 * Migration: ensure every member owns its OWN section (id = member id). Models
 * generated before per-member sizing shared a single section, so optimisation
 * moved them all together — splitting restores independent sizing. Idempotent.
 */
export function splitSharedSections(model: StructuralModel): StructuralModel {
  if (model.members.every((m) => m.section === m.id)) return model
  const secMap = new Map(model.sections.map((s) => [s.id, s]))
  const fallback = model.sections[0]
  const sections: RectSection[] = []
  const members = model.members.map((m) => {
    const base = secMap.get(m.section) ?? fallback
    sections.push({ ...(base ?? { fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, b: 300, h: 500 }), id: m.id, name: base ? `${base.b}×${base.h}` : '300×500' })
    return { ...m, section: m.id }
  })
  return { ...model, sections, members }
}

/**
 * Strong-column / weak-beam geometry: at every node a supporting member must be
 * at least as WIDE (cross-section b) as the members it supports, so reinforcement
 * passes through. Enforces, at each node, girder.b ≥ beam.b and column.b ≥
 * max(beam, girder).b (columns kept at least square). Widths only grow — returns
 * a new model with the bumped per-member sections. Idempotent.
 */
export function enforceSectionHierarchy(model: StructuralModel): StructuralModel {
  const sec = new Map(model.sections.map((s) => [s.id, { ...s }]))
  const secOf = (m: Member) => sec.get(m.section)
  const atNode = new Map<string, Member[]>()
  for (const m of model.members)
    for (const n of [m.i, m.j]) {
      const list = atNode.get(n); if (list) list.push(m); else atNode.set(n, [m])
    }
  const widthOf = (mem: Member[], roles: MemberRole[]) =>
    Math.max(0, ...mem.filter((m) => roles.includes(m.role)).map((m) => secOf(m)?.b ?? 0))

  for (let iter = 0; iter < 12; iter++) {
    let changed = false
    for (const mem of atNode.values()) {
      const beamW = widthOf(mem, ['beam', 'brace'])
      // girders ≥ the beams they meet
      for (const m of mem) if (m.role === 'girder') {
        const s = secOf(m)!; if (s.b < beamW) { s.b = beamW; changed = true }
      }
      const flexW = Math.max(beamW, widthOf(mem, ['girder']))
      // columns ≥ the widest beam/girder at the joint, kept square-or-taller
      for (const m of mem) if (m.role === 'column') {
        const s = secOf(m)!
        if (s.b < flexW) { s.b = flexW; changed = true }
        if (s.h < s.b) { s.h = s.b; changed = true }
      }
    }
    if (!changed) break
  }
  return { ...model, sections: model.sections.map((s) => { const u = sec.get(s.id)!; return { ...u, name: `${u.b}×${u.h}` } }) }
}
