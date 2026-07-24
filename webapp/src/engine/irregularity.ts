// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 structural-irregularity auto-flags — Table 208-9 (vertical) and
// Table 208-10 (plan/horizontal). Pure post-processing of results the model
// already produces (the E-case displacement field + storey weights); no solver
// change. Layer L5 (dynamics/seismic).
//
// Implemented (the four checks derivable from the existing modal/drift data):
//   P1  Torsional irregularity        (208-10 Type 1a/1b): max storey drift at
//        one end > 1.2× (1a) / 1.4× (1b) the average of the two ends.
//   V1  Stiffness — soft storey        (208-9  Type 1a/1b): storey stiffness
//        k = Vstorey/Δstorey < 70% (1a) / 60% (1b) of the storey above, OR
//        < 80% (1a) / 70% (1b) of the average of the three storeys above.
//   V2  Weight (mass) irregularity     (208-9  Type 2): storey seismic weight
//        > 150% of an adjacent storey (a roof lighter than the floor below is
//        exempt).
//   V3  Vertical geometric             (208-9  Type 3): horizontal dimension of
//        the LFRS in a storey > 130% of that in an adjacent storey.
//
// Not covered here (need capacity, plan-shape polygon, or offset topology the
// analysis model doesn't yet carry): 208-9 Types 4 (in-plane discontinuity) &
// 5 (weak storey), 208-10 Types 2 (re-entrant corners), 3 (diaphragm
// discontinuity), 4 (out-of-plane offsets), 5 (non-parallel systems).
//
// Units: geometry m; displacements taken from the frame3d DOF vector in m and
// reported as mm; weights kN. Ratios are unitless so the verdicts are
// unit-independent.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel } from './model'
import { storeyWeights } from './seismic'

export type IrregVerdict = 'none' | 'irregular' | 'extreme'

export interface IrregularityFlag {
  /** NSCP designation: 'P1a'|'P1b' (Table 208-10) / 'V1a'|'V1b'|'V2'|'V3' (208-9). */
  code: string
  /** Human name of the irregularity type. */
  name: string
  /** Which NSCP table it comes from. */
  table: 'Table 208-9' | 'Table 208-10'
  /** Load direction the check was evaluated in (torsion/stiffness are directional). */
  dir?: 'x' | 'z'
  /** Storey (top elevation, m) where the governing ratio occurs. */
  elevation?: number
  /** Governing ratio (see `detail` for its definition). */
  ratio: number
  /** The threshold the ratio crossed. */
  limit: number
  verdict: IrregVerdict
  /** One-line explanation with the numbers. */
  detail: string
}

const near = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) < tol
const r2 = (v: number) => Math.round(v * 100) / 100

// ── P1 · Torsional irregularity (Table 208-10 Type 1a/1b) ────────────────
/**
 * Verdict from the two extreme-end storey drifts (δmax, δmin ≥ 0):
 * ratio = δmax / δavg, δavg = (δmax + δmin)/2 → > 1.4 extreme, > 1.2 irregular.
 */
export function torsionalVerdict(driftMax: number, driftMin: number): { ratio: number; verdict: IrregVerdict } {
  const avg = (driftMax + driftMin) / 2
  if (!(avg > 1e-12)) return { ratio: 1, verdict: 'none' }
  const ratio = driftMax / avg
  return { ratio, verdict: ratio > 1.4 ? 'extreme' : ratio > 1.2 ? 'irregular' : 'none' }
}

// ── V1 · Stiffness / soft storey (Table 208-9 Type 1a/1b) ────────────────
/**
 * Per-storey soft-storey verdict. `k[]` is storey lateral stiffness ordered
 * BOTTOM→TOP (k[i] = Vstorey_i / Δstorey_i). A storey is soft when its
 * stiffness drops below 70%/60% of the storey directly above, or 80%/70% of
 * the mean of the three storeys above. The top storey (no storey above) is
 * never flagged. Returns one entry per storey index, verdict 'none' where OK.
 */
export function softStoreyVerdicts(k: number[]): { i: number; ratio: number; verdict: IrregVerdict; basis: 'above' | 'avg3' }[] {
  const sev = (v: IrregVerdict) => (v === 'extreme' ? 2 : v === 'irregular' ? 1 : 0)
  const out: { i: number; ratio: number; verdict: IrregVerdict; basis: 'above' | 'avg3' }[] = []
  for (let i = 0; i < k.length - 1; i++) {
    const above = k[i + 1]
    const rAbove = above > 1e-12 ? k[i] / above : Infinity
    // three storeys above, when they exist
    const three = k.slice(i + 1, i + 4)
    const avg3 = three.length === 3 ? three.reduce((s, v) => s + v, 0) / 3 : NaN
    const rAvg3 = Number.isFinite(avg3) && avg3 > 1e-12 ? k[i] / avg3 : Infinity
    // each clause is scored independently; the storey takes the more severe.
    // 1a soft: < 70% of above OR < 80% of avg-of-3; 1b extreme: < 60% / < 70%.
    const vAbove: IrregVerdict = rAbove < 0.6 ? 'extreme' : rAbove < 0.7 ? 'irregular' : 'none'
    const vAvg3: IrregVerdict = rAvg3 < 0.7 ? 'extreme' : rAvg3 < 0.8 ? 'irregular' : 'none'
    const basis: 'above' | 'avg3' = sev(vAvg3) > sev(vAbove) ? 'avg3' : 'above'
    out.push({ i, ratio: basis === 'above' ? rAbove : rAvg3, verdict: sev(vAvg3) > sev(vAbove) ? vAvg3 : vAbove, basis })
  }
  return out
}

