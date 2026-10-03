// ─────────────────────────────────────────────────────────────────────────
// DO SAG CURVE — Streeter–Phelps oxygen balance downstream of a discharge.
//
//   Deficit ODE     dD/dt = kd·L − kr·D
//   BOD decay       L(t) = L0·e^(−kd·t)
//   Sag equation    D(t) = kd·L0/(kr−kd)·(e^(−kd·t) − e^(−kr·t)) + D0·e^(−kr·t)
//   Critical time   tc = 1/(kr−kd) · ln[ kr/kd · (1 − D0(kr−kd)/(kd·L0)) ]
//   Critical deficit Dc = (kd·L0/kr)·e^(−kd·tc)  →  DOcrit = DOsat − Dc
//
//   Mixing at the outfall (flow-weighted):
//     L0 = (Qr·Lr + Qw·Lw)/(Qr+Qw),  D0 = DOsat − (Qr·DOr + Qw·DOw)/(Qr+Qw)
//
//   Temperature     k(T) = k20·θ^(T−20); θ ≈ 1.047 deoxygenation,
//   correction      θ ≈ 1.024 reaeration (both editable).
//
//   Ultimate BOD    L0 = y5/(1 − e^(−kd·5))  from a 5-day BOD result.
//   Reaeration est. kr20 ≈ 2.148·v^0.878/H^−1.48 (UNESCO IHP; v m/s, H m)
//
//   Units: flows m³/s, concentrations mg/L, rates day⁻¹, time days,
//   distance km via the stream velocity u (m/s).
// ─────────────────────────────────────────────────────────────────────────

/** DO saturation (mg/L) — Benson–Krause polynomial as used by USGS DOTABLES. */
export function doSaturation(T: number): number {
  const Ta = T + 273.15
  return Math.exp(
    -139.34411 + 1.575701e5 / Ta - 6.642308e7 / Ta ** 2
    + 1.243800e10 / Ta ** 3 - 8.621949e11 / Ta ** 4,
  )
}

/** Temperature-corrected rate: k(T) = k20·θ^(T−20). */
export function tempCorrect(k20: number, theta: number, T: number): number {
  return k20 * Math.pow(theta, T - 20)
}

/** Reaeration k2 at 20 °C from the UNESCO IHP equation (d⁻¹). */
export function reaerationUNESCO(v: number, H: number): number {
  if (!(v > 0)) throw new Error('Stream velocity must be positive.')
  if (!(H > 0)) throw new Error('Average depth must be positive.')
  return 2.148 * Math.pow(v, 0.878) * Math.pow(H, -1.48)
}

/** Ultimate BOD from a 5-day BOD exertion y5 and the deoxygenation rate kd (d⁻¹). */
export function ultimateFromBOD5(y5: number, kd: number): number {
  if (!(y5 > 0)) throw new Error('BOD5 must be positive.')
  if (!(kd > 0)) throw new Error('Deoxygenation rate must be positive.')
  return y5 / (1 - Math.exp(-kd * 5))
}

export interface SagInput {
  /** Upstream river flow, m³/s. */
  Qr: number
  /** Upstream ultimate BOD, mg/L. */
  Lr: number
  /** Upstream DO concentration, mg/L. */
  DOr: number
  /** Effluent flow, m³/s. */
  Qw: number
  /** Effluent ultimate BOD, mg/L. */
  Lw: number
  /** Effluent DO, mg/L. */
  DOw: number
  /** Deoxygenation rate at 20 °C, d⁻¹. */
  kd20: number
  /** Reaeration rate at 20 °C, d⁻¹. */
  kr20: number
  /** Water temperature, °C. */
  T: number
  /** θ for kd (default 1.047). */
  theta1?: number
  /** θ for kr (default 1.024). */
  theta2?: number
  /** Stream velocity, m/s (for the distance axis; optional). */
  u?: number
  /** DO saturation override, mg/L (default: Benson–Krause at T). */
  DOsatOverride?: number
  /** Simulation window, days (default: auto from tc). */
  days?: number
}

