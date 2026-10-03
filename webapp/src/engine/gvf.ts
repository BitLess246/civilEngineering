// ─────────────────────────────────────────────────────────────────────────
// GRADUALLY VARIED FLOW — the water-surface profile behind a control.
//
//   GVF equation      dy/dx = (S0 − Sf) / (1 − Fr²)
//   Friction slope    Sf = (Q·n / (A·R^(2/3)))²          (Manning, SI)
//   Froude number     Fr² = Q²·T / (g·A³)
//
//   Profile classes (Chow): slope type from yn vs yc, zone from the depth —
//     mild       yn > yc :  M1 (y > yn)   M2 (yc<y<yn)   M3 (y < yc)
//     steep      yn < yc :  S1 (y > yc)   S2 (yn<y<yc)   S3 (y < yn)
//     critical   yn = yc :  C1 (y > yc)                  C3 (y < yc)
//     horizontal S0 = 0  :  H2 (y > yc)                  H3 (y < yc)
//     adverse    S0 < 0  :  A2 (y > yc)                  A3 (y < yc)
//
//   Directions: M1/M2/S1 are subcritical — control at the downstream end,
//   march upstream; M3/S2/S3 are supercritical — control at the upstream
//   end, march downstream. The march integrates the ODE with RK4 and stops
//   at the uniform-flow asymptote (approach to yn) or at critical depth
//   (a hydraulic jump sits ahead). Horizontal/adverse profiles have no yn
//   and always head for the critical-depth asymptote when marching
//   downstream.
//
// A standard-step energy march between stations,
//   E_us + hf = E_ds,  hf = Δx·(Sf_us + Sf_ds)/2
// (equivalently E_us = E_ds + hf − S0·Δx), is provided as an independent
// second method — the tests use it to cross-check the RK4 march.
// ─────────────────────────────────────────────────────────────────────────

import { geomAt, normalDepth, criticalDepth, froude, G, type ChannelShape } from './openChannel'

/** Manning friction slope Sf at depth y (SI). */
export function frictionSlope(shape: ChannelShape, y: number, Q: number, n: number): number {
  const { A, R } = geomAt(shape, y)
  return Math.pow(Q * n / (A * Math.pow(R, 2 / 3)), 2)
}

/** Specific energy E = y + Q²/(2gA²). */
export function energyAt(shape: ChannelShape, y: number, Q: number): number {
  const { A } = geomAt(shape, y)
  return y + Q * Q / (2 * G * A * A)
}

/** Right-hand side of the GVF equation dy/dx at depth y (clamped near the Fr = 1 singularity). */
export function gvfSlope(shape: ChannelShape, y: number, Q: number, n: number, S0: number): number {
  const num = S0 - frictionSlope(shape, y, Q, n)
  const den = 1 - Math.pow(froude(shape, y, Q), 2)
  if (Math.abs(den) < 1e-3) return Math.sign(num || 1) * Math.min(50, Math.abs(num) / 1e-3)
  return num / den
}

export type SlopeClass = 'mild' | 'steep' | 'critical' | 'horizontal' | 'adverse'

export interface GvfInput {
  shape: ChannelShape
  /** Discharge, m³/s. */
  Q: number
  /** Manning n. */
  n: number
  /** Bed slope S0 (m/m) — 0 or negative allowed (horizontal / adverse). */
  S0: number
  /** Reach length, m. */
  L: number
  /** Boundary (control) depth, m. */
  yControl: number
  /** Where the control sits. 'auto' follows the Froude rule. */
  controlAt: 'upstream' | 'downstream' | 'auto'
  /** Integration step, m (default L/400, clamped 0.05–5). */
  dx?: number
}

export interface GvfStation {
  /** Distance from the reach's upstream end, m. */
  x: number
  y: number
  Fr: number
  Sf: number
}

export interface GvfResult {
  /** Normal depth (null on horizontal / adverse slopes). */
  yn: number | null
  /** Critical depth. */
  yc: number
  slopeClass: SlopeClass
  /** Chow profile label, e.g. 'M1', 'S2', 'H3'. */
  profile: string
  /** Zone 1/2/3 of the classification diagram. */
  zone: 1 | 2 | 3
  /** Direction the march travelled. */
  march: 'upstream' | 'downstream'
  /** Where the control depth was applied. */
  controlAt: 'upstream' | 'downstream'
  /** Froude number of the control depth. */
  FrControl: number
  stations: GvfStation[]
  terminus: 'uniform-flow asymptote' | 'critical-depth asymptote — jump ahead' | 'reach end' | 'numerical limit'
  /** Depth reached at the far end of the march. */
  yEnd: number
}

function classifySlope(S0: number, yn: number | null, yc: number): SlopeClass {
  if (S0 < 0) return 'adverse'
  if (S0 === 0 || yn === null) return 'horizontal'
  if (Math.abs(yn - yc) < 1e-6 * Math.max(yn, yc)) return 'critical'
  return yn > yc ? 'mild' : 'steep'
}

function profileLabel(cls: SlopeClass, y: number, yn: number | null, yc: number): { letter: string; zone: 1 | 2 | 3 } {
  const above = y > yc
  switch (cls) {
    case 'mild': {
      const z: 1 | 2 | 3 = y > (yn as number) ? 1 : above ? 2 : 3
      return { letter: 'M', zone: z }
    }
    case 'steep': {
      const z: 1 | 2 | 3 = above ? 1 : y > (yn as number) ? 2 : 3
      return { letter: 'S', zone: z }
    }
    case 'critical': return { letter: 'C', zone: above ? 1 : 3 }
    case 'horizontal': return { letter: 'H', zone: above ? 2 : 3 }
    case 'adverse': return { letter: 'A', zone: above ? 2 : 3 }
  }
}

