// ─────────────────────────────────────────────────────────────────────────
// PUMP STATION — the system-curve vs pump-curve operating point, NPSH
// margin, and the power chain, for a single pumping circuit.
//
// SYSTEM CURVE (what the circuit demands):
//   H_sys(Q) = H_static + hf(Q) + hm(Q)
//   H_static = static lift + pressure head at the discharge point (m)
//   friction: Hazen–Williams hf = 10.67·L·Q^1.852/(C^1.852·D^4.8704)
//   minor:    hm = ΣK·V²/(2g)
//
// PUMP CURVE (what the pump gives) — the standard quadratic falling curve
// pinned on the shutoff head H0 and the rated point (Qd, Hd):
//   H_pump(Q) = H0 − (H0 − Hd)·(Q/Qd)²
// OPERATING POINT: H_pump(Q*) = H_sys(Q*), solved by bisection (the pump
// curve falls, the system curve rises → unique crossing below Qd).
//
// NPSH AVAILABLE at the pump suction:
//   NPSHa = (Patm − Pv)/γ + z_suction − hf,suction
//   (positive z = flooded suction below the wet well level)
// CAVITATION CHECK: NPSHa ≥ NPSHr·(1 + margin).
//
// POWER: hydraulic P = ρgQH/1000 (kW) → shaft = /η_pump → motor = /η_motor.
// AFFINITY LAWS for a speed change N→N': Q' = Q·r, H' = H·r², P' = P·r³.
// ─────────────────────────────────────────────────────────────────────────

export const G = 9.81
/** Water: ρ = 1000 kg/m³, γ = 9.81 kN/m³. */
export const GAMMA_W = 9.81
/** Atmospheric pressure head at sea level, m of water. */
export const PATM_HEAD = 10.33

/** Hazen–Williams friction head (m) in a circular pipe: L, Q (m³/s), D (m). */
export function hwFriction(L: number, Q: number, C: number, D: number): number {
  if (!(C > 0)) throw new Error('Hazen–Williams C must be positive.')
  if (!(D > 0)) throw new Error('Pipe diameter must be positive.')
  if (Q < 0) throw new Error('Flow must not be negative.')
  if (Q === 0) return 0
  return (10.67 * L * Math.pow(Q, 1.852)) / (Math.pow(C, 1.852) * Math.pow(D, 4.8704))
}

/** Minor losses ΣK·V²/2g (m). */
export function minorLoss(Q: number, D: number, sumK: number): number {
  if (Q === 0) return 0
  const A = Math.PI * D * D / 4
  const V = Q / A
  return sumK * V * V / (2 * G)
}

export interface SystemInput {
  /** Static lift, m (discharge level − suction level). */
  staticLift: number
  /** Additional pressure head to deliver at the discharge, m. */
  pressureHead: number
  /** Suction-side: length (m), diameter (m), C, ΣK. */
  suction: { L: number; D: number; C: number; K: number }
  /** Discharge-side: length (m), diameter (m), C, ΣK. */
  discharge: { L: number; D: number; C: number; K: number }
}

/** System head (m) demanded at a flow Q (m³/s). */
export function systemHead(sys: SystemInput, Q: number): number {
  const hf = hwFriction(sys.suction.L, Q, sys.suction.C, sys.suction.D) +
    hwFriction(sys.discharge.L, Q, sys.discharge.C, sys.discharge.D)
  const Dref = sys.discharge.D
  const hm = minorLoss(Q, Dref, sys.suction.K + sys.discharge.K)
  return sys.staticLift + sys.pressureHead + hf + hm
}

/** Pump head (m) at flow Q from the shutoff/rated-point parabola. */
export function pumpHead(Q: number, H0: number, Qd: number, Hd: number): number {
  if (!(H0 > 0)) throw new Error('Shutoff head must be positive.')
  if (!(Qd > 0 && Hd > 0)) throw new Error('Rated point must be positive.')
  return H0 - (H0 - Hd) * Math.pow(Q / Qd, 2)
}

export interface PumpSpec {
  /** Shutoff head H0, m. */
  H0: number
  /** Rated flow, m³/s. */
  Qd: number
  /** Rated head at the rated flow, m. */
  Hd: number
  /** Pump efficiency at the rated point (0–1). */
  eta: number
  /** Motor efficiency (0–1, default 0.92). */
  motorEta?: number
}

export interface OperatingPoint {
  Q: number          // m³/s
  H: number          // m
  Pwater: number     // kW
  Pshaft: number     // kW
  Pmotor: number     // kW
  /** kWh per m³ of water lifted. */
  kwhPerM3: number
}

/** The operating point: bisection on H_pump(Q) − H_sys(Q) = 0. */
export function operatingPoint(sys: SystemInput, pump: PumpSpec): OperatingPoint {
  if (!(pump.eta > 0 && pump.eta <= 1)) throw new Error('Pump efficiency must be 0–1.')
  const motorEta = pump.motorEta ?? 0.92
  const f = (Q: number) => pumpHead(Q, pump.H0, pump.Qd, pump.Hd) - systemHead(sys, Q)
  // Bracket: at Q = 0 the pump gives H0 > static demand (else it never
  // lifts); march the upper bound until the curves cross or give up.
  if (f(0) <= 0) throw new Error('The shutoff head cannot exceed the static demand — the pump will not lift.')
  let hi = Math.max(pump.Qd, 1e-3)
  for (let i = 0; i < 60 && f(hi) > 0; i++) hi *= 1.5
  if (f(hi) > 0) throw new Error('The system curve never overtakes the pump curve in the searchable range.')
  let lo = 0
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid
    else hi = mid
  }
  const Q = (lo + hi) / 2
  const H = systemHead(sys, Q)
  const Pwater = (GAMMA_W * Q * H)
  const Pshaft = Pwater / pump.eta
  const Pmotor = Pshaft / motorEta
  return { Q, H, Pwater, Pshaft, Pmotor, kwhPerM3: Pshaft / (Q * 1000) }
}

export interface NpshInput {
  /** Atmospheric pressure head at site elevation, m (10.33 at sea level). */
  patmHead: number
  /** Vapour pressure head at the water temperature, m. */
  vapourHead: number
  /** Suction static head, m — POSITIVE for flooded suction, negative lift. */
  zSuction: number
  /** Suction friction + minor losses at the operating flow, m. */
  hfSuction: number
  /** Required NPSH from the pump datasheet, m. */
  npshRequired: number
  /** Safety margin as a fraction of NPSHr (default 0.3 → +30 %). */
  marginFrac?: number
}

export interface NpshResult {
  npshAvailable: number
  npshRequired: number
  margin: number
  ok: boolean
}

/** NPSH available vs required, with the margin check. */
export function npsh(p: NpshInput): NpshResult {
  if (!(p.npshRequired > 0)) throw new Error('NPSH required must be positive.')
  const marginFrac = p.marginFrac ?? 0.3
  const available = p.patmHead - p.vapourHead + p.zSuction - p.hfSuction
  const required = p.npshRequired * (1 + marginFrac)
  return { npshAvailable: available, npshRequired: required, margin: available - required, ok: available + 1e-9 >= required }
}

/** Affinity laws: the rated triple at a new speed ratio r = N'/N. */
export function affinity(Qd: number, Hd: number, P: number, r: number) {
  if (!(r > 0)) throw new Error('Speed ratio must be positive.')
  return { Q: Qd * r, H: Hd * r * r, P: P * r * r * r }
}
