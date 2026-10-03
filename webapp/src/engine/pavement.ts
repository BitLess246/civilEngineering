// ─────────────────────────────────────────────────────────────────────────
// FLEXIBLE PAVEMENT — AASHTO Guide for Design of Pavement Structures
// (1993). Traffic forecasting as ESALs, the structural-number equation,
// and the layer-thickness check.
//
//   Design equation (flexible)
//     log10(W18) = ZR·S0 + 9.36·log10(SN+1) − 0.20
//       + log10[ΔPSI / 2.7] / [0.40 + 1094/(SN+1)^5.19]
//       + 2.32·log10(MR) − 8.07
//     MR in psi, ΔPSI = p0 − pt (p0 = 4.2 initial serviceability).
//     ZR is the standard normal deviate of the reliability, S0 the overall
//     standard deviation (flexible 0.40–0.50, typically 0.45).
//   ESAL growth (uniform annual rate r over n years)
//     G = [(1+r)^n − 1]/r ,  W18 = ADT·T%·TF·D·L·365·G
//   Layer equation
//     SN = a1·D1 + a2·D2·m2 + a3·D3·m3   (inches, or a·D with consistent
//     SI layer coefficients — here both D in mm and in are supported by
//     keeping the coefficients per-mm).
//
// The SN solve is bisection: the RHS is strictly increasing in SN.
// ─────────────────────────────────────────────────────────────────────────

/** Standard normal quantile (Acklam's inverse-CFD approximation, ~1e-9). */
export function zrFromReliability(R: number): number {
  if (!(R > 0 && R < 100)) throw new Error('Reliability must be between 0 and 100 %.')
  const p = (100 - R) / 100 // upper tail
  // Rational approximation to the inverse normal CDF (Peter Acklam).
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
  return -Math.abs(x)
}

/** AASHTO's printed ZR table, for the worked-solution reference. */
export const ZR_PRINTED: { R: number; zr: number }[] = [
  { R: 50, zr: 0 }, { R: 60, zr: -0.253 }, { R: 70, zr: -0.524 }, { R: 75, zr: -0.674 },
  { R: 80, zr: -0.841 }, { R: 85, zr: -1.037 }, { R: 90, zr: -1.282 }, { R: 91, zr: -1.340 },
  { R: 92, zr: -1.405 }, { R: 93, zr: -1.476 }, { R: 94, zr: -1.555 }, { R: 95, zr: -1.645 },
  { R: 96, zr: -1.751 }, { R: 97, zr: -1.881 }, { R: 98, zr: -2.054 }, { R: 99, zr: -2.327 },
  { R: 99.9, zr: -3.090 }, { R: 99.99, zr: -3.750 },
]

// ── ESAL forecasting ─────────────────────────────────────────────────────

export interface EsalsInput {
  /** Two-way AADT, veh/day. */
  adt: number
  /** Trucks (heavy vehicles) as % of AADT. */
  truckPct: number
  /** Truck factor: ESALs per truck per day (average of the truck fleet). */
  truckFactor: number
  /** Directional split factor (default 0.5). */
  directional?: number
  /** Design-lane factor (default 1.0 for the outer lane of two; 0.8–1.0 typical). */
  laneFactor?: number
  /** Annual growth rate, % (0 to freeze the traffic). */
  growthPct?: number
  /** Design period, years. */
  years: number
}

export interface EsalsResult {
  W18: number
  growthFactor: number
  dailyTrucks: number
  firstYear: number
}

/** ESALs over the design period with a uniform annual growth rate. */
export function esals(p: EsalsInput): EsalsResult {
  if (!(p.adt > 0)) throw new Error('AADT must be positive.')
  if (!(p.truckPct >= 0 && p.truckPct <= 100)) throw new Error('Truck percentage must be 0–100.')
  if (!(p.truckFactor > 0)) throw new Error('Truck factor must be positive.')
  if (!(p.years > 0)) throw new Error('Design period must be positive.')
  const dir = p.directional ?? 0.5
  const lane = p.laneFactor ?? 1.0
  const r = (p.growthPct ?? 0) / 100
  const growthFactor = r > 0 ? (Math.pow(1 + r, p.years) - 1) / r : p.years
  const dailyTrucks = p.adt * (p.truckPct / 100)
  const firstYear = dailyTrucks * p.truckFactor * dir * lane * 365
  return { W18: firstYear * growthFactor, growthFactor, dailyTrucks, firstYear }
}

