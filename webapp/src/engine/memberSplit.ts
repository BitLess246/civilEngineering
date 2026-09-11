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

/**
 * Reassemble the parent member's result from its parts.
 *
 * The station list keeps the duplicated junction value: shear really is
 * discontinuous there, because the shell delivers a point force into the beam,
 * and smoothing it away would hide the very load this whole phase exists to
 * transfer. End forces come from the outer ends of the chain — valid because
 * every part is collinear and shares the parent's `rot`, so they share a local
 * frame.
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
    const xs: number[] = []
    const N: number[] = [], Vy: number[] = [], Vz: number[] = [], T: number[] = []
    const My: number[] = [], Mz: number[] = []
    ps.forEach((p, k) => {
      for (let q = 0; q < p.xs.length; q++) xs.push(st[k] + p.xs[q])
      N.push(...p.N); Vy.push(...p.Vy); Vz.push(...p.Vz)
      T.push(...p.T); My.push(...p.My); Mz.push(...p.Mz)
    })
    const first = ps[0], lastP = ps[ps.length - 1]
    out.push({
      id: s.parent,
      L: s.lengths.reduce((a, b) => a + b, 0),
      f: [...first.f.slice(0, 6), ...lastP.f.slice(6, 12)],
      xs, N, Vy, Vz, T, My, Mz,
      Nmax: Math.max(...ps.map((p) => p.Nmax)),
      Vmax: Math.max(...ps.map((p) => p.Vmax)),
      Mmax: Math.max(...ps.map((p) => p.Mmax)),
      Tmax: Math.max(...ps.map((p) => p.Tmax)),
    })
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
    perCombo: a.perCombo.map((c) => (c.result ? { ...c, result: stitchResult(c.result, map) } : c)),
  }
}
