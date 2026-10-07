// ─────────────────────────────────────────────────────────────────────────
// Steel column base plate — AISC 360-16 §J8 + AISC Design Guide 1 (concentric
// axial, LRFD). Bearing on concrete governs the plan area; cantilever bending
// of the plate governs the thickness. An optional net uplift sizes the anchor
// rods in tension (§J9 / Table J3.2).
//
//  · Concrete bearing §J8:  φc·Pp,  Pp = 0.85 f'c A1 √(A2/A1) ≤ 1.7 f'c A1,
//    φc = 0.65.  √(A2/A1) capped at 2.0 (confinement benefit limit).
//  · Plan sizing (DG1):  Δ = (0.95 d − 0.8 bf)/2;  N ≈ √A1,req + Δ;  B = A1/N.
//  · Cantilevers:  m = (N − 0.95 d)/2,  n = (B − 0.8 bf)/2,
//    n' = √(d·bf)/4;  ℓ = max(m, n, λn'),  λ ≈ 1 (conservative).
//  · Thickness (DG1):  tp = ℓ·√(2 fp /(0.9 Fy)),  fp = Pu/(B·N).
//  · Anchor rods: minimum 4, OUTSIDE the flanges — rod centre a nut-and-wrench
//    clearance max(40, 1.75·da) off each flange face, max(50, 2·da) in from
//    the plate edge — so N ≥ d + 2·(clearance + edge). Inside the flanges a
//    W310's rods sat 8 mm off the flange, where no nut fits. In net uplift
//    Tu, required area Ab,req = Tu /(n_rods·φt·0.75·Fu_rod), φt = 0.75; the
//    concrete side of the anchorage is `anchorDesign` (ACI 318-14 Ch. 17).
// Units: forces kN, moments kN·m, geometry mm, stress MPa.
// ─────────────────────────────────────────────────────────────────────────

export type AnchorGrade = 'A307' | 'F1554-36' | 'F1554-55' | 'A325M'

/** Nominal tensile strength Fu of common anchor-rod grades (MPa). */
export const ANCHOR_FU: Record<AnchorGrade, number> = {
  A307: 414, 'F1554-36': 400, 'F1554-55': 517, A325M: 830,
}
/** …and yield, MPa (A307 has none specified — its F1554-36 equivalent). */
export const ANCHOR_FY: Record<AnchorGrade, number> = {
  A307: 248, 'F1554-36': 248, 'F1554-55': 380, A325M: 660,
}

export interface BasePlateInput {
  Pu: number              // factored axial compression, kN
  Tu?: number             // factored net uplift (tension), kN — default 0
  d: number               // column depth, mm
  bf: number              // column flange width, mm
  fc: number              // concrete f'c, MPa
  Fy?: number             // plate yield, MPa — default 248 (A36)
  /** Supporting concrete area A2 / plate area A1 (confinement). Default 1.0
   *  (plate fully covers the pier). Capped at 4 → √ ratio capped at 2. */
  a2OverA1?: number
  nRods?: number          // anchor-rod count — default 4
  rodGrade?: AnchorGrade  // default A307
  rodDia?: number         // anchor-rod diameter, mm — default 25
  /** Least plate length / width, mm — what an axial + moment check
   *  (`basePlateMoment`) found the plate needs along each axis. */
  Nmin?: number; Bmin?: number
}

export interface BasePlateResult {
  // bearing
  sqrtRatio: number       // √(A2/A1), capped at 2.0
  fpMax: number           // φc · bearing stress capacity, MPa
  A1req: number           // required bearing area, mm²
  // plan
  N: number; B: number    // adopted plate dimensions, mm (N along d, B along bf)
  A1: number              // provided area, mm²
  fp: number              // actual bearing pressure, MPa
  bearingUtil: number     // Pu / φc·Pp
  bearingOK: boolean
  // thickness
  m: number; n: number; nPrime: number; ell: number   // cantilevers, mm
  tReq: number            // required plate thickness, mm
  // anchors
  Tu: number
  rodAbReq: number        // required tensile area per rod, mm²
  rodAbProv: number       // provided area per rod, mm²
  anchorOK: boolean
  /** Rod positions from the plate centre, mm: ±rodX along N, ±rodY along B. */
  rodX: number; rodY: number
}

/** Rod centre clearance off a flange face, and rod centre to plate edge, mm. */
export const rodFlangeClearance = (da: number) => Math.max(40, 1.75 * da)
export const rodEdge = (da: number) => Math.max(50, 2 * da)

