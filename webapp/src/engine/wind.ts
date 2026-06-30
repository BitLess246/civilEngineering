// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 §207B Directional Procedure — MWFRS wind loads for enclosed
// rigid buildings of all heights.
//   Velocity pressure   qz = 0.613·Kz·Kzt·Kd·V²   (N/m², V in m/s)   (207B.3-1)
//   Kz = 2.01·(z/zg)^(2/α), z floored at 4.5 m, capped at zg          (Table 207B.3-1, Note 1)
//   Design pressure     p = q·G·Cp − qi·(GCpi)     (N/m²)            (207B.4-1)
//     q  = qz (windward, varies with height); qh (leeward/side, at roof h)
//     Cp = +0.8 windward, leeward −0.5/−0.3/−0.2 by L/B (Figure 207B.4-1)
//     G  = 0.85 (rigid, §207A.9);  Kd = 0.85 (Table 207A.6-1)
// For the lateral (along-wind) MWFRS the internal pressure GCpi acts equally
// on windward and leeward faces and cancels in the horizontal sum, so the net
// storey force uses only the external windward + leeward wall pressures. The
// forces are emitted as NODE loads (category 'W') split across each level's
// nodes — the existing NSCP combinations (1.2D+1.0W+…, 0.9D+1.0W) pick them up.
//
// Components & Cladding (§207E.4, low-rise walls) is provided separately below
// (`computeCladding`) for local cladding/curtain-wall pressures. Roof uplift and
// MWFRS side-wall pressures remain out of scope.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, ModelLoad } from './model'

export interface WindParams {
  V: number                  // basic wind speed, m/s (§207A.5)
  exposure: 'B' | 'C' | 'D'
  Kzt?: number               // topographic factor (default 1.0, §207A.8)
  Kd?: number                // directionality factor (default 0.85, Table 207A.6-1)
  G?: number                 // gust-effect factor (default 0.85 rigid, §207A.9)
  dir: 'x' | 'z'
}

export interface WindLevel {
  elevation: number; Kz: number; qz: number   // qz in kN/m²
  pWind: number; pLee: number                  // kN/m² (= q·G·Cp, leeward as magnitude)
  tribH: number; Fx: number                    // kN net horizontal force at the level
  nodes: number
}

export interface WindResult {
  V: number; h: number; B: number; L: number; LB: number
  Kd: number; G: number; qh: number; CpLee: number
  levels: WindLevel[]
  baseShear: number
  loads: ModelLoad[]         // node loads, cat 'W'
}

/** Exposure constants (Table 207A.9-1): power-law exponent α, gradient height zg (m). */
const EXPO: Record<string, { a: number; zg: number }> = {
  B: { a: 7.0, zg: 365.76 },
  C: { a: 9.5, zg: 274.32 },
  D: { a: 11.5, zg: 213.36 },
}

/** Velocity-pressure exposure coefficient Kz (Table 207B.3-1, Note 1):
 *  Kz = 2.01·(z/zg)^(2/α), with z floored at 4.5 m and capped at zg. */
export function windKz(z: number, exposure: 'B' | 'C' | 'D'): number {
  const { a, zg } = EXPO[exposure]
  const zz = Math.min(Math.max(z, 4.5), zg)
  return 2.01 * (zz / zg) ** (2 / a)
}

/** Velocity pressure qz = 0.613·Kz·Kzt·Kd·V² (207B.3-1), returned in kN/m². */
export function velocityPressure(
  z: number, V: number, exposure: 'B' | 'C' | 'D', Kzt = 1.0, Kd = 0.85,
): number {
  return (0.613 * windKz(z, exposure) * Kzt * Kd * V * V) / 1000
}

/** Leeward-wall external pressure coefficient Cp (Figure 207B.4-1), a function
 *  of the along-wind/across-wind ratio L/B: −0.5 (≤1), −0.3 (=2), −0.2 (≥4). */
export function cpLeeward(LB: number): number {
  if (LB <= 1) return -0.5
  if (LB <= 2) return -0.5 + (LB - 1) * 0.2          // −0.5 → −0.3
  if (LB < 4) return -0.3 + (LB - 2) * 0.05          // −0.3 → −0.2
  return -0.2
}

const CP_WIND = 0.8   // windward wall, Figure 207B.4-1

export function computeWind(model: StructuralModel, p: WindParams): WindResult | null {
  if (model.nodes.length === 0) return null
  const xs = model.nodes.map((n) => n.x)
  const ys = model.nodes.map((n) => n.y)
  const zs = model.nodes.map((n) => n.z)
  const h = Math.max(...ys)
  if (!(h > 0)) return null
  const xr = Math.max(...xs) - Math.min(...xs)
  const zr = Math.max(...zs) - Math.min(...zs)
  const B = p.dir === 'x' ? zr : xr                  // across-wind width
  const L = p.dir === 'x' ? xr : zr                  // along-wind depth
  if (!(B > 0)) return null
  const LB = L > 0 ? L / B : 1

  const Kd = p.Kd ?? 0.85, Kzt = p.Kzt ?? 1.0, G = p.G ?? 0.85
  const q = (z: number) => velocityPressure(z, p.V, p.exposure, Kzt, Kd) // kN/m²
  const qh = q(h)
  const CpLee = cpLeeward(LB)
  const pLee = qh * G * Math.abs(CpLee)              // leeward suction → adds to along-wind force

  // Diaphragm levels (elevated storeys) with the ground at 0.
  const elev = [...new Set(model.storeys.map((s) => s.elevation))].sort((a, b) => a - b)
  const levelsAll = [0, ...elev]
  const nodesAt = (e: number) => model.nodes.filter((n) => Math.abs(n.y - e) < 1e-6)

  const levels: WindLevel[] = []
  const loads: ModelLoad[] = []
  let baseShear = 0
  for (let k = 1; k < levelsAll.length; k++) {
    const e = levelsAll[k]
    const below = levelsAll[k - 1]
    const above = k + 1 < levelsAll.length ? levelsAll[k + 1] : null
    const tribH = (e - below) / 2 + (above !== null ? (above - e) / 2 : 0)
    const qz = q(e)
    const pWind = qz * G * CP_WIND
    const F = (pWind + pLee) * B * tribH             // kN, net windward + leeward
    const nodes = nodesAt(e)
    levels.push({ elevation: e, Kz: windKz(e, p.exposure), qz, pWind, pLee, tribH, Fx: F, nodes: nodes.length })
    baseShear += F
    if (nodes.length > 0 && F > 1e-9) {
      const per = F / nodes.length
      for (const n of nodes) {
        loads.push(p.dir === 'x'
          ? { kind: 'node', node: n.id, Fx: per, cat: 'W' }
          : { kind: 'node', node: n.id, Fz: per, cat: 'W' })
      }
    }
  }
  return { V: p.V, h, B, L, LB, Kd, G, qh, CpLee, levels, baseShear, loads }
}

