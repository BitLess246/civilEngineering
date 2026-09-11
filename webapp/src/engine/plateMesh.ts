// ─────────────────────────────────────────────────────────────────────────
// TURNING A MODEL PANEL INTO A MESH THE SOLVER CAN BE ACCURATE ON.
//
// `shell.ts`'s flat shell — CST membrane + DKT bending — is benchmarked against
// both Timoshenko plate closed forms and passes a constant-strain patch test.
// None of that reached the analysis, because `modelBridge` cut every panel into
// exactly TWO triangles across its c0–c2 diagonal, on the panel's own four
// corner nodes. Two triangles cannot represent sag between supports: the
// curvature is constant over each half-panel, so the element is being asked for
// a field it has no freedom to describe. The element was fine; it was never
// given a mesh.
//
// This module subdivides instead. The grid, the conforming node merge and the
// reuse of real model node ids all come from `subdivideQuadPlates`, which
// already exists and is already tested; what is here is everything that makes
// it safe to point at a USER's model rather than a benchmark:
//
//   • NODE IDENTITY. Synthetic vertex ids must not collide with a node the user
//     named. A collision does not fail loudly — it MERGES two distinct nodes
//     and welds unrelated parts of the structure together. `meshPrefix` proves
//     its prefix unused before handing it over.
//
//   • NODE ORDER. `modelBridge` builds `br.nodes` as `model.nodes.map(...)`, and
//     five call sites index the displacement vector by ARRAY POSITION against
//     one or the other list — `driftCheck`, `assessIrregularities`,
//     `displacedNodes`, `DisplacementTable` and the deflection-scale scan. Mesh
//     nodes are therefore APPENDED after the last model node and never inserted,
//     so `br.nodes[i]` keeps answering for `model.nodes[i]`.
//
//   • AREA. Each element's area is returned rather than recomputed downstream,
//     so the bridge lumps q·A/3 from the same numbers the stiffness was built
//     from and the load can never disagree with the mesh.
//
//   • EDGES. Which model members a mesh node lands on, so the bridge can split
//     them and actually attach the panel to its beams. Unattached, a subdivided
//     panel hangs off its four corners, which is WORSE than two triangles.
//
//   • OPENINGS. Cells whose centre falls in a `SlabOpening` are cut out, and
//     every node left unreferenced goes with them — an orphan carries six
//     zero-stiffness DOFs and takes the whole solve down with it, silently.
//
// UNITS: geometry m, thickness mm (converted to m at the element), E MPa.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, Plate } from './model'
import type { F3Node, F3Shell } from './frame3d'
import { subdivideQuadPlates, type V3, type QuadPlateSpec } from './shell'

export interface PlateMeshOpts {
  /** n×n cells per panel. 1 reproduces the two-triangle mesh exactly. */
  subdiv: number
  /** Shell material, from the bridge so the mesh and the frame agree. */
  E: number
  nu: number
  /** Coordinate-merge tolerance, m. */
  tol?: number
}

export interface PlateMeshResult {
  /** Mesh-only nodes, in deterministic order. APPEND after `model.nodes`. */
  nodes: F3Node[]
  shells: F3Shell[]
  /** plate id → its element ids, for area-load distribution and stress grouping. */
  elemsByPlate: Map<string, string[]>
  /** element id → area m², so the caller lumps q·A/3 from the meshed geometry. */
  areaByElem: Map<string, number>
  /** element id → its three node ids, so the caller need not re-index. */
  nodesByElem: Map<string, [string, string, string]>
  /** model member id → mesh node ids lying strictly inside it, ordered i→j. */
  edgeSplits: Map<string, string[]>
  /** Panels that were meshed (the caller skips their tributary edge loads). */
  meshedPlateIds: Set<string>
  /** Mesh cells cut out for openings. 0 on a solid panel. */
  droppedCells: number
}

const EMPTY: PlateMeshResult = {
  nodes: [], shells: [], elemsByPlate: new Map(), areaByElem: new Map(),
  nodesByElem: new Map(), edgeSplits: new Map(), meshedPlateIds: new Set(),
  droppedCells: 0,
}
/** A mesh that meshed nothing — shared, and never mutated by `meshPlates`. */
export const emptyPlateMesh = (): PlateMeshResult => EMPTY

/**
 * A synthetic-node-id prefix no existing node id starts with.
 *
 * `subdivideQuadPlates` names its interior vertices `${prefix}0`, `${prefix}1`,
 * … and merges any two vertices that resolve to the same id. If the user has a
 * node called `sv3`, the default prefix silently welds it to a slab interior
 * point. Proving the prefix unused is one pass over the node ids.
 */
export function meshPrefix(model: StructuralModel): string {
  let p = '~p'
  while (model.nodes.some((n) => n.id.startsWith(p))) p += '~'
  return p
}

