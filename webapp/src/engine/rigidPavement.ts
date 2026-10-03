// ─────────────────────────────────────────────────────────────────────────
// RIGID PAVEMENT — AASHTO Guide for Design of Pavement Structures (1993),
// the rigid (Portland cement concrete slab) design equation.
//
//   log10(W18) = ZR·S0 + 7.35·log10(D+1) − 0.06
//     + log10[ΔPSI / (4.5 − 1.5)] / [1 + 1.624×10⁷/(D+1)^8.46]
//     + (4.22 − 0.32·pt)·log10[ sc'·Cd·(D^0.75 − 1.132)
//         / (215.63·J·(D^0.75 − 18.42/(E/k)^0.25)) ]
//
//   D      slab thickness, inches (solved by bisection on the monotone RHS)
//   ZR     standard normal deviate of the reliability
//   S0     overall standard deviation (rigid typically 0.30–0.50, 0.35)
//   ΔPSI   p0 − pt with the rigid initial serviceability p0 = 4.5
//          (terminal pt commonly 2.5 → ΔPSI = 2.0)
//   sc'    concrete modulus of rupture, psi (third-point loading)
//   Cd     drainage coefficient (1.0 typical, 0.8–1.20 range)
//   J      load-transfer coefficient (3.2 JPCP without tied shoulders,
//          2.8 with tied PCC shoulders; lower = better load transfer)
//   E      concrete elastic modulus, psi (≈ 4–5×10⁶)
//   k      modulus of subgrade reaction, pci (the Guide's native unit —
//          subgrade support, NOT a strength ratio; typical 75–220 pci).
//          There is deliberately no default: a silent fixed subgrade would
//          size every slab for soil that was never entered.
//
// Inputs are SI (mm, MPa, MN/m³) and converted to the Guide's US units internally.
// ─────────────────────────────────────────────────────────────────────────

/** MPa → psi. */
export const PSI_PER_MPA = 145.038
/** mm → inches. */
export const IN_PER_MM = 1 / 25.4

/** MN/m³ per pci: 1 pci = 6894.76 Pa / 0.0254 m = 0.271447 MN/m³. */
export const MNPM3_PER_PCI = 0.271447

/**
 * Log of the rigid design equation RHS as a function of the slab thickness
 * D (INCHES) — strictly increasing in D over the practical bracket, so the
 * required D comes from a plain bisection. All US units, as printed.
 */
export function logW18Rigid(D: number, p: {
  ZR: number; S0: number; dPSI: number; pt: number
  scPsi: number; Cd: number; J: number; Epsi: number; kPci: number
}): number {
  const slabStress =
    (p.scPsi * p.Cd * (Math.pow(D, 0.75) - 1.132)) /
    (215.63 * p.J * (Math.pow(D, 0.75) - 18.42 / Math.pow(p.Epsi / p.kPci, 0.25)))
  return (
    p.ZR * p.S0 +
    7.35 * Math.log10(D + 1) -
    0.06 +
    Math.log10(p.dPSI / 3.0) / (1 + 1.624e7 / Math.pow(D + 1, 8.46)) +
    (4.22 - 0.32 * p.pt) * Math.log10(slabStress)
  )
}

export interface RigidInput {
  /** Design ESALs W18. */
  W18: number
  /** Reliability, % (default 90). */
  reliability?: number
  /** Overall standard deviation (default 0.35). */
  S0?: number
  /** Initial serviceability (rigid default 4.5). */
  pi?: number
  /** Terminal serviceability (default 2.5). */
  pt?: number
  /** Modulus of rupture sc', MPa (default 4.5 ≈ 650 psi). */
  sc_MPa: number
  /** Drainage coefficient Cd (default 1.0). */
  Cd?: number
  /** Load-transfer coefficient J (default 3.2). */
  J?: number
  /** Concrete elastic modulus E, MPa (default 27 580 ≈ 4×10⁶ psi). */
  E_MPa: number
  /** Modulus of subgrade reaction k, MN/m³ (required — e.g. ≈54 for 200 pci).
   *  Typical compacted subgrades run 20–60 MN/m³ (≈75–220 pci). */
  k_MNpm3: number
}

