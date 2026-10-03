// ─────────────────────────────────────────────────────────────────────────
// SCS / NRCS RUNOFF — curve-number loss model, composite CN, the lag-method
// time of concentration, and the TR-55 triangular unit hydrograph peak.
//
//   Retention            S   = 25400/CN − 254                 (mm)
//   Initial abstraction  Ia  = 0.2·S                          (TR-55 classic)
//   Runoff depth         Q   = (P − Ia)²/(P − Ia + S)  for P > Ia, else 0
//   Volume               V   = 10·Q(mm)·A(ha)                 (m³)
//
//   Lag time (TR-55 §3, SI form)
//     Tlag = L^0.8·(S + 25.4)^0.7 / (7069·√Y)   [hr]
//     L = hydraulic length (m), S = retention (mm), Y = watershed slope (%)
//     Tc = Tlag / 0.6
//
//   Triangular UH (TR-55)
//     Tp = Δt/2 + 0.6·Tc
//     Qp = 0.208·A(km²)·Q(mm) / Tp(hr)    [m³/s]   (SI twin of 484 in US units)
//     tb = 2.67·Tp
//
// The composite CN is the area-weighted mean of the cover/soil-group CNs.
// ─────────────────────────────────────────────────────────────────────────

export function retentionFromCn(CN: number): number {
  if (!(CN >= 30 && CN <= 100)) throw new Error('Curve number must be 30–100.')
  return 25400 / CN - 254
}

export interface RunoffResult {
  P: number
  CN: number
  S: number
  Ia: number
  /** Runoff depth, mm. */
  Q: number
  /** Volumetric runoff coefficient Q/P. */
  coefficient: number
  notes: string[]
}

/** SCS runoff depth (mm) for a storm depth P (mm) and curve number CN. */
export function runoffDepth(P: number, CN: number, iaRatio = 0.2): RunoffResult {
  if (!(P >= 0)) throw new Error('Rainfall depth cannot be negative.')
  const S = retentionFromCn(CN)
  const Ia = iaRatio * S
  const Q = P > Ia ? ((P - Ia) * (P - Ia)) / (P - Ia + S) : 0
  const notes: string[] = []
  if (Q === 0) {
    notes.push(`P = ${P.toFixed(1)} mm does not exceed the initial abstraction Ia = ${Ia.toFixed(1)} mm — no runoff is generated.`)
  }
  if (iaRatio !== 0.2) {
    notes.push('Ia/S ratio other than 0.2 departs from the classic TR-55 model (the NRCS 2004 update suggests Ia = 0.05·S for forested catchments).')
  }
  return { P, CN, S, Ia, Q, coefficient: P > 0 ? Q / P : 0, notes }
}

export interface CnPart { name: string; area: number; cn: number }

export interface CompositeCn {
  cn: number
  area: number
  rows: { name: string; area: number; cn: number; weight: number }[]
}

/** Area-weighted composite curve number. */
export function compositeCn(parts: CnPart[]): CompositeCn {
  if (parts.length === 0) throw new Error('Add at least one land-cover area.')
  let area = 0
  let weighted = 0
  const rows: CompositeCn['rows'] = []
  for (const p of parts) {
    if (!(p.area > 0)) throw new Error(`Area for ${p.name} must be positive.`)
    if (!(p.cn >= 30 && p.cn <= 100)) throw new Error(`Curve number for ${p.name} must be 30–100.`)
    area += p.area
    weighted += p.area * p.cn
  }
  for (const p of parts) rows.push({ name: p.name, area: p.area, cn: p.cn, weight: p.area / area })
  return { cn: weighted / area, area, rows }
}

/** Runoff volume in m³ from a depth Q (mm) over an area A (ha). */
export function runoffVolumeM3(Qmm: number, areaHa: number): number {
  return 10 * Qmm * areaHa
}

export interface LagResult {
  lagHr: number
  tcHr: number
}

/** TR-55 lag-method time of concentration (SI). */
export function lagTc(L_m: number, S_mm: number, slopePct: number): LagResult {
  if (!(L_m > 0)) throw new Error('Hydraulic length must be positive.')
  if (!(slopePct > 0)) throw new Error('Watershed slope must be positive.')
  const lagHr = Math.pow(L_m, 0.8) * Math.pow(S_mm + 25.4, 0.7) / (7069 * Math.sqrt(slopePct))
  return { lagHr, tcHr: lagHr / 0.6 }
}

export interface UHResult {
  /** Time to peak, hr. */
  tp: number
  /** Peak discharge, m³/s. */
  qp: number
  /** Base time, hr. */
  tb: number
  /** Runoff depth used, mm. */
  Q: number
}

/**
 * TR-55 triangular unit hydrograph peak for a storm of runoff depth
 * Q (mm) on an area A (km²), with computation interval Δt (minutes).
 */
export function triangularUH(A_km2: number, Qmm: number, tcHr: number, dtMin = 10): UHResult {
  if (!(A_km2 > 0)) throw new Error('Catchment area must be positive.')
  if (!(Qmm >= 0)) throw new Error('Runoff depth cannot be negative.')
  if (!(tcHr > 0)) throw new Error('Time of concentration must be positive.')
  const tp = dtMin / 120 + 0.6 * tcHr
  const qp = Qmm > 0 ? (0.208 * A_km2 * Qmm) / tp : 0
  return { tp, qp, tb: 2.67 * tp, Q: Qmm }
}

export interface RunoffInput {
  parts: CnPart[]
  /** Design storm depth, mm. */
  P: number
  /** Hydraulic (longest flow) length, m. */
  L: number
  /** Average watershed slope, %. */
  slopePct: number
  /** Ia/S ratio (default 0.2). */
  iaRatio?: number
  /** Computation interval, minutes (default 10). */
  dtMin?: number
}

export interface RunoffSuite {
  composite: CompositeCn
  runoff: RunoffResult
  lag: LagResult
  uh: UHResult
  volumeM3: number
}

/** The whole SCS chain: composite CN → depth → Tc → UH peak → volume. */
export function scsRunoffSuite(p: RunoffInput): RunoffSuite {
  const composite = compositeCn(p.parts)
  const runoff = runoffDepth(p.P, composite.cn, p.iaRatio ?? 0.2)
  const lag = lagTc(p.L, runoff.S, p.slopePct)
  const areaKm2 = composite.area / 100 // ha → km²
  const uh = triangularUH(areaKm2, runoff.Q, lag.tcHr, p.dtMin ?? 10)
  return { composite, runoff, lag, uh, volumeM3: runoffVolumeM3(runoff.Q, composite.area) }
}