const sub = (a: V3, b: V3): V3 => [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
const cross = (u: V3, v: V3): V3 =>
  [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
const norm = (u: V3) => Math.hypot(u[0], u[1], u[2])
const dot = (u: V3, v: V3) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2]
const triArea3 = (a: V3, b: V3, c: V3) => 0.5 * norm(cross(sub(a, b), sub(a, c)))

/**
 * Mesh every slab/wall panel of `model` into an n×n triangular shell grid.
 *
 * Panels whose corners are missing or which enclose no area are skipped — both
 * already carry a `meshValidation` rule, so the user has been told.
 */
export function meshPlates(model: StructuralModel, opts: PlateMeshOpts): PlateMeshResult {
  const n = Math.max(1, Math.floor(opts.subdiv))
  const tol = opts.tol ?? 1e-4
  const nm = new Map(model.nodes.map((q) => [q.id, q]))
  const pos = (id: string): V3 | null => {
    const q = nm.get(id)
    return q ? [q.x, q.y, q.z] : null
  }

  // Panels worth meshing, in model order so the output is deterministic.
  const specs: QuadPlateSpec[] = []
  const meshedPlateIds = new Set<string>()
  const byId = new Map<string, { plate: Plate; corners: [V3, V3, V3, V3] }>()
  for (const p of model.plates) {
    const c = p.corners.map(pos)
    if (c.some((q) => !q)) continue
    const [c0, c1, c2, c3] = c as [V3, V3, V3, V3]
    if (triArea3(c0, c1, c2) + triArea3(c0, c2, c3) < 1e-9) continue
    specs.push({ id: p.id, corners: [c0, c1, c2, c3], E: opts.E, nu: opts.nu, t: p.thickness })
    meshedPlateIds.add(p.id)
    byId.set(p.id, { plate: p, corners: [c0, c1, c2, c3] })
  }
  if (specs.length === 0) return emptyPlateMesh()

  // Reuse a real model node wherever the mesh lands on one. Hashing on the same
  // snapped key the subdivider uses keeps this O(1); a node the user drew at a
  // panel edge midpoint is then picked up for free and stays a single node.
  const key = (q: V3) => `${Math.round(q[0] / tol)}_${Math.round(q[1] / tol)}_${Math.round(q[2] / tol)}`
  const modelAt = new Map<string, string>()
  for (const q of model.nodes) modelAt.set(key([q.x, q.y, q.z]), q.id)
  const cornerId = (q: V3) => modelAt.get(key(q))

  const { nodes: meshNodes, elems } = subdivideQuadPlates(
    specs, n, cornerId, tol, meshPrefix(model))

  // Split the mesh nodes: those that ARE model nodes are already in the list.
  const modelIds = new Set(model.nodes.map((q) => q.id))
  const nodes: F3Node[] = meshNodes
    .filter((q) => !modelIds.has(q.id))
    .map((q) => ({ id: q.id, x: q.x, y: q.y, z: q.z }))

  const at = new Map<string, V3>(model.nodes.map((q) => [q.id, [q.x, q.y, q.z] as V3]))
  for (const q of nodes) at.set(q.id, [q.x, q.y, q.z])

  // Cells to cut out for openings, keyed `${plate}_${i}_${j}`.
  const holes = holeCells(byId, n)

  const shells: F3Shell[] = []
  const elemsByPlate = new Map<string, string[]>()
  const areaByElem = new Map<string, number>()
  const nodesByElem = new Map<string, [string, string, string]>()
  let droppedCells = 0
  const seenHole = new Set<string>()
  for (const e of elems) {
    const [a, b, c] = e.nodes.map((id) => at.get(id))
    if (!a || !b || !c) continue
    const cell = cellOf(e.id, meshedPlateIds)
    if (cell === null) continue
    const ck = `${cell.plate}_${cell.i}_${cell.j}`
    if (holes.has(ck)) {
      if (!seenHole.has(ck)) { seenHole.add(ck); droppedCells++ }
      continue                                          // both triangles, never one
    }
    shells.push({ id: e.id, nodes: e.nodes, E: e.E, nu: e.nu, t: e.t })
    areaByElem.set(e.id, triArea3(a, b, c))
    nodesByElem.set(e.id, e.nodes)
    const list = elemsByPlate.get(cell.plate)
    if (list) list.push(e.id); else elemsByPlate.set(cell.plate, [e.id])
  }

  // ORPHANS MUST GO. A node left inside a hole is referenced by no element, so
  // it carries six free DOFs with zero stiffness — `symFactor` returns null and
  // the WHOLE solve dies with no message. Dropping them before they are
  // appended also keeps the model-node prefix untouched, so nothing renumbers.
  const referenced = new Set(shells.flatMap((sh) => sh.nodes))
  const live = nodes.filter((q) => referenced.has(q.id))

  return {
    nodes: live, shells, elemsByPlate, areaByElem, nodesByElem,
    edgeSplits: findEdgeSplits(model, live, tol),
    meshedPlateIds, droppedCells,
  }
}

/**
 * Which plate and which cell an element id came from.
 *
 * `subdivideQuadPlates` names elements `${plateId}_${i}_${j}_${k}`, and a plate
 * id may itself contain underscores, so the plate is whatever is left after the
 * three trailing segments and it is only accepted if we asked for it.
 */
function cellOf(
  elemId: string, plateIds: Set<string>,
): { plate: string; i: number; j: number } | null {
  const seg = elemId.split('_')
  if (seg.length < 4) return null
  seg.pop()                                   // the 0|1 triangle within the cell
  const j = Number(seg.pop()), i = Number(seg.pop())
  const plate = seg.join('_')
  if (!Number.isInteger(i) || !Number.isInteger(j) || !plateIds.has(plate)) return null
  return { plate, i, j }
}

/**
 * The cells a panel's openings cut out, keyed `${plate}_${i}_${j}`.
 *
 * A cell is dropped when its CENTRE falls in a hole. Centre-in-hole rather than
 * any-overlap keeps Σ(dropped area) unbiased — it under-cuts on one side of the
 * boundary and over-cuts on the other, so the panel's remaining area, and with
 * it the load it carries, stays right on average instead of drifting one way.
 *
 * `SlabOpening.x`/`y` are metres from the panel's corner 0 along its two edges
 * (`model.ts`), and `bilinearQuad(c, s, u)` runs `s` from corner 0 to corner 1
 * and `u` from corner 0 to corner 3 — the same pair of edges. So a cell centre
 * at (s, u) = ((i+½)/n, (j+½)/n) is simply that fraction of each edge length,
 * with no extra geometry to get wrong.
 */
function holeCells(
  plates: Map<string, { plate: Plate; corners: [V3, V3, V3, V3] }>, n: number,
): Set<string> {
  const out = new Set<string>()
  for (const [id, { plate: p, corners: c }] of plates) {
    if (!p.openings?.length) continue
    const Lx = norm(sub(c[0], c[1])), Ly = norm(sub(c[0], c[3]))
    if (!(Lx > 0) || !(Ly > 0)) continue
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = ((i + 0.5) / n) * Lx, y = ((j + 0.5) / n) * Ly
        for (const o of p.openings) {
          const inside = o.kind === 'circle'
            ? (x - o.x) ** 2 + (y - o.y) ** 2 < (o.r ?? 0) ** 2
            : x > o.x && x < o.x + (o.w ?? 0) && y > o.y && y < o.y + (o.h ?? 0)
          if (inside) { out.add(`${id}_${i}_${j}`); break }
        }
      }
    }
  }
  return out
}

