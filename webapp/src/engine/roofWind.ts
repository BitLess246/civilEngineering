// ─────────────────────────────────────────────────────────────────────────
// ROOF WIND ON A TRUSSED ROOF — NSCP 2015 §207B (MWFRS, Directional), the
// roof half of Figure 207B.4-1, as node loads at the truss panel points.
//
// `computeWind` covers the walls: the along-wind storey forces. A trussed
// roof is light (sheeting on purlins, ~0.5 kPa), and the roof suction the
// same wind puts on it can exceed its dead load — the truss then works in
// REVERSE: the bottom chord in compression over its full span, unbraced
// between panel points, which no gravity combination ever shows. This module
// adds that roof pressure to each directional W case, so 0.9D + 1.0W sees it.
//
//   p = qh·G·Cp − qh·(GCpi)                                  (207B.4-1)
//   qh at the MEAN ROOF HEIGHT h: the eave height for θ ≤ 10°, else the
//   average of eave and ridge (§207A.2); G = 0.85 (rigid, §207A.9);
//   (GCpi) = +0.18 enclosed / +0.55 partially enclosed (Table 207A.11-1) —
//   positive internal pressure pushes the roof UP, so it is the sign that
//   adds to the suction.
//
// Cp (Figure 207B.4-1, roof):
//   · wind NORMAL to the ridge, θ ≥ 10°: windward slope by θ and h/L (the
//     NEGATIVE — uplift — branch, the one that reverses a light truss),
//     leeward slope by θ and h/L;
//   · wind PARALLEL to the ridge, or any roof flatter than 10°: by distance
//     from the windward edge, 0–h/2, h/2–h, h–2h, > 2h, for h/L ≤ 0.5 and
//     ≥ 1.0 (the area reduction the figure allows on −1.3 is not taken).
//   Interpolated linearly in θ and in h/L between the tabulated columns.
//
// Each panel point carries the half-panels either side of it (the tributary
// `model.roofing` already stores, plan area), each loaded NORMAL TO ITS OWN
// SLOPE: F = −p·A_plan·n/n_y with n the outward normal, so the vertical part is
// −p·A_plan and a sloped half-panel also pushes (or pulls) horizontally.
//
// TWO BRANCHES. The figure gives the windward slope two Cp values and both
// must be checked:
//   · 'uplift' (default) — the negative windward value with +GCpi: the roof
//     sucked up, a light truss reversed;
//   · 'downward' — the POSITIVE windward value with −GCpi (internal suction
//     pulling the roof down too), wind normal to the ridge only. On a steep
//     roof (θ ≳ 20°) the windward slope is pushed DOWN, which adds to the
//     gravity compression in the top chord. Below that the "positive" value is
//     −0.18 … 0, the case sits between dead-only and uplift, and governs
//     nothing — `windwardCp` says which, so the caller can skip it.
// Units: m, kPa, kN.
// ─────────────────────────────────────────────────────────────────────────
import type { ModelLoad, StructuralModel } from './model'
import { velocityPressure } from './wind'
import { trussPart } from './roofTruss'

export type WindDir = '+X' | '-X' | '+Z' | '-Z'

export interface RoofWindParams {
  V: number
  exposure: 'B' | 'C' | 'D'
  Kzt?: number; Kd?: number; G?: number
  /** Internal pressure, Table 207A.11-1; the + value is applied (uplift). */
  enclosure?: 'enclosed' | 'partially' | 'open'
  dir: WindDir
  /** Which windward Cp the figure's pair to apply — see the header. */
  branch?: 'uplift' | 'downward'
}

export interface RoofWindResult {
  /** Mean roof height, m, and the velocity pressure there, kPa. */
  h: number; qh: number
  /** Roof slope, degrees, and h/L for this direction. */
  theta: number; hL: number
  normalToRidge: boolean
  /** The internal pressure applied, signed (+ pushes the roof up). */
  GCpi: number
  /** The largest windward-slope Cp used (normal-to-ridge only; else NaN). */
  windwardCp: number
  loads: ModelLoad[]
  /** Net vertical force on the roof, kN (+ up). */
  uplift: number
}

const lerp = (x: number, x0: number, x1: number, y0: number, y1: number) =>
  x1 === x0 ? y0 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0)
/** Piecewise-linear lookup, clamped at both ends. */
function table(x: number, xs: readonly number[], ys: readonly number[]): number {
  if (x <= xs[0]) return ys[0]
  for (let k = 1; k < xs.length; k++) if (x <= xs[k]) return lerp(x, xs[k - 1], xs[k], ys[k - 1], ys[k])
  return ys[ys.length - 1]
}