// ── V2 · Weight (mass) irregularity (Table 208-9 Type 2) ─────────────────
/**
 * `w[]` = storey seismic weight ordered BOTTOM→TOP. A storey whose weight
 * exceeds 150% of an adjacent storey is irregular; a roof (top storey) lighter
 * than the floor below is exempt (§ note to Table 208-9). Returns per-storey
 * governing ratio (w_i / lighter-neighbour) and verdict.
 */
export function massVerdicts(w: number[]): { i: number; ratio: number; verdict: IrregVerdict }[] {
  const out: { i: number; ratio: number; verdict: IrregVerdict }[] = []
  for (let i = 0; i < w.length; i++) {
    const neigh: number[] = []
    if (i > 0) neigh.push(w[i - 1])
    if (i < w.length - 1) neigh.push(w[i + 1])
    // exceeds 150% of ANY adjacent storey ⇒ compare to the lighter neighbour
    const minN = neigh.length ? Math.min(...neigh) : Infinity
    const ratio = minN > 1e-12 ? w[i] / minN : 1
    out.push({ i, ratio, verdict: ratio > 1.5 ? 'irregular' : 'none' })
  }
  return out
}

// ── V3 · Vertical geometric irregularity (Table 208-9 Type 3) ────────────
/**
 * `dim[]` = LFRS horizontal dimension per storey (m), BOTTOM→TOP. A storey
 * whose dimension exceeds 130% of an adjacent storey is irregular.
 */
export function geometricVerdicts(dim: number[]): { i: number; ratio: number; verdict: IrregVerdict }[] {
  const out: { i: number; ratio: number; verdict: IrregVerdict }[] = []
  for (let i = 0; i < dim.length; i++) {
    const neigh: number[] = []
    if (i > 0) neigh.push(dim[i - 1])
    if (i < dim.length - 1) neigh.push(dim[i + 1])
    const minN = neigh.length ? Math.min(...neigh) : Infinity
    const ratio = minN > 1e-12 ? dim[i] / minN : 1
    out.push({ i, ratio, verdict: ratio > 1.3 ? 'irregular' : 'none' })
  }
  return out
}

// ── Model adapter ────────────────────────────────────────────────────────
export interface IrregularityInput {
  /** DOF ordering of `d` (6 DOFs/node), matching the frame3d solution. */
  nodeOrder: { id: string; y: number }[]
  /** Global displacement vector of the E-case solve (metres). */
  d: number[]
  /** Applied lateral storey force per level in `dir` (kN) — for storey shear. */
  storeyForce: { elevation: number; F: number }[]
  /** Load direction the E-case was solved in. */
  dir: 'x' | 'z'
}

/**
 * Assemble the NSCP irregularity flags for one E-case run. The torsional (P1)
 * and stiffness (V1) checks use the direction of the run; the mass (V2) and
 * geometric (V3) checks are direction-independent (computed once).
 *
 * Only irregularities that trip (verdict ≠ 'none') are returned, most-severe
 * first. An empty array means the structure is regular by these four checks.
 */
