// ─────────────────────────────────────────────────────────────────────────
// Planar (2D) pin-jointed truss: model, parametric generators (Pratt / Howe /
// Warren parallel-chord + a pitched gable roof truss) and a direct-stiffness
// solver returning member axial forces (tension +), support reactions and the
// static-determinacy check (m + r vs 2j). Members carry axial load only.
// Units: geometry m; E MPa (N/mm²); A mm²; loads & forces kN.
// ─────────────────────────────────────────────────────────────────────────
import { solveLinear, matVec } from './fem'

export interface TNode { id: string; x: number; y: number }            // m, in the truss plane
export type ChordKind = 'top' | 'bottom' | 'vertical' | 'diagonal'
export interface TMember { id: string; i: string; j: string; kind: ChordKind }
export interface TSupport { node: string; ux: boolean; uy: boolean }   // pin = both, roller(y) = uy only
export interface TLoad { node: string; fx: number; fy: number }        // kN (fy < 0 = downward)
export interface TrussModel {
  nodes: TNode[]; members: TMember[]; supports: TSupport[]; loads: TLoad[]
  E: number; A: number       // uniform material/section: MPa, mm²
}

export type TrussType = 'pratt' | 'howe' | 'warren' | 'roof'
export interface TrussSpec {
  type: TrussType
  span: number; height: number; panels: number      // m, m, count
  panelLoad: number                                   // kN downward at each top-chord node
}

const len = (a: TNode, b: TNode) => Math.hypot(b.x - a.x, b.y - a.y)

/** Parametric truss generator. Pin at the left support, roller at the right;
 *  a downward `panelLoad` is seeded at every loaded (top-chord) joint. */
export function generateTruss(spec: TrussSpec): TrussModel {
  const n = Math.max(2, Math.round(spec.panels))
  const L = spec.span, H = spec.height, p = L / n
  const nodes: TNode[] = []
  const members: TMember[] = []
  const add = (i: string, j: string, kind: ChordKind) => members.push({ id: `m${members.length}`, i, j, kind })

  const roof = spec.type === 'roof'
  const mid = n / 2
  // bottom chord b0..bn (y = 0)
  for (let i = 0; i <= n; i++) nodes.push({ id: `b${i}`, x: i * p, y: 0 })
  // top chord: parallel types get a node above every panel point; the roof
  // (gable, apex at mid-span) gets INTERIOR top nodes only — its end top nodes
  // coincide with the supports, so the top chord springs from b0 / bn.
  const topY = (i: number) => roof ? H * (1 - Math.abs(i * p - L / 2) / (L / 2)) : H
  for (let i = 0; i <= n; i++) { if (roof && (i === 0 || i === n)) continue; nodes.push({ id: `t${i}`, x: i * p, y: topY(i) }) }
  const top = (i: number) => (roof && i === 0) ? 'b0' : (roof && i === n) ? `b${n}` : `t${i}`

  // chords
  for (let i = 0; i < n; i++) add(`b${i}`, `b${i + 1}`, 'bottom')
  for (let i = 0; i < n; i++) add(top(i), top(i + 1), 'top')

  // verticals: every interior panel point (and the ends for parallel types);
  // Warren keeps full verticals so the parallel truss stays determinate.
  for (let i = 0; i <= n; i++) {
    if (roof && (i === 0 || i === n)) continue   // top coincides with the support
    add(`b${i}`, top(i), 'vertical')
  }

  // diagonals: one per panel; the roof skips the two END panels (already a
  // triangle b–b–t), keeping every generated truss statically determinate.
  for (let i = 0; i < n; i++) {
    if (roof && (i === 0 || i === n - 1)) continue
    let a: string, b: string
    if (spec.type === 'warren') { (i % 2 === 0) ? (a = `b${i}`, b = top(i + 1)) : (a = top(i), b = `b${i + 1}`) }
    else if (spec.type === 'howe') { (i < mid) ? (a = top(i), b = `b${i + 1}`) : (a = `b${i}`, b = top(i + 1)) }
    else { (i < mid) ? (a = `b${i}`, b = top(i + 1)) : (a = top(i), b = `b${i + 1}`) }   // pratt + roof
    add(a, b, 'diagonal')
  }

  const supports: TSupport[] = [
    { node: 'b0', ux: true, uy: true },          // pin
    { node: `b${n}`, ux: false, uy: true },        // roller
  ]
  // downward joint loads at the loaded chord (top chord; its end nodes coincide
  // with the supports on a roof, so load the interior top nodes there).
  const loaded = nodes.filter((nd) => nd.id.startsWith('t') && !(roof && (nd.id === 't0' || nd.id === `t${n}`)))
  const loads: TLoad[] = loaded.map((nd) => ({ node: nd.id, fx: 0, fy: -Math.abs(spec.panelLoad) }))

  return { nodes, members, supports, loads, E: 200000, A: 1500 }
}

