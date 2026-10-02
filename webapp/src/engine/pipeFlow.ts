// ─────────────────────────────────────────────────────────────────────────
// PIPE FLOW — friction head loss, the two workhorse equations.
//
// HAZEN–WILLIAMS (water, turbulent, the PH waterworks standard):
//   V = 0.8492 · C · R^0.63 · S^0.54        R in m, S = hf/L in m/m
//   hf = 10.67 · L · Q^1.852 / (C^1.852 · D^4.8704)     (the same law in Q)
//
// DARCY–WEISBACH:
//   hf = f · (L/D) · V²/(2g)
//   Re = V·D/ν
//   laminar  Re < 2300:            f = 64/Re
//   turbulent           Colebrook–White, solved by Newton iteration:
//     1/√f = −2·log₁₀( ε/(3.7·D) + 2.51/(Re·√f) )
//
// Minor losses are summed as ΣK·V²/(2g) on top of the friction loss.
// ─────────────────────────────────────────────────────────────────────────

export const G = 9.81

/** Kinematic viscosity of water, ×10⁻⁶ m²/s, by temperature (°C). */
const NU_TABLE: [number, number][] = [
  [0, 1.787], [5, 1.519], [10, 1.307], [15, 1.141], [20, 1.004],
  [25, 0.897], [30, 0.801], [35, 0.723], [40, 0.658],
]

/** Linear interpolation of ν (m²/s) at a temperature in °C, clamped to the table. */
export function waterNu(tempC: number): number {
  const t = Math.min(40, Math.max(0, tempC))
  for (let i = 1; i < NU_TABLE.length; i++) {
    const [t0, n0] = NU_TABLE[i - 1]
    const [t1, n1] = NU_TABLE[i]
    if (t <= t1) return (n0 + (t - t0) / (t1 - t0) * (n1 - n0)) * 1e-6
  }
  return NU_TABLE[NU_TABLE.length - 1][1] * 1e-6
}

export interface PipeGeometry {
  /** Length (m). */
  L: number
  /** Inside diameter (m). */
  D: number
  /** Sum of minor-loss coefficients ΣK. */
  minorK: number
}

/** Hazen–Williams slope S (m/m) from velocity, C and hydraulic radius. */
export function hwSlope(V: number, C: number, R: number): number {
  if (!(V > 0)) throw new Error('Hazen–Williams: velocity must be positive.')
  if (!(C > 0)) throw new Error('Hazen–Williams: C must be positive.')
  if (!(R > 0)) throw new Error('Hazen–Williams: hydraulic radius must be positive.')
  return Math.pow(V / (0.8492 * C * Math.pow(R, 0.63)), 1 / 0.54)
}

export interface PipeResult {
  /** Velocity (m/s). */
  V: number
  /** Friction head loss (m). */
  hf: number
  /** Minor losses ΣK·V²/2g (m). */
  hm: number
  /** Total head loss (m). */
  hTotal: number
  /** Hydraulic slope hf/L (m per m) and per 100 m. */
  S: number
  S100: number
  /** Reynolds number (Darcy path only; NaN for Hazen–Williams). */
  Re: number
  /** Friction factor (Darcy path only; NaN for Hazen–Williams). */
  f: number
  /** Flow regime label (Darcy path only). */
  regime: 'laminar' | 'transition' | 'turbulent' | ''
  warnings: string[]
}

export interface HWInput extends PipeGeometry {
  /** Hazen–Williams roughness coefficient (typ. 90–140). */
  C: number
  /** Discharge (m³/s) — or leave blank and give velocity. */
  Q?: number
  /** Velocity (m/s) used when Q is not given. */
  V?: number
}