const PHI_C = 0.65   // §J8 bearing
const PHI_B = 0.90   // plate flexure
const PHI_T = 0.75   // §J3 rod tension

export function designBasePlate(i: BasePlateInput): BasePlateResult {
  const Fy = i.Fy ?? 248
  const a2OverA1 = Math.max(1, i.a2OverA1 ?? 1)
  const sqrtRatio = Math.min(Math.sqrt(a2OverA1), 2.0)
  const fpMax = PHI_C * 0.85 * i.fc * sqrtRatio   // ≤ φc·1.7f'c automatically (sqrtRatio≤2)

  // required bearing area from φc·Pp ≥ Pu
  const PuN = Math.max(i.Pu, 0) * 1000            // N
  const A1req = fpMax > 0 ? PuN / fpMax : 0

  // DG1 plan sizing: keep the two cantilevers roughly balanced
  const delta = (0.95 * i.d - 0.8 * i.bf) / 2
  // start from a square-ish plate that respects the column footprint
  const dia = i.rodDia ?? 25
  const Nrods = i.d + 2 * (rodFlangeClearance(dia) + rodEdge(dia))   // rods outside the flanges
  const Nstart = Math.max(Math.sqrt(A1req) + delta, 0.95 * i.d + 40, i.d + 50, Nrods, i.Nmin ?? 0)
  let N = Math.ceil(Nstart / 10) * 10
  // …and wide enough for the rods across it to stand 4·da apart (ACI §17.7.1)
  let B = Math.max(A1req / N, 0.8 * i.bf + 40, i.bf + 50, 4 * dia + 2 * rodEdge(dia), i.Bmin ?? 0)
  B = Math.ceil(B / 10) * 10
  // grow to satisfy bearing if the rounded plate is short
  while (N * B < A1req && N < 4000) { N += 10; B = Math.ceil(Math.max(B, A1req / N) / 10) * 10 }

  const A1 = N * B
  const fp = A1 > 0 ? PuN / A1 : 0
  const phiPp = fpMax * A1 / 1000                 // kN
  const bearingUtil = phiPp > 0 ? i.Pu / phiPp : Infinity

  // cantilevers
  const m = (N - 0.95 * i.d) / 2
  const n = (B - 0.8 * i.bf) / 2
  const nPrime = Math.sqrt(i.d * i.bf) / 4        // λ = 1 (conservative)
  const ell = Math.max(m, n, nPrime)

  // required thickness (DG1): tp = ℓ √(2 fp / (φb Fy)); fp from actual pressure
  const tReq = ell * Math.sqrt((2 * fp) / (PHI_B * Fy))

  // anchor rods in net uplift
  const Tu = Math.max(i.Tu ?? 0, 0)
  const nRods = i.nRods ?? 4
  const Fu = ANCHOR_FU[i.rodGrade ?? 'A307']
  const rodAbProv = (Math.PI / 4) * dia * dia
  // φRn per rod = φt · 0.75 Fu · Ab  (0.75 = effective-area factor, §J3.6)
  const rodCapPerRod = (PHI_T * 0.75 * Fu * rodAbProv) / 1000   // kN
  const rodAbReq = Tu > 0 ? (Tu * 1000) / (nRods * PHI_T * 0.75 * Fu) : 0
  const anchorOK = Tu <= 0 || (nRods * rodCapPerRod >= Tu - 1e-9)

  return {
    sqrtRatio, fpMax, A1req,
    N, B, A1, fp, bearingUtil, bearingOK: bearingUtil <= 1 + 1e-9,
    m, n, nPrime, ell, tReq,
    Tu, rodAbReq, rodAbProv, anchorOK,
    rodX: Math.min(i.d / 2 + rodFlangeClearance(dia), N / 2 - rodEdge(dia)),
    rodY: B / 2 - rodEdge(dia),
  }
}

/** Round a required plate thickness up to the next common plate stock (mm). */
export const PLATE_STOCK = [10, 12, 16, 20, 22, 25, 28, 32, 36, 40, 45, 50]
export function adoptPlateThickness(tReq: number): number {
  return PLATE_STOCK.find((t) => t >= tReq - 1e-6) ?? Math.ceil(tReq / 5) * 5
}