export function assessIrregularities(model: StructuralModel, input: IrregularityInput): IrregularityFlag[] {
  const { nodeOrder, d, storeyForce, dir } = input
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const comp = dir === 'x' ? 0 : 2
  // levels bottom→top, including the base
  const levels = [0, ...[...new Set(model.storeys.map((s) => s.elevation))].sort((a, b) => a - b)]
    .filter((e, i, a) => a.indexOf(e) === i)
    .sort((a, b) => a - b)

  // per-level lateral displacement keyed by plan line (x,z) — mm
  const key = (x: number, z: number) => `${Math.round(x * 1e3)},${Math.round(z * 1e3)}`
  const uByLevel = levels.map(() => new Map<string, number>())
  const levelOf = (y: number) => levels.findIndex((e) => near(e, y))
  nodeOrder.forEach((n, i) => {
    const li = levelOf(n.y)
    const nd = nm.get(n.id)
    if (li < 0 || !nd) return
    uByLevel[li].set(key(nd.x, nd.z), d[6 * i + comp] * 1000)
  })

  const flags: IrregularityFlag[] = []
  const dirTag = dir.toUpperCase()

  // storey drift arrays (index s = storey between levels[s] and levels[s+1])
  const nStorey = levels.length - 1
  const driftMaxRep: number[] = []   // representative (max end) storey drift, mm
  for (let s = 0; s < nStorey; s++) {
    const below = uByLevel[s], above = uByLevel[s + 1]
    const lineDrifts: number[] = []
    for (const [ln, uTop] of above) {
      if (below.has(ln)) lineDrifts.push(Math.abs(uTop - (below.get(ln) as number)))
    }
    if (lineDrifts.length === 0) { driftMaxRep.push(0); continue }
    const dMax = Math.max(...lineDrifts), dMin = Math.min(...lineDrifts)
    driftMaxRep.push(dMax)
    // P1 torsional — needs at least two distinct ends
    if (lineDrifts.length >= 2) {
      const { ratio, verdict } = torsionalVerdict(dMax, dMin)
      if (verdict !== 'none') flags.push({
        code: verdict === 'extreme' ? 'P1b' : 'P1a',
        name: verdict === 'extreme' ? 'Extreme torsional irregularity' : 'Torsional irregularity',
        table: 'Table 208-10', dir, elevation: levels[s + 1], ratio, limit: verdict === 'extreme' ? 1.4 : 1.2,
        verdict, detail: `${dirTag}: δmax/δavg = ${r2(ratio)} > ${verdict === 'extreme' ? 1.4 : 1.2} (δmax ${r2(dMax)} mm, δmin ${r2(dMin)} mm)`,
      })
    }
  }

  // V1 soft storey — k = storeyShear / storeyDrift, bottom→top
  const shearByLevel = new Map(storeyForce.map((s) => [s.elevation, s.F]))
  const k: number[] = []
  for (let s = 0; s < nStorey; s++) {
    // storey shear = Σ applied force at levels at/above the top of this storey
    let V = 0
    for (let t = s + 1; t < levels.length; t++) V += shearByLevel.get(levels[t]) ?? 0
    const drift = driftMaxRep[s]
    k.push(drift > 1e-9 ? Math.abs(V) / drift : Infinity)
  }
  if (k.every((v) => Number.isFinite(v))) {
    for (const sv of softStoreyVerdicts(k)) {
      if (sv.verdict === 'none') continue
      const soft = sv.verdict === 'extreme'
      flags.push({
        code: soft ? 'V1b' : 'V1a',
        name: soft ? 'Extreme soft storey (stiffness)' : 'Soft storey (stiffness)',
        table: 'Table 208-9', dir, elevation: levels[sv.i + 1], ratio: sv.ratio,
        limit: sv.basis === 'above' ? (soft ? 0.6 : 0.7) : (soft ? 0.7 : 0.8), verdict: sv.verdict,
        detail: `${dirTag}: k/${sv.basis === 'above' ? 'k(above)' : 'avg k(3 above)'} = ${r2(sv.ratio)} < ${sv.basis === 'above' ? (soft ? 0.6 : 0.7) : (soft ? 0.7 : 0.8)}`,
      })
    }
  }

  // V2 mass — storey seismic weights bottom→top (exclude the base level 0)
  const sw = storeyWeights(model)
  const wByElev = new Map(sw.map((s) => [s.elevation, s.w]))
  const elevs = levels.slice(1)                     // framed levels
  const w = elevs.map((e) => wByElev.get(e) ?? 0)
  if (w.length >= 2 && w.every((v) => v > 0)) {
    for (const mv of massVerdicts(w)) {
      if (mv.verdict === 'none') continue
      // roof (top) lighter than the floor below is exempt — only heavier trips, so already fine
      flags.push({
        code: 'V2', name: 'Weight (mass) irregularity', table: 'Table 208-9', elevation: elevs[mv.i],
        ratio: mv.ratio, limit: 1.5, verdict: mv.verdict,
        detail: `W/W(adjacent) = ${r2(mv.ratio)} > 1.5 (W = ${Math.round(w[mv.i])} kN)`,
      })
    }
  }

  // V3 vertical geometric — LFRS plan dimension per framed level (max of X/Z extent)
  const colNodeIds = new Set<string>()
  for (const m of model.members) if (m.role === 'column') { colNodeIds.add(m.i); colNodeIds.add(m.j) }
  const dimAt = (e: number): number => {
    const ns = model.nodes.filter((n) => near(n.y, e) && colNodeIds.has(n.id))
    if (ns.length < 2) return 0
    const xs = ns.map((n) => n.x), zs = ns.map((n) => n.z)
    return Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs))
  }
  const dim = elevs.map(dimAt)
  if (dim.length >= 2 && dim.every((v) => v > 0)) {
    for (const gv of geometricVerdicts(dim)) {
      if (gv.verdict === 'none') continue
      flags.push({
        code: 'V3', name: 'Vertical geometric irregularity', table: 'Table 208-9', elevation: elevs[gv.i],
        ratio: gv.ratio, limit: 1.3, verdict: gv.verdict,
        detail: `LFRS dim ratio = ${r2(gv.ratio)} > 1.3 (${r2(dim[gv.i])} m vs adjacent)`,
      })
    }
  }

  // most-severe first (extreme before irregular), then by code
  const sev = (v: IrregVerdict) => (v === 'extreme' ? 0 : v === 'irregular' ? 1 : 2)
  return flags.sort((a, b) => sev(a.verdict) - sev(b.verdict) || a.code.localeCompare(b.code))
}
