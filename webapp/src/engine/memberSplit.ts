// ─────────────────────────────────────────────────────────────────────────
// ATTACHING THE PLATE MESH TO THE FRAME THAT CARRIES IT.
//
// A subdivided panel is only worth having if it is HELD. With the mesh alone,
// the interior and edge nodes share no DOF with the edge beams: the panel hangs
// off its four corners, its deflection explodes, and its load walks to the
// corner columns instead of the beams. That is worse than the two triangles it
// replaced, which is why the mesh defaults to 1 until this module exists.
//
// THE FIX IS TO SPLIT THE MEMBERS, NOT TO CONSTRAIN THE NODES. `frame3d`'s
// diaphragm machinery is a general linear-MPC facility and could express an
// edge node as an interpolation of the two beam ends — cheaper, and member
// identity survives. It is the wrong answer here: `postprocessMember` builds a
// member's internal-force diagram from its END FORCES plus its own load list,
// and a constraint's transferred force never enters that list. The end forces
// would be right and the SPAN MOMENT wrong — which is precisely the number the
// beam design reads. Transferring load only (put the node forces on the beam as
// point loads) is worse still: the edge node stays free, so the plate deflects
// as though unsupported.
//
// So a beam that carries mesh nodes becomes a chain of collinear sub-members,
// and the solver's per-part results are stitched back onto the parent id before
// anything downstream sees them. Everything here is pure: no solver change, and
// nothing outside this file needs to know a member was ever split.
//
// UNITS: geometry m, forces kN, moments kN·m — unchanged from `frame3d`.
// ─────────────────────────────────────────────────────────────────────────
import type { F3Node, F3Member, F3Load, F3Result, F3MemberResult, F3Analysis } from './frame3d'
import type { AxialMode } from './axialOnly'

/** How one parent member was cut. `parts` are in i→j order. */
export interface SplitMap {
  parent: string
  parts: string[]
  /** Part lengths, m, in the same order — they sum to the parent's length. */
  lengths: number[]
}

/** Sub-member id for part `k` of `parent`. `#` is not produced by the model
 *  builder or by the mesher, so a split id cannot collide with a real one. */
export const partId = (parent: string, k: number) => `${parent}#${k}`

/**
 * Cut every member named in `splits` at the given interior nodes.
 *
 * `splits` is `BridgeResult.edgeSplits`: parent member id → mesh node ids on it,
 * already ordered i→j. Members not named are returned untouched, so a model
 * with no mesh passes straight through and `map` comes back empty.
 *
 * Releases and offsets are placed so the chain behaves as the single member did:
 *   • `relI` only on the first part, `relJ` only on the last — interior ends
 *     stay continuous, or the beam would develop a hinge at every mesh node.
 *   • `offI`/`offJ` likewise on the outer ends ONLY when they are rigid end
 *     zones. A `beamTopOfSteel` drop is different in kind: it is a translation
 *     of the whole member's axis below the node line, so every interior end
 *     carries it too — that arm from the slab-level mesh node down to the beam
 *     centroid IS the physical connection. The caller says which it has.
 */
export function splitMembers(
  members: F3Member[], nodes: F3Node[], splits: Map<string, string[]>,
  opts: { interiorOffset?: (m: F3Member) => [number, number, number] | undefined } = {},
): { members: F3Member[]; map: SplitMap[] } {
  if (splits.size === 0) return { members, map: [] }
  const nm = new Map(nodes.map((n) => [n.id, n]))
  const out: F3Member[] = []
  const map: SplitMap[] = []

  for (const m of members) {
    const interior = splits.get(m.id)
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!interior || interior.length === 0 || !a || !b) { out.push(m); continue }

    const chain = [m.i, ...interior, m.j]
    const lengths: number[] = []
    const parts: string[] = []
    let ok = true
    for (let k = 0; k + 1 < chain.length; k++) {
      const p = nm.get(chain[k]), q = nm.get(chain[k + 1])
      if (!p || !q) { ok = false; break }
      const L = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z)
      if (!(L > 1e-9)) { ok = false; break }        // a zero-length part is a singular element
      lengths.push(L)
    }
    if (!ok) { out.push(m); continue }              // leave the member whole rather than break it

    const inner = opts.interiorOffset?.(m)
    const last = chain.length - 2
    for (let k = 0; k <= last; k++) {
      const id = partId(m.id, k)
      parts.push(id)
      out.push({
        ...m,
        id, i: chain[k], j: chain[k + 1],
        relI: k === 0 ? m.relI : undefined,
        relJ: k === last ? m.relJ : undefined,
        offI: k === 0 ? m.offI : inner,
        offJ: k === last ? m.offJ : inner,
      })
    }
    map.push({ parent: m.id, parts, lengths })
  }
  return { members: out, map }
}

