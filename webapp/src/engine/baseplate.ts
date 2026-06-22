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
//  · Anchor rods: minimum 4; in net uplift Tu, required area
//    Ab,req = Tu /(n_rods·φt·0.75·Fu_rod),  φt = 0.75.
// Units: forces kN, moments kN·m, geometry mm, stress MPa.
// ─────────────────────────────────────────────────────────────────────────

export type AnchorGrade = 'A307' | 'F1554-36' | 'F1554-55' | 'A325M'

/** Nominal tensile strength Fu of common anchor-rod grades (MPa). */
const ANCHOR_FU: Record<AnchorGrade, number> = {
  A307: 414, 'F1554-36': 400, 'F1554-55': 517, A325M: 830,
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
}

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
  const Nstart = Math.max(Math.sqrt(A1req) + delta, 0.95 * i.d + 40, i.d + 50)
  let N = Math.ceil(Nstart / 10) * 10
  let B = Math.max(A1req / N, 0.8 * i.bf + 40, i.bf + 50)
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
  const dia = i.rodDia ?? 25
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
  }
}

/** Round a required plate thickness up to the next common plate stock (mm). */
export const PLATE_STOCK = [10, 12, 16, 20, 22, 25, 28, 32, 36, 40, 45, 50]
export function adoptPlateThickness(tReq: number): number {
  return PLATE_STOCK.find((t) => t >= tReq - 1e-6) ?? Math.ceil(tReq / 5) * 5
}
