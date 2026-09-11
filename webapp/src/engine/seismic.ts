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
import { columnShares, shiftResultantLoads } from './storeyDistribution'
import { memberWeightPerLength } from './modelBuilder'
import type { LateralCase } from './pipeline'
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

/**
 * Where the seismic weight comes from, level by level and component by
 * component — §208.5.1.1's "total dead load", itemised.
 *
 * Reported, because a reviewer asked the question the report could not answer:
 * the appendix printed a lumped mass of 98.2 t and nothing said what was in it.
 *
 * ITEMISING IT FOUND THAT IT WAS SHORT. W was slab area dead loads plus member
 * self-weight computed from the sections, and nothing else — so a dead load
 * applied as a LINE load on a beam or as a NODE load was not in the seismic
 * weight at all. Wall self-weight is exactly that: `buildGravityLoads` puts it
 * on the supporting member as a `member-udl`, so a modelled wall added mass to
 * the gravity design and none to the earthquake. Generated member self-weight
 * (`sw: true`) is still skipped, because this function computes it from the
 * sections itself and counting the load as well would double it.
 */
export interface WeightComponent {
  /** Slab dead area loads on the plates at this level. */
  slab: number
  /** Member self-weight, from each member's own section. */
  selfWeight: number
  /** Dead line loads a user (or a wall) put on a member — NOT the generated
   *  self-weight, which `selfWeight` already carries. */
  lineDead: number
  /** Dead point loads: node forces and member point loads. */
  pointDead: number
}
export interface StoreyWeight extends WeightComponent { elevation: number; w: number }

const zeroComponents = (): WeightComponent => ({ slab: 0, selfWeight: 0, lineDead: 0, pointDead: 0 })

/** Seismic weight per elevated level, itemised — see `WeightComponent`. */
export function storeyWeightBreakdown(model: StructuralModel, gammaC = GAMMA_C): StoreyWeight[] {
  const rows = storeyWeightsFull(model, gammaC)
  return rows
}

/** Seismic weight per elevated level — the sum of `storeyWeightBreakdown`. */
export function storeyWeights(model: StructuralModel, gammaC = GAMMA_C): { elevation: number; w: number }[] {
  return storeyWeightsFull(model, gammaC).map(({ elevation, w }) => ({ elevation, w }))
}

/**
 * Which level a thing belongs to, and how long a member is — shared by the
 * dead-weight pass and the floor-live pass so the two cannot disagree about
 * where a load lands.
 */
function levelTools(model: StructuralModel) {
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const levels = [...new Set(model.storeys.map((s) => s.elevation))].sort((a, b) => a - b)
  const closest = (y: number) => levels.reduce((best, e) => (Math.abs(e - y) < Math.abs(best - y) ? e : best), levels[0])
  const memberLen = (id: string) => {
    const m = model.members.find((x) => x.id === id)
    const a = m && nm.get(m.i), b = m && nm.get(m.j)
    return a && b ? Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) : 0
  }
  /** The level a member's load belongs to — a beam's own, a column's top. */
  const memberLevel = (id: string) => {
    const m = model.members.find((x) => x.id === id)
    const a = m && nm.get(m.i), b = m && nm.get(m.j)
    if (!a || !b) return levels[0]
    return closest(m.role === 'column' ? Math.max(a.y, b.y) : a.y)
  }
  return { nm, levels, closest, memberLen, memberLevel }
}

/**
 * FLOOR LIVE LOAD per elevated level, kN — area loads on the level's panels
 * plus any cat-'L' line, point or node load, assigned to levels exactly as the
 * dead-weight pass assigns dead ones.
 *
 * Not part of the seismic weight W (§208.5.1.1 takes dead plus only specific
 * live fractions); this exists for §208.5.10.2, whose Px is the total dead AND
 * FLOOR LIVE load above the storey. Roof live Lr is not floor live and is not
 * counted.
 */