// ── the structural-number equation ───────────────────────────────────────

export interface SnInput {
  /** Design ESALs. */
  W18: number
  /** Reliability, % (default 90). */
  reliability?: number
  /** Overall standard deviation (default 0.45). */
  S0?: number
  /** Initial serviceability (default 4.2). */
  pi?: number
  /** Terminal serviceability (default 2.0). */
  pt?: number
  /** Subgrade resilient modulus, MPa (converted to psi internally). */
  MR_MPa: number
}

export interface SnResult {
  SN: number
  ZR: number
  S0: number
  dPSI: number
  MRpsi: number
  logW18: number
}

/** The 1993 flexible design equation, log10(W18) as a function of SN. */
export function logW18(SN: number, ZR: number, S0: number, dPSI: number, MRpsi: number): number {
  return (
    ZR * S0 +
    9.36 * Math.log10(SN + 1) -
    0.2 +
    Math.log10(dPSI / 2.7) / (0.4 + 1094 / Math.pow(SN + 1, 5.19)) +
    2.32 * Math.log10(MRpsi) -
    8.07
  )
}

/** Required structural number: bisection on the monotone design equation. */
export function requiredSN(p: SnInput): SnResult {
  if (!(p.W18 > 0)) throw new Error('Design ESALs must be positive.')
  if (!(p.MR_MPa > 0)) throw new Error('Resilient modulus must be positive.')
  const R = p.reliability ?? 90
  const S0 = p.S0 ?? 0.45
  const dPSI = (p.pi ?? 4.2) - (p.pt ?? 2.0)
  if (dPSI <= 0) throw new Error('Terminal serviceability must be below the initial value.')
  const ZR = zrFromReliability(R)
  const MRpsi = p.MR_MPa * 145.038
  const target = Math.log10(p.W18)
  let lo = 0.3
  let hi = 20
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (logW18(mid, ZR, S0, dPSI, MRpsi) < target) lo = mid
    else hi = mid
  }
  const SN = (lo + hi) / 2
  return { SN, ZR, S0, dPSI, MRpsi, logW18: logW18(SN, ZR, S0, dPSI, MRpsi) }
}

// ── layer equation ───────────────────────────────────────────────────────

export interface LayerRow {
  name: string
  /** Layer coefficient per mm (a1 asphalt ≈ 0.0042/mm for 0.42/in·25.4). */
  a: number
  /** Layer thickness, mm. */
  D: number
  /** Drainage coefficient (1.0 default). */
  m?: number
}

export interface LayerResult {
  SNprovided: number
  rows: { name: string; contribution: number; m: number }[]
  shortfall: number
  ok: boolean
}

/**
 * Layer check: SN = a1·D1 + a2·D2·m2 + a3·D3·m3 with the coefficients
 * per mm and the thickness in mm (so SN comes out dimensionless as the
 * classic equation does with inches).
 */
export function layerSN(rowsIn: LayerRow[]): LayerResult {
  if (rowsIn.length === 0) throw new Error('Add at least one pavement layer.')
  const rows = rowsIn.map((r) => {
    if (!(r.a > 0)) throw new Error(`Layer coefficient for ${r.name} must be positive.`)
    if (!(r.D > 0)) throw new Error(`Layer thickness for ${r.name} must be positive.`)
    return { name: r.name, contribution: r.a * r.D * (r.m ?? 1), m: r.m ?? 1 }
  })
  const SNprovided = rows.reduce((s, r) => s + r.contribution, 0)
  return { SNprovided, rows, shortfall: 0, ok: true }
}

/** Compare a provided SN with the required one. */
export function checkLayers(required: number, provided: number): LayerResult & { required: number } {
  return { required, SNprovided: provided, rows: [], shortfall: Math.max(0, required - provided), ok: provided + 1e-9 >= required }
}

/** Typical layer coefficients per mm (from the 1993 Guide charts, per-inch ÷ 25.4). */
export const TYPICAL_A = {
  asphalt: 0.42 / 25.4, // a1 ≈ 0.42 per inch
  base: 0.14 / 25.4, // crushed stone base a2 ≈ 0.14
  subbase: 0.11 / 25.4, // granular subbase a3 ≈ 0.11
}
