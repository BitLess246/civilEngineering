// ─────────────────────────────────────────────────────────────────────────
// CONNECTION PLATE FE — a plane-stress finite-element model of one plate.
//
// The shear tab or gusset as designed: its outline, its bolt holes, welded
// along its support edges, loaded by the bolt forces (bearing on each hole's
// loaded half, cosine-distributed) or by the weld lines of a slotted brace.
// Linear elastic; the field is what the contour plots, beside the code checks
// — the checks decide pass/fail, the field shows where the plate works.
//
// Mesh   a grid of h-sized cells over the plate: a cell is kept when its
//        centre or any corner lies in the plate; the nodes a kept cell has
//        outside it, or within h/4 of its edge, are moved onto the nearest
//        edge point, so the free edges are traced, not stair-stepped, and a
//        cell whose corners collapse becomes a triangle. A plate with bolt
//        holes is instead blocked out and each hole O-gridded (rings graded
//        toward it), which traces the hole exactly and converges on Kirsch.
// Elems  quadrilaterals with Wilson's incompatible modes (Q6, with Taylor's
//        centre-Jacobian correction so the patch test passes) — a Q4 locks in
//        bending and a tab is a short cantilever; triangles are CST.
//        Stresses at the element centre, where Q6 is most accurate.
// Solve  sparse symmetric assembly, RCM-ordered skyline LDLᵀ (`fem.ts`).
//
// Units: mm, N, MPa.
// ─────────────────────────────────────────────────────────────────────────
import { sparseSym, sparseAdd } from './sparseSym'
import { skylineFactorSparse, skylineSolve, rcmOrderSparse } from './fem'

export type Pt = [number, number]

export interface PlateHole { x: number; y: number; d: number }

export type PlateLoad =
  /** A bolt bearing on hole `hole`: force on the PLATE, N. */
  | { kind: 'hole'; hole: number; Fx: number; Fy: number }
  /** A force spread evenly over the nodes along a line in the plate, N. */
  | { kind: 'line'; a: Pt; b: Pt; Fx: number; Fy: number }

export interface PlateSupport {
  /** A welded edge: every node on segment a→b is held. */
  a: Pt; b: Pt
  /** Which displacements are held (default both). */
  fix?: 'xy' | 'x' | 'y'
}

export interface PlateFEInput {
  outline: Pt[]
  holes?: PlateHole[]
  t: number
  Fy: number
  E?: number; nu?: number
  /** Target element size, mm (default: the plate's larger side / 48, finer round holes). */
  h?: number
  supports: PlateSupport[]
  /** Single nodes held (the node nearest `at`) — to remove rigid-body modes in tests. */
  pins?: { at: Pt; fix: 'x' | 'y' | 'xy' }[]
  loads: PlateLoad[]
}

export interface PlateElem {
  nodes: number[]                // 4 (quad) or 3 (triangle), counter-clockwise
  area: number
  sx: number; sy: number; txy: number; vm: number   // MPa, at the centre
}

export interface PlateFEResult {
  nodes: Pt[]
  elems: PlateElem[]
  /** Nodal von Mises, the mean of the elements meeting there. */
  nodalVm: number[]
  hx: number; hy: number
  maxVm: number; maxAt: Pt
  /** Area-weighted mean von Mises over the plate. */
  meanVm: number
  /** Share of the plate's area above Fy (linear-elastic: where it would
   *  yield), by each element's mean nodal value — what the contour colours. */
  yieldFrac: number
  /** Σ applied loads and Σ support reactions, N — equal and opposite — and
   *  their moments about the origin, N·mm. */
  applied: Pt; reaction: Pt
  appliedM: number; reactionM: number
  /** Meshed area against the plate's own (outline − holes), mm². */
  area: number; areaExact: number
}

const insidePoly = (p: Pt, poly: Pt[]): boolean => {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j]
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

const projSeg = (p: Pt, a: Pt, b: Pt): Pt => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0
  return [a[0] + t * dx, a[1] + t * dy]
}
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