const TH = [10, 15, 20, 25, 30, 35, 45] as const
const HL = [0.25, 0.5, 1.0] as const
/** Windward roof, normal to ridge — the NEGATIVE (uplift) branch (Fig. 207B.4-1).
 *  Where the figure gives only a positive value (45°, h/L ≤ 0.25) the
 *  negative branch is 0.0. */
const WINDWARD_NEG: Record<number, readonly number[]> = {
  0.25: [-0.7, -0.5, -0.3, -0.2, -0.2, 0.0, 0.0],
  0.5: [-0.9, -0.7, -0.4, -0.3, -0.2, -0.2, 0.0],
  1.0: [-1.3, -1.0, -0.7, -0.5, -0.3, -0.2, 0.0],
}
/** Windward roof, normal to ridge — the POSITIVE (downward) branch. Where
 *  the figure gives only one value at 10–20° for the steeper h/L columns it
 *  is −0.18 (Fig. 207B.4-1). */
const WINDWARD_POS: Record<number, readonly number[]> = {
  0.25: [-0.18, 0.0, 0.2, 0.3, 0.3, 0.4, 0.4],
  0.5: [-0.18, -0.18, 0.0, 0.2, 0.2, 0.3, 0.4],
  1.0: [-0.18, -0.18, -0.18, 0.0, 0.2, 0.2, 0.3],
}
/** Leeward roof, normal to ridge (Fig. 207B.4-1): θ = 10, 15, ≥ 20. */
const LEEWARD: Record<number, readonly number[]> = {
  0.25: [-0.3, -0.5, -0.6],
  0.5: [-0.5, -0.5, -0.6],
  1.0: [-0.7, -0.6, -0.6],
}

const byHL = (hL: number, f: (col: number) => number) => {
  const c = Math.max(HL[0], Math.min(HL[2], hL))
  if (c <= 0.5) return lerp(c, 0.25, 0.5, f(0.25), f(0.5))
  return lerp(c, 0.5, 1.0, f(0.5), f(1.0))
}

/** Windward-slope Cp, uplift branch, wind normal to the ridge (θ ≥ 10°). */
export function cpWindwardRoof(thetaDeg: number, hL: number): number {
  return byHL(hL, (col) => table(thetaDeg, TH, WINDWARD_NEG[col]))
}
/** Windward-slope Cp, DOWNWARD branch, wind normal to the ridge (θ ≥ 10°). */
export function cpWindwardRoofPos(thetaDeg: number, hL: number): number {
  return byHL(hL, (col) => table(thetaDeg, TH, WINDWARD_POS[col]))
}
/** Leeward-slope Cp, wind normal to the ridge (θ ≥ 10°). */
export function cpLeewardRoof(thetaDeg: number, hL: number): number {
  return byHL(hL, (col) => table(thetaDeg, [10, 15, 20], LEEWARD[col]))
}
/** Cp at distance d from the windward edge — wind parallel to the ridge, or
 *  θ < 10° (Fig. 207B.4-1): h/L ≤ 0.5 → −0.9 to h, −0.5 to 2h, −0.3 beyond;
 *  h/L ≥ 1.0 → −1.3 to h/2, −0.7 beyond; linear in h/L between. */
export function cpRoofByDistance(d: number, h: number, hL: number): number {
  const low = d <= h ? -0.9 : d <= 2 * h ? -0.5 : -0.3
  const high = d <= h / 2 ? -1.3 : -0.7
  const c = Math.max(0.5, Math.min(1.0, hL))
  return lerp(c, 0.5, 1.0, low, high)
}

const GCPI: Record<NonNullable<RoofWindParams['enclosure']>, number> = { enclosed: 0.18, partially: 0.55, open: 0 }

/**
 * The roof's MWFRS wind for one direction, as node loads (cat 'W') at the
 * truss panel points. Empty (null) without trussed roofing.
 */
