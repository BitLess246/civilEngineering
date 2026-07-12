// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 §208 (UBC-97) static lateral force procedure + storey drift —
// Phase 7 of the 3D roadmap.
//   Ta = Ct·hn^(3/4)                 (Method A; Ct = 0.0731 for RC frames, m)
//   T  = min(Tb, 1.3·Ta) Zone 4 / min(Tb, 1.4·Ta) else, when a Method-B
//        analytical period Tb is supplied (§208.5.2.2); otherwise T = Ta.
//   V = Cv·I·W / (R·T)               2.5·Ca·I·W/R ≥ V ≥ 0.11·Ca·I·W
//   Ft = 0.07·T·V ≤ 0.25·V  (T > 0.7 s, else 0)
//   Fx = (V − Ft)·wx·hx / Σ(w·h)     (+Ft at the roof)
// Seismic weight W: slab dead area loads + member self-weight (beams at the
// level, half of the columns above & below). The generated forces are NODE
// loads with category 'E', split across the level's nodes, so the existing
// NSCP combinations (1.2D+1.0E+L+0.2S, 0.9D+1.0E) pick them up unchanged.
// Drift: Δs from the elastic results, ΔM = 0.7·R·Δs ≤ 0.025·hs (T < 0.7 s)
// or 0.020·hs otherwise.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, ModelLoad } from './model'
import { buildSeismicMass } from './modal'

export interface SeismicParams {
  Ca: number; Cv: number
  I: number; R: number
  Z?: number                // seismic zone factor (0.4 = Zone 4); enables eq 208-11
  Nv?: number               // near-source velocity factor (default 1.0)
  Ct?: number               // default 0.0731 (RC moment frame, metres)
  gammaC?: number           // concrete unit weight for member self-weight (default 24)
  dir: 'x' | 'z'
  /** §208.5.2.2 Method B: analytical fundamental period (s) in the load
   *  direction (e.g. from modal analysis). Used for V and Ft, but capped at
   *  1.3·Ta in Seismic Zone 4 (Z ≥ 0.4) and 1.4·Ta elsewhere. Omit → Method A. */
  Tb?: number
}

export interface StoreyForce {
  elevation: number; hx: number; wx: number; Fx: number; nodes: number
}

export interface SeismicResult {
  hn: number
  /** Method-A empirical period Ct·hn^¾, s (§208.5.2.1). */
  Ta: number
  /** Period used for V and Ft, s: Ta, or the capped Method-B period. */
  T: number
  /** Which §208.5.2 method produced T ('B' only when Tb was supplied). */
  Tmethod: 'A' | 'B'
  W: number
  Vraw: number; Vmax: number; Vmin: number; Vsrc: number; V: number
  Ft: number
  storeys: StoreyForce[]
  loads: ModelLoad[]        // node loads, cat 'E'
}

const GAMMA_C = 24 // kN/m³, default concrete unit weight

/** Seismic weight per elevated level: slab dead loads + member self-weight. */
export function storeyWeights(model: StructuralModel, gammaC = GAMMA_C): { elevation: number; w: number }[] {
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const secMap = new Map(model.sections.map((s) => [s.id, s]))
  const aSecOf = (mSection: string) => {
    const s = secMap.get(mSection) ?? model.sections[0]
    return s ? (s.b / 1000) * (s.h / 1000) : 0
  }
  const levels = [...new Set(model.storeys.map((s) => s.elevation))].sort((a, b) => a - b)
  const w = new Map<number, number>(levels.map((e) => [e, 0]))
  const closest = (y: number) => levels.reduce((best, e) => (Math.abs(e - y) < Math.abs(best - y) ? e : best), levels[0])

  // slabs: dead area loads × panel area
  for (const p of model.plates) {
    const c = p.corners.map((id) => nm.get(id))
    if (c.some((q) => !q)) continue
    const [c0, c1, , c3] = c as { x: number; y: number; z: number }[]
    const lx = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z)
    const lz = Math.hypot(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z)
    const lvl = closest(c0.y)
    const qD = model.loads
      .filter((l) => l.kind === 'area' && l.plate === p.id && l.cat === 'D')
      .reduce((s, l) => s + (l as { q: number }).q, 0)
    w.set(lvl, (w.get(lvl) ?? 0) + qD * lx * lz)
  }
  // members: beams/girders at their level; columns half up, half down
  for (const m of model.members) {
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const wSelf = aSecOf(m.section) * L * gammaC
    if (m.role === 'column') {
      const top = Math.max(a.y, b.y), bot = Math.min(a.y, b.y)
      const topLvl = levels.includes(top) ? top : closest(top)
      w.set(topLvl, (w.get(topLvl) ?? 0) + wSelf / 2)
      if (levels.includes(bot)) w.set(bot, (w.get(bot) ?? 0) + wSelf / 2)
      // lower half of ground-storey columns goes to the foundation, not W
    } else {
      const lvl = closest(a.y)
      w.set(lvl, (w.get(lvl) ?? 0) + wSelf)
    }
  }
  return levels.map((e) => ({ elevation: e, w: w.get(e) ?? 0 }))
}

