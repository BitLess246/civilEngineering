// Steel member and connection design — AISC 360-16, LRFD.
// Units throughout: geometry mm, forces kN, stresses MPa, moments kN·m.
// Sections are AiscShape from aiscSections (W-family only for beam/column).

import type { AiscShape } from './aiscSections'

export const E_STEEL = 200_000  // MPa

const PHI_B = 0.90   // §F1 flexure
const PHI_C = 0.90   // §E1 compression
const PHI_J = 0.75   // §J connections

// ─── Derived beam properties from W-shape geometry ────────────────────────
// Ix via box-subtraction (exact for sharp-corner I); Iy via A·ry² (tabulated
// ry is accurate); J by uniform-thickness formula (conservative ~40–60% low
// for W-shapes — Lr may be 10–20% shorter than tabulated; LTB results are
// conservative). Zx by first-moment formula (exact for sharp-corner I).

export interface DerivedBeamProps {
  Ix: number    // mm⁴
  Sx: number    // mm³, elastic strong-axis section modulus
  Zx: number    // mm³, plastic strong-axis section modulus
  Iy: number    // mm⁴
  Zy: number    // mm³, plastic weak-axis section modulus
  J: number     // mm⁴, torsional constant (uniform-t approx)
  ho: number    // mm, distance between flange centroids ≈ d − tf
  rts: number   // mm, effective radius of gyration (§F2-7)
  hw: number    // mm, clear web depth = d − 2·tf
}

export function deriveWSection(s: AiscShape): DerivedBeamProps {
  const { A, ry, d, bf, tf, tw } = s
  if (d == null || bf == null || tf == null || tw == null) throw new Error('W-section geometry missing')
  const hw = d - 2 * tf
  const Ix = (bf * d ** 3 - (bf - tw) * hw ** 3) / 12
  const Sx = Ix / (d / 2)
  const Zx = bf * tf * (d - tf) + (tw * hw * hw) / 4
  const Iy = A * ry * ry
  const Zy = tf * bf * bf / 2 + hw * tw * tw / 4
  const J = (2 * bf * tf ** 3 + hw * tw ** 3) / 3
  const ho = d - tf
  const Cw = (Iy * ho * ho) / 4
  const rts = Math.sqrt(Math.sqrt(Iy * Cw) / Sx)
  return { Ix, Sx, Zx, Iy, Zy, J, ho, rts, hw }
}

// ─── Beam flexure §F2 (doubly-symmetric I, compact or near-compact) ───────

export interface BeamFlexureResult {
  Mp: number          // kN·m, Fy·Zx
  Lp: number          // mm, §F2-5
  Lr: number          // mm, §F2-6
  ltbZone: 'plastic' | 'inelastic' | 'elastic'
  Mn: number          // kN·m
  phiMn: number       // kN·m
  lambdaF: number; lambdaPF: number; compactFlange: boolean
  lambdaW: number; lambdaPW: number; compactWeb: boolean
  compact: boolean
}

export function beamFlexure(
  s: AiscShape, p: DerivedBeamProps,
  Fy: number, Lb: number, Cb = 1.0
): BeamFlexureResult {
  const E = E_STEEL
  const { ry, bf, tf, tw } = s
  const { Sx, Zx, J, ho, hw, rts } = p

  const lambdaF  = bf! / (2 * tf!)
  const lambdaPF = 0.38 * Math.sqrt(E / Fy)
  const lambdaW  = hw / tw!
  const lambdaPW = 3.76 * Math.sqrt(E / Fy)
  const compactFlange = lambdaF <= lambdaPF
  const compactWeb    = lambdaW <= lambdaPW
  const compact = compactFlange && compactWeb

  const Mp = (Fy * Zx) / 1e6   // kN·m
  const Lp = 1.76 * ry * Math.sqrt(E / Fy)
  const c  = J / (Sx * ho)
  const Lr = 1.95 * rts * (E / (0.7 * Fy)) *
             Math.sqrt(c + Math.sqrt(c * c + 6.76 * ((0.7 * Fy) / E) ** 2))

  let Mn: number, ltbZone: BeamFlexureResult['ltbZone']
  if (Lb <= Lp) {
    ltbZone = 'plastic'; Mn = Mp
  } else if (Lb <= Lr) {
    ltbZone = 'inelastic'
    Mn = Cb * (Mp - (Mp - 0.7 * Fy * Sx / 1e6) * ((Lb - Lp) / (Lr - Lp)))
    Mn = Math.min(Mn, Mp)
  } else {
    ltbZone = 'elastic'
    const Fcr = (Cb * Math.PI ** 2 * E) / (Lb / rts) ** 2 *
                Math.sqrt(1 + 0.078 * (J / (Sx * ho)) * (Lb / rts) ** 2)
    Mn = Math.min((Fcr * Sx) / 1e6, Mp)
  }

  return { Mp, Lp, Lr, ltbZone, Mn, phiMn: PHI_B * Mn,
           lambdaF, lambdaPF, compactFlange, lambdaW, lambdaPW, compactWeb, compact }
}

