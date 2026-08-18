// Steel member and connection design — AISC 360-16, LRFD.
// Units throughout: geometry mm, forces kN, stresses MPa, moments kN·m.
// Sections are AiscShape from aiscSections (W-family only for beam/column).

import type { AiscShape } from './aiscSections'
import { basisFactor, requiredFromDL, type DesignBasis } from './designBasis'

export const E_STEEL = 200_000  // MPa

// The phi values below are the LRFD half of the dual format. Every result type
// also carries the NOMINAL strength, because `designBasis.ts` needs Rn to state
// the ASD allowable Rn/Omega — see that module for why the two must not mix.
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

// ─── Beam flexure §F2 / §F3 (doubly-symmetric I-shapes) ───────────────────
// §F2 covers a COMPACT flange and a COMPACT web. §F3 keeps the compact web but
// takes a flange-local-buckling reduction for a noncompact or slender flange.
// Anything with a non-compact WEB is §F4/§F5 and a tee is §F9 — neither is
// implemented, and both are reported as out of scope rather than silently given
// the compact §F2 strength (which is what this module used to do: it computed
// the compactness ratios, printed them, and then returned Mp regardless).

/** Width-to-thickness classification of one plate element, Table B4.1b. */
export type PlateClass = 'compact' | 'noncompact' | 'slender'
/** Which flexure clause the section actually falls under. */
export type FlexureClause = 'F2' | 'F3' | 'out-of-scope'

export interface FlexureScope {
  lambdaF: number; lambdaPF: number; lambdaRF: number; flangeClass: PlateClass
  lambdaW: number; lambdaPW: number; lambdaRW: number; webClass: PlateClass
  compactFlange: boolean; compactWeb: boolean; compact: boolean
  clause: FlexureClause
  /** False when no implemented clause covers the section. A caller must NOT
   *  use `Mn`/`phiMn` in that case — they are returned as 0 so that anything
   *  that ignores this flag fails loudly instead of passing quietly. */
  applicable: boolean
  /** Why it is out of scope, in the words the schedule shows the user. */
  reason?: string
}

/**
 * Classify a shape for strong-axis flexure (Table B4.1b cases 10/15) and say
 * which clause covers it. Exported so the pipeline can state the reason a
 * member went unchecked without having to build the full result first.
 */
export function beamFlexureScope(s: AiscShape, p: DerivedBeamProps, Fy: number): FlexureScope {
  const E = E_STEEL
  const lambdaF  = s.bf! / (2 * s.tf!)
  const lambdaPF = 0.38 * Math.sqrt(E / Fy)   // Table B4.1b case 10
  const lambdaRF = 1.0  * Math.sqrt(E / Fy)
  const lambdaW  = p.hw / s.tw!
  const lambdaPW = 3.76 * Math.sqrt(E / Fy)   // Table B4.1b case 15
  const lambdaRW = 5.70 * Math.sqrt(E / Fy)

  const flangeClass: PlateClass = lambdaF <= lambdaPF ? 'compact' : lambdaF <= lambdaRF ? 'noncompact' : 'slender'
  const webClass:    PlateClass = lambdaW <= lambdaPW ? 'compact' : lambdaW <= lambdaRW ? 'noncompact' : 'slender'
  const compactFlange = flangeClass === 'compact'
  const compactWeb    = webClass === 'compact'

  let clause: FlexureClause, reason: string | undefined
  if (s.family !== 'W') {
    clause = 'out-of-scope'
    // deriveWSection assumes two flanges about a mid-depth axis, so a tee run
    // through it is not merely the wrong clause — Ix, Sx and Zx are wrong too.
    reason = s.family === 'WT'
      ? `${s.name} is a tee — strong-axis flexure of tees is §F9, which is not implemented`
      : `${s.name} is family ${s.family} — §F2/§F3 cover doubly-symmetric I-shapes only`
  } else if (webClass === 'noncompact') {
    clause = 'out-of-scope'
    reason = `${s.name} at Fy=${Fy} MPa has a noncompact web (λw=${lambdaW.toFixed(1)} > λpw=${lambdaPW.toFixed(1)}) — §F4 is not implemented`
  } else if (webClass === 'slender') {
    clause = 'out-of-scope'
    reason = `${s.name} at Fy=${Fy} MPa has a slender web (λw=${lambdaW.toFixed(1)} > λrw=${lambdaRW.toFixed(1)}) — §F5 is not implemented`
  } else {
    clause = compactFlange ? 'F2' : 'F3'
  }

  return {
    lambdaF, lambdaPF, lambdaRF, flangeClass,
    lambdaW, lambdaPW, lambdaRW, webClass,
    compactFlange, compactWeb, compact: compactFlange && compactWeb,
    clause, applicable: clause !== 'out-of-scope', reason,
  }
}