export function computeSeismic(model: StructuralModel, p: SeismicParams): SeismicResult | null {
  const storeyW = storeyWeights(model, p.gammaC ?? GAMMA_C)
  if (storeyW.length === 0) return null
  const hn = Math.max(...storeyW.map((s) => s.elevation))
  const W = storeyW.reduce((s, q) => s + q.w, 0)
  if (!(hn > 0) || !(W > 0)) return null

  const Ct = p.Ct ?? 0.0731
  const Ta = Ct * Math.pow(hn, 0.75)
  // §208.5.2.2 Method B: the analytical period may replace Ta, but shall not
  // exceed it by more than 30% in Seismic Zone 4 (Z ≥ 0.4) or 40% elsewhere.
  const useB = p.Tb !== undefined && p.Tb > 0
  const T = useB ? Math.min(p.Tb!, ((p.Z ?? 0) >= 0.4 ? 1.3 : 1.4) * Ta) : Ta
  const Tmethod: 'A' | 'B' = useB ? 'B' : 'A'
  const Vraw = (p.Cv * p.I * W) / (p.R * T)
  const Vmax = (2.5 * p.Ca * p.I * W) / p.R          // 208-9 upper bound
  const Vmin = 0.11 * p.Ca * p.I * W                  // 208-10 lower bound
  // 208-11: in Seismic Zone 4 the base shear shall also be ≥ 0.8·Z·Nv·I·W/R.
  const Vsrc = (p.Z ?? 0) >= 0.4 ? (0.8 * (p.Z ?? 0.4) * (p.Nv ?? 1.0) * p.I * W) / p.R : 0
  const V = Math.max(Vmin, Vsrc, Math.min(Vraw, Vmax))
  const Ft = T > 0.7 ? Math.min(0.07 * T * V, 0.25 * V) : 0

  const sumWH = storeyW.reduce((s, q) => s + q.w * q.elevation, 0)
  const top = hn
  const nodesAt = (e: number) => model.nodes.filter((n) => Math.abs(n.y - e) < 1e-6)

  const storeys: StoreyForce[] = storeyW.map((s) => {
    const Fx = sumWH > 0 ? ((V - Ft) * s.w * s.elevation) / sumWH + (Math.abs(s.elevation - top) < 1e-9 ? Ft : 0) : 0
    return { elevation: s.elevation, hx: s.elevation, wx: s.w, Fx, nodes: nodesAt(s.elevation).length }
  })

  const loads: ModelLoad[] = []
  for (const s of storeys) {
    const nodes = nodesAt(s.elevation)
    if (nodes.length === 0 || Math.abs(s.Fx) < 1e-9) continue
    const per = s.Fx / nodes.length
    for (const n of nodes) {
      loads.push(p.dir === 'x'
        ? { kind: 'node', node: n.id, Fx: per, cat: 'E' }
        : { kind: 'node', node: n.id, Fz: per, cat: 'E' })
    }
  }

  return { hn, Ta, T, Tmethod, W, Vraw, Vmax, Vmin, Vsrc, V, Ft, storeys, loads }
}

// ── Accidental torsion (NSCP 208.7.2.7) ──────────────────────────────────
// The centre of mass of each level is assumed displaced ±5% of the plan
// dimension perpendicular to the load direction — statically equivalent to the
// storey force F applied at the mass centroid PLUS a torque T = ±0.05·L⊥·F
// about the vertical axis. The torque is realised as a self-equilibrating set
// of node forces in the load direction, distributed about the storey mass
// centroid:  ΔF_i = T · m_i·d_i / Σ m_j·d_j²   (d = perpendicular offset)
// so ΣΔF = 0 (statics unchanged) and ΣΔF·d = T (torque exact). This works with
// or without a rigid diaphragm: the couple simply loads the frames in
// proportion to a rigid-rotation displacement pattern weighted by mass.

/**
 * Antisymmetric node-force set adding the §208.7.2.7 accidental torsion to a
 * directional E-case. `base` is the case's SIGNED node-load set (Fx for
 * dir 'x', Fz for dir 'z'); the returned loads are ADDED to it. `sign` picks
 * the eccentricity sense (envelope both). Levels with no torsional lever
 * (single frame line, denom ≈ 0) contribute nothing.
 */