export const polygonArea = (poly: Pt[]): number =>
  Math.abs(poly.reduce((s, p, k) => { const q = poly[(k + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)) / 2

/** Plane-stress constitutive matrix. */
function dMatrix(E: number, nu: number): number[][] {
  const c = E / (1 - nu * nu)
  return [[c, c * nu, 0], [c * nu, c, 0], [0, 0, (c * (1 - nu)) / 2]]
}

/** CST stiffness (6×6) and its constant B. */
function cst(p: Pt[], D: number[][], t: number): { K: number[][]; B: number[][]; A: number } {
  const [[x1, y1], [x2, y2], [x3, y3]] = p
  const A2 = (x2 - x1) * (y3 - y1) - (x3 - x1) * (y2 - y1)
  const b = [y2 - y3, y3 - y1, y1 - y2], c = [x3 - x2, x1 - x3, x2 - x1]
  const B = [0, 1, 2].map(() => new Array(6).fill(0))
  for (let i = 0; i < 3; i++) {
    B[0][2 * i] = b[i] / A2; B[1][2 * i + 1] = c[i] / A2
    B[2][2 * i] = c[i] / A2; B[2][2 * i + 1] = b[i] / A2
  }
  return { K: btdb(B, D, (t * A2) / 2), B, A: A2 / 2 }
}

/** Bᵀ·D·B·w, added into `into` (or a fresh matrix). */
function btdb(B: number[][], D: number[][], w: number, into?: number[][]): number[][] {
  const n = B[0].length
  const K = into ?? Array.from({ length: n }, () => new Array(n).fill(0))
  const DB = D.map((r) => Array.from({ length: n }, (_, j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]))
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i][j] += w * (B[0][i] * DB[0][j] + B[1][i] * DB[1][j] + B[2][i] * DB[2][j])
  return K
}

/** Q6 (Wilson–Taylor incompatible modes), condensed to 8×8; the centre B
 *  (where the incompatible modes contribute nothing) for stress recovery. */
function q6(p: Pt[], D: number[][], t: number): { K: number[][]; B0: number[][]; A: number; Bg: number[][][]; G: number[][] } | null {
  const xi = [-1, 1, 1, -1], eta = [-1, -1, 1, 1]
  const jac = (s: number, r: number) => {
    let J11 = 0, J12 = 0, J21 = 0, J22 = 0
    for (let k = 0; k < 4; k++) {
      const dNs = (xi[k] * (1 + eta[k] * r)) / 4, dNr = (eta[k] * (1 + xi[k] * s)) / 4
      J11 += dNs * p[k][0]; J12 += dNs * p[k][1]; J21 += dNr * p[k][0]; J22 += dNr * p[k][1]
    }
    return { J11, J12, J21, J22, det: J11 * J22 - J12 * J21 }
  }
  const J0 = jac(0, 0)
  if (!(J0.det > 0)) return null
  const Bat = (s: number, r: number, Jc: ReturnType<typeof jac>, incompat: boolean): number[][] => {
    const n = incompat ? 2 : 4
    const B = [0, 1, 2].map(() => new Array(2 * n).fill(0))
    const inv = [[Jc.J22 / Jc.det, -Jc.J12 / Jc.det], [-Jc.J21 / Jc.det, Jc.J11 / Jc.det]]
    const dN: [number, number][] = incompat
      ? [[-2 * s, 0], [0, -2 * r]]
      : [0, 1, 2, 3].map((k) => [(xi[k] * (1 + eta[k] * r)) / 4, (eta[k] * (1 + xi[k] * s)) / 4])
    dN.forEach(([ds, dr], k) => {
      const dx = inv[0][0] * ds + inv[0][1] * dr, dy = inv[1][0] * ds + inv[1][1] * dr
      B[0][2 * k] = dx; B[1][2 * k + 1] = dy; B[2][2 * k] = dy; B[2][2 * k + 1] = dx
    })
    return B
  }
  const g = 1 / Math.sqrt(3)
  const K12 = Array.from({ length: 12 }, () => new Array(12).fill(0))
  let A = 0
  // the Gauss points in NODE order (the point nearest node k is k), so the
  // stresses there extrapolate to the corners
  const Bg: number[][][] = []
  for (let k = 0; k < 4; k++) {
    const s = xi[k] * g, r = eta[k] * g
    const J = jac(s, r)
    if (!(J.det > 0)) return null
    A += J.det
    const Bc = Bat(s, r, J, false)
    // Taylor: the incompatible modes' derivatives through the CENTRE Jacobian,
    // weighted by det J0 — so a constant-strain patch is reproduced exactly
    const Bi = Bat(s, r, J0, true)
    const B = Bc.map((row, m) => [...row, ...Bi[m].map((v) => (v * J0.det) / J.det)])
    Bg.push(B)
    btdb(B, D, t * J.det, K12)
  }
  // condense the four internal DOFs
  const Kcc = K12.slice(0, 8).map((r) => r.slice(0, 8))
  const Kci = K12.slice(0, 8).map((r) => r.slice(8))
  const Kii = K12.slice(8).map((r) => r.slice(8))
  const inv = invert4(Kii)
  if (!inv) return null
  const KciInv = Kci.map((row) => [0, 1, 2, 3].map((j) => row.reduce((s, v, k) => s + v * inv[k][j], 0)))
  const K = Kcc.map((row, i) => row.map((v, j) => v - KciInv[i].reduce((s, w, k) => s + w * Kci[j][k], 0)))
  // the internal modes from the nodal displacements: α = −Kii⁻¹·Kic·u
  const G = [0, 1, 2, 3].map((i) => Array.from({ length: 8 }, (_, j) => -inv[i].reduce((s, v, k) => s + v * Kci[j][k], 0)))
  return { K, B0: Bat(0, 0, J0, false), A, Bg, G }
}

function invert4(M: number[][]): number[][] | null {
  const n = M.length
  const a = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r][c]) > Math.abs(a[p][c])) p = r
    if (Math.abs(a[p][c]) < 1e-300) return null
    ;[a[c], a[p]] = [a[p], a[c]]
    const d = a[c][c]
    for (let j = 0; j < 2 * n; j++) a[c][j] /= d
    for (let r = 0; r < n; r++) if (r !== c) { const f = a[r][c]; for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[c][j] }
  }
  return a.map((r) => r.slice(n))
}