/**
 * Mesh nodes that land strictly inside a model member, ordered along i→j.
 *
 * Generic rather than "panel edges only" on purpose: a secondary beam drawn
 * across a panel picks up its mesh nodes too, which is exactly the attachment
 * you want. Bucketed by the member's bounding box so this is not a full
 * cross product on a large model.
 */
function findEdgeSplits(
  model: StructuralModel, meshNodes: F3Node[], tol: number,
): Map<string, string[]> {
  const out = new Map<string, string[]>()
  if (meshNodes.length === 0) return out
  const nm = new Map(model.nodes.map((q) => [q.id, q]))

  for (const m of model.members) {
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!a || !b) continue
    const A: V3 = [a.x, a.y, a.z], B: V3 = [b.x, b.y, b.z]
    const ab = sub(A, B)
    const L2 = dot(ab, ab)
    if (!(L2 > 1e-18)) continue
    const lo = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.min(A[2], B[2])]
    const hi = [Math.max(A[0], B[0]), Math.max(A[1], B[1]), Math.max(A[2], B[2])]

    const hits: { t: number; id: string }[] = []
    for (const q of meshNodes) {
      const P: V3 = [q.x, q.y, q.z]
      if (P[0] < lo[0] - tol || P[0] > hi[0] + tol
        || P[1] < lo[1] - tol || P[1] > hi[1] + tol
        || P[2] < lo[2] - tol || P[2] > hi[2] + tol) continue
      const ap = sub(A, P)
      const t = dot(ap, ab) / L2
      if (!(t > 1e-9) || !(t < 1 - 1e-9)) continue          // strictly interior
      // perpendicular distance from the line
      if (norm(cross(ap, ab)) / Math.sqrt(L2) > tol) continue
      hits.push({ t, id: q.id })
    }
    if (hits.length === 0) continue
    hits.sort((x, y) => x.t - y.t)
    out.set(m.id, hits.map((h) => h.id))
  }
  return out
}