/** Cumulative start station of each part along the parent, m. */
const starts = (lengths: number[]) => {
  const s = [0]
  for (const L of lengths) s.push(s[s.length - 1] + L)
  return s
}

/**
 * Re-target member loads onto the sub-members.
 *
 * Each of the four member-load kinds the bridge emits needs its own rule:
 *   • `member-udl` — the same intensity on every part (a uniform load stays
 *     uniform whatever you cut it into).
 *   • `member-vdl` — clipped to each part's station range, with `w1`/`w2`
 *     linearly interpolated at the clip points and `x` re-origined to the part.
 *   • `member-point` — to the part containing its station; a load landing
 *     exactly on a junction goes to the EARLIER part, so it is placed once.
 *   • `member-thermal` — the same `PT` on every part. The fixed-end pair is
 *     self-equilibrating per element, so a chain of them reproduces the single
 *     member's end forces exactly.
 * Node loads and any member not split pass through unchanged.
 */
export function splitLoads(loads: F3Load[], map: SplitMap[]): F3Load[] {
  if (map.length === 0) return loads
  const by = new Map(map.map((s) => [s.parent, s]))
  const out: F3Load[] = []

  for (const ld of loads) {
    if (ld.kind === 'node') { out.push(ld); continue }
    const s = by.get(ld.member)
    if (!s) { out.push(ld); continue }
    const st = starts(s.lengths)

    if (ld.kind === 'member-udl' || ld.kind === 'member-thermal') {
      for (const p of s.parts) out.push({ ...ld, member: p })
      continue
    }

    if (ld.kind === 'member-point') {
      // the first part whose end station reaches a — so a load landing exactly
      // on a junction goes to the EARLIER part, and is placed exactly once
      let k = s.parts.length - 1
      for (let q = 0; q < s.parts.length; q++) {
        if (ld.a < st[q + 1] + 1e-12) { k = q; break }
      }
      out.push({ ...ld, member: s.parts[k], a: Math.max(0, ld.a - st[k]) })
      continue
    }

    // member-vdl: clip the trapezoid to each part
    const lo = Math.min(ld.x1, ld.x2), hi = Math.max(ld.x1, ld.x2)
    const wLo = ld.x1 <= ld.x2 ? ld.w1 : ld.w2
    const wHi = ld.x1 <= ld.x2 ? ld.w2 : ld.w1
    const span = hi - lo
    const wAt = (x: number) => (span > 1e-12 ? wLo + ((wHi - wLo) * (x - lo)) / span : wLo)
    for (let k = 0; k < s.parts.length; k++) {
      const a = Math.max(lo, st[k]), b = Math.min(hi, st[k + 1])
      if (!(b - a > 1e-12)) continue
      out.push({ ...ld, member: s.parts[k], x1: a - st[k], x2: b - st[k], w1: wAt(a), w2: wAt(b) })
    }
  }
  return out
}

/** Carry a parent's axial mode onto every one of its parts — a tension-only
 *  brace that got split must stay tension-only along its whole length. */
export function splitAxialModes(
  modes: Map<string, AxialMode>, map: SplitMap[],
): Map<string, AxialMode> {
  if (map.length === 0 || modes.size === 0) return modes
  const out = new Map(modes)
  for (const s of map) {
    const mode = modes.get(s.parent)
    if (!mode) continue
    out.delete(s.parent)
    for (const p of s.parts) out.set(p, mode)
  }
  return out
}