export interface RigidResult {
  D: number          // slab thickness, mm
  D_in: number       // slab thickness, inches (the Guide's native unit)
  ZR: number
  S0: number
  dPSI: number
  pi: number
  pt: number
  scPsi: number
  Epsi: number
  kPci: number       // subgrade modulus in the Guide's native pci
  logW18: number     // the RHS at the solution — should equal log10(W18)
}

/** Required slab thickness: bisection on the monotone rigid equation. */
export function requiredD(inp: RigidInput): RigidResult {
  if (!(inp.W18 > 0)) throw new Error('Design ESALs must be positive.')
  if (!(inp.sc_MPa > 0)) throw new Error('Modulus of rupture must be positive.')
  if (!(inp.E_MPa > 0)) throw new Error('Elastic modulus must be positive.')
  const R = inp.reliability ?? 90
  if (!(R > 0 && R < 100)) throw new Error('Reliability must be between 0 and 100 %.')
  const S0 = inp.S0 ?? 0.35
  const pi = inp.pi ?? 4.5
  const ptv = inp.pt ?? 2.5
  if (pi <= ptv) throw new Error('Terminal serviceability must be below the initial value.')
  const Cd = inp.Cd ?? 1.0
  if (!(Cd > 0)) throw new Error('Drainage coefficient must be positive.')
  const J = inp.J ?? 3.2
  if (!(J > 0)) throw new Error('Load-transfer coefficient must be positive.')
  const scPsi = inp.sc_MPa * PSI_PER_MPA
  const Epsi = inp.E_MPa * PSI_PER_MPA
  if (!(inp.k_MNpm3 > 0)) throw new Error('Subgrade modulus k must be positive (MN/m³).')
  const kPci = inp.k_MNpm3 / MNPM3_PER_PCI
  const dPSI = pi - ptv
  const ZR = zrFromReliability(R)
  const target = Math.log10(inp.W18)
  const eq = { ZR, S0, dPSI, pt: ptv, scPsi, Cd, J, Epsi, kPci }
  const f = (D: number) => logW18Rigid(D, eq)
  // Bracket: below ~4 in the slab-stress bracket can go negative (log of a
  // negative number is NaN); 30 inches covers every printed design case.
  let lo = 4
  let hi = 30
  if (!(f(hi) > target)) throw new Error('The design case exceeds the 30-inch bracket of the Guide.')
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) < target) lo = mid
    else hi = mid
  }
  const D_in = (lo + hi) / 2
  return { D: D_in * 25.4, D_in, ZR, S0, dPSI, pi, pt: ptv, scPsi, Epsi, kPci, logW18: f(D_in) }
}

/** Standard normal quantile (Acklam inverse-CFD, ~1e-9). */
export function zrFromReliability(R: number): number {
  if (!(R > 0 && R < 100)) throw new Error('Reliability must be between 0 and 100 %.')
  const p = (100 - R) / 100
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.383577518672690e2, -3.066479806614716e1, 2.506628277459239]
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1]
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783]
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416]
  const pLow = 0.02425
  let q: number, x: number
  if (p < pLow) {
    q = Math.sqrt(-2 * Math.log(p))
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  } else if (p <= 1 - pLow) {
    q = p - 0.5
    const r = q * q
    x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
  } else {
    q = Math.sqrt(-2 * Math.log(1 - p))
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  }
  // Plain quantile: R < 50 gives a positive ZR (over-design only if misread —
  // never silently flip the sign).
  return x
}

/** The Guide's printed ZR ladder for the worked solution. */
export const ZR_PRINTED: { R: number; zr: number }[] = [
  { R: 50, zr: 0 }, { R: 60, zr: -0.253 }, { R: 70, zr: -0.524 }, { R: 75, zr: -0.674 },
  { R: 80, zr: -0.841 }, { R: 85, zr: -1.037 }, { R: 90, zr: -1.282 }, { R: 95, zr: -1.645 },
  { R: 98, zr: -2.054 }, { R: 99, zr: -2.327 }, { R: 99.9, zr: -3.090 },
]

/** Typical load-transfer coefficients (Guide §4.2 shoulder ladder). */
export const J_OPTIONS = [
  { j: 3.2, label: 'JPCP, no tied shoulder (3.2)' },
  { j: 3.1, label: 'JPCP, aggregate shoulder (3.1)' },
  { j: 3.0, label: 'JPCP, asphalt shoulder (3.0)' },
  { j: 2.8, label: 'JPCP, tied PCC shoulder (2.8)' },
]