export interface BeamFlexureResult extends FlexureScope {
  Mp: number          // kN·m, Fy·Zx
  Lp: number          // mm, §F2-5
  Lr: number          // mm, §F2-6
  ltbZone: 'plastic' | 'inelastic' | 'elastic'
  /** §F2.2 lateral-torsional buckling strength, kN·m. */
  MnLTB: number
  /** §F3.2 flange-local-buckling strength, kN·m — Infinity when the flange is
   *  compact, i.e. when FLB is not a limit state (§F2 has no FLB term). */
  MnFLB: number
  /** Which of the two limit states produced `Mn`. */
  governing: 'yielding' | 'LTB' | 'FLB'
  Mn: number          // kN·m — 0 when `applicable` is false
  phiMn: number       // kN·m — 0 when `applicable` is false
  /** §F3.2(b) coefficient 4/√(h/tw), clamped to [0.35, 0.76]; only meaningful
   *  for a slender flange. */
  kc: number
}

export function beamFlexure(
  s: AiscShape, p: DerivedBeamProps,
  Fy: number, Lb: number, Cb = 1.0
): BeamFlexureResult {
  const E = E_STEEL
  const { ry } = s
  const { Sx, Zx, J, ho, hw, rts } = p
  const scope = beamFlexureScope(s, p, Fy)

  const Mp = (Fy * Zx) / 1e6   // kN·m
  const Lp = 1.76 * ry * Math.sqrt(E / Fy)
  const c  = J / (Sx * ho)
  const Lr = 1.95 * rts * (E / (0.7 * Fy)) *
             Math.sqrt(c + Math.sqrt(c * c + 6.76 * ((0.7 * Fy) / E) ** 2))

  // §F2.2 lateral-torsional buckling — the same three zones apply under §F3.1.
  let MnLTB: number, ltbZone: BeamFlexureResult['ltbZone']
  if (Lb <= Lp) {
    ltbZone = 'plastic'; MnLTB = Mp
  } else if (Lb <= Lr) {
    ltbZone = 'inelastic'
    MnLTB = Cb * (Mp - (Mp - 0.7 * Fy * Sx / 1e6) * ((Lb - Lp) / (Lr - Lp)))
    MnLTB = Math.min(MnLTB, Mp)
  } else {
    ltbZone = 'elastic'
    const Fcr = (Cb * Math.PI ** 2 * E) / (Lb / rts) ** 2 *
                Math.sqrt(1 + 0.078 * (J / (Sx * ho)) * (Lb / rts) ** 2)
    MnLTB = Math.min((Fcr * Sx) / 1e6, Mp)
  }

  // §F3.2 flange local buckling. Compact flange ⇒ not a limit state.
  const kc = Math.min(0.76, Math.max(0.35, 4 / Math.sqrt(hw / s.tw!)))
  let MnFLB = Infinity
  if (scope.flangeClass === 'noncompact') {
    // §F3-1
    MnFLB = Mp - (Mp - 0.7 * Fy * Sx / 1e6) *
            ((scope.lambdaF - scope.lambdaPF) / (scope.lambdaRF - scope.lambdaPF))
  } else if (scope.flangeClass === 'slender') {
    // §F3-2
    MnFLB = (0.9 * E * kc * Sx) / (scope.lambdaF ** 2) / 1e6
  }

  const Mn = Math.min(MnLTB, MnFLB)
  const governing: BeamFlexureResult['governing'] =
    MnFLB < MnLTB ? 'FLB' : ltbZone === 'plastic' ? 'yielding' : 'LTB'

  return {
    ...scope,
    Mp, Lp, Lr, ltbZone, MnLTB, MnFLB, governing, kc,
    Mn: scope.applicable ? Mn : 0,
    phiMn: scope.applicable ? PHI_B * Mn : 0,
  }
}