export function roofWindLoads(model: StructuralModel, p: RoofWindParams): RoofWindResult | null {
  const r = model.roofing
  if (!r || r.points.length === 0) return null
  const node = new Map(model.nodes.map((n) => [n.id, n]))
  const tops = model.members.filter((m) => trussPart(m.id)?.part === 'top')
  if (!tops.length) return null

  // the half-panels each point carries: one per top-chord member it ends
  type Piece = { node: string; area: number; n: [number, number, number]; cx: number; cz: number; theta: number }
  const pieces: Piece[] = []
  let ridgeAxis: 'x' | 'z' = 'x'       // the plan axis the TRUSSES span along
  for (const pt of r.points) {
    const at = node.get(pt.node)
    if (!at) continue
    const ms = tops.filter((m) => m.i === pt.node || m.j === pt.node)
    if (!ms.length) continue
    const halves = ms.map((m) => {
      const o = node.get(m.i === pt.node ? m.j : m.i)!
      const dx = o.x - at.x, dy = o.y - at.y, dz = o.z - at.z
      return { dx, dy, dz, plan: Math.hypot(dx, dz) / 2 }
    })
    const planSum = halves.reduce((s, q) => s + q.plan, 0)
    if (!(planSum > 0)) continue
    const width = pt.area / planSum                       // the tributary width across the truss
    for (const q of halves) {
      const L = Math.hypot(q.dx, q.dy, q.dz)
      const t: [number, number, number] = [q.dx / L, q.dy / L, q.dz / L]
      if (Math.abs(q.dx) >= Math.abs(q.dz)) ridgeAxis = 'x'; else ridgeAxis = 'z'
      // across the truss, horizontal: perpendicular to its plan direction
      const ph = Math.hypot(t[0], t[2]) || 1
      const c: [number, number, number] = [-t[2] / ph, 0, t[0] / ph]
      // outward normal: t × c, flipped to point up
      let n: [number, number, number] = [t[1] * c[2] - t[2] * c[1], t[2] * c[0] - t[0] * c[2], t[0] * c[1] - t[1] * c[0]]
      const nl = Math.hypot(...n) || 1
      n = n.map((v) => v / nl) as [number, number, number]
      if (n[1] < 0) n = n.map((v) => -v) as [number, number, number]
      pieces.push({
        node: pt.node, area: q.plan * width, n,
        cx: at.x + q.dx / 4, cz: at.z + q.dz / 4,
        theta: (Math.acos(Math.min(1, n[1])) * 180) / Math.PI,
      })
    }
  }
  if (!pieces.length) return null

  const ys = r.points.map((pt) => node.get(pt.node)?.y).filter((y): y is number => y !== undefined)
  const eave = Math.min(...ys), ridge = Math.max(...ys)
  const theta = Math.max(...pieces.map((q) => q.theta))
  const h = theta <= 10 ? eave : (eave + ridge) / 2
  const qh = velocityPressure(h, p.V, p.exposure, p.Kzt ?? 1, p.Kd ?? 0.85)
  const G = p.G ?? 0.85
  const down = p.branch === 'downward'
  // + internal pressure lifts the roof (uplift branch); − pulls it down
  const GCpi = (down ? -1 : 1) * GCPI[p.enclosure ?? 'enclosed']

  const axis = p.dir.includes('X') ? 'x' : 'z'
  const sgn = p.dir.startsWith('-') ? -1 : 1
  const w: [number, number, number] = axis === 'x' ? [sgn, 0, 0] : [0, 0, sgn]
  const coords = model.nodes.map((n) => (axis === 'x' ? n.x : n.z))
  const lo = Math.min(...coords), hi = Math.max(...coords)
  const L = Math.max(hi - lo, 1e-9)
  const hL = h / L
  // the wind runs along the truss span: it meets the slopes — normal to the ridge
  const normalToRidge = axis === ridgeAxis && theta >= 10
  // the downward branch exists only where the wind meets the slopes
  if (down && !normalToRidge) return null

  const force = new Map<string, [number, number, number]>()
  let uplift = 0, windwardCp = Number.NaN
  for (const q of pieces) {
    let cp: number
    if (normalToRidge) {
      // windward slope: its outward normal faces into the wind
      const faces = q.n[0] * w[0] + q.n[2] * w[2] < -1e-9
      cp = faces ? (down ? cpWindwardRoofPos(q.theta, hL) : cpWindwardRoof(q.theta, hL)) : cpLeewardRoof(q.theta, hL)
      if (faces) windwardCp = Number.isNaN(windwardCp) ? cp : Math.max(windwardCp, cp)
    } else {
      const d = sgn > 0 ? (axis === 'x' ? q.cx : q.cz) - lo : hi - (axis === 'x' ? q.cx : q.cz)
      cp = cpRoofByDistance(Math.max(0, d), h, hL)
    }
    const press = qh * G * cp - qh * GCpi                 // kPa, + toward the surface
    // F = −p·A_plan·n/n_y: the half-panel's true area A/n_y, pushed along −n
    const k = (-press * q.area) / q.n[1]
    const f = force.get(q.node) ?? [0, 0, 0]
    force.set(q.node, [f[0] + k * q.n[0], f[1] + k * q.n[1], f[2] + k * q.n[2]])
    uplift += -press * q.area
  }
  const loads: ModelLoad[] = []
  for (const [id, [Fx, Fy, Fz]] of force) {
    if (Math.hypot(Fx, Fy, Fz) < 1e-9) continue
    loads.push({ kind: 'node', node: id, Fx, Fy, Fz, cat: 'W' })
  }
  return { h, qh, theta, hL, normalToRidge, GCpi, windwardCp, loads, uplift }
}
