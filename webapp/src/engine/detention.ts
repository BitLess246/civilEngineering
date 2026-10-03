// ─────────────────────────────────────────────────────────────────────────
// DETENTION POND ROUTING — level-pool (storage-indication / modified Puls).
//
//   Continuity     (I1+I2)/2 − (O1+O2)/2 = (S2−S1)/Δt
//   Rearranged     F2 = 2S2/Δt + O2 = (I1+I2) + (2S1/Δt − O1) = (I1+I2) + F1 − 2·O1
//   with the storage-indication curve F(h) = 2S(h)/Δt + O(h) inverted for the
//   new stage, then O2 = O(h2), S2 = S(h2). The curve is strictly increasing
//   in h, so each step is a bisection — no oscillation-prone iteration.
//
//   Basin          trapezoidal prism: A(h) = (W+2zh)(L+2zh)
//                  S(h) = W·L·h + z(W+L)h² + (4/3)z²h³
//   Outlets        orifice Qo = Cd·a·√(2g·head)   (head above the invert)
//                  weir    Qw = C·Lw·hw^1.5       (Francis, SI C ≈ 1.84)
//   Units: lengths m, areas m², storage m³, flow m³/s, Δt minutes.
//
// Mass balance is checked end-to-end: inflow volume − outflow volume must
// equal the residual storage (S_end − S_start) to rounding.
// ─────────────────────────────────────────────────────────────────────────

import { G } from './openChannel'

export interface PondInput {
  /** Bottom width, m. */
  bottomWidth: number
  /** Bottom length (flow direction), m. */
  bottomLength: number
  /** Side slope z (H:V), both walls. */
  sideZ: number
  /** Usable depth (stage at which the pond is full), m. */
  depthMax: number
  /** Orifice area, m² (0 disables). */
  orificeArea: number
  /** Orifice discharge coefficient (typ. 0.6). */
  orificeCd: number
  /** Orifice invert height above the basin bottom, m. */
  orificeInvert: number
  /** Weir length, m (0 disables). */
  weirLength: number
  /** Weir crest height above the basin bottom, m. */
  weirCrest: number
  /** Francis weir coefficient (SI, typ. 1.84). */
  weirC: number
  /** Routing interval, minutes. */
  dtMin: number
  /** Inflow hydrograph ordinates (m³/s) at 0, Δt, 2Δt… */
  inflow: number[]
}

export interface StagePoint {
  stage: number
  area: number
  storage: number
  /** Outflow at this stage, m³/s. */
  outflow: number
  /** Storage-indication ordinate 2S/Δt + O, m³/s. */
  indication: number
}

export interface PondResult {
  curve: StagePoint[]
  /** Routed stages at each time step (m). */
  stages: number[]
  /** Routed outflows at each time step (m³/s). */
  outflows: number[]
  peakIn: number
  peakOut: number
  /** Time of the inflow / outflow peaks, minutes. */
  tPeakIn: number
  tPeakOut: number
  peakStage: number
  attenuationPct: number
  /** Outflow peak lag behind the inflow peak, minutes. */
  lagMin: number
  inflowVolume: number
  outflowVolume: number
  /** Storage still in the pond at the end of the run, m³. */
  residualStorage: number
  /** |inflow − outflow − residual| as % of inflow. */
  massErrorPct: number
  warnings: string[]
}

/** Stage–area–storage of the trapezoidal prism. */
export function pondGeometry(bottomWidth: number, bottomLength: number, sideZ: number, stage: number): { area: number; storage: number } {
  if (!(bottomWidth > 0) || !(bottomLength > 0)) throw new Error('Basin bottom dimensions must be positive.')
  if (!(sideZ >= 0)) throw new Error('Side slope z cannot be negative.')
  if (!(stage >= 0)) throw new Error('Stage cannot be negative.')
  const area = (bottomWidth + 2 * sideZ * stage) * (bottomLength + 2 * sideZ * stage)
  const storage = bottomWidth * bottomLength * stage
    + sideZ * (bottomWidth + bottomLength) * stage * stage
    + (4 / 3) * sideZ * sideZ * Math.pow(stage, 3)
  return { area, storage }
}

/** Outflow capacity of the outlet works at a given stage, m³/s. */
export function outletFlow(stage: number, p: Pick<PondInput, 'orificeArea' | 'orificeCd' | 'orificeInvert' | 'weirLength' | 'weirCrest' | 'weirC'>): number {
  let q = 0
  const head = stage - p.orificeInvert
  if (p.orificeArea > 0 && head > 0) {
    q += p.orificeCd * p.orificeArea * Math.sqrt(2 * G * head)
  }
  const hw = stage - p.weirCrest
  if (p.weirLength > 0 && hw > 0) {
    q += p.weirC * p.weirLength * Math.pow(hw, 1.5)
  }
  return q
}