// ─── Beam shear §G2.1 ─────────────────────────────────────────────────────
// Hot-rolled I-shapes: h/tw ≤ 2.24√(E/Fy) → φv = 1.0, Cv1 = 1.0 (§G2.1a).
// Slender webs use §G2.1(b) with kv = 5.34 (unstiffened).

export interface BeamShearResult {
  Aw: number; Cv1: number; phiV: number; phiVn: number; hwTw: number
  /** Nominal shear strength 0.6·Fy·Aw·Cv1, kN. */
  Vn: number
  /** True when §G2.1(b) governs, which changes BOTH phi (1.00→0.90) and
   *  Omega (1.50→1.67) — the basis layer needs to know which pair to use. */
  slenderWeb: boolean
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
  const Vn = (0.6 * Fy * Aw * Cv1) / 1000
  return { Aw, Cv1, phiV, phiVn: phiV * Vn, hwTw, Vn, slenderWeb: phiV !== 1.0 }
}

// ─── Column axial §E3 ──────────────────────────────────────────────────────
// Both axes checked; governing (larger) KL/r controls Fcr.
// L in metres; returns phiPn in kN.

export interface ColumnAxialResult {
  slendernessX: number; slendernessY: number; slenderness: number
  Fcr: number; phiPn: number; slenderOK: boolean
  /** Nominal compressive strength Fcr·Ag, kN. */
  Pn: number
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
  const Pn = (Fcr * s.A) / 1000
  return {
    slendernessX, slendernessY, slenderness, Fcr,
    phiPn: PHI_C * Pn, Pn,
    slenderOK: slenderness <= 200,
  }
}

// ─── Weak-axis flexure §F6 ────────────────────────────────────────────────
// §F6.1 yielding: Mny = Mp,y = Fy·Zy ≤ 1.6·Fy·Sy.
// §F6.2 flange local buckling: only a limit state when the flange is NOT
// compact. Web slenderness is irrelevant about the weak axis (the web is at the
// neutral axis), so §F6 has no web term and needs no scope gate for it.

export interface WeakAxisResult {
  Sy: number; Zy: number; phiMny: number
  /** Nominal weak-axis flexural strength, kN·m. */
  Mny: number
  /** §F6.1 yielding strength before any FLB reduction, kN·m. */
  MnY: number
  /** §F6.2 flange-local-buckling strength, kN·m; Infinity for a compact flange. */
  MnFLB: number
  flangeClass: PlateClass
}

export function weakAxisFlexure(s: AiscShape, p: DerivedBeamProps, Fy: number): WeakAxisResult {
  const E = E_STEEL
  const Sy  = (2 * p.Iy) / s.bf!
  const cap = Math.min(p.Zy, 1.6 * Sy)   // §F6-1 cap
  const MnY = (Fy * cap) / 1e6

  // λ for §F6 is the same half-flange ratio b/tf used by Table B4.1b case 10.
  const lambdaF  = s.bf! / (2 * s.tf!)
  const lambdaPF = 0.38 * Math.sqrt(E / Fy)
  const lambdaRF = 1.0  * Math.sqrt(E / Fy)
  const flangeClass: PlateClass = lambdaF <= lambdaPF ? 'compact' : lambdaF <= lambdaRF ? 'noncompact' : 'slender'

  let MnFLB = Infinity
  if (flangeClass === 'noncompact') {
    // §F6-2
    MnFLB = MnY - (MnY - 0.7 * Fy * Sy / 1e6) * ((lambdaF - lambdaPF) / (lambdaRF - lambdaPF))
  } else if (flangeClass === 'slender') {
    // §F6-3/§F6-4: Fcr = 0.69E/λ²
    MnFLB = ((0.69 * E) / (lambdaF ** 2)) * Sy / 1e6
  }

  const Mny = Math.min(MnY, MnFLB)
  return { Sy, Zy: p.Zy, phiMny: PHI_B * Mny, Mny, MnY, MnFLB, flangeClass }
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
  /** Nominal strengths, kN per bolt — what `designBasis.available()` needs to
   *  state the ASD allowable Rn/Ω rather than back it out of φRn. */
  Rn_shear: number; Rn_bearing: number; Rn: number
}

/**
 * @param nShear shear planes crossing the bolt: 1 for a lap (single shear),
 *   2 for a splice with plates both sides (double shear). AISC §J3.6 counts
 *   strength PER SHEAR PLANE, so the shear capacity scales with it. BEARING
 *   DOES NOT — it is a plate check, governed by the ply the bolt bears against,
 *   and doubling the shear planes does not thicken that ply. Passing the tab
 *   thickness for `t_conn` therefore stays the right, conservative input.
 */
