// ─────────────────────────────────────────────────────────────────────────
// DISPLACEMENT CONTOUR ON THE DEFORMED SHAPE — the mesh the viewport draws.
//
// The fields come from `engine/deformedShape` (each member's displacement from
// its own moment diagram, matched to the solver's nodes); this turns them into
// one coloured mesh:
//
//   · every member as a prism of its real section, following its DEFORMED
//     centreline (base + amp·disp at every station), one colour per station;
//   · every slab as a Coons patch over its deformed edge members, so the slab
//     edge IS the beam's deflected line rather than a flat quad parting from it.
//
// Displacement is continuous through every joint — a column's top moves with
// the beam it carries — so, unlike stress, this field flows across joints on its
// own; nothing here smooths it.
//
// Values are NORMALISED 0…1 per vertex (see `lib/contourMaterial`), over a
// domain in mm. Units: geometry m, section half-dims m, displacement m in,
// the domain and read-outs in mm.
// ─────────────────────────────────────────────────────────────────────────
import { defaultAxisRotation, localAxes, type F3MemberResult, type V3 } from '../engine/frame3d'
import {
  coonsDisplacement, displacementValue, edgeFromMember, isSignedDisplacement, memberDisplacement, straightEdge,
  type DisplacementKey, type EdgeField, type MemberDisplacement,
} from '../engine/deformedShape'
import type { BridgeResult } from '../engine/modelBridge'
import type { StructuralModel } from '../engine/model'
import { stressSection } from '../engine/memberStress'
import { HANGS_BELOW_NODE } from '../components/modelSpace/sceneTokens'
import { stressDomain, normalise, type Domain } from './stressScale'

/** A member to draw: its field, the section it draws with, its local roll. */
export interface DeformedMemberIn {
  field: MemberDisplacement
  /** Half the section depth (local y′) and width (local z′), m. */
  hy: number; hz: number
  rotDeg: number
  /** Node ids at its ends, to find the edge a slab sits on. */
  ni: string; nj: string
  /** How far the drawn section's centroid sits below the node, m — a beam's
   *  node is its TOP (see `levelDrop`), so its prism hangs half a depth. */
  drop?: number
}

/** A slab to draw: its four corners, CCW, and their nodal displacements. */
export interface DeformedSlabIn {
  corners: [string, string, string, string]
  pos: [V3, V3, V3, V3]
  disp: [V3, V3, V3, V3]
}

export interface DeformedGeometry {
  position: Float32Array
  /** NORMALISED value per vertex, 0–1. */
  value: Float32Array
  index: number[]
  /** Domain the values were normalised over, mm. */
  domain: Domain
}

/** Points round a rectangle's outline — 2 per side is enough for a displacement
 *  field, which is constant round the section. */
const RING: [number, number][] = [[1, 1], [1, 0], [1, -1], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]]

/** Slab patch resolution, per side. */
export const SLAB_GRID = 8

const mm = (m: number) => m * 1000

/** The member lying on a slab edge, and whether it runs the other way. */
function edgeMember(ms: readonly DeformedMemberIn[], p: string, q: string): EdgeField | null {
  for (const m of ms) {
    if (m.ni === p && m.nj === q) return edgeFromMember(m.field, false)
    if (m.ni === q && m.nj === p) return edgeFromMember(m.field, true)
  }
  return null
}

/**
 * Build the whole deformed mesh.
 *
 * `amp` multiplies displacement for DRAWING only; the colour always reads the
 * true displacement, so a legend in mm stays correct at any amplification.
 */
export function deformedGeometry(
  members: readonly DeformedMemberIn[], slabs: readonly DeformedSlabIn[], key: DisplacementKey, amp: number,
): DeformedGeometry | null {
  // One domain over everything drawn, members and slabs alike.
  const all: number[] = []
  for (const m of members) for (const d of m.field.disp) all.push(mm(displacementValue(d, key)))
  for (const s of slabs) for (const d of s.disp) all.push(mm(displacementValue(d, key)))
  if (all.length === 0) return null
  const domain = stressDomain(all, isSignedDisplacement(key))

  const pos: number[] = [], val: number[] = [], idx: number[] = []
  const put = (p: V3, d: V3) => {
    pos.push(p[0] + amp * d[0], p[1] + amp * d[1], p[2] + amp * d[2])
    val.push(normalise(mm(displacementValue(d, key)), domain))
  }

  for (const m of members) {
    const { base, disp } = m.field
    const n = base.length
    if (n < 2) continue
    const dir: V3 = [base[n - 1][0] - base[0][0], base[n - 1][1] - base[0][1], base[n - 1][2] - base[0][2]]
    if (!(Math.hypot(...dir) > 1e-9)) continue
    const [, ey, ez] = localAxes(dir, m.rotDeg)
    const R = RING.length
    const ring0 = pos.length / 3
    const dy = m.drop ?? 0
    for (let k = 0; k < n; k++) {
      for (const [a, c] of RING) {
        const oy = a * m.hy, oz = c * m.hz
        put([base[k][0] + ey[0] * oy + ez[0] * oz, base[k][1] + ey[1] * oy + ez[1] * oz - dy, base[k][2] + ey[2] * oy + ez[2] * oz], disp[k])
      }
    }
    for (let k = 0; k < n - 1; k++) {
      for (let c = 0; c < R; c++) {
        const d = (c + 1) % R
        const p0 = ring0 + k * R + c, p1 = ring0 + k * R + d, q0 = ring0 + (k + 1) * R + c, q1 = ring0 + (k + 1) * R + d
        idx.push(p0, p1, q1, p0, q1, q0)
      }
    }
    // Close both ends, so no open tube shows its inside.
    for (const k of [0, n - 1]) {
      const hub = pos.length / 3
      put([base[k][0], base[k][1] - dy, base[k][2]], disp[k])
      for (let c = 0; c < R; c++) idx.push(hub, ring0 + k * R + c, ring0 + k * R + ((c + 1) % R))
    }
  }

  for (const s of slabs) {
    const [c0, c1, c2, c3] = s.corners
    const [d0, d1, d2, d3] = s.disp
    // e0: c0→c1, e1: c1→c2, e2: c3→c2, e3: c0→c3 — the Coons contract.
    const e0 = edgeMember(members, c0, c1) ?? straightEdge(d0, d1)
    const e1 = edgeMember(members, c1, c2) ?? straightEdge(d1, d2)
    const e2 = edgeMember(members, c3, c2) ?? straightEdge(d3, d2)
    const e3 = edgeMember(members, c0, c3) ?? straightEdge(d0, d3)
    const [p0, p1, p2, p3] = s.pos
    const N = SLAB_GRID, first = pos.length / 3
    for (let j = 0; j <= N; j++) {
      const t = j / N
      for (let i = 0; i <= N; i++) {
        const u = i / N
        const P: V3 = [0, 1, 2].map((a) =>
          (1 - u) * (1 - t) * p0[a] + u * (1 - t) * p1[a] + u * t * p2[a] + (1 - u) * t * p3[a]) as V3
        put(P, coonsDisplacement(e0, e1, e2, e3, u, t))
      }
    }
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const a = first + j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1
        idx.push(a, b, d, a, d, c)
      }
    }
  }
  if (idx.length === 0) return null
  return { position: new Float32Array(pos), value: new Float32Array(val), index: idx, domain }
}