// ── the slab's traction, recovered from the forces the mesh hands the beam ──
//
// A beam carrying mesh nodes receives the slab through those nodes: in the
// discrete model the transfer is a POINT force (and a small couple) at every
// junction, so the stitched diagram is a staircase in V and a polyline in M —
// jagged, and more so the finer the mesh. Physically the slab bears on the beam
// along its whole length. The junction forces are that line load as the FE sees
// it: its CONSISTENT nodal values, J_j = ∫ q·N_j dx with N_j the linear hat on
// the junction stations (Zienkiewicz & Taylor, The Finite Element Method, Vol. 1
// §2.4 — the consistent load vector, read backwards).
//
// So q is recovered by inverting that relation, piecewise linear on the
// stations, and the steps are replaced by what q does to the beam. The property
// that makes this more than a cosmetic: the moment the transferred FORCES make
// at every junction is unchanged, exactly. (x_k − ξ)₊ is linear between stations, so it is its own
// hat interpolant, and ∫(x_k − ξ)₊ q dξ = Σ_j (x_k − x_j)₊ J_j — the point-force
// moment. Between stations M now bulges the way a distributed load bends it,
// which is the better estimate of the span moment, not a softer one.
//
// The two ends are where the beam meets its joint. There the mesh delivered the
// slab's share straight into the joint node, so the recovered q is carried to
// the end (extrapolated from the two nearest junctions) and the drawn end shear
// includes that share — larger than the solver's end force by ∫ q·N_0, the load
// a finer mesh would have put into the beam. Reactions and `f` are untouched.
//
// The slab also passes small COUPLES through the shared rotational DOFs — a
// jump in M at the junction. Those ramp across the two half-cells beside it, so
// the drawn moment there is the middle of the solver's jump and the member
// ends, where design reads the support moment, are never moved.

/** Solve the small dense system A·x = b by Gaussian elimination, partial pivoting. */
function solveDense(A: number[][], b: number[]): number[] {
  const n = b.length
  const M = A.map((r, i) => [...r, b[i]])
  for (let c = 0; c < n; c++) {
    let p = c
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r
    ;[M[c], M[p]] = [M[p], M[c]]
    const d = M[c][c] || 1e-300
    for (let r = c + 1; r < n; r++) {
      const f = M[r][c] / d
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]
    }
  }
  const x = new Array(n).fill(0)
  for (let r = n - 1; r >= 0; r--) {
    let v = M[r][n]
    for (let k = r + 1; k < n; k++) v -= M[r][k] * x[k]
    x[r] = v / (M[r][r] || 1e-300)
  }
  return x
}

/**
 * Nodal values q_0..q_K of the piecewise-linear line load whose consistent
 * interior nodal forces are `J` (J[j] at station x[j], j = 1..K−1; J[0], J[K]
 * ignored). Ends: linear extrapolation from the two nearest junctions (K ≥ 3),
 * uniform when there is only one junction.
 */
export function recoverLineLoad(x: number[], J: number[]): number[] {
  const K = x.length - 1
  if (K < 2) return new Array(K + 1).fill(0)
  const h = x.slice(1).map((v, i) => v - x[i])
  if (K === 2) { const q = J[1] / ((h[0] + h[1]) / 2); return [q, q, q] }
  const A = Array.from({ length: K + 1 }, () => new Array(K + 1).fill(0))
  const b = new Array(K + 1).fill(0)
  for (let j = 1; j < K; j++) {
    A[j][j - 1] = h[j - 1] / 6; A[j][j] = (h[j - 1] + h[j]) / 3; A[j][j + 1] = h[j] / 6
    b[j] = J[j]
  }
  // q_0 on the line through q_1, q_2;  q_K on the line through q_{K−1}, q_{K−2}
  A[0][0] = 1; A[0][1] = -(1 + h[0] / h[1]); A[0][2] = h[0] / h[1]
  A[K][K] = 1; A[K][K - 1] = -(1 + h[K - 1] / h[K - 2]); A[K][K - 2] = h[K - 1] / h[K - 2]
  return solveDense(A, b)
}