const vonMises = (sx: number, sy: number, txy: number) => Math.sqrt(sx * sx - sx * sy + sy * sy + 3 * txy * txy)

interface Mesh { nodes: Pt[]; cells: number[][] }

/** Nodes deduplicated by position, cells counter-clockwise. */
function meshBuilder() {
  const nodes: Pt[] = [], cells: number[][] = []
  const keyOf = new Map<string, number>()
  const node = (p: Pt) => {
    const key = `${Math.round(p[0] * 1e4)},${Math.round(p[1] * 1e4)}`
    let id = keyOf.get(key)
    if (id == null) { id = nodes.length; nodes.push(p); keyOf.set(key, id) }
    return id
  }
  const cell = (ids: number[]) => {
    const A = ids.reduce((s, k, i) => { const q = nodes[ids[(i + 1) % ids.length]]; return s + nodes[k][0] * q[1] - q[0] * nodes[k][1] }, 0)
    cells.push(A < 0 ? [...ids].reverse() : ids)
  }
  return { nodes, cells, node, cell }
}

/** A plate with no holes: grid cells whose centres lie inside, the nodes
 *  outside (or within h/4 of the edge) moved onto the nearest edge point. */
function meshPolygon(
  poly: Pt[], nx: number, ny: number, hx: number, hy: number,
  inPlate: (p: Pt) => boolean, nearestBoundary: (p: Pt) => { q: Pt; d: number }, h: number, strict: boolean,
): Mesh {
  const x0 = Math.min(...poly.map((p) => p[0])), y0 = Math.min(...poly.map((p) => p[1]))
  const m = meshBuilder()
  const at = new Map<number, number>()
  const nodeAt = (i: number, j: number) => {
    const g = j * (nx + 1) + i
    let id = at.get(g)
    if (id == null) {
      const p: Pt = [x0 + i * hx, y0 + j * hy]
      const nb = nearestBoundary(p)
      id = m.node(!inPlate(p) || nb.d < h / 4 ? nb.q : p)
      at.set(g, id)
    }
    return id
  }
  // a cell is kept when its centre, or two of its corners, lie inside: its
  // outside corners then sit on the edge, so a cut corner becomes a triangle
  // rather than a notch. Two, not one — a cell kept for a single corner would
  // hang off the mesh by one node, a mechanism.
  const ins = (i: number, j: number) => (inPlate([x0 + i * hx, y0 + j * hy]) ? 1 : 0)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    if (!inPlate([x0 + (i + 0.5) * hx, y0 + (j + 0.5) * hy]) && (strict || ins(i, j) + ins(i + 1, j) + ins(i + 1, j + 1) + ins(i, j + 1) < 2)) continue
    m.cell([nodeAt(i, j), nodeAt(i + 1, j), nodeAt(i + 1, j + 1), nodeAt(i, j + 1)])
  }
  return m
}