export interface SagPoint {
  /** Travel time, days. */
  t: number
  /** Travel distance, km (0 when u not given). */
  x: number
  /** DO concentration, mg/L. */
  DO: number
  /** Remaining BOD, mg/L. */
  BOD: number
  /** Oxygen deficit, mg/L. */
  D: number
}

export interface SagResult {
  /** Mixed ultimate BOD at the outfall, mg/L. */
  L0: number
  /** Initial deficit at the outfall, mg/L. */
  D0: number
  /** Mixed DO at the outfall, mg/L. */
  DOmix: number
  kd: number
  kr: number
  DOsat: number
  /** Critical time, days (null when the DO never sags below the outfall mix). */
  tc: number | null
  Dcrit: number | null
  DOcrit: number | null
  /** Critical distance, km (null without a velocity). */
  xc: number | null
  /** Recovery time (D back to 2 mg/L or window end), days. */
  curve: SagPoint[]
  anoxic: boolean
  notes: string[]
}

export function doSag(input: SagInput): SagResult {
  const p = input
  if (!(p.Qr > 0) || !(p.Qw >= 0)) throw new Error('Flows must be non-negative and the river flow positive.')
  if (!(p.kd20 > 0) || !(p.kr20 > 0)) throw new Error('BOD and reaeration rates must be positive.')
  if (p.kr20 === p.kd20) throw new Error('kr must differ from kd for the closed-form sag equation.')

  const theta1 = p.theta1 ?? 1.047
  const theta2 = p.theta2 ?? 1.024
  const kd = tempCorrect(p.kd20, theta1, p.T)
  const kr = tempCorrect(p.kr20, theta2, p.T)
  const DOsat = p.DOsatOverride ?? doSaturation(p.T)

  const Qt = p.Qr + p.Qw
  const L0 = (p.Qr * p.Lr + p.Qw * p.Lw) / Qt
  const DOmix = (p.Qr * p.DOr + p.Qw * p.DOw) / Qt
  const D0 = Math.max(0, DOsat - DOmix)

  const notes: string[] = []
  if (D0 === 0 && DOmix > DOsat) notes.push('The mixed DO exceeds saturation — a supersaturated mix; the model clips the initial deficit to zero.')

  // critical point — exists only when the logarithm's argument is positive
  let tc: number | null = null
  let Dcrit: number | null = null
  if (kr !== kd && L0 > 0) {
    const arg = (kr / kd) * (1 - (D0 * (kr - kd)) / (kd * L0))
    if (arg > 0) {
      const t = Math.log(arg) / (kr - kd)
      if (t > 0) {
        tc = t
        Dcrit = (kd * L0 / kr) * Math.exp(-kd * t)
      }
    }
  }
  const DOcrit = Dcrit !== null ? DOsat - Dcrit : null
  const anoxic = DOcrit !== null && DOcrit <= 0
  if (anoxic) {
    notes.push(`The sag bottoms at ${DOcrit?.toFixed(2)} mg/L — below zero, i.e. the reach turns anoxic. The Streeter–Phelps curve is mathematical only past that point; a treatment upgrade is indicated.`)
  }
  if (tc === null) {
    notes.push('No critical point: reaeration outruns deoxygenation from the outfall on, so the DO recovers (or never sags) — the minimum sits at the mix itself.')
  }

  const xc = p.u && p.u > 0 && tc !== null ? p.u * 86400 * tc / 1000 : null

  const tCrit = tc ?? 0
  const window = p.days ?? Math.min(30, Math.max(5, 3 * tCrit))
  const N = 240
  const curve: SagPoint[] = []
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * window
    const bod = L0 * Math.exp(-kd * t)
    const d = kr !== kd
      ? (kd * L0 / (kr - kd)) * (Math.exp(-kd * t) - Math.exp(-kr * t)) + D0 * Math.exp(-kr * t)
      : kd * L0 * t * Math.exp(-kr * t) + D0 * Math.exp(-kr * t)
    curve.push({
      t, x: p.u ? p.u * 86400 * t / 1000 : 0,
      DO: DOsat - d, BOD: bod, D: d,
    })
  }

  return { L0, D0, DOmix, kd, kr, DOsat, tc, Dcrit, DOcrit, xc, curve, anoxic, notes }
}