/** ∫₀ˣ q and ∫₀ˣ∫₀ q for the piecewise-linear q on stations `xn`, at `x`. */
function loadIntegrals(xn: number[], q: number[], x: number): [number, number] {
  let I1 = 0, I2 = 0
  for (let k = 0; k + 1 < xn.length; k++) {
    const a = xn[k], hk = xn[k + 1] - a
    if (x <= a) break
    const s = Math.min(x, xn[k + 1]) - a
    const slope = (q[k + 1] - q[k]) / hk
    // over [a, a+s]: ∫q = q_k s + slope s²/2;  ∫∫q adds I1·s + q_k s²/2 + slope s³/6
    I2 += I1 * s + q[k] * s * s / 2 + slope * s * s * s / 6
    I1 += q[k] * s + slope * s * s / 2
  }
  return [I1, I2]
}

/**
 * Reassemble the parent member's result from its parts.
 *
 * End forces come from the outer ends of the chain — valid because every part
 * is collinear and shares the parent's `rot`, so they share a local frame.
 *
 * The junction steps are replaced by the slab's recovered line load (see
 * above): every component comes back continuous, the moments at the junctions
 * are exactly the solver's, and the duplicated junction station is dropped.
 * This reverses an earlier choice to keep the staircase, made on the grounds
 * that smoothing would hide the transferred load. It does not: the load is
 * still there, in the slope of V and the curvature of M — where the slab puts
 * it — instead of in steps that grow sharper as the mesh is refined.
 */
export function stitchMembers(res: F3MemberResult[], map: SplitMap[]): F3MemberResult[] {
  if (map.length === 0) return res
  const byId = new Map(res.map((r) => [r.id, r]))
  const parented = new Set(map.flatMap((s) => s.parts))
  const out: F3MemberResult[] = res.filter((r) => !parented.has(r.id))

  for (const s of map) {
    const parts = s.parts.map((p) => byId.get(p))
    if (parts.some((p) => !p)) continue           // a part went missing — drop rather than lie
    const ps = parts as F3MemberResult[]
    const st = starts(s.lengths)
    const K = ps.length
    type Comp = 'N' | 'Vy' | 'Vz' | 'T' | 'My' | 'Mz'
    const C: Comp[] = ['N', 'Vy', 'Vz', 'T', 'My', 'Mz']
    // the jump of each component at each junction: start of part k − end of part k−1
    const jump = (c: Comp) => st.map((_, j) => (j > 0 && j < K)
      ? ps[j][c][0] - ps[j - 1][c][ps[j - 1][c].length - 1] : 0)
    const J = Object.fromEntries(C.map((c) => [c, jump(c)])) as Record<Comp, number[]>
    // force components: the line load each one's steps came from
    const qOf = Object.fromEntries((['N', 'Vy', 'Vz', 'T'] as Comp[]).map((c) => [c, recoverLineLoad(st, J[c])])) as Record<string, number[]>
    // a couple the slab passed through the rotational DOFs ramps across the two
    // half-cells either side of its junction (midpoint to midpoint): the moment
    // at that junction is the middle of the solver's jump, and the member ends —
    // the support moments design reads — are never touched
    const ramp = (c: 'My' | 'Mz', x: number) => {
      let v = 0
      for (let j = 1; j < K; j++) {
        const a = (st[j - 1] + st[j]) / 2, b = (st[j] + st[j + 1]) / 2
        v += J[c][j] * (x <= a ? 0 : x >= b ? 1 : (x - a) / (b - a))
      }
      return v
    }
    const e0 = (q: number[]) => (st[1] - st[0]) * (2 * q[0] + q[1]) / 6

    const xs: number[] = []
    const D: Record<Comp, number[]> = { N: [], Vy: [], Vz: [], T: [], My: [], Mz: [] }
    ps.forEach((p, k) => {
      for (let q = 0; q < p.xs.length; q++) {
        if (k > 0 && q === 0) continue              // the junction station, once
        const x = st[k] + p.xs[q]
        xs.push(x)
        // the steps already crossed at this station (part k carries junctions 1..k)
        const S = (c: Comp) => { let v = 0; for (let j = 1; j <= k; j++) v += J[c][j]; return v }
        const Sx = (c: Comp) => { let v = 0; for (let j = 1; j <= k; j++) v += J[c][j] * (x - st[j]); return v }
        for (const c of ['N', 'Vy', 'Vz', 'T'] as Comp[]) {
          const [I1] = loadIntegrals(st, qOf[c], x)
          D[c].push(p[c][q] - S(c) + I1 - e0(qOf[c]))
        }
        // moments: the force steps' effect (∫ of the V change), then the couples'
        const dV = (c: 'Vy' | 'Vz') => { const [, I2] = loadIntegrals(st, qOf[c], x); return I2 - e0(qOf[c]) * x - Sx(c) }
        D.Mz.push(p.Mz[q] + dV('Vy') - S('Mz') + ramp('Mz', x))
        D.My.push(p.My[q] - dV('Vz') - S('My') + ramp('My', x))
      }
    })
    const first = ps[0], lastP = ps[ps.length - 1]
    const amax = (a: number[]) => a.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    out.push({
      id: s.parent,
      L: s.lengths.reduce((a, b) => a + b, 0),
      f: [...first.f.slice(0, 6), ...lastP.f.slice(6, 12)],
      xs, ...D,
      Nmax: amax(D.N),
      Vmax: Math.max(amax(D.Vy), amax(D.Vz)),
      Mmax: Math.max(amax(D.My), amax(D.Mz)),
      Tmax: amax(D.T),
    })
  }
  return out
}