// ─── Axial load + moment — AISC Design Guide 1 (2nd ed.) §3.3/§3.4 ────────
// The uniform-bearing method: the bearing block under the compression side is
// Y long at qmax = fp(max)·B (N/mm). Below the critical eccentricity
// ecrit = N/2 − Pu/(2·qmax) the plate bears over Y = N − 2e and the rods stay
// slack; above it, the rods on the tension side (at f from the plate centre)
// pull Tu = qmax·Y − Pu, with
//   Y = (f + N/2) − √((f + N/2)² − 2(Mu + Pu·f)/qmax)
// (no real root ⇒ the plate is too short for the moment). Thickness on the
// bearing side is the cantilever m under fp (1.5·m·√(fp/Fy) once Y ≥ m, else
// 2.11·√(fp·Y·(m − Y/2)/Fy)), and on the tension side the rods bend the plate
// about the flange: 2.11·√(Tu·x/(B·Fy)), x = f − d/2 + tf/2. Both constants
// carry φb = 0.90. Written with Mu rather than e, so a moment with no axial
// load (e → ∞) and a net uplift are the same equations.
// N here is the plate's length ALONG the bending; B across it, d and bf the
// column's depth and width in those directions, m its cantilever along N.

export interface BasePlateMomentInput {
  Pu: number            // kN, compression +
  Mu: number            // kN·m, magnitude
  N: number; B: number  // mm
  m: number             // cantilever along N, mm
  dBend: number         // column dimension along N (d, or bf for the weak axis), mm
  tfBend: number        // flange (or web) thickness that the rods bend the plate about, mm
  f: number             // plate centre → tension rod line, mm
  fc: number; Fy?: number; a2OverA1?: number
}

export interface BasePlateMomentResult {
  e: number                 // Mu/Pu, mm (Infinity with no compression)
  qmax: number; fpMax: number
  ecrit: number
  regime: 'small' | 'large' | 'uplift' | 'too short'
  Y: number                 // bearing length, mm
  fp: number                // bearing pressure, MPa
  Tu: number                // tension-side rods, total, kN
  x: number                 // rod line to the flange centre, mm
  tReqBearing: number; tReqTension: number; tReq: number
  ok: boolean               // solvable within the plate
}

export function basePlateMoment(i: BasePlateMomentInput): BasePlateMomentResult {
  const Fy = i.Fy ?? 248
  const sqrtRatio = Math.min(Math.sqrt(Math.max(1, i.a2OverA1 ?? 1)), 2)
  const fpMax = PHI_C * 0.85 * i.fc * sqrtRatio
  const qmax = fpMax * i.B                          // N/mm
  const P = i.Pu * 1000, M = Math.abs(i.Mu) * 1e6  // N, N·mm
  const x = i.f - i.dBend / 2 + i.tfBend / 2
  const bearingT = (fp: number, Y: number) =>
    Y >= i.m ? 1.5 * i.m * Math.sqrt(fp / Fy) : 2.11 * Math.sqrt((fp * Y * (i.m - Y / 2)) / Fy)
  const tensionT = (T: number) => (T > 0 ? 2.11 * Math.sqrt((T * Math.max(x, 0)) / (i.B * Fy)) : 0)
  const out = (r: Omit<BasePlateMomentResult, 'qmax' | 'fpMax' | 'x' | 'tReq'>): BasePlateMomentResult =>
    ({ ...r, qmax, fpMax, x, tReq: Math.max(r.tReqBearing, r.tReqTension) })

  if (P <= 0) {
    // net uplift (or none): the rods take the couple about their two lines
    // and half the uplift each side — no bearing
    const T = M / (2 * i.f) + -P / 2
    return out({ e: Infinity, ecrit: 0, regime: 'uplift', Y: 0, fp: 0, Tu: T / 1000, tReqBearing: 0, tReqTension: tensionT(T), ok: true })
  }
  const e = M / P
  const ecrit = i.N / 2 - P / (2 * qmax)
  if (e <= ecrit) {
    const Y = i.N - 2 * e
    const fp = P / (Y * i.B)
    return out({ e, ecrit, regime: 'small', Y, fp, Tu: 0, tReqBearing: bearingT(fp, Y), tReqTension: 0, ok: true })
  }
  const a = i.f + i.N / 2
  const disc = a * a - (2 * (M + P * i.f)) / qmax
  if (disc < 0) return out({ e, ecrit, regime: 'too short', Y: NaN, fp: fpMax, Tu: NaN, tReqBearing: NaN, tReqTension: NaN, ok: false })
  const Y = a - Math.sqrt(disc)
  const T = qmax * Y - P
  return out({ e, ecrit, regime: 'large', Y, fp: fpMax, Tu: T / 1000, tReqBearing: bearingT(fpMax, Y), tReqTension: tensionT(T), ok: true })
}