/**
 * Everything `deformedGeometry` needs, from a model and ITS analysis.
 *
 * The section properties are read from `br` — the bridge the analysis solved
 * (same cracked-section, shear-deformation and top-of-steel options), because
 * the curve between the nodes is ∬M/EI and must use the EI that produced the
 * nodal displacements it is pinned to. When the mesh cut a member into parts,
 * the parent's result is already stitched back (`stitchAnalysis`), and every
 * part carries the parent's section: the first part's properties stand for it,
 * its i-offset and its last part's j-offset for its ends.
 *
 * `d` is the analysis's DOF vector: six per node, and the model's own nodes
 * come first (`BridgeResult.meshNodeCount`), so index k is model.nodes[k].
 */
export function deformedInputs(
  model: StructuralModel, d: readonly number[], results: readonly F3MemberResult[], br: BridgeResult,
): { members: DeformedMemberIn[]; slabs: DeformedSlabIn[]; fields: MemberDisplacement[]; diagonal: number } {
  const props = new Map(br.members.map((m) => [m.id, m]))
  const parts = new Map(br.memberSplits.map((s) => [s.parent, s.parts]))
  const res = new Map(results.map((r) => [r.id, r]))
  const secs = new Map(model.sections.map((s) => [s.id, s]))
  const kOf = new Map(model.nodes.map((n, k) => [n.id, k]))
  const at = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z] as V3]))
  const dOf = (id: string): number[] | null => {
    const k = kOf.get(id)
    return k === undefined ? null : d.slice(6 * k, 6 * k + 6) as number[]
  }
  const members: DeformedMemberIn[] = [], fields: MemberDisplacement[] = []
  for (const m of model.members) {
    const fr = res.get(m.id), a = at.get(m.i), b = at.get(m.j), di = dOf(m.i), dj = dOf(m.j)
    const sp = parts.get(m.id)
    const p0 = props.get(m.id) ?? (sp ? props.get(sp[0]) : undefined)
    const pN = sp ? props.get(sp[sp.length - 1]) : p0
    const sec = secs.get(m.section)
    if (!fr || !a || !b || !di || !dj || !p0 || !sec) continue
    const dir: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
    const rotDeg = defaultAxisRotation(dir, m.axisRotation)
    const field = memberDisplacement({
      id: m.id, a, b, rotDeg, di, dj, forces: fr,
      E: p0.E, Iz: p0.Iz, Iy: p0.Iy, G: p0.G, Asy: p0.Asy, Asz: p0.Asz, offI: p0.offI, offJ: pN?.offJ,
    })
    if (!field) continue
    const ss = stressSection(sec)
    const flat = Math.abs(a[1] - b[1]) <= 1e-6
    fields.push(field)
    members.push({
      field, rotDeg, ni: m.i, nj: m.j, hy: ss.cy / 1000, hz: ss.cz / 1000,
      drop: HANGS_BELOW_NODE.has(m.role) && flat ? ss.cy / 1000 : 0,
    })
  }
  const slabs: DeformedSlabIn[] = []
  for (const p of model.plates) {
    const ps = p.corners.map((c) => at.get(c)), ds = p.corners.map((c) => dOf(c))
    if (ps.some((x) => !x) || ds.some((x) => !x)) continue
    slabs.push({
      corners: p.corners,
      pos: ps as [V3, V3, V3, V3],
      disp: ds.map((x) => [x![0], x![1], x![2]]) as [V3, V3, V3, V3],
    })
  }
  let lo: V3 = [Infinity, Infinity, Infinity], hi: V3 = [-Infinity, -Infinity, -Infinity]
  for (const n of model.nodes) {
    lo = [Math.min(lo[0], n.x), Math.min(lo[1], n.y), Math.min(lo[2], n.z)]
    hi = [Math.max(hi[0], n.x), Math.max(hi[1], n.y), Math.max(hi[2], n.z)]
  }
  const diagonal = model.nodes.length ? Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) : 0
  return { members, slabs, fields, diagonal }
}
