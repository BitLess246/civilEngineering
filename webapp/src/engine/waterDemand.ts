// ─────────────────────────────────────────────────────────────────────────
// WATER DEMAND — the municipal-side chain: population forecasting, average
// and peaking demands, fire demand, and the storage reservoir breakdown.
//
// POPULATION FORECAST (design horizon n years):
//   arithmetic growth:        Pn = P0 + n·k          (k = P1 − P0 per period)
//   geometric growth:         Pn = P0·(1 + r/100)^n
//   incremental increase:     Pn = P0 + n·a + n(n+1)/2·b
//       a = mean increase per decade, b = mean increment of the increase
//   decreasing-rate growth:   Pn = P0 + n·a − n(n+1)/2·b
//
// DEMANDS:
//   ADD  = q·P          q = per-capita demand, L/capita/day (LPCD)
//   MDD  = f_day·ADD    max-day factor (default 1.30 — LWUA design practice)
//   PHD  = f_hour·ADD   peak-hour factor (default 2.50)
//   fire (Kuichling):   Qf = 3182·√P    L/min, P in thousands
//
// STORAGE (the design-policy breakdown, factors editable):
//   operating (equalization) ≈ 25 % of MDD
//   fire reserve             = fire flow × duration
//   emergency                = 25 % of MDD
// ─────────────────────────────────────────────────────────────────────────

export type ForecastMethod = 'arithmetic' | 'geometric' | 'incremental' | 'decreasing'

export interface ForecastInput {
  /** Latest census population. */
  P0: number
  /** Previous census population (for the arithmetic/incremental rates). */
  P1?: number
  /** Census interval of P0↔P1, years (default 10). */
  censusYears?: number
  /** Annual geometric growth rate, % (geometric method). */
  growthPct?: number
  /** Mean increase per decade a (incremental methods; default derived from P1). */
  a?: number
  /** Mean increment of the increase b (incremental methods). */
  b?: number
  /** Design horizon, years. */
  years: number
  method: ForecastMethod
}

export interface ForecastResult {
  Pn: number
  method: ForecastMethod
  perYear: number      // the effective linear rate, cap/yr, for the worked solution
  r: number            // the effective geometric rate, %/yr
  a: number
  b: number
}

export function forecastPopulation(p: ForecastInput): ForecastResult {
  if (!(p.P0 > 0)) throw new Error('Present population must be positive.')
  if (!(p.years > 0)) throw new Error('Design horizon must be positive.')
  const censusYears = p.censusYears ?? 10
  let Pn: number
  let perYear = 0, r = 0, a = 0, b = 0

  switch (p.method) {
    case 'arithmetic': {
      if (!(p.P1 != null && p.P1 > 0)) throw new Error('Give the previous census for the arithmetic method.')
      a = (p.P0 - p.P1) / censusYears
      perYear = a
      Pn = p.P0 + a * p.years
      break
    }
    case 'geometric': {
      r = p.growthPct ?? 1.5
      if (r < 0) throw new Error('Growth rate must not be negative.')
      Pn = p.P0 * Math.pow(1 + r / 100, p.years)
      perYear = (Pn - p.P0) / p.years
      break
    }
    case 'incremental':
    case 'decreasing': {
      // a and b are PER-DECADE rates (the arrival form the page labels and
      // the textbook prints): the horizon runs in decades, fractional allowed.
      a = p.a ?? (p.P1 != null ? ((p.P0 - p.P1) / censusYears) * 10 : 0)
      b = p.b ?? 0
      const nDec = p.years / 10
      const quad = (nDec * (nDec + 1) / 2) * b
      Pn = p.P0 + nDec * a + (p.method === 'incremental' ? quad : -quad)
      if (Pn < p.P0 && p.method === 'incremental') throw new Error('Negative increment b drove the forecast below the present population.')
      perYear = (Pn - p.P0) / p.years
      break
    }
  }
  if (!(Pn > 0)) throw new Error('The forecast collapsed below zero — check the rates.')
  return { Pn, method: p.method, perYear, r, a, b }
}

export interface DemandInput {
  /** Per-capita demand q, L/capita/day. */
  lpcd: number
  /** Max-day factor (default 1.30). */
  maxDayFactor?: number
  /** Peak-hour factor (default 2.50). */
  peakHourFactor?: number
}

export interface DemandResult {
  ADD: number        // m³/day
  MDD: number
  PHD: number
  ADD_lps: number    // L/s averages
  MDD_lps: number
  PHD_lps: number
}

export function demands(P: number, d: DemandInput): DemandResult {
  if (!(P > 0)) throw new Error('Design population must be positive.')
  if (!(d.lpcd > 0)) throw new Error('Per-capita demand must be positive.')
  const fDay = d.maxDayFactor ?? 1.30
  const fHour = d.peakHourFactor ?? 2.50
  if (!(fDay >= 1)) throw new Error('Max-day factor must be ≥ 1.')
  if (!(fHour >= fDay)) throw new Error('Peak-hour factor should not be below the max-day factor.')
  const ADD = d.lpcd * P / 1000
  const MDD = ADD * fDay
  const PHD = ADD * fHour
  return {
    ADD, MDD, PHD,
    ADD_lps: ADD / 86.4,        // m³/day → L/s: ÷ 86.4
    MDD_lps: MDD / 86.4,
    PHD_lps: PHD / 86.4,
  }
}

/** Kuichling fire demand: Qf = 3182·√P (L/min, P population in thousands). */
export function kuichlingFireFlow(P: number): { lpm: number; lps: number } {
  if (!(P > 0)) throw new Error('Population must be positive.')
  const lpm = 3182 * Math.sqrt(P / 1000)
  return { lpm, lps: lpm / 60 }
}

export interface StorageInput {
  MDD: number                     // m³/day
  fireLps: number                 // fire flow, L/s
  /** Fire duration, hours (default 3). */
  fireHours?: number
  /** Operating-storage fraction of MDD (default 0.25). */
  operatingFrac?: number
  /** Emergency-storage fraction of MDD (default 0.25). */
  emergencyFrac?: number
}

export interface StorageResult {
  operating: number
  fire: number
  emergency: number
  total: number
  fireHours: number
}

/** The reservoir breakdown, m³. */
export function storage(s: StorageInput): StorageResult {
  if (!(s.MDD > 0)) throw new Error('Max-day demand must be positive.')
  const fireHours = s.fireHours ?? 3
  if (!(fireHours > 0)) throw new Error('Fire duration must be positive.')
  const operating = (s.operatingFrac ?? 0.25) * s.MDD
  const emergency = (s.emergencyFrac ?? 0.25) * s.MDD
  const fire = s.fireLps * 3.6 * fireHours   // L/s × 3.6 = m³/h
  return { operating, fire, emergency, total: operating + fire + emergency, fireHours }
}

/** Typical PH per-capita demands (LPCD) for the picker. */
export const LPCD_OPTIONS = [
  { v: 100, label: '100 — LWUA residential, house-connection standard' },
  { v: 120, label: '120 — mixed residential with some non-domestic use' },
  { v: 150, label: '150 — metro / commercialized service area' },
]