/**
 * Put a combination's factored loads back on the parent members, in the
 * parent's own stations — the inverse of `splitLoads`.
 *
 * The results are stitched onto the parent ids, and the loads must follow, or
 * anything that reads the two together sees a different structure: the statics
 * check measured `w · memberLen('B1#2')`, found no such member, and reported
 * every beam line load on a meshed slab as missing — a 15 % "residual" on a
 * structure in exact equilibrium.
 */
export function stitchLoads(loads: F3Load[], map: SplitMap[]): F3Load[] {
  if (map.length === 0) return loads
  const owner = new Map<string, { s: SplitMap; k: number; st: number[] }>()
  for (const s of map) { const st = starts(s.lengths); s.parts.forEach((p, k) => owner.set(p, { s, k, st })) }
  const out: F3Load[] = []
  // a parent UDL (or thermal load) was copied onto every part: count the copies back down
  const copies = new Map<string, { ld: F3Load; n: number; parts: number }>()
  for (const ld of loads) {
    if (ld.kind === 'node') { out.push(ld); continue }
    const o = owner.get(ld.member)
    if (!o) { out.push(ld); continue }
    const parent = o.s.parent, x0 = o.st[o.k]
    if (ld.kind === 'member-udl' || ld.kind === 'member-thermal') {
      const key = JSON.stringify({ ...ld, member: parent })
      const e = copies.get(key) ?? { ld: { ...ld, member: parent }, n: 0, parts: o.s.parts.length }
      e.n++; copies.set(key, e)
    } else if (ld.kind === 'member-point') out.push({ ...ld, member: parent, a: ld.a + x0 })
    else out.push({ ...ld, member: parent, x1: ld.x1 + x0, x2: ld.x2 + x0 })
  }
  for (const e of copies.values()) {
    const whole = Math.floor(e.n / e.parts)
    for (let i = 0; i < whole; i++) out.push(e.ld)
    // a remainder cannot come from splitLoads; if one ever does, keep its total
    // force on the parent rather than drop it
    const rem = e.n % e.parts
    if (rem && e.ld.kind === 'member-udl') out.push({ ...e.ld, w: (e.ld.w * rem) / e.parts })
  }
  return out
}

/** `stitchMembers` over a whole solve, with the envelope maxima recomputed from
 *  the stitched list so they describe the members the caller will actually see. */
export function stitchResult(r: F3Result, map: SplitMap[]): F3Result {
  if (map.length === 0) return r
  const members = stitchMembers(r.members, map)
  const max = (k: 'Mmax' | 'Vmax' | 'Nmax') =>
    members.reduce((m, x) => Math.max(m, x[k]), 0)
  return { ...r, members, Mmax: max('Mmax'), Vmax: max('Vmax'), Nmax: max('Nmax') }
}

/** `stitchResult` across every combination of an analysis. */
export function stitchAnalysis<T extends F3Analysis>(a: T, map: SplitMap[]): T {
  if (map.length === 0) return a
  return {
    ...a,
    perCombo: a.perCombo.map((c) => ({ ...c, factored: stitchLoads(c.factored, map), ...(c.result ? { result: stitchResult(c.result, map) } : {}) })),
  }
}