export function storeyLiveLoads(model: StructuralModel): { elevation: number; l: number }[] {
  const { nm, levels, closest, memberLen, memberLevel } = levelTools(model)
  const live = new Map<number, number>(levels.map((e) => [e, 0]))
  const add = (lvl: number, v: number) => live.set(lvl, (live.get(lvl) ?? 0) + v)
  for (const p of model.plates) {
    const c = p.corners.map((id) => nm.get(id))
    if (c.some((q) => !q)) continue
    const [c0, c1, , c3] = c as { x: number; y: number; z: number }[]
    const lx = Math.hypot(c1.x - c0.x, c1.y - c0.y, c1.z - c0.z)
    const lz = Math.hypot(c3.x - c0.x, c3.y - c0.y, c3.z - c0.z)
    const q = model.loads
      .filter((l) => l.kind === 'area' && l.plate === p.id && l.cat === 'L')
      .reduce((t, l) => t + (l as { q: number }).q, 0)
    add(closest(c0.y), q * lx * lz)
  }
  for (const l of model.loads) {
    if (l.cat !== 'L') continue
    if (l.kind === 'member-udl') add(memberLevel(l.member), l.w * memberLen(l.member))
    else if (l.kind === 'member-point') add(memberLevel(l.member), l.P)
    else if (l.kind === 'node') {
      const n = nm.get(l.node)
      if (n) add(closest(n.y), Math.abs(l.Fy ?? 0))
    }
  }
  return levels.map((e) => ({ elevation: e, l: live.get(e) ?? 0 }))
}