/** Hazen–Williams head loss for a full circular pipe. */
export function hazenWilliams(input: HWInput): PipeResult {
  const { L, D, C } = input
  if (!(L > 0)) throw new Error('Hazen–Williams: length must be positive.')
  if (!(D > 0)) throw new Error('Hazen–Williams: diameter must be positive.')
  const A = Math.PI * D * D / 4
  const V = input.Q !== undefined && input.Q !== null
    ? (() => {
        if (!(input.Q! > 0)) throw new Error('Hazen–Williams: discharge must be positive.')
        return input.Q! / A
      })()
    : (() => {
        if (!(input.V! > 0)) throw new Error('Hazen–Williams: give either Q or V.')
        return input.V!
      })()
  if (!(C >= 50 && C <= 160)) {
    throw new Error('Hazen–Williams: C is calibrated for water mains — 50 ≤ C ≤ 160.')
  }

  const R = D / 4
  const S = hwSlope(V, C, R)
  const hf = S * L
  const hm = input.minorK * V * V / (2 * G)
  const warnings: string[] = []
  if (V < 0.3) warnings.push(`V = ${V.toFixed(2)} m/s is below the ~0.3 m/s self-cleansing floor for water mains.`)
  if (V > 3) warnings.push(`V = ${V.toFixed(2)} m/s is high — surge pressures and wear grow quickly above ~3 m/s.`)
  return {
    V, hf, hm, hTotal: hf + hm,
    S, S100: S * 100,
    Re: NaN, f: NaN, regime: '',
    warnings,
  }
}

export interface DWInput extends PipeGeometry {
  /** Equivalent sand-grain roughness ε (m), e.g. 0.000046 for commercial steel. */
  eps: number
  /** Kinematic viscosity (m²/s). */
  nu: number
  /** Discharge (m³/s) — or leave blank and give velocity. */
  Q?: number
  /** Velocity (m/s) used when Q is not given. */
  V?: number
}

/** Colebrook–White friction factor by fixed-point iteration (Swamee–Jain seed):
 *  f ← 1 / [ −2·log₁₀( ε/(3.7D) + 2.51/(Re·√f) ) ]². */
export function colebrook(epsOverD: number, Re: number): number {
  if (!(Re > 0)) throw new Error('Colebrook: Reynolds number must be positive.')
  // seed — Swamee–Jain explicit form
  let f = 0.25 / Math.pow(Math.log10(epsOverD / 3.7 + 5.74 / Math.pow(Re, 0.9)), 2)
  for (let i = 0; i < 200; i++) {
    const root = Math.sqrt(f)
    const denom = -2 * Math.log10(epsOverD / 3.7 + 2.51 / (Re * root))
    if (!(denom > 0)) break
    const fNew = 1 / (denom * denom)
    if (!Number.isFinite(fNew) || fNew <= 0) break
    if (Math.abs(fNew - f) < 1e-13 * f) { f = fNew; break }
    f = fNew
  }
  return f
}

/** Darcy–Weisbach head loss for a full circular pipe. */
export function darcyWeisbach(input: DWInput): PipeResult {
  const { L, D, eps, nu } = input
  if (!(L > 0)) throw new Error('Darcy–Weisbach: length must be positive.')
  if (!(D > 0)) throw new Error('Darcy–Weisbach: diameter must be positive.')
  if (!(nu > 0)) throw new Error('Darcy–Weisbach: viscosity must be positive.')
  if (eps < 0) throw new Error('Darcy–Weisbach: roughness ε cannot be negative.')
  const A = Math.PI * D * D / 4
  const V = input.Q !== undefined && input.Q !== null
    ? (() => {
        if (!(input.Q! > 0)) throw new Error('Darcy–Weisbach: discharge must be positive.')
        return input.Q! / A
      })()
    : (() => {
        if (!(input.V! > 0)) throw new Error('Darcy–Weisbach: give either Q or V.')
        return input.V!
      })()

  const Re = V * D / nu
  let f: number
  let regime: PipeResult['regime']
  if (Re < 2300) {
    f = 64 / Re
    regime = 'laminar'
  } else {
    f = colebrook(eps / D, Re)
    regime = Re < 4000 ? 'transition' : 'turbulent'
  }
  const hf = f * (L / D) * V * V / (2 * G)
  const hm = input.minorK * V * V / (2 * G)
  const warnings: string[] = []
  if (regime === 'transition') warnings.push(`Re = ${Re.toFixed(0)} sits in the 2300–4000 transition band — neither laminar nor fully turbulent laws hold cleanly; the friction factor is approximate there.`)
  if (V < 0.3) warnings.push(`V = ${V.toFixed(2)} m/s is below the ~0.3 m/s self-cleansing floor for water mains.`)
  if (V > 3) warnings.push(`V = ${V.toFixed(2)} m/s is high — surge pressures and wear grow quickly above ~3 m/s.`)
  return {
    V, hf, hm, hTotal: hf + hm,
    S: hf / L, S100: hf / L * 100,
    Re, f, regime,
    warnings,
  }
}