// ─── Beam shear §G2.1 ─────────────────────────────────────────────────────
// Hot-rolled I-shapes: h/tw ≤ 2.24√(E/Fy) → φv = 1.0, Cv1 = 1.0 (§G2.1a).
// Slender webs use §G2.1(b) with kv = 5.34 (unstiffened).

export interface BeamShearResult {
  Aw: number; Cv1: number; phiV: number; phiVn: number; hwTw: number
}

export function beamShear(s: AiscShape, p: DerivedBeamProps, Fy: number): BeamShearResult {
  const E = E_STEEL
  const Aw   = s.d! * s.tw!
  const hwTw = p.hw / s.tw!
  let Cv1: number, phiV: number
  if (hwTw <= 2.24 * Math.sqrt(E / Fy)) {
    Cv1 = 1.0; phiV = 1.0
  } else {
    const kv = 5.34
    const lim1 = 1.10 * Math.sqrt(kv * E / Fy)
    const lim2 = 1.37 * Math.sqrt(kv * E / Fy)
    Cv1  = hwTw <= lim1 ? 1.0 : hwTw <= lim2 ? lim1 / hwTw : (1.51 * kv * E) / (Fy * hwTw * hwTw)
    phiV = 0.9
  }
  return { Aw, Cv1, phiV, phiVn: (phiV * 0.6 * Fy * Aw * Cv1) / 1000, hwTw }
}

// ─── Column axial §E3 ──────────────────────────────────────────────────────
// Both axes checked; governing (larger) KL/r controls Fcr.
// L in metres; returns phiPn in kN.

export interface ColumnAxialResult {
  slendernessX: number; slendernessY: number; slenderness: number
  Fcr: number; phiPn: number; slenderOK: boolean
}

export function columnAxial(
  s: AiscShape, Fy: number, L: number, Kx: number, Ky: number
): ColumnAxialResult {
  const E = E_STEEL
  const Lmm = L * 1000
  const slendernessX = (Kx * Lmm) / s.rx
  const slendernessY = (Ky * Lmm) / s.ry
  const slenderness  = Math.max(slendernessX, slendernessY)
  const limit = 4.71 * Math.sqrt(E / Fy)
  const Fe  = (Math.PI ** 2 * E) / slenderness ** 2
  const Fcr = slenderness <= limit ? Math.pow(0.658, Fy / Fe) * Fy : 0.877 * Fe
  return {
    slendernessX, slendernessY, slenderness, Fcr,
    phiPn: (PHI_C * Fcr * s.A) / 1000,
    slenderOK: slenderness <= 200,
  }
}

// ─── Weak-axis flexure §F6 ────────────────────────────────────────────────
// Compact W-shapes, no LTB about weak axis → Mny = Mp_y = Fy·Zy ≤ 1.6·Fy·Sy.

export interface WeakAxisResult { Sy: number; Zy: number; phiMny: number }

export function weakAxisFlexure(s: AiscShape, p: DerivedBeamProps, Fy: number): WeakAxisResult {
  const Sy  = (2 * p.Iy) / s.bf!
  const cap = Math.min(p.Zy, 1.6 * Sy)   // §F6-1 cap
  return { Sy, Zy: p.Zy, phiMny: (PHI_B * Fy * cap) / 1e6 }
}

// ─── Combined loading §H1-1 ───────────────────────────────────────────────
// Muy / phiMny defaults to 0 when no weak-axis moment is applied.

export interface CombinedResult { ratio: number; equation: 'H1-1a' | 'H1-1b'; ok: boolean }

export function combinedLoading(
  Pu: number, phiPn: number,
  Mux: number, phiMnx: number,
  Muy = 0, phiMny = Infinity
): CombinedResult {
  const pr = Pu / phiPn
  const mr = Mux / phiMnx + (phiMny > 0 ? Muy / phiMny : 0)
  const [ratio, equation]: [number, CombinedResult['equation']] =
    pr >= 0.2
      ? [pr + (8 / 9) * mr, 'H1-1a']
      : [pr / 2 + mr, 'H1-1b']
  return { ratio, equation, ok: ratio <= 1.0 }
}

// ─── Bolt shear §J3.6 + bearing §J3.10 ───────────────────────────────────
// Bolt shear: φRn = 0.75·Fnv·Ab per bolt (Table J3.2, metric bolts).
// Bearing:    φRn = 0.75·2.4·Fu·d·t per bolt (standard holes, §J3.10).