export interface MemberForce { id: string; N: number; L: number; kind: ChordKind; i: string; j: string }
export interface Reaction { node: string; fx: number; fy: number }
export interface Determinacy { m: number; r: number; j: number; value: number; status: 'determinate' | 'indeterminate' | 'unstable' }
export interface TrussResult {
  forces: MemberForce[]
  reactions: Reaction[]
  determinacy: Determinacy
  maxTension: number; maxCompression: number      // kN (compression reported as a positive magnitude)
  stable: boolean
}

/** Direct-stiffness solve of a planar truss (2 DOF/node). */
export function solveTruss(model: TrussModel): TrussResult | null {
  const { nodes, members, supports, loads, E, A } = model
  const idx = new Map(nodes.map((nd, k) => [nd.id, k]))
  const j = nodes.length, ndof = 2 * j
  const node = (id: string) => nodes[idx.get(id)!]

  const r = supports.reduce((s, sup) => s + (sup.ux ? 1 : 0) + (sup.uy ? 1 : 0), 0)
  const value = members.length + r - 2 * j     // < 0 unstable, 0 determinate, > 0 indeterminate

  // global stiffness (N/mm), working in mm
  const K = Array.from({ length: ndof }, () => new Array(ndof).fill(0))
  const geom = members.map((mb) => {
    const a = node(mb.i), b = node(mb.j)
    const L = len(a, b)
    const Lmm = L * 1000
    const c = (b.x - a.x) / L, s = (b.y - a.y) / L
    const k = (E * A) / Lmm                    // N/mm
    const ia = idx.get(mb.i)! * 2, ib = idx.get(mb.j)! * 2
    const map = [ia, ia + 1, ib, ib + 1]
    const cc = c * c, ss = s * s, cs = c * s
    const ke = [
      [cc, cs, -cc, -cs], [cs, ss, -cs, -ss], [-cc, -cs, cc, cs], [-cs, -ss, cs, ss],
    ]
    for (let p = 0; p < 4; p++) for (let q = 0; q < 4; q++) K[map[p]][map[q]] += k * ke[p][q]
    return { mb, L, Lmm, c, s, k, map }
  })

  // load vector (N)
  const F = new Array(ndof).fill(0)
  for (const ld of loads) {
    const o = idx.get(ld.node); if (o === undefined) continue
    F[o * 2] += ld.fx * 1000
    F[o * 2 + 1] += ld.fy * 1000
  }

  // constrained DOFs
  const fixed = new Set<number>()
  for (const sup of supports) {
    const o = idx.get(sup.node); if (o === undefined) continue
    if (sup.ux) fixed.add(o * 2)
    if (sup.uy) fixed.add(o * 2 + 1)
  }
  const free = [...Array(ndof).keys()].filter((d) => !fixed.has(d))

  // reduced solve  K_ff u_f = F_f
  const Kff = free.map((a) => free.map((b) => K[a][b]))
  const Ff = free.map((d) => F[d])
  const uf = solveLinear(Kff, Ff)
  if (!uf) return { forces: [], reactions: [], determinacy: { m: members.length, r, j, value, status: 'unstable' }, maxTension: 0, maxCompression: 0, stable: false }

  const u = new Array(ndof).fill(0)
  free.forEach((d, k) => { u[d] = uf[k] })

  // member axial forces (tension +) in kN
  let maxTension = 0, maxCompression = 0
  const forces: MemberForce[] = geom.map((g) => {
    const [a, b, cc, dd] = g.map
    const elong = (u[cc] - u[a]) * g.c + (u[dd] - u[b]) * g.s   // mm
    const N = (g.k * elong) / 1000                              // kN, tension +
    if (N > maxTension) maxTension = N
    if (-N > maxCompression) maxCompression = -N
    return { id: g.mb.id, N, L: g.L, kind: g.mb.kind, i: g.mb.i, j: g.mb.j }
  })

  // reactions (kN): R = K u − F at the fixed DOFs
  const Ku = matVec(K, u)
  const reactions: Reaction[] = supports.map((sup) => {
    const o = idx.get(sup.node)!
    return {
      node: sup.node,
      fx: sup.ux ? (Ku[o * 2] - F[o * 2]) / 1000 : 0,
      fy: sup.uy ? (Ku[o * 2 + 1] - F[o * 2 + 1]) / 1000 : 0,
    }
  })

  const status: Determinacy['status'] = value < 0 ? 'unstable' : value === 0 ? 'determinate' : 'indeterminate'
  return { forces, reactions, determinacy: { m: members.length, r, j, value, status }, maxTension, maxCompression, stable: true }
}