export function boltShear(
  grade: BoltGrade, db: number,
  Vu: number, t_conn: number, Fu_conn: number,
  threadsInPlane = true, nShear = 1
): BoltResult {
  const Ab  = (Math.PI / 4) * db * db
  const Fnv = grade === 'A325M'
    ? (threadsInPlane ? 310 : 372)
    : (threadsInPlane ? 372 : 457)   // Table J3.2
  const Rn_shear   = (Fnv * Ab * nShear) / 1000
  const Rn_bearing = (2.4 * Fu_conn * db * t_conn) / 1000
  const phiRn_shear   = PHI_J * Rn_shear
  const phiRn_bearing = PHI_J * Rn_bearing
  const phiRn  = Math.min(phiRn_shear, phiRn_bearing)
  return {
    Ab, Fnv, phiRn_shear, phiRn_bearing, phiRn, n_reqd: Math.ceil(Vu / phiRn),
    Rn_shear, Rn_bearing, Rn: Math.min(Rn_shear, Rn_bearing),
  }
}

// ─── Fillet weld §J2.4 ────────────────────────────────────────────────────
// Effective throat = 0.707·w (equal-leg fillet), 60° loading angle → θ = 0°.
// φRnw = 0.75·0.6·Fexx·0.707·w  per unit length (kN/mm).

export type ElectrodeClass = 'E70' | 'E80' | 'E90' | 'E100'

export interface WeldResult {
  Fexx: number
  phiRnw: number   // kN/mm per mm of weld length
  L_reqd: number   // mm total weld length for Vu
  /** Nominal strength per unit length 0.6·Fexx·0.707·w, kN/mm. */
  Rnw: number
}

/** Nominal electrode tensile strength, MPa. Exported because the eccentric
 *  weld-group page offers the same classes and must not carry its own copy of
 *  the table — two tables is how E80 ends up at 550 on one page and 552 on the
 *  other. */
export const FEXX_BY_CLASS: Record<ElectrodeClass, number> = { E70: 482, E80: 550, E90: 620, E100: 690 }

export function weldStrength(electrode: ElectrodeClass, wSize: number, Vu: number): WeldResult {
  const Fex  = FEXX_BY_CLASS[electrode]
  const Rnw    = (0.6 * Fex * 0.707 * wSize) / 1000            // kN/mm
  const phiRnw = PHI_J * Rnw
  return { Fexx: Fex, phiRnw, L_reqd: phiRnw > 0 ? Vu / phiRnw : Infinity, Rnw }
}

// ─── Beam loading (simple span, uniform load) → Mu, Vu, deflections ───────
// Deflection: δ = 5wL⁴/(384EI); w in kN/m = N/mm numerically.

export interface BeamLoadInput { wDead: number; wLive: number; L: number }

export interface BeamLoadsResult {
  wu: number   // kN/m, required — factored under LRFD, service sum under ASD
  Mu: number   // kN·m
  Vu: number   // kN
  deltaD: number  // mm, dead-load deflection (unfactored)
  deltaL: number  // mm, live-load deflection
  limL360: number // mm, L/360
  limL240: number // mm, L/240
}

