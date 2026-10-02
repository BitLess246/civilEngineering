// ─────────────────────────────────────────────────────────────────────────
// RATIONAL METHOD — peak runoff for small catchments, Q = C·i·A/360.
//
//   Q  = C·i·A / 360      Q in m³/s, i in mm/h, A in hectares
//
// The intensity comes either directly or from a user IDF curve of the
// standard textbook form i = a / (Tc + b)^c (c defaults to 1, so
// "i = 760/(Tc + 10)" is simply a = 760, b = 10, c blank).
//
// TIME OF CONCENTRATION, the two classics (minutes):
//
//   Kirpich   Tc = K · L^0.77 · S^(−0.385)
//             K = 0.0195 with L in metres, S in m/m (TxDOT's SI form);
//             the same formula with K = 0.0078 and L in feet.
//   FAA       Tc = 1.8 · (1.1 − C) · L_ft^0.5 / S%^0.333
//             (overland flow, C = the rational coefficient — the formula
//             is built for the same C that feeds Q, in US units: feet and
//             slope in percent).
//
// Both are floored at 5 minutes, the standard rational-method practice.
// A composite C = Σ(Cᵢ·Aᵢ)/ΣAᵢ is computed when the catchment is entered
// as sub-areas; a single C/A pair skips that layer.
// ─────────────────────────────────────────────────────────────────────────

export interface SubArea {
  /** Sub-area name (display only). */
  name: string
  /** Runoff coefficient of the sub-area (0–1). */
  c: number
  /** Area (ha). */
  a: number
}

export interface RationalInput {
  subAreas: SubArea[]
  /** Where the design intensity comes from. */
  intensity: { mode: 'direct'; mmPerHour: number } | { mode: 'idf'; a: number; b: number; c?: number }
  /** Where Tc comes from. */
  tc: { mode: 'direct'; minutes: number } | { mode: 'kirpich'; lengthM: number; slope: number } | { mode: 'faa'; lengthM: number; slopePct: number }
}

export interface RationalResult {
  /** The sub-areas actually used (positive area), as the engine saw them. */
  subAreas: SubArea[]
  /** Composite runoff coefficient. */
  C: number
  /** Total area (ha). */
  A: number
  /** Time of concentration used (min). */
  tcMin: number
  /** Method actually used for Tc ('direct' | 'kirpich' | 'faa'). */
  tcMethod: 'direct' | 'kirpich' | 'faa'
  /** Design intensity (mm/h). */
  i: number
  /** Peak flow (m³/s) — and the same in L/s and cfs for the sheet. */
  Q: number
  Qls: number
  Qcfs: number
  warnings: string[]
}

const M_TO_FT = 1 / 0.3048

/** Kirpich, SI: L in metres, S in m/m, Tc in minutes. K = 0.01947 is the
 *  exact unit conversion of the US constant 0.0078 (ft) — the value the
 *  review texts print — so both unit forms agree to machine precision. */
export function tcKirpich(lengthM: number, slope: number): number {
  if (!(lengthM > 0)) throw new Error('Kirpich: flow length must be positive.')
  if (!(slope > 0)) throw new Error('Kirpich: slope must be positive.')
  return 0.01947 * Math.pow(lengthM, 0.77) * Math.pow(slope, -0.385)
}

/** FAA: L in metres (converted internally to feet), slope in PERCENT, Tc in minutes. */
export function tcFaa(lengthM: number, slopePct: number, C: number): number {
  if (!(lengthM > 0)) throw new Error('FAA: flow length must be positive.')
  if (!(slopePct > 0)) throw new Error('FAA: slope must be positive.')
  if (C < 0 || C > 1) throw new Error('FAA: the rational coefficient must be 0–1.')
  const Lft = lengthM * M_TO_FT
  return (1.8 * (1.1 - C) * Math.sqrt(Lft)) / Math.pow(slopePct, 0.333)
}

/** Textbook IDF: i = a / (Tc + b)^c, Tc in minutes → i in mm/h. */
export function idfIntensity(a: number, b: number, c: number | undefined, tcMin: number): number {
  if (!(a > 0)) throw new Error('IDF: coefficient a must be positive.')
  if (b < 0) throw new Error('IDF: constant b cannot be negative.')
  const cc = c ?? 1
  if (!(cc > 0)) throw new Error('IDF: exponent c must be positive.')
  if (!(tcMin > 0)) throw new Error('IDF: Tc must be positive.')
  return a / Math.pow(tcMin + b, cc)
}

const TC_FLOOR = 5

export function solveRational(input: RationalInput): RationalResult {
  const subAreas = input.subAreas.filter((s) => s.a > 0)
  if (subAreas.length < 1) throw new Error('At least one sub-area with positive size is needed.')
  const A = subAreas.reduce((s, x) => s + x.a, 0)
  const C = subAreas.reduce((s, x) => s + x.c * x.a, 0) / A
  for (const s of subAreas) {
    if (s.c < 0 || s.c > 1) throw new Error(`Sub-area ${s.name || '(unnamed)'}: C must be 0–1.`)
  }

  // ── time of concentration ──
  const warnings: string[] = []
  let tcMin: number
  let tcMethod: RationalResult['tcMethod']
  if (input.tc.mode === 'direct') {
    if (!(input.tc.minutes > 0)) throw new Error('Tc must be positive.')
    tcMin = input.tc.minutes
    tcMethod = 'direct'
  } else if (input.tc.mode === 'kirpich') {
    tcMin = tcKirpich(input.tc.lengthM, input.tc.slope)
    tcMethod = 'kirpich'
  } else {
    tcMin = tcFaa(input.tc.lengthM, input.tc.slopePct, C)
    tcMethod = 'faa'
  }
  if (tcMin < TC_FLOOR) {
    warnings.push(`Tc = ${tcMin.toFixed(2)} min is below the 5-minute rational-method floor; 5 min used.`)
    tcMin = TC_FLOOR
  }

  // ── intensity ──
  const i = input.intensity.mode === 'direct'
    ? (() => {
        if (!(input.intensity.mmPerHour > 0)) throw new Error('Rainfall intensity must be positive.')
        return input.intensity.mmPerHour
      })()
    : idfIntensity(input.intensity.a, input.intensity.b, input.intensity.c, tcMin)

  if (A > 80) warnings.push(`A = ${A.toFixed(1)} ha is well beyond the rational method's small-catchment range (≈ 80 ha).`)

  const Q = (C * i * A) / 360
  return {
    subAreas,
    C, A, tcMin, tcMethod, i,
    Q, Qls: Q * 1000, Qcfs: Q * 35.3146667,
    warnings,
  }
}