/** A rectangular plate with bolt holes: a tensor grid of blocks, each hole
 *  in a square block of side s meshed as an O-grid — rings graded toward
 *  the hole, spokes from the hole to the block's boundary nodes — and the
 *  blocks between them structured. Every hole edge is traced exactly. */
function meshRectWithHoles(x0: number, y0: number, x1: number, y1: number, holes: PlateHole[], h: number): Mesh | null {
  // the block side: no more than the room to the plate's edges and between holes
  let s = Math.min(...holes.map((o) => Math.min(4 * o.d, 2 * (o.x - x0), 2 * (x1 - o.x), 2 * (o.y - y0), 2 * (y1 - o.y))))
  for (let i = 0; i < holes.length; i++) for (let j = i + 1; j < holes.length; j++) {
    const dx = Math.abs(holes[i].x - holes[j].x), dy = Math.abs(holes[i].y - holes[j].y)
    if (dx > 1e-6) s = Math.min(s, dx)
    if (dy > 1e-6) s = Math.min(s, dy)
  }
  if (!(s > 1.15 * Math.max(...holes.map((o) => o.d)))) return null
  const lines = (lo: number, hi: number, cs: number[]) =>
    [...new Set([lo, hi, ...cs.flatMap((c) => [c - s / 2, c + s / 2])].map((v) => Math.round(v * 1e6) / 1e6))].sort((a, b) => a - b)
  const X = lines(x0, x1, holes.map((o) => o.x)), Y = lines(y0, y1, holes.map((o) => o.y))
  const nb = Math.max(8, 2 * Math.round(s / h / 2))       // divisions of a block side (even)
  const div = (L: number) => (Math.abs(L - s) < 1e-6 ? nb : Math.max(1, Math.round(L / h)))
  const coords = (V: number[]) => V.slice(0, -1).map((v, k) => {
    const n = div(V[k + 1] - v)
    return Array.from({ length: n + 1 }, (_, q) => v + ((V[k + 1] - v) * q) / n)
  })
  const cx = coords(X), cy = coords(Y)
  const m = meshBuilder()
  for (let a = 0; a < cx.length; a++) for (let b = 0; b < cy.length; b++) {
    const xs = cx[a], ys = cy[b]
    const hole = holes.find((o) => o.x > xs[0] && o.x < xs[xs.length - 1] && o.y > ys[0] && o.y < ys[ys.length - 1])
    if (!hole) {
      for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < xs.length - 1; i++) {
        m.cell([m.node([xs[i], ys[j]]), m.node([xs[i + 1], ys[j]]), m.node([xs[i + 1], ys[j + 1]]), m.node([xs[i], ys[j + 1]])])
      }
      continue
    }
    // the block's boundary, counter-clockwise from its lower-left corner
    const n = xs.length - 1
    const ring: Pt[] = [
      ...xs.slice(0, n).map((x): Pt => [x, ys[0]]),
      ...ys.slice(0, n).map((y): Pt => [xs[n], y]),
      ...xs.slice(1).reverse().map((x): Pt => [x, ys[n]]),
      ...ys.slice(1).reverse().map((y): Pt => [xs[0], y]),
    ]
    const r = hole.d / 2
    const nr = Math.max(4, Math.round(((s / 2 - r) / h) * 1.3))
    const q = 1.15                                              // ring growth: thin rings at the hole
    const f = (k: number) => (q ** k - 1) / (q ** nr - 1)
    const pts = ring.map((P) => {
      const d = Math.hypot(P[0] - hole.x, P[1] - hole.y)
      const C: Pt = [hole.x + ((P[0] - hole.x) * r) / d, hole.y + ((P[1] - hole.y) * r) / d]
      return Array.from({ length: nr + 1 }, (_, k) => m.node(k === nr ? P : [C[0] + f(k) * (P[0] - C[0]), C[1] + f(k) * (P[1] - C[1])]))
    })
    for (let i = 0; i < ring.length; i++) {
      const A = pts[i], B = pts[(i + 1) % ring.length]
      for (let k = 0; k < nr; k++) m.cell([A[k], B[k], B[k + 1], A[k + 1]])
    }
  }
  return m
}