export type BoltGrade = 'A325M' | 'A490M'

export interface BoltResult {
  Ab: number; Fnv: number
  phiRn_shear: number   // kN per bolt
  phiRn_bearing: number // kN per bolt
  phiRn: number         // governing
  n_reqd: number        // bolts required for Vu
}

export function boltShear(
  grade: BoltGrade, db: number,
  Vu: number, t_conn: number, Fu_conn: number,
  threadsInPlane = true
): BoltResult {
  const Ab  = (Math.PI / 4) * db * db
  const Fnv = grade === 'A325M'
    ? (threadsInPlane ? 310 : 372)
    : (threadsInPlane ? 372 : 457)   // Table J3.2
  const phiRn_shear   = (PHI_J * Fnv * Ab) / 1000
  const phiRn_bearing = (PHI_J * 2.4 * Fu_conn * db * t_conn) / 1000
  const phiRn  = Math.min(phiRn_shear, phiRn_bearing)
  return { Ab, Fnv, phiRn_shear, phiRn_bearing, phiRn, n_reqd: Math.ceil(Vu / phiRn) }
}

// ─── Fillet weld §J2.4 ────────────────────────────────────────────────────
// Effective throat = 0.707·w (equal-leg fillet), 60° loading angle → θ = 0°.
// φRnw = 0.75·0.6·Fexx·0.707·w  per unit length (kN/mm).

export type ElectrodeClass = 'E70' | 'E80' | 'E90' | 'E100'

export interface WeldResult {
  Fexx: number
  phiRnw: number   // kN/mm per mm of weld length
  L_reqd: number   // mm total weld length for Vu
}

export function weldStrength(electrode: ElectrodeClass, wSize: number, Vu: number): WeldResult {
  const Fexx: Record<ElectrodeClass, number> = { E70: 482, E80: 550, E90: 620, E100: 690 }
  const Fex  = Fexx[electrode]
  const phiRnw = (PHI_J * 0.6 * Fex * 0.707 * wSize) / 1000   // kN/mm
  return { Fexx: Fex, phiRnw, L_reqd: phiRnw > 0 ? Vu / phiRnw : Infinity }
}

// ─── Beam loading (simple span, uniform load) → Mu, Vu, deflections ───────
// Deflection: δ = 5wL⁴/(384EI); w in kN/m = N/mm numerically.

export interface BeamLoadInput { wDead: number; wLive: number; L: number }

export interface BeamLoadsResult {
  wu: number   // kN/m, factored (max of 1.4D, 1.2D+1.6L)
  Mu: number   // kN·m
  Vu: number   // kN
  deltaD: number  // mm, dead-load deflection (unfactored)
  deltaL: number  // mm, live-load deflection
  limL360: number // mm, L/360
  limL240: number // mm, L/240
}

export function beamLoadingSimple(bl: BeamLoadInput, Ix_mm4: number): BeamLoadsResult {
  const { wDead, wLive, L } = bl
  const wu   = Math.max(1.4 * wDead, 1.2 * wDead + 1.6 * wLive)
  const Mu   = (wu * L * L) / 8
  const Vu   = (wu * L) / 2
  const Lmm  = L * 1000
  const coef = (5 * Lmm ** 4) / (384 * E_STEEL * Ix_mm4)
  return {
    wu, Mu, Vu,
    deltaD: wDead * coef,
    deltaL: wLive * coef,
    limL360: Lmm / 360,
    limL240: Lmm / 240,
  }
}

// ─── Bolt group geometry ──────────────────────────────────────────────────
// Bolt positions relative to the group centroid (mm).
// Grid is nRows (vertical) × nCols (horizontal), spacing sx / sy,
// edge distances ex (horizontal) and ey (vertical) from plate edges.

export interface BoltPos { id: string; x: number; y: number }

export interface BoltGroupGeom {
  bolts: BoltPos[]   // positions relative to centroid, mm
  n: number
  Cx: number; Cy: number   // centroid distance from bottom-left origin, mm
  Ip: number               // Σ(x² + y²), mm²
  plateW: number; plateH: number   // minimum plate size, mm
}