/** One load case at a column base: axial (compression +, kN) and the base
 *  moment about the column's strong and weak axes, kN·m. */
export interface BaseCase { name: string; P: number; Ms: number; Mw: number }
export type BaseMomentCase = BasePlateMomentResult & { name: string }

export interface BasePlateMomentCheck {
  /** The case that needs the thickest plate about each axis. */
  strong: BaseMomentCase
  weak: BaseMomentCase
  /** The thickest the moments ask for, mm, and the largest single-rod
   *  tension they put in the rods (two rods each side), kN. */
  tReq: number
  rodTu: number
  /** A case the plate is too short for, about either axis. */
  shortN: boolean; shortB: boolean
}

/** `basePlateMoment` for every case about both axes of a designed plate.
 *  Strong axis: along N, cantilever m, rods at ±rodX, bending about the
 *  flange. Weak axis: along B, cantilever n, rods at ±rodY, bending about the
 *  flange tips (x = rodY − bf/2, nothing where the rods sit inside them). */
export function basePlateMoments(
  p: BasePlateResult, col: { d: number; bf: number; tf: number }, cases: BaseCase[], fc: number, Fy = 248, a2OverA1 = 1,
): BasePlateMomentCheck {
  const run = (c: BaseCase, axis: 'strong' | 'weak'): BaseMomentCase => ({
    name: c.name,
    ...(axis === 'strong'
      ? basePlateMoment({ Pu: c.P, Mu: c.Ms, N: p.N, B: p.B, m: p.m, dBend: col.d, tfBend: col.tf, f: p.rodX, fc, Fy, a2OverA1 })
      : basePlateMoment({ Pu: c.P, Mu: c.Mw, N: p.B, B: p.N, m: p.n, dBend: col.bf, tfBend: 0, f: p.rodY, fc, Fy, a2OverA1 })),
  })
  const worst = (rs: BaseMomentCase[]) => rs.reduce((a, b) =>
    (!b.ok && a.ok) || (b.ok === a.ok && (b.tReq > a.tReq || (!(a.tReq > 0) && b.Tu > a.Tu))) ? b : a)
  const S = cases.map((c) => run(c, 'strong')), W = cases.map((c) => run(c, 'weak'))
  const all = [...S, ...W].filter((r) => r.ok)
  return {
    strong: worst(S), weak: worst(W),
    tReq: Math.max(0, ...all.map((r) => r.tReq)),
    rodTu: Math.max(0, ...all.map((r) => r.Tu / 2)),
    shortN: S.some((r) => !r.ok), shortB: W.some((r) => !r.ok),
  }
}

/** The column-to-plate fillets (AISC §J2.4): under a base moment or uplift
 *  the tension flange pulls on the plate with T = Ms/(d − tf) − Pu/2 (the
 *  compression a flange still carries in bearing subtracts; uplift adds), so
 *  each flange is welded on both faces over its width — two lines of bf, less
 *  the web — to carry T at φ·0.6·FEXX·0.707·w. The Table J2.4 minimum for the
 *  thinner of flange and plate is the floor; a column in bearing alone still
 *  gets it, the plate is set on the column, not hung from it. */
export interface ColumnBaseWeld { T: number; L: number; w: number; wMin: number; phiRn: number; ok: boolean }
export function columnBaseWeld(
  col: { d: number; bf: number; tf: number; tw?: number }, tPlate: number, cases: BaseCase[], FEXX = 482,
): ColumnBaseWeld {
  const T = Math.max(0, ...cases.map((c) => (c.Ms * 1000) / (col.d - col.tf) - c.P / 2))
  const L = 2 * col.bf - (col.tw ?? 0)
  const per = (w: number) => (0.75 * 0.6 * FEXX * 0.707 * w * L) / 1000
  const tMin = Math.min(col.tf, tPlate)
  const wMin = tMin <= 6 ? 3 : tMin <= 13 ? 5 : tMin <= 19 ? 6 : 8
  let w = wMin
  while (per(w) < T && w < 25) w++
  return { T, L, w, wMin, phiRn: per(w), ok: per(w) >= T - 1e-9 }
}