/** `strict` meshes a hole-free plate by cell centres alone — the fallback when
 *  a boundary cell kept for its corners leaves the stiffness singular. */
export function solvePlateFE(inp: PlateFEInput, strict = false): PlateFEResult | null {
  const E = inp.E ?? 200000, nu = inp.nu ?? 0.3, t = inp.t
  const holes = inp.holes ?? []
  const poly = inp.outline
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1])
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
  const W = x1 - x0, H = y1 - y0
  const hTarget = inp.h ?? Math.min(Math.max(W, H) / 48, ...holes.map((o) => o.d / 5))
  const nx = Math.max(2, Math.round(W / hTarget)), ny = Math.max(2, Math.round(H / hTarget))
  const hx = W / nx, hy = H / ny, h = Math.min(hx, hy)

  const inHole = (p: Pt) => holes.some((o) => dist(p, [o.x, o.y]) < o.d / 2 - 1e-9)
  const inPlate = (p: Pt) => insidePoly(p, poly) && !inHole(p)
  // the nearest point on the plate's boundary, and how far it is
  const nearestBoundary = (p: Pt): { q: Pt; d: number } => {
    let best: Pt = p, bd = Infinity
    for (let k = 0; k < poly.length; k++) {
      const q = projSeg(p, poly[k], poly[(k + 1) % poly.length]), d = dist(p, q)
      if (d < bd) { bd = d; best = q }
    }
    for (const o of holes) {
      const c: Pt = [o.x, o.y], r = dist(p, c)
      const q: Pt = r > 1e-12 ? [o.x + ((p[0] - o.x) * o.d) / 2 / r, o.y + ((p[1] - o.y) * o.d) / 2 / r] : [o.x + o.d / 2, o.y]
      const d = Math.abs(r - o.d / 2)
      if (d < bd) { bd = d; best = q }
    }
    return { q: best, d: bd }
  }

  // ── mesh ────────────────────────────────────────────────────────────────
  const mesh = holes.length ? meshRectWithHoles(x0, y0, x1, y1, holes, hTarget) : meshPolygon(poly, nx, ny, hx, hy, inPlate, nearestBoundary, h, strict)
  if (!mesh) return null
  const nodes = mesh.nodes
  const D = dMatrix(E, nu)
  type Built = { nodes: number[]; K: number[][]; B: number[][]; A: number; Bg?: number[][][]; G?: number[][] }
  const built: Built[] = []
  for (const c of mesh.cells) {
    let ids = c
    // corners that collapsed onto one point: a triangle
    ids = ids.filter((v, k) => v !== ids[(k + 1) % ids.length])
    if (ids.length === 4) {
      const e = q6(ids.map((k) => nodes[k]), D, t)
      if (e) { built.push({ nodes: ids, K: e.K, B: e.B0, A: e.A, Bg: e.Bg, G: e.G }); continue }
      // a distorted quad: split on its better diagonal
      const tri = [[ids[0], ids[1], ids[2]], [ids[0], ids[2], ids[3]]]
      for (const tr of tri) {
        const e3 = cst(tr.map((k) => nodes[k]), D, t)
        if (e3.A > 1e-9 * h * h) built.push({ nodes: tr, K: e3.K, B: e3.B, A: e3.A })
      }
    } else if (ids.length === 3) {
      const e3 = cst(ids.map((k) => nodes[k]), D, t)
      if (e3.A > 1e-9 * h * h) built.push({ nodes: ids, K: e3.K, B: e3.B, A: e3.A })
    }
  }
  if (!built.length) return null

  /** The element containing p and its shape-function weights at p. */
  // elements bucketed by the grid cells their bounding boxes touch
  const bucket = new Map<number, number[]>()
  const cellOf = (x: number, y: number) => Math.floor((y - y0) / hy) * (nx + 2) + Math.floor((x - x0) / hx)
  built.forEach((e, idx) => {
    const q = e.nodes.map((k) => nodes[k])
    const i0 = Math.floor((Math.min(...q.map((v) => v[0])) - x0) / hx - 1e-9), i1 = Math.floor((Math.max(...q.map((v) => v[0])) - x0) / hx + 1e-9)
    const j0 = Math.floor((Math.min(...q.map((v) => v[1])) - y0) / hy - 1e-9), j1 = Math.floor((Math.max(...q.map((v) => v[1])) - y0) / hy + 1e-9)
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const key = j * (nx + 2) + i
      const list = bucket.get(key)
      if (list) list.push(idx); else bucket.set(key, [idx])
    }
  })
  const locate = (p: Pt): [number, number][] | null => {
    for (const idx of bucket.get(cellOf(p[0], p[1])) ?? []) {
      const e = built[idx]
      const q = e.nodes.map((k) => nodes[k])
      if (p[0] < Math.min(...q.map((v) => v[0])) - 1e-9 || p[0] > Math.max(...q.map((v) => v[0])) + 1e-9
        || p[1] < Math.min(...q.map((v) => v[1])) - 1e-9 || p[1] > Math.max(...q.map((v) => v[1])) + 1e-9) continue
      if (q.length === 3) {
        const [[x1, y1], [x2, y2], [x3, y3]] = q
        const d = (y2 - y3) * (x1 - x3) + (x3 - x2) * (y1 - y3)
        const l1 = ((y2 - y3) * (p[0] - x3) + (x3 - x2) * (p[1] - y3)) / d
        const l2 = ((y3 - y1) * (p[0] - x3) + (x1 - x3) * (p[1] - y3)) / d
        const l3 = 1 - l1 - l2
        if (Math.min(l1, l2, l3) < -1e-9) continue
        return [[e.nodes[0], l1], [e.nodes[1], l2], [e.nodes[2], l3]]
      }
      // invert the bilinear map by Newton
      const xi = [-1, 1, 1, -1], eta = [-1, -1, 1, 1]
      let s = 0, r = 0
      for (let it = 0; it < 20; it++) {
        let x = 0, y = 0, a = 0, b = 0, c = 0, d = 0
        for (let k = 0; k < 4; k++) {
          const N = ((1 + xi[k] * s) * (1 + eta[k] * r)) / 4
          const Ns = (xi[k] * (1 + eta[k] * r)) / 4, Nr = (eta[k] * (1 + xi[k] * s)) / 4
          x += N * q[k][0]; y += N * q[k][1]
          a += Ns * q[k][0]; b += Nr * q[k][0]; c += Ns * q[k][1]; d += Nr * q[k][1]
        }
        const det = a * d - b * c, ex = p[0] - x, ey = p[1] - y
        if (Math.abs(det) < 1e-300) break
        const ds = (d * ex - b * ey) / det, dr = (-c * ex + a * ey) / det
        s += ds; r += dr
        if (Math.abs(ds) + Math.abs(dr) < 1e-12) break
      }
      if (Math.abs(s) > 1 + 1e-7 || Math.abs(r) > 1 + 1e-7) continue
      return e.nodes.map((k, i) => [k, ((1 + xi[i] * s) * (1 + eta[i] * r)) / 4] as [number, number])
    }
    return null
  }

  // ── supports and loads ──────────────────────────────────────────────────
  const ndof = 2 * nodes.length
  const fixed = new Uint8Array(ndof)
  // a node no element kept (its cell collapsed to nothing) carries nothing:
  // held, so it does not leave a zero pivot
  const referenced = new Uint8Array(nodes.length)
  for (const e of built) for (const k of e.nodes) referenced[k] = 1
  referenced.forEach((r, k) => { if (!r) { fixed[2 * k] = 1; fixed[2 * k + 1] = 1 } })
  const tol = h * 0.02
  for (const s of inp.supports) {
    nodes.forEach((p, k) => {
      if (dist(p, projSeg(p, s.a, s.b)) > tol) return
      if (s.fix !== 'y') fixed[2 * k] = 1
      if (s.fix !== 'x') fixed[2 * k + 1] = 1
    })
  }
  for (const pin of inp.pins ?? []) {
    let k = 0, bd = Infinity
    nodes.forEach((p, i) => { const d = dist(p, pin.at); if (d < bd) { bd = d; k = i } })
    if (pin.fix !== 'y') fixed[2 * k] = 1
    if (pin.fix !== 'x') fixed[2 * k + 1] = 1
  }
  const F = new Array(ndof).fill(0)
  const applied: Pt = [0, 0]
  let appliedM = 0
  for (const ld of inp.loads) {
    applied[0] += ld.Fx; applied[1] += ld.Fy
    let ws: [number, number][]
    if (ld.kind === 'hole') {
      const o = holes[ld.hole]
      if (!o) continue
      const fm = Math.hypot(ld.Fx, ld.Fy)
      const ring = nodes.map((p, k) => [k, p] as const).filter(([, p]) => Math.abs(dist(p, [o.x, o.y]) - o.d / 2) < tol)
      // the bolt bears on the half of the hole the force points into: cos θ
      ws = ring.map(([k, p]) => [k, fm > 0 ? Math.max(0, ((p[0] - o.x) * ld.Fx + (p[1] - o.y) * ld.Fy) / ((o.d / 2) * fm)) : 1])
    } else {
      // consistent: the line sampled at midpoints of 64·(its length / h)
      // equal pieces, each piece's share given to the element it lies in by
      // that element's shape functions
      const L = dist(ld.a, ld.b), m = Math.max(64, Math.ceil((64 * L) / h))
      const acc = new Map<number, number>()
      for (let q = 0; q < m; q++) {
        const f = (q + 0.5) / m
        const at = locate([ld.a[0] + f * (ld.b[0] - ld.a[0]), ld.a[1] + f * (ld.b[1] - ld.a[1])])
        if (!at) continue
        at.forEach(([k, w]) => acc.set(k, (acc.get(k) ?? 0) + w / m))
      }
      ws = [...acc]
    }
    const sw = ws.reduce((s, [, w]) => s + w, 0)
    if (!(sw > 0)) return null
    for (const [k, w] of ws) {
      const fx = (ld.Fx * w) / sw, fy = (ld.Fy * w) / sw
      F[2 * k] += fx; F[2 * k + 1] += fy
      appliedM += nodes[k][0] * fy - nodes[k][1] * fx
    }
  }

  // ── assemble, solve ─────────────────────────────────────────────────────
  const freeOf = new Int32Array(ndof).fill(-1)
  let nf = 0
  for (let d = 0; d < ndof; d++) if (!fixed[d]) freeOf[d] = nf++
  const K = sparseSym(nf)
  const dofs = (e: Built) => e.nodes.flatMap((k) => [2 * k, 2 * k + 1])
  for (const e of built) {
    const m = dofs(e)
    for (let i = 0; i < m.length; i++) {
      const fi = freeOf[m[i]]
      if (fi < 0) continue
      for (let j = 0; j < m.length; j++) { const fj = freeOf[m[j]]; if (fj >= 0) sparseAdd(K, fi, fj, e.K[i][j]) }
    }
  }
  const fac = skylineFactorSparse(K, rcmOrderSparse(K))
  if (!fac) return strict || holes.length ? null : solvePlateFE(inp, true)
  const df = skylineSolve(fac, Array.from({ length: ndof }, (_, d) => d).filter((d) => freeOf[d] >= 0).map((d) => F[d]))
  const u = new Array(ndof).fill(0)
  for (let d = 0; d < ndof; d++) if (freeOf[d] >= 0) u[d] = df[freeOf[d]]

  // ── stresses, reactions ─────────────────────────────────────────────────
  const R = new Array(ndof).fill(0)
  const sig = (B: number[][], v: number[]) => {
    const eps = B.map((row) => row.reduce((s, b, j) => s + b * v[j], 0))
    return D.map((row) => row[0] * eps[0] + row[1] * eps[1] + row[2] * eps[2])
  }
  // nodal stress components: each element's corner values summed, then averaged
  const nsum = Array.from({ length: nodes.length }, () => [0, 0, 0]), ncnt = new Array(nodes.length).fill(0)
  const r3 = Math.sqrt(3)
  const elems: PlateElem[] = built.map((e) => {
    const m = dofs(e), ue = m.map((d) => u[d])
    for (let i = 0; i < m.length; i++) if (fixed[m[i]]) R[m[i]] += e.K[i].reduce((s, v, j) => s + v * ue[j], 0)
    const [sx, sy, txy] = sig(e.B, ue)
    let corners: number[][]
    if (e.Bg && e.G) {
      const alpha = e.G.map((row) => row.reduce((s, v, j) => s + v * ue[j], 0))
      const full = [...ue, ...alpha]
      const gp = e.Bg.map((B) => sig(B, full))
      // extrapolate the 2×2 Gauss values to the corners: node k sits at
      // (√3·ξk, √3·ηk) in the Gauss points' own bilinear frame
      const xi = [-1, 1, 1, -1], eta = [-1, -1, 1, 1]
      corners = [0, 1, 2, 3].map((k) => [0, 1, 2].map((c) => gp.reduce((s, sg, q) =>
        s + ((1 + xi[q] * xi[k] * r3) * (1 + eta[q] * eta[k] * r3)) / 4 * sg[c], 0)))
    } else corners = e.nodes.map(() => [sx, sy, txy])
    e.nodes.forEach((k, i) => { for (let c = 0; c < 3; c++) nsum[k][c] += corners[i][c]; ncnt[k]++ })
    return { nodes: e.nodes, area: e.A, sx, sy, txy, vm: vonMises(sx, sy, txy) }
  })
  const reaction: Pt = [0, 0]
  let reactionM = 0
  for (let d = 0; d < ndof; d++) if (fixed[d]) {
    const r = R[d] - F[d], p = nodes[d >> 1]
    reaction[d % 2] += r
    reactionM += d % 2 ? p[0] * r : -p[1] * r
  }
  const nodalVm = nsum.map((v, k) => (ncnt[k] ? vonMises(v[0] / ncnt[k], v[1] / ncnt[k], v[2] / ncnt[k]) : 0))
  let maxVm = 0, maxAt: Pt = [0, 0], area = 0, vmA = 0, yA = 0
  nodalVm.forEach((v, k) => { if (v > maxVm) { maxVm = v; maxAt = nodes[k] } })
  for (const e of elems) {
    area += e.area; vmA += e.vm * e.area
    // above Fy by the same measure the contour colours: the element's mean nodal value
    if (e.nodes.reduce((t, k) => t + nodalVm[k], 0) / e.nodes.length > inp.Fy) yA += e.area
  }
  const areaExact = polygonArea(poly) - holes.reduce((s, o) => s + (Math.PI * o.d * o.d) / 4, 0)
  return { nodes, elems, nodalVm, hx, hy, maxVm, maxAt, meanVm: vmA / area, yieldFrac: yA / area, applied, reaction, appliedM, reactionM, area, areaExact }
}