export function detentionRoute(input: PondInput): PondResult {
  const p = input
  if (!(p.depthMax > 0)) throw new Error('Usable depth must be positive.')
  if (!(p.dtMin > 0)) throw new Error('Routing interval must be positive.')
  if (p.inflow.length < 3) throw new Error('Give at least three inflow ordinates.')
  if (p.inflow.some((q) => !(q >= 0))) throw new Error('Inflow ordinates cannot be negative.')
  if (p.orificeArea <= 0 && p.weirLength <= 0) {
    throw new Error('The pond has no outlet — give an orifice, a weir, or both.')
  }

  // build the storage-indication curve up to 1.5× the usable depth so an
  // overtopping run still finds a stage and can warn about it
  const dt = p.dtMin * 60 // s
  const hTop = p.depthMax * 1.5
  const N = 600
  const curve: StagePoint[] = []
  for (let i = 0; i <= N; i++) {
    const stage = (i / N) * hTop
    const { area, storage } = pondGeometry(p.bottomWidth, p.bottomLength, p.sideZ, stage)
    const outflow = outletFlow(stage, p)
    curve.push({ stage, area, storage, outflow, indication: 2 * storage / dt + outflow })
  }

  const warnings: string[] = []
  const wetted: StagePoint[] = curve.filter((c) => c.indication > 0)
  const findStage = (indication: number): StagePoint => {
    if (indication <= wetted[0].indication) return wetted[0]
    let lo = 0, hi = wetted.length - 1
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1
      if (wetted[mid].indication <= indication) lo = mid
      else hi = mid
    }
    const a = wetted[lo], b = wetted[hi]
    const t = (indication - a.indication) / Math.max(b.indication - a.indication, 1e-12)
    return {
      stage: a.stage + t * (b.stage - a.stage),
      area: a.area + t * (b.area - a.area),
      storage: a.storage + t * (b.storage - a.storage),
      outflow: a.outflow + t * (b.outflow - a.outflow),
      indication,
    }
  }

  const stages: number[] = []
  const outflows: number[] = []
  let F = 0 // 2S/Δt + O at t = 0 with an empty pond: S = 0, O = 0
  let endStorage = 0
  for (let i = 0; i < p.inflow.length; i++) {
    if (i === 0) {
      stages.push(0)
      outflows.push(0)
      continue
    }
    const rhs = p.inflow[i - 1] + p.inflow[i] + F - 2 * outflows[i - 1]
    const pt = findStage(Math.max(rhs, 0))
    F = pt.indication
    endStorage = pt.storage
    stages.push(pt.stage)
    outflows.push(pt.outflow)
  }

  const peakIn = Math.max(...p.inflow)
  const peakOut = Math.max(...outflows)
  const tPeakIn = p.inflow.indexOf(peakIn) * p.dtMin
  const tPeakOut = outflows.indexOf(peakOut) * p.dtMin
  const peakStage = Math.max(...stages)

  // exact trapezoid of the sampled ordinates — the routing recurrence
  // integrates I and O the same way, so the balance closes to interpolation
  // error only
  const trap = (qs: number[]) => qs.reduce((s, q) => s + q, 0) - (qs[0] + qs[qs.length - 1]) / 2
  const inflowVolume = trap(p.inflow) * dt
  const outflowVolume = trap(outflows) * dt
  const residualStorage = endStorage
  const massErrorPct = inflowVolume > 0 ? Math.abs(inflowVolume - outflowVolume - residualStorage) / inflowVolume * 100 : 0

  if (peakStage > p.depthMax) {
    warnings.push(`Peak stage ${peakStage.toFixed(2)} m exceeds the usable depth ${p.depthMax.toFixed(2)} m — the pond overtops. Enlarge the footprint, deepen the basin, or add outlet capacity.`)
  }
  if (peakStage >= hTop - 1e-9) {
    warnings.push('The routed stage ran past the curve built here — results above the top stage are extrapolated flat and unreliable.')
  }
  if (peakOut > peakIn * (1 - 1e-9)) {
    warnings.push('Peak outflow equals the inflow peak — the pond is not attenuating. Enlarge the storage or throttle the outlets.')
  }

  return {
    curve, stages, outflows,
    peakIn, peakOut, tPeakIn, tPeakOut, peakStage,
    attenuationPct: peakIn > 0 ? (1 - peakOut / peakIn) * 100 : 0,
    lagMin: tPeakOut - tPeakIn,
    inflowVolume, outflowVolume, residualStorage, massErrorPct, warnings,
  }
}

/** Triangular inflow hydrograph sampled at Δt: rises linearly to Qp at Tp, then falls to zero at Tb. */
export function triangularInflow(Qp: number, tpMin: number, tbMin: number, dtMin: number): number[] {
  if (!(Qp > 0)) throw new Error('Peak inflow must be positive.')
  if (!(tpMin > 0 && tpMin < tbMin)) throw new Error('Time to peak must be positive and shorter than the base time.')
  if (!(dtMin > 0)) throw new Error('Routing interval must be positive.')
  const n = Math.ceil(tbMin / dtMin)
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    const t = i * dtMin
    out.push(t <= tpMin ? Qp * t / tpMin : Math.max(0, Qp * (tbMin - t) / (tbMin - tpMin)))
  }
  return out
}