function storeyWeightsFull(model: StructuralModel, gammaC = GAMMA_C): StoreyWeight[] {
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const secMap = new Map(model.sections.map((s) => [s.id, s]))
  // What a member weighs per metre — the shared answer, so a steel or timber
  // frame's storey weight matches its gravity loads. This used to be
  // `(b/1000)·(h/1000)` with NO material branch at all, so every member came
  // out at the concrete number: a W310x52 frame was 2.44× its real member
  // weight and a DFL-2 timber frame 4.89×.
  const wPerM = (mSection: string, gc: number) => {
    const s = secMap.get(mSection) ?? model.sections[0]
    return s ? memberWeightPerLength(s, gc) : 0
  }
  const { levels, closest, memberLen, memberLevel } = levelTools(model)
  const parts = new Map<number, WeightComponent>(levels.map((e) => [e, zeroComponents()]))
  const add = (lvl: number, key: keyof WeightComponent, v: number) => {
    const c = parts.get(lvl); if (c) c[key] += v
  }

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
    add(lvl, 'slab', qD * lx * lz)
  }
  // members: beams/girders at their level; columns half up, half down
  for (const m of model.members) {
    const a = nm.get(m.i), b = nm.get(m.j)
    if (!a || !b) continue
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z)
    const wSelf = wPerM(m.section, gammaC) * L
    if (m.role === 'column') {
      const top = Math.max(a.y, b.y), bot = Math.min(a.y, b.y)
      const topLvl = levels.includes(top) ? top : closest(top)
      add(topLvl, 'selfWeight', wSelf / 2)
      if (levels.includes(bot)) add(bot, 'selfWeight', wSelf / 2)
      // lower half of ground-storey columns goes to the foundation, not W
    } else {
      add(closest(a.y), 'selfWeight', wSelf)
    }
  }
  // DEAD LOADS THAT ARE NOT SELF-WEIGHT AND NOT ON A SLAB. A wall's weight is
  // one of these — `buildGravityLoads` puts it on its supporting member — and
  // so is any façade, partition or plant a user hangs off a beam or a node.
  // Left out, they were carried by the gravity design and by nothing else.
  for (const l of model.loads) {
    if (l.cat !== 'D') continue
    if (l.kind === 'member-udl') {
      // `sw` is the GENERATED member self-weight, already counted above from
      // the sections; counting the load too would double every member.
      if (l.sw) continue
      add(memberLevel(l.member), 'lineDead', l.w * memberLen(l.member))
    } else if (l.kind === 'member-point') {
      add(memberLevel(l.member), 'pointDead', l.P)
    } else if (l.kind === 'node') {
      const n = nm.get(l.node)
      // A downward gravity load is −Fy; mass is its magnitude.
      if (n) add(closest(n.y), 'pointDead', Math.abs(l.Fy ?? 0))
    }
  }
  return levels.map((e) => {
    const c = parts.get(e) ?? zeroComponents()
    return { elevation: e, ...c, w: c.slab + c.selfWeight + c.lineDead + c.pointDead }
  })
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

  // Share each level's force out by the stiffness its columns present to the
  // push — see `storeyDistribution`. The equal split stays as the fallback for
  // a level with no column under it, where there is nothing to weigh by.
  const loads: ModelLoad[] = []
  for (const s of storeys) {
    const nodes = nodesAt(s.elevation)
    if (nodes.length === 0 || Math.abs(s.Fx) < 1e-9) continue
    const cs = columnShares(model, s.elevation, p.dir)
    const per = (id: string) => (cs.usable ? s.Fx * (cs.share.get(id) ?? 0) : s.Fx / nodes.length)
    for (const n of nodes) {
      const F = per(n.id)
      if (Math.abs(F) < 1e-12) continue
      loads.push(p.dir === 'x'
        ? { kind: 'node', node: n.id, Fx: F, cat: 'E' }
        : { kind: 'node', node: n.id, Fz: F, cat: 'E' })
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

/**
 * The §208.7.2.7 INHERENT torsion: the couple that puts a case's resultant on
 * the level's centre of MASS, wherever the plan distribution happened to leave
 * it. `base` is the case's signed node-load set; the returned loads are ADDED
 * to it and change no resultant force, only its line of action.
 *
 * This is not an optional refinement, and it is not the accidental ±5%. A
 * seismic force originates at the mass; applying it anywhere else — at the
 * centre of rigidity, which is exactly where stiffness-weighted shares put it,
 * or at a geometric centroid, which is where an equal split put it — changes
 * how much the storey twists. §208.7.2.7 sets the design eccentricity as the
 * actual eccentricity plus the accidental one; this term is the actual part.
 * In an FEM it is applied by moving the force to the mass centre rather than
 * by adding F·(CM − CR) as a torque about the rigidity centre: the structure
 * then develops its own inherent torsion from its own stiffness, and the two
 * routes must not both be taken or the eccentricity is counted twice.
 */
export function inherentTorsionLoads(
  model: StructuralModel, base: ModelLoad[], dir: 'x' | 'z',
): ModelLoad[] {
  const mass = buildSeismicMass(model)
  const w = (id: string) => mass.get(id) ?? 0
  return shiftResultantLoads(model, base, dir, 'E', (nodes) => {
    let m = 0, c = 0
    for (const n of nodes) { const q = w(n.id); m += q; c += q * (dir === 'x' ? n.z : n.x) }
    return m > 0 ? c / m : null      // no mass at this level — nothing to centre on
  }, w)
}

/** What a directional lateral case actually applies. */
export interface CaseResultant {
  /** Σ of the node forces, kN. */
  Fx: number; Fz: number
  /** Torque about the vertical axis through the level MASS centroid, kN·m —
   *  the axis §208.7.2.7 measures its ±5% eccentricity from. Summed over
   *  levels. A pattern with no intended torsion still reports a non-zero value
   *  when the force is spread over nodes whose centroid is not the mass
   *  centroid, which is the whole point of printing it. */
  Mt: number
}

/**
 * The resultant of a lateral case's node loads.
 *
 * Exists so a report can tell twelve directional figures apart: ⟳ and ⟲ differ
 * only by a torsion increment that is small beside the storey force, so the
 * pictures look alike and the numbers are what distinguish them.
 */
export function caseResultant(model: StructuralModel, loads: ModelLoad[]): CaseResultant {
  const nm = new Map(model.nodes.map((n) => [n.id, n]))
  const mass = buildSeismicMass(model)
  let Fx = 0, Fz = 0, Mt = 0
  // Mass centroid per level, so the torque is about the axis the code means.
  const levels = [...new Set(model.nodes.map((n) => n.y))]
  const centroid = new Map<number, { x: number; z: number }>()
  for (const y of levels) {
    const at = model.nodes.filter((n) => Math.abs(n.y - y) < 1e-6)
    let m = 0, cx = 0, cz = 0
    for (const n of at) { const q = mass.get(n.id) ?? 0; m += q; cx += q * n.x; cz += q * n.z }
    centroid.set(y, m > 0
      ? { x: cx / m, z: cz / m }
      // No mass at this level — fall back to the geometric centre so the
      // torque is still measured about something, and say nothing more.
      : { x: at.reduce((t, n) => t + n.x, 0) / (at.length || 1), z: at.reduce((t, n) => t + n.z, 0) / (at.length || 1) })
  }
  for (const l of loads) {
    if (l.kind !== 'node') continue
    const n = nm.get(l.node)
    if (!n) continue
    const fx = l.Fx ?? 0, fz = l.Fz ?? 0
    Fx += fx; Fz += fz
    const c = centroid.get([...centroid.keys()].find((y) => Math.abs(y - n.y) < 1e-6) ?? n.y)
    if (!c) continue
    // Mt about +y: a force in x at offset z gives −Fx·(z−cz); one in z at
    // offset x gives +Fz·(x−cx).
    Mt += fz * (n.x - c.x) - fx * (n.z - c.z)
  }
  return { Fx, Fz, Mt }
}

// ── P-Δ stability coefficient (NSCP §208.5.10.2 / UBC-97 §1630.1.3) ──────
//
// SECOND-ORDER ANALYSIS IS A CHECKBOX IN THIS APP AND A REQUIREMENT IN THE
// CODE, and nothing connected the two. `AnalyzeOptions.pDelta` could be left
// off on a frame the code obliges to be analysed second-order, and the run
// came back clean: no warning, no row, nothing that could fail. This is the
// verdict that was missing rather than the verdict that could not fail.
//
// §208.5.10.2 lets P-Δ be neglected when the ratio of secondary to primary
// moment does not exceed 0.10, and gives that ratio for any storey as
//
//     θ = Px·Δs / (Vx·hsx)
//
// with Px the total dead AND FLOOR LIVE load above the storey, Δs the elastic
// seismic storey drift, Vx the seismic shear in that storey and hsx its
// height. In Seismic Zone 3 and 4 there is a second exemption that stands on
// its own: P-Δ need not be considered when the storey drift ratio Δs/hsx does
// not exceed 0.02/R.
//
// Δs, NOT ΔM. The ratio is elastic drift over design shear — both sides come
// from the same design-level forces, so amplifying one and not the other would
// inflate θ by 0.7·R. (ASCE 7-10 §12.8.7 writes the same quantity as
// Px·Δ/(Vx·hsx·Cd) with Δ already amplified, which is the identical number.)
//
// NO θmax IS PUBLISHED HERE. ASCE 7-10 caps θ at θmax = 0.5/(β·Cd) ≤ 0.25 and
// calls the structure unstable above it; §208.5.10.2 in its UBC-97 lineage
// carries no such ceiling, and inventing one under an NSCP clause reference
// would be a claim this module cannot support. The 0.10 threshold and the
// Zone 3/4 exemption are what it checks.

export interface StabilityRow {
  elevation: number
  /** Storey height, mm. */
  hs: number
  /** Elastic seismic storey drift Δs, mm. */
  ds: number
  /** Total dead + floor live load above the storey, kN. */
  Px: number
  /** Seismic storey shear, kN — the applied lateral force at and above it. */
  Vx: number
  /** θ = Px·Δs/(Vx·hs). */
  theta: number
  /** Δs/hs, against the Zone 3/4 exemption limit 0.02/R. */
  driftRatio: number
  /** Zone 3/4 and Δs/hs ≤ 0.02/R — exempt whatever θ comes to. */
  exempt: boolean
  /** θ > 0.10 and not exempt: the code requires a second-order analysis. */
  pDeltaRequired: boolean
}

/**
 * Per-storey §208.5.10.2 stability coefficient.
 *
 * `drift` supplies Δs and hs (from `driftCheck`, same direction), `storeyForce`
 * the applied lateral force per level (the E-case node loads summed by level),
 * and the model its gravity load. Returns `null` when R is not a usable
 * reduction factor or there is no storey to check.
 *
 * A storey carrying no seismic shear is OMITTED rather than reported: θ is
 * Px·Δs over Vx·hs, so Vx = 0 makes it undefined — not zero, and not infinite.
 * Saying nothing about a storey with no seismic demand is the honest answer;
 * reporting θ = ∞ there would be a failure the structure did not earn.
 */
export function stabilityCheck(
  model: StructuralModel,
  drift: DriftRow[],
  storeyForce: { elevation: number; F: number }[],
  p: { R: number; Z?: number; gammaC?: number },
): StabilityRow[] | null {
  if (!(p.R > 0) || !Number.isFinite(p.R)) return null
  if (drift.length === 0) return null
  const dead = storeyWeights(model, p.gammaC ?? GAMMA_C)
  const live = storeyLiveLoads(model)
  // Zone 3 starts at Z = 0.3; the exemption is written for Zone 3 AND 4.
  const zone34 = (p.Z ?? 0) >= 0.3
  const limit = 0.02 / p.R

  const out: StabilityRow[] = []
  for (const row of drift) {
    // everything at or above this level contributes to Px and Vx
    const aboveOrAt = (e: number) => e >= row.elevation - 1e-6
    let Px = 0
    for (const w of dead) if (aboveOrAt(w.elevation)) Px += w.w
    for (const l of live) if (aboveOrAt(l.elevation)) Px += l.l
    const Vx = storeyForce.reduce((t, f) => t + (aboveOrAt(f.elevation) ? Math.abs(f.F) : 0), 0)
    if (!(Vx > 1e-9) || !(row.hs > 0)) continue          // no seismic demand — θ undefined
    const theta = (Px * row.ds) / (Vx * row.hs)
    const driftRatio = row.ds / row.hs
    const exempt = zone34 && driftRatio <= limit + 1e-12
    out.push({
      elevation: row.elevation, hs: row.hs, ds: row.ds, Px, Vx,
      theta, driftRatio, exempt, pDeltaRequired: !exempt && theta > 0.10,
    })
  }
  return out.length ? out : null
}

// ── Directional E-case builder (§208.7.2.7 + §208.8.1) ───────────────────

export interface ECaseOpts {
  /** Directions to envelope: '+X' | '-X' | '+Z' | '-Z'. */
  dirs: string[]
  /** §208.7.2.7 accidental torsion: split every case into ⟳/⟲ variants. */
  torsion?: boolean
  /** Accidental eccentricity ratio (default 0.05). */
  ecc?: number
  /** §208.8.1 orthogonal effects: add ±30% of the perpendicular direction to
   *  every case (100%+30% rule — corner columns / intersecting systems). */
  orth30?: boolean
}

const scaleNodeLoads = (loads: ModelLoad[], f: number): ModelLoad[] =>
  loads.map((l) => l.kind === 'node'
    ? {
      ...l,
      ...(l.Fx !== undefined ? { Fx: l.Fx * f } : {}),
      ...(l.Fy !== undefined ? { Fy: l.Fy * f } : {}),
      ...(l.Fz !== undefined ? { Fz: l.Fz * f } : {}),
    }
    : l)

/**
 * Expands per-axis base E-load sets (from the static §208.5 or RSA §208.6.4
 * procedure — `baseX` carries Fx, `baseZ` carries Fz, both in the + sense)
 * into the directional cat-E cases the design pipeline envelopes:
 *   dirs × (orth30 ? ±0.3·perpendicular : 1) × (torsion ? ⟳/⟲ : 1).
 * The accidental-torsion couple is built per component (100% primary and 30%
 * perpendicular each carry their own ±5%·L⊥ torque, same eccentricity sense).
 */
export function buildECases(
  model: StructuralModel, baseX: ModelLoad[], baseZ: ModelLoad[], o: ECaseOpts,
): LateralCase[] {
  const out: LateralCase[] = []
  for (const d of o.dirs) {
    const axis: 'x' | 'z' = d.includes('X') ? 'x' : 'z'
    const sign = d.startsWith('-') ? -1 : 1
    const prim = scaleNodeLoads(axis === 'x' ? baseX : baseZ, sign)
    const perpAxis: 'x' | 'z' = axis === 'x' ? 'z' : 'x'
    const perpBase = perpAxis === 'x' ? baseX : baseZ
    const perpVariants = o.orth30
      ? ([1, -1] as const).map((ps) => ({
        tag: `${ps > 0 ? '+' : '−'}0.3${perpAxis.toUpperCase()}`,
        loads: scaleNodeLoads(perpBase, 0.3 * ps),
      }))
      : [{ tag: '', loads: [] as ModelLoad[] }]
    for (const pv of perpVariants) {
      const name = `E${d}${pv.tag}`
      // Inherent torsion first, and unconditionally: it is where the force
      // acts, not an accidental allowance that can be switched off.
      const inh = [
        ...inherentTorsionLoads(model, prim, axis),
        ...(pv.loads.length ? inherentTorsionLoads(model, pv.loads, perpAxis) : []),
      ]
      const loads = [...prim, ...pv.loads, ...inh]
      if (!o.torsion) { out.push({ name, kind: 'E', loads }); continue }
      for (const s of [1, -1] as const) {
        const tor = [
          ...accidentalTorsionLoads(model, prim, axis, s, o.ecc),
          ...(pv.loads.length ? accidentalTorsionLoads(model, pv.loads, perpAxis, s, o.ecc) : []),
        ]
        out.push({ name: `${name}${s > 0 ? '⟳' : '⟲'}`, kind: 'E', loads: [...loads, ...tor] })
      }
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