function bisect(f: (v: number) => number, a: number, b: number): number {
  let fa = f(a)
  for (let i = 0; i < 80; i++) {
    const m = (a + b) / 2
    const fm = f(m)
    if (fa * fm <= 0) b = m
    else { a = m; fa = fm }
    if (b - a < 1e-12) break
  }
  return (a + b) / 2
}

/**
 * Standard-step march (energy balance between stations): the unknown
 * station satisfies E_u + S0·dx − hf = E_known with hf = dx·(Sf_u + Sf_k)/2.
 * Monotone energy/friction balance on each side of critical depth → bisection.
 */
export function standardStep(
  shape: ChannelShape, Q: number, n: number, S0: number,
  yStart: number, dx: number, steps: number,
): number[] {
  const yc = criticalDepth(shape, Q)
  const E = (y: number) => energyAt(shape, y, Q)
  const Sf = (y: number) => frictionSlope(shape, y, Q, n)
  const depths: number[] = [yStart]
  let y = yStart

  for (let i = 0; i < steps; i++) {
    const Ek = E(y)
    const Sfk = Sf(y)
    const sub = y > yc
    // unknown station energy: E_u + S0·dx − dx·(Sf_u + Sf_k)/2 = E_k
    const balance = (yu: number) => E(yu) + S0 * dx - dx * (Sf(yu) + Sfk) / 2 - Ek
    // g(yu) is monotone on each branch; bracket on the known side of critical
    let lo: number, hi: number
    if (sub) {
      lo = Math.max(yc * (1 + 1e-9), y * 0.02)
      hi = y
    } else {
      lo = y
      hi = Math.min(yc * (1 - 1e-9), y * 50)
    }
    // the root must sit strictly inside; if the balance cannot be met before
    // critical depth, the profile wants to cross — stop the march
    if (balance(lo) * balance(hi) > 0) break
    y = bisect(balance, lo, hi)
    if (y < 1e-4) break
    depths.push(y)
  }
  return depths
}

/** The GVF water-surface profile. */
export function gvfProfile(input: GvfInput): GvfResult {
  const { shape, Q, n, S0, L } = input
  if (!(Q > 0)) throw new Error('Discharge must be positive.')
  if (!(n > 0)) throw new Error('Manning n must be positive.')
  if (!(input.yControl > 0)) throw new Error('Control depth must be positive.')
  if (!(L > 0)) throw new Error('Reach length must be positive.')
  if (shape.kind === 'circle' && input.yControl >= shape.D) {
    throw new Error('Control depth must stay below the crown of a circular section.')
  }

  const yc = criticalDepth(shape, Q)
  let yn: number | null = null
  if (S0 > 0) {
    try { yn = normalDepth(shape, Q, n, S0) } catch { yn = null }
  }

  const cls = classifySlope(S0, yn, yc)
  const { letter, zone } = profileLabel(cls, input.yControl, yn, yc)

  const FrControl = froude(shape, input.yControl, Q)
  const controlAt: 'upstream' | 'downstream' =
    input.controlAt !== 'auto' ? input.controlAt : (FrControl > 1 ? 'upstream' : 'downstream')
  const march: 'upstream' | 'downstream' = controlAt === 'downstream' ? 'upstream' : 'downstream'

  const dx = Math.min(5, Math.max(0.05, input.dx ?? L / 400))
  const maxSteps = Math.ceil(L / dx)
  const stations: GvfStation[] = []
  const push = (x: number, yy: number) => {
    stations.push({ x, y: yy, Fr: froude(shape, yy, Q), Sf: frictionSlope(shape, yy, Q, n) })
  }

  let y = input.yControl
  let x = controlAt === 'downstream' ? L : 0
  push(x, y)

  const yScale = yn ?? yc
  const tolUniform = 5e-4 * yScale
  const tolCrit = 2e-3 * yc
  let terminus: GvfResult['terminus'] = 'reach end'

  const step = march === 'downstream' ? dx : -dx
  const f = (yy: number) => gvfSlope(shape, yy, Q, n, S0)

  for (let i = 0; i < maxSteps; i++) {
    const k1 = f(y)
    const k2 = f(y + step * k1 / 2)
    const k3 = f(y + step * k2 / 2)
    const k4 = f(y + step * k3)
    const dy = step * (k1 + 2 * k2 + 2 * k3 + k4) / 6
    if (!Number.isFinite(dy) || Math.abs(dy) > 2 * dx) { terminus = 'numerical limit'; break }
    let yNext = y + dy
    if (yNext <= 1e-6) { terminus = 'numerical limit'; break }
    if (shape.kind === 'circle') yNext = Math.min(yNext, shape.D * (1 - 1e-6))
    const xNext = x + step
    if (xNext < -1e-9 || xNext > L + 1e-9) break // reached the reach boundary

    // a profile that closes on critical depth ends at a hydraulic jump
    if (Math.abs(yNext - yc) < tolCrit && Math.abs(yNext - yc) < Math.abs(y - yc)) {
      y = yNext; x = xNext; push(x, y)
      terminus = 'critical-depth asymptote — jump ahead'
      break
    }
    y = yNext
    x = xNext
    push(x, y)

    if (yn !== null && Math.abs(y - yn) < tolUniform && Math.abs(k1) < 1e-4) {
      terminus = 'uniform-flow asymptote'
      break
    }
  }

  return {
    yn, yc, slopeClass: cls, profile: `${letter}${zone}`, zone,
    march, controlAt, FrControl, stations, terminus, yEnd: y,
  }
}