// ─────────────────────────────────────────────────────────────────────────
// NSCP 2015 §207E — Components & Cladding (C&C), low-rise walls (h ≤ 18.3 m).
//
//   Design pressure  p = qh·[(GCp) − (GCpi)]   (kN/m²)        (207E.4-1)
//   qh = velocity pressure at mean roof height h
//   (GCp): external pressure coefficient by wall zone & effective wind area
//          (Figure 207E.4-1); (GCpi): internal pressure coefficient
//          (Table 207A.11-1: ±0.18 enclosed, ±0.55 partially enclosed, 0 open).
//
// Wall (GCp), all roof angles, h ≤ 18.3 m — log-linear in the effective wind
// area A between A₁ = 0.93 m² and A₂ = 46.5 m² (constant outside that band):
//   Zone 4 (interior):  + 1.0 → +0.7 ,  − 1.1 → −0.8
//   Zone 5 (corner)  :  + 1.0 → +0.7 ,  − 1.4 → −0.8
// The controlling pressures combine the worst internal pressure with each
// external sign: p⁺ = qh·(GCp⁺ + |GCpi|),  p⁻ = qh·(GCp⁻ − |GCpi|).
// (Roof C&C zones 1/2/3 and h > 18.3 m §207E.5 remain out of scope.)
// ─────────────────────────────────────────────────────────────────────────
export type WindEnclosure = 'enclosed' | 'partially' | 'open'

/** Internal pressure coefficient magnitude |GCpi| (Table 207A.11-1). */
export function gcpiMagnitude(e: WindEnclosure): number {
  return e === 'enclosed' ? 0.18 : e === 'partially' ? 0.55 : 0
}

/** Effective-wind-area breakpoints for the wall C&C curves, m² (10 / 500 ft²). */
const CC_A1 = 0.93
const CC_A2 = 46.5

/** Log-linear interpolation of a GCp value over the effective wind area A. */
function ccInterp(v1: number, v2: number, area: number): number {
  const a = Math.min(Math.max(area, CC_A1), CC_A2)
  const t = (Math.log10(a) - Math.log10(CC_A1)) / (Math.log10(CC_A2) - Math.log10(CC_A1))
  return v1 + (v2 - v1) * t
}

/** External wall (GCp) for C&C zone 4 (interior) or 5 (corner), by area (Fig 207E.4-1). */
export function wallGCp(zone: 4 | 5, area: number): { pos: number; neg: number } {
  const pos = ccInterp(1.0, 0.7, area)                       // both zones share +GCp
  const neg = zone === 5 ? ccInterp(-1.4, -0.8, area) : ccInterp(-1.1, -0.8, area)
  return { pos, neg }
}

/** C&C design pressures (kN/m²) for one wall zone at a given effective area. */
export interface CladdingZonePressure {
  zone: 4 | 5
  GCpPos: number; GCpNeg: number
  /** Positive (inward) and negative (suction, ≤ 0) design pressures, kN/m². */
  pPos: number; pNeg: number
}

export interface CladdingParams extends WindParams {
  /** Effective wind area of the component, m² (§207A.3); clamps to the curve band. */
  area: number
  enclosure: WindEnclosure
}

export interface CladdingResult {
  h: number; qh: number; GCpi: number; area: number; enclosure: WindEnclosure
  zone4: CladdingZonePressure; zone5: CladdingZonePressure
}

/**
 * Components & Cladding wall pressures (NSCP §207E.4) for an enclosed/partially
 * enclosed low-rise building. Returns null when the building height is non-positive.
 * `dir` is irrelevant for C&C wall pressures (qh uses the mean roof height h).
 */
export function computeCladding(model: StructuralModel, p: CladdingParams): CladdingResult | null {
  if (model.nodes.length === 0) return null
  const h = Math.max(...model.nodes.map((n) => n.y))
  if (!(h > 0)) return null
  const Kd = p.Kd ?? 0.85, Kzt = p.Kzt ?? 1.0
  const qh = velocityPressure(h, p.V, p.exposure, Kzt, Kd)
  const gi = gcpiMagnitude(p.enclosure)
  const zone = (z: 4 | 5): CladdingZonePressure => {
    const g = wallGCp(z, p.area)
    return { zone: z, GCpPos: g.pos, GCpNeg: g.neg, pPos: qh * (g.pos + gi), pNeg: qh * (g.neg - gi) }
  }
  return { h, qh, GCpi: gi, area: p.area, enclosure: p.enclosure, zone4: zone(4), zone5: zone(5) }
}