export function beamLoadingSimple(
  bl: BeamLoadInput, Ix_mm4: number,
  /** ASD sums the service loads instead of factoring them. Comparing an ASD
   *  allowable strength against a FACTORED demand — or the reverse — is the
   *  error the whole dual format exists to keep apart, so the combination
   *  travels with the basis rather than being fixed here. */
  basis: DesignBasis = 'LRFD',
): BeamLoadsResult {
  const { wDead, wLive, L } = bl
  const wu   = requiredFromDL(basis, wDead, wLive)
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

/** Bolt-group geometry (centroid + polar inertia Ip) from ARBITRARY bolt
 *  positions — lets a connection be designed with each bolt placed anywhere in
 *  the plane, not just a regular grid. Positions are absolute (plate) mm. */
export function boltGeomFromPositions(abs: BoltPos[]): BoltGroupGeom {
  const n = abs.length
  if (n === 0) return { bolts: [], n: 0, Cx: 0, Cy: 0, Ip: 0, plateW: 0, plateH: 0 }
  const Cx = abs.reduce((s, b) => s + b.x, 0) / n
  const Cy = abs.reduce((s, b) => s + b.y, 0) / n
  const bolts = abs.map((b) => ({ id: b.id, x: b.x - Cx, y: b.y - Cy }))
  const Ip = bolts.reduce((s, b) => s + b.x ** 2 + b.y ** 2, 0)
  const xs = abs.map((b) => b.x), ys = abs.map((b) => b.y)
  return { bolts, n, Cx, Cy, Ip, plateW: Math.max(...xs) - Math.min(...xs), plateH: Math.max(...ys) - Math.min(...ys) }
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

// ─── Out-of-plane eccentricity §J3.7 ─────────────────────────────────────
// Load Vu applied at perpendicular distance e_out from the bolt group plane
// produces out-of-plane moment M_op = Vu·e_out (kN·mm).
// Neutral axis at the bottom bolt row (plate bearing against column flange).
// Bolt tension: T_i = M_op · yi / Σyi²  (yi = height above lowest bolt, mm).
// Combined shear + tension interaction per §J3.7 (LRFD):
//   φFnt' = min(1.3·Fnt − (Fnt/(φ·Fnv))·frv, Fnt) ≥ 0
//   utilisation = T_i / (φ·Fnt'·Ab/1000) ≤ 1.0

const BOLT_Fnt: Record<BoltGrade, number> = { A325M: 620, A490M: 780 }

export interface OutOfPlaneBolt {
  id: string
  yi: number           // mm from lowest bolt (neutral axis)
  T: number            // kN, bolt tension
  frt: number          // MPa, tension stress = T·1000/Ab
  frv: number          // MPa, shear stress from in-plane analysis
  phiFnt_prime: number // MPa, reduced tensile strength (§J3.7)
  phiTn: number        // kN, available bolt tension capacity
  util: number         // T / phiTn
  ok: boolean
}

export interface OutOfPlaneResult {
  M_op: number
  Fnt: number; Fnv: number; Ab: number
  sumYi2: number       // mm², Σyi²
  bolts: OutOfPlaneBolt[]
  critical: string     // bolt id with maximum tension
  Tmax: number; phiTn_crit: number
  ok: boolean
}

export function outOfPlaneBoltGroup(
  geom: BoltGroupGeom,
  inPlaneBolts: BoltForce[],
  e_out: number,        // mm, perpendicular to bolt group plane
  Vu: number,           // kN, applied shear
  boltGrade: BoltGrade,
  db: number,           // mm
  threadInPlane: boolean,
  /**
   * §J3.7 is written twice in the specification:
   *   LRFD  F'nt = 1.3Fnt − (Fnt / (φ Fnv)) frv ≤ Fnt
   *   ASD   F'nt = 1.3Fnt − (Ω Fnt / Fnv)   frv ≤ Fnt
   * Both are "Fnt over the AVAILABLE shear stress", so one expression covers
   * them once the factor is chosen — which is why this takes a basis rather
   * than rescaling an LRFD answer. Rescaling would be wrong here: the factor
   * is inside the reduction, not outside the result.
   */
  basis: DesignBasis = 'LRFD',
): OutOfPlaneResult {
  const k = basisFactor(basis, 'connection')   // φ, or 1/Ω
  const Fnt = BOLT_Fnt[boltGrade]
  const Fnv = boltGrade === 'A325M'
    ? (threadInPlane ? 310 : 372)
    : (threadInPlane ? 372 : 457)
  const Ab = (Math.PI / 4) * db * db
  const M_op = Vu * e_out   // kN·mm

  const absYs = geom.bolts.map(b => b.y + geom.Cy)
  const yMin  = Math.min(...absYs)
  const yis   = absYs.map(y => y - yMin)
  const sumYi2 = yis.reduce((s, yi) => s + yi * yi, 0)

  const bolts: OutOfPlaneBolt[] = geom.bolts.map((b, i) => {
    const yi  = yis[i]
    const T   = sumYi2 > 0 ? (M_op * yi) / sumYi2 : 0
    const frv = inPlaneBolts.find(ip => ip.id === b.id)?.fv ?? 0
    const frt = (T * 1000) / Ab
    const phiFnt_prime = Math.max(0, Math.min(1.3 * Fnt - (Fnt / (k * Fnv)) * frv, Fnt))
    const phiTn = (k * phiFnt_prime * Ab) / 1000
    const util = phiTn > 0 ? T / phiTn : (T > 0 ? Infinity : 0)
    return { id: b.id, yi, T, frt, frv, phiFnt_prime, phiTn, util, ok: util <= 1.0 }
  })

  const ci = bolts.reduce((mi, _, i) => bolts[i].T > bolts[mi].T ? i : mi, 0)
  return {
    M_op, Fnt, Fnv, Ab, sumYi2, bolts,
    critical: bolts[ci].id, Tmax: bolts[ci].T, phiTn_crit: bolts[ci].phiTn,
    ok: bolts.every(b => b.ok),
  }
}

// ─── Prying action §J3.9 — AISC Manual Part 9 T-stub model ──────────────
// Applied to the critical bolt of a bolted fitting (bracket plate, angle, tee).
// Prying force Q amplifies the required bolt tension T_req → T_total = T+Q.
//
// Geometry (mm):
//   b  = bolt CL to face of the connecting web/stem (fitting gage distance)
//   a  = bolt CL to free edge of the fitting flange (= horizontal edge distance)
//   p  = tributary bolt pitch (bolt spacing along fitting; use sy for interior bolts)
//   tf = fitting plate/flange thickness
//   db = bolt diameter; dh = db + 2 (standard hole, +2 mm oversize)
//
// α = 0 → no prying (thick plate);  α = 1 → full prying (thin plate).
// Required plate thickness to sustain T_req including prying:
//   t_req = √(4·T_req·b' / (φ_f·Fy·p·(1 + δ·α)))   φ_f = 0.90 (plate flexure)
// Minimum thickness to eliminate prying entirely:
//   t_0   = √(4·φBn·b'  / (φ_f·Fy·p))

export interface PryingResult {
  b_prime: number      // mm  b − db/2
  a_prime: number      // mm  min(a, 1.25b)
  rho: number          // b'/a'
  delta: number        // 1 − dh/p
  beta: number         // prying potential = (1/ρ)(φBn/T − 1)
  alpha: number        // 0 to 1, prying fraction
  Q: number            // kN, prying force on critical bolt
  T_total: number      // kN, T_req + Q
  t_req: number        // mm, required plate thickness
  t_no_prying: number  // mm, minimum t to eliminate prying
  ok: boolean          // T_total ≤ φBn
}

// T_req: required bolt tension (kN); phi_Bn: available bolt tension (kN, φFnt'·Ab/1000)
export function pryingAction(
  T_req: number, phi_Bn: number,
  b: number, a: number, p: number,
  _tf: number, db: number, Fy: number,
  /** Affects the PLATE-flexure factor in t_req and t_0 only — `phi_Bn` is
   *  already the available bolt tension on the caller's basis. */
  basis: DesignBasis = 'LRFD',
): PryingResult {
  const phi_f = basisFactor(basis, 'plateFlexure')
  const dh     = db + 2
  const b_prime = b - db / 2
  const a_prime = Math.min(a, 1.25 * b)
  const rho   = b_prime / a_prime
  const delta = Math.max(0, 1 - dh / p)

  let beta = 0, alpha = 0
  if (T_req <= 0) {
    // no tension — no prying
  } else if (T_req >= phi_Bn) {
    // bolt already overstressed; worst-case prying
    alpha = 1.0
    beta  = 0
  } else {
    beta = (1 / rho) * (phi_Bn / T_req - 1)
    if (beta >= 1.0) {
      alpha = 1.0
    } else {
      const denom = delta * (1 - beta)
      alpha = denom > 0 ? Math.min(beta / denom, 1.0) : 1.0
    }
  }

  const Q       = alpha * delta * rho * T_req
  const T_total = T_req + Q

  // plate thickness formulas (kN → N: ×1000)
  const factor       = phi_f * Fy * p
  const t_req        = factor > 0 && (1 + delta * alpha) > 0
    ? Math.sqrt((4 * T_req * 1000 * b_prime) / (factor * (1 + delta * alpha)))
    : Infinity
  const t_no_prying  = factor > 0
    ? Math.sqrt((4 * phi_Bn * 1000 * b_prime) / factor)
    : Infinity

  return { b_prime, a_prime, rho, delta, beta, alpha, Q, T_total, t_req, t_no_prying, ok: T_total <= phi_Bn }
}