export function boltGroupGeom(
  nRows: number, nCols: number,
  sx: number, sy: number,
  ex: number, ey: number
): BoltGroupGeom {
  const abs: BoltPos[] = []
  for (let r = 0; r < nRows; r++)
    for (let c = 0; c < nCols; c++)
      abs.push({ id: `B${r * nCols + c + 1}`, x: ex + c * sx, y: ey + r * sy })
  const n   = abs.length
  const Cx  = abs.reduce((s, b) => s + b.x, 0) / n
  const Cy  = abs.reduce((s, b) => s + b.y, 0) / n
  const bolts = abs.map(b => ({ id: b.id, x: b.x - Cx, y: b.y - Cy }))
  const Ip  = bolts.reduce((s, b) => s + b.x ** 2 + b.y ** 2, 0)
  return { bolts, n, Cx, Cy, Ip, plateW: 2 * ex + (nCols - 1) * sx, plateH: 2 * ey + (nRows - 1) * sy }
}

// ─── In-plane eccentric bolt group — elastic (vector) method ─────────────
// Forces Pu (+Y = up) and Hu (+X = right) applied at offset (ex_load, ey_load)
// from the bolt centroid. Positive ex_load → load is to the RIGHT of centroid.
// M (CCW +) = Pu·ex_load − Hu·ey_load  [kN·mm]
// Each bolt force: direct V/n + moment contribution M·(-yi, xi)/Ip.

export interface BoltForce {
  id: string; x: number; y: number
  Vx: number; Vy: number   // kN, force components
  R: number                // kN, resultant
  utilShear: number        // R / phiRn_bolt
  fbr: number              // MPa, bearing stress = R·1000 / (db·t)
  fv: number               // MPa, average shear stress = R·1000 / Ab
}

export interface EccentricBoltResult {
  bolts: BoltForce[]
  critical: string   // bolt id of max resultant
  Rmax: number       // kN
  M: number          // kN·mm
}

export function eccentricBoltGroup(
  geom: BoltGroupGeom,
  Pu: number, Hu: number,
  ex_load: number, ey_load: number,
  phiRn: number,
  db: number, t_plate: number
): EccentricBoltResult {
  const { bolts, n, Ip } = geom
  const Ab = (Math.PI / 4) * db * db
  const M  = Pu * ex_load - Hu * ey_load
  const bf: BoltForce[] = bolts.map(b => {
    const Vx = Hu / n - M * b.y / Ip
    const Vy = Pu / n + M * b.x / Ip
    const R  = Math.sqrt(Vx ** 2 + Vy ** 2)
    return { ...b, Vx, Vy, R, utilShear: phiRn > 0 ? R / phiRn : Infinity,
             fbr: (R * 1000) / (db * t_plate), fv: (R * 1000) / Ab }
  })
  const ci = bf.reduce((mi, _, i) => bf[i].R > bf[mi].R ? i : mi, 0)
  return { bolts: bf, critical: bf[ci].id, Rmax: bf[ci].R, M }
}

// ─── Block shear §J4.3 ────────────────────────────────────────────────────
// Rn = min(0.6·Fu·Anv + Ubs·Fu·Ant,  0.6·Fy·Agv + Ubs·Fu·Ant)  φ = 0.75
// Two standard paths for a shear tab / single bolt column are returned.

export interface BlockShearCase {
  label: string
  Agv: number; Anv: number; Agt: number; Ant: number; Ubs: number
  Rn_fract: number   // shear fracture + tension fracture, kN
  Rn_cap: number     // shear yield cap, kN
  Rn: number; phiRn: number   // kN
}

// shear tab: nRows bolts in one vertical column, spacing sy, edge distances
// ey_top (top) / ey_bot (bottom) / ex_edge (horizontal to free edge).
export function shearTabBlockShear(
  nRows: number, sy: number,
  ey_top: number, ey_bot: number, ex_edge: number,
  db: number, t: number,
  Fy: number, Fu: number
): BlockShearCase[] {
  const dh  = db + 2   // hole diameter (+2 mm oversize)
  const Agt = t * ex_edge
  const Ant = Agt - 0.5 * dh * t

  const mkCase = (label: string, Lv: number): BlockShearCase => {
    const Agv = t * Lv
    const Anv = Agv - (nRows - 0.5) * dh * t
    const Ubs = 1.0
    const Rn_fract = (0.6 * Fu * Math.max(0, Anv) + Ubs * Fu * Math.max(0, Ant)) / 1000
    const Rn_cap   = (0.6 * Fy * Agv                + Ubs * Fu * Math.max(0, Ant)) / 1000
    const Rn = Math.min(Rn_fract, Rn_cap)
    return { label, Agv, Anv: Math.max(0, Anv), Agt, Ant: Math.max(0, Ant), Ubs, Rn_fract, Rn_cap, Rn, phiRn: 0.75 * Rn }
  }

  return [
    mkCase('§J4.3 Case A — shear path from bottom edge (governs for short end distance at bottom)', (nRows - 1) * sy + ey_bot),
    mkCase('§J4.3 Case B — shear path from top edge', (nRows - 1) * sy + ey_top),
  ]
}