export function accidentalTorsionLoads(
  model: StructuralModel, base: ModelLoad[], dir: 'x' | 'z', sign: 1 | -1, ecc = 0.05,
): ModelLoad[] {
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const mass = buildSeismicMass(model)
  // perpendicular plan coordinate: force in x ↔ lever arm in z, and vice versa
  const perp = (n: { x: number; z: number }) => (dir === 'x' ? n.z : n.x)

  // group the case's forces by level (node elevation)
  const byLevel = new Map<number, { node: string; F: number }[]>()
  for (const l of base) {
    if (l.kind !== 'node') continue
    const n = nm.get(l.node)
    if (!n) continue
    const F = (dir === 'x' ? l.Fx : l.Fz) ?? 0
    if (F === 0) continue
    const key = [...byLevel.keys()].find((e) => Math.abs(e - n.y) < 1e-6) ?? n.y
    const arr = byLevel.get(key) ?? []
    arr.push({ node: l.node, F })
    byLevel.set(key, arr)
  }

  const out: ModelLoad[] = []
  for (const [y, entries] of byLevel) {
    const Flevel = entries.reduce((s, e) => s + e.F, 0)
    const nodes = model.nodes.filter((n) => Math.abs(n.y - y) < 1e-6)
    if (nodes.length < 2 || Math.abs(Flevel) < 1e-12) continue
    const cs = nodes.map(perp)
    const Lperp = Math.max(...cs) - Math.min(...cs)          // plan dimension ⊥ force
    if (!(Lperp > 0)) continue
    // mass centroid and torsional lever Σm·d² of the level
    let mTot = 0, mC = 0
    for (const n of nodes) { const m = mass.get(n.id) ?? 0; mTot += m; mC += m * perp(n) }
    if (!(mTot > 0)) continue
    const cbar = mC / mTot
    let denom = 0
    for (const n of nodes) denom += (mass.get(n.id) ?? 0) * (perp(n) - cbar) ** 2
    if (!(denom > 1e-9)) continue                            // no lever — single frame line
    const T = sign * ecc * Lperp * Flevel                    // kN·m about the vertical axis
    for (const n of nodes) {
      const dF = (T * (mass.get(n.id) ?? 0) * (perp(n) - cbar)) / denom
      if (Math.abs(dF) < 1e-12) continue
      out.push(dir === 'x'
        ? { kind: 'node', node: n.id, Fx: dF, cat: 'E' }
        : { kind: 'node', node: n.id, Fz: dF, cat: 'E' })
    }
  }
  return out
}

// ── Storey drift (NSCP 208.5.10) ─────────────────────────────────────────
export interface DriftRow {
  elevation: number; hs: number
  ds: number     // elastic storey drift Δs, mm
  dM: number     // inelastic ΔM = 0.7·R·Δs, mm
  limit: number  // 0.025·hs (T < 0.7 s) or 0.020·hs, mm
  ok: boolean
}

/**
 * Drift from a frame3d solution: `d` are the global DOFs in the order of
 * `nodeOrder` (6/node); displacement component 0 = x, 2 = z.
 */
export function driftCheck(
  model: StructuralModel, nodeOrder: { id: string; y: number }[], d: number[],
  R: number, T: number, dir: 'x' | 'z',
): DriftRow[] {
  const comp = dir === 'x' ? 0 : 2
  const levels = [0, ...[...new Set(model.storeys.map((s) => s.elevation))].sort((a, b) => a - b)]
  const maxU = new Map<number, number>(levels.map((e) => [e, 0]))
  nodeOrder.forEach((n, i) => {
    const lvl = levels.find((e) => Math.abs(e - n.y) < 1e-6)
    if (lvl === undefined) return
    const u = Math.abs(d[6 * i + comp]) * 1000   // mm
    if (u > (maxU.get(lvl) ?? 0)) maxU.set(lvl, u)
  })
  const ratio = T < 0.7 ? 0.025 : 0.020
  const rows: DriftRow[] = []
  for (let k = 1; k < levels.length; k++) {
    const hs = (levels[k] - levels[k - 1]) * 1000
    const ds = (maxU.get(levels[k]) ?? 0) - (maxU.get(levels[k - 1]) ?? 0)
    const dM = 0.7 * R * ds
    const limit = ratio * hs
    rows.push({ elevation: levels[k], hs, ds, dM, limit, ok: dM <= limit + 1e-9 })
  }
  return rows
}
