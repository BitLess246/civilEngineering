// ─────────────────────────────────────────────────────────────────────────
// CULVERT HYDRAULICS — FHWA HDS-5 (Normann, "Hydraulic Design of Highway
// Culverts") inlet- and outlet-control headwater for circular and box
// culverts, with the controlling regime, headwater ratio and outlet
// velocity, plus a standard-size sweep for minimum diameter.
//
//   Inlet control, unsubmerged (form 1)
//     HWi/D = Ec/D + K·[Q/(A·√D)]^M + slopeCoef·S
//   Inlet control, submerged (form 2)
//     HWi/D = c·[Q/(A·√D)]² + Y + slopeCoef·S
//   Transition 1.0 ≤ HW/D ≤ 1.2: linear in Q between form 1 at 1.0·D and
//   form 2 at 1.2·D (the HDS-5 nomograph knot).
//   Outlet control, full barrel
//     H  = [1 + Ke + 2g·n²·L/R^(4/3)]·V²/(2g)
//     HW = ho + H,   ho = max(TW, (dc + D)/2)
//   Outlet velocity: inlet control → Manning normal-depth area (capped at
//   the crown); outlet control → area at dc / TW / crown, whichever HDS-5
//   prescribes.
//
// The K/M/c/Y/Ke constants are dimensionless ONLY with Q in cfs, A in ft²
// and D in ft, so the inlet-control arithmetic runs in US units and is
// converted back at the edge. Values (HDS-5 Appendix A / Table 12 & 14):
//
//   concrete square edge w/ headwall   K=0.0098 M=2.00 c=0.0398 Y=0.67 Ke=0.5
//   concrete groove end w/ headwall    K=0.0018 M=2.00 c=0.0292 Y=0.74 Ke=0.2
//   concrete groove end projecting     K=0.0033 M=2.00 c=0.0316 Y=0.69 Ke=0.2
//   CMP 90° headwall                   K=0.0078 M=2.00 c=0.0379 Y=0.69 Ke=0.5
//   CMP mitered to slope               K=0.0210 M=1.33 c=0.0463 Y=0.75 Ke=0.7
//   CMP projecting                     K=0.0340 M=1.50 c=0.0553 Y=0.54 Ke=0.9
//   box 30°–75° flared wingwalls       K=0.022  M=1.33 c=0.0423 Y=0.81 Ke=0.2
//
// The slope term is −0.5·S for every entrance except the mitered one,
// where the barrel slope is ADDED (+0.7·S) per the HDS-5 mitered chart.
// ─────────────────────────────────────────────────────────────────────────

import { geomAt, normalDepth, criticalDepth, type ChannelShape } from './openChannel'

const FT = 1 / 0.3048 // m → ft
const G_US = 32.2 // ft/s²

export interface CulvertInletDef {
  id: string
  label: string
  material: 'concrete' | 'CMP' | 'concrete box'
  kind: 'circular' | 'box'
  /** Manning n of the barrel (default per material). */
  n: number
  K: number
  M: number
  c: number
  Y: number
  /** Coefficient of the barrel slope in the HW/D equations. */
  slopeCoef: number
  /** Entrance loss coefficient for outlet control. */
  Ke: number
}

export const CULVERT_INLETS: CulvertInletDef[] = [
  { id: 'concrete-square-headwall', label: 'Concrete · square edge w/ headwall', material: 'concrete', kind: 'circular', n: 0.013, K: 0.0098, M: 2.0, c: 0.0398, Y: 0.67, slopeCoef: -0.5, Ke: 0.5 },
  { id: 'concrete-groove-headwall', label: 'Concrete · groove end w/ headwall', material: 'concrete', kind: 'circular', n: 0.013, K: 0.0018, M: 2.0, c: 0.0292, Y: 0.74, slopeCoef: -0.5, Ke: 0.2 },
  { id: 'concrete-groove-projecting', label: 'Concrete · groove end projecting', material: 'concrete', kind: 'circular', n: 0.013, K: 0.0033, M: 2.0, c: 0.0316, Y: 0.69, slopeCoef: -0.5, Ke: 0.2 },
  { id: 'cmp-headwall', label: 'CMP · 90° headwall', material: 'CMP', kind: 'circular', n: 0.024, K: 0.0078, M: 2.0, c: 0.0379, Y: 0.69, slopeCoef: -0.5, Ke: 0.5 },
  { id: 'cmp-mitered', label: 'CMP · mitered to slope', material: 'CMP', kind: 'circular', n: 0.024, K: 0.021, M: 1.33, c: 0.0463, Y: 0.75, slopeCoef: 0.7, Ke: 0.7 },
  { id: 'cmp-projecting', label: 'CMP · projecting', material: 'CMP', kind: 'circular', n: 0.024, K: 0.034, M: 1.5, c: 0.0553, Y: 0.54, slopeCoef: -0.5, Ke: 0.9 },
  { id: 'box-flared-wingwalls', label: 'Concrete box · 30°–75° flared wingwalls', material: 'concrete box', kind: 'box', n: 0.013, K: 0.022, M: 1.33, c: 0.0423, Y: 0.81, slopeCoef: -0.5, Ke: 0.2 },
]

export function inletDef(id: string): CulvertInletDef {
  const d = CULVERT_INLETS.find((i) => i.id === id)
  if (!d) throw new Error(`Unknown culvert inlet type: ${id}`)
  return d
}

export type CulvertSection =
  | { kind: 'circular'; D: number }
  | { kind: 'box'; B: number; D: number }

function channelShape(s: CulvertSection, scale = 1): ChannelShape {
  if (s.kind === 'circular') return { kind: 'circle', D: s.D * scale }
  return { kind: 'rect', b: s.B * scale }
}

/** Full-barrel area, m². */
export function fullArea(s: CulvertSection): number {
  return s.kind === 'circular'
    ? Math.PI * s.D * s.D / 4
    : s.B * s.D
}

/** Full-barrel wetted perimeter, m. */
export function fullPerimeter(s: CulvertSection): number {
  return s.kind === 'circular' ? Math.PI * s.D : 2 * (s.B + s.D)
}

/** Inlet-control constants with the x = Q/(A·√D) ratio for the record. */
export interface InletHW {
  hw: number
  form: 'unsubmerged' | 'transition' | 'submerged'
  /** Q/(A·√D) in US units. */
  x: number
  /** Critical-energy head Ec (ft) when form 1 drove the answer. */
  EcFt?: number
}

/**
 * HDS-5 inlet-control headwater depth (m) for one barrel. Internal
 * arithmetic in US units; Q in m³/s, section in m.
 */
export function inletControlHW(Q: number, section: CulvertSection, inlet: CulvertInletDef, S: number): InletHW {
  if (!(Q > 0)) throw new Error('Inlet control: discharge must be positive.')
  if (!(S >= 0)) throw new Error('Inlet control: barrel slope must be non-negative.')
  const q = Q * FT ** 3 // cfs
  const D = section.D * FT // ft
  const shape = channelShape(section, FT)
  const A = fullArea(section) * FT ** 2 // ft²
  const x = q / (A * Math.sqrt(D))
  const slopeTerm = inlet.slopeCoef * S

  // — form 2 (submerged): valid once HW/D ≥ 1.2 —
  const hw2OverD = inlet.c * x * x + inlet.Y + slopeTerm
  const hw2 = hw2OverD * D

  // — form 1 (unsubmerged): needs the critical-energy head Ec in the barrel —
  const ecFor = (qCfs: number): number => {
    const yc = criticalDepthUs(shape, D, qCfs)
    const g = geomAt(shape, yc)
    return yc + qCfs * qCfs / (2 * G_US * g.A * g.A)
  }
  const ec = ecFor(q)
  const hw1OverD = ec / D + inlet.K * Math.pow(x, inlet.M) + slopeTerm
  const hw1 = hw1OverD * D

  if (hw1OverD <= 1.0) {
    return { hw: hw1 / FT, form: 'unsubmerged', x, EcFt: ec }
  }

  // — transition knot: form 1 at HW/D = 1.0 → form 2 at HW/D = 1.2 —
  // Qa: discharge where form 1 reaches the crown. Ec depends on Q, so
  // this is a bisection on the full form-1 curve, not a closed form.
  const form1Hw = (qCfs: number): number => {
    const e = ecFor(qCfs)
    const xq = qCfs / (A * Math.sqrt(D))
    return D * (e / D + inlet.K * Math.pow(xq, inlet.M) + slopeTerm)
  }
  let loQ = q * 1e-6
  let hiQ = q
  let QaCfs = 0
  if (form1Hw(loQ) < D) {
    for (let i = 0; i < 100; i++) {
      const mid = (loQ + hiQ) / 2
      if (form1Hw(mid) < D) loQ = mid
      else hiQ = mid
    }
    QaCfs = (loQ + hiQ) / 2
  }
  // Qb: discharge where form 2 reaches 1.2·D (no Ec in form 2 — closed form).
  const denom2 = 1.2 - inlet.Y - slopeTerm
  const xb = denom2 > 0 && inlet.c > 0 ? Math.sqrt(denom2 / inlet.c) : NaN
  const QbCfs = Number.isFinite(xb) ? xb * A * Math.sqrt(D) : NaN

  if (Number.isFinite(QbCfs) && QaCfs > 0 && QbCfs > QaCfs && q <= QbCfs) {
    const frac = Math.min(1, Math.max(0, (q - QaCfs) / (QbCfs - QaCfs)))
    const hw = D * (1.0 + 0.2 * frac)
    return { hw: hw / FT, form: 'transition', x, EcFt: ec }
  }
  if (Number.isFinite(QbCfs) && q > QbCfs) {
    return { hw: hw2 / FT, form: 'submerged', x }
  }
  // Degenerate constants: fall back to the larger of the two forms.
  return { hw: Math.max(hw1, hw2) / FT, form: hw1 >= hw2 ? 'unsubmerged' : 'submerged', x, EcFt: ec }
}

/** Critical depth in a ft-section under a cfs discharge (g = 32.2). */
function criticalDepthUs(shape: ChannelShape, D_ft: number, q: number): number {
  const f = (y: number) => {
    const g = geomAt(shape, y)
    return (q * q * g.T) / (G_US * Math.pow(g.A, 3)) - 1
  }
  // f > 0 (choked) at small depths, f < 0 near the crown → root between.
  let lo = 1e-9 * D_ft
  let hi = D_ft * (1 - 1e-9)
  if (shape.kind === 'rect') {
    // rect has no crown: bracket by growth
    hi = Math.max(1, 10 * D_ft)
  }
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2
    if (f(mid) > 0) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

export interface OutletHW {
  hw: number
  /** Full-barrel velocity, m/s. */
  V: number
  /** Total outlet-control head loss (m) from ho to the headwater surface. */
  H: number
  /** Friction part of H, m. */
  hf: number
  /** Entrance + velocity head part of H, m. */
  vh: number
  /** Outlet depth used for the HW datum, m. */
  ho: number
  /** Critical depth at the outlet, m. */
  dc: number
  /** True when TW ≥ crown (fully submerged outlet). */
  submergedOutlet: boolean
}

/**
 * HDS-5 outlet-control headwater for a full barrel (SI throughout).
 * H = [1 + Ke + 2g·n²·L/R^(4/3)]·V²/2g ; HW = ho + H with
 * ho = max(TW, (dc + D)/2).
 */
export function outletControlHW(Q: number, section: CulvertSection, inlet: CulvertInletDef, L: number, n: number, TW: number): OutletHW {
  if (!(Q > 0)) throw new Error('Outlet control: discharge must be positive.')
  if (!(L > 0)) throw new Error('Outlet control: barrel length must be positive.')
  const A = fullArea(section)
  const P = fullPerimeter(section)
  const R = A / P
  const V = Q / A
  const vhHead = V * V / 19.62
  const fricCoef = 19.62 * n * n * L / Math.pow(R, 4 / 3)
  const hf = fricCoef * vhHead
  const H = (1 + inlet.Ke + fricCoef) * vhHead
  const dc = criticalDepth(channelShape(section), Q)
  const submergedOutlet = TW >= section.D
  // HDS-5: ho is the greater of the tailwater depth and (dc + D)/2.
  const ho = Math.max(TW, (dc + section.D) / 2)
  return { hw: ho + H, V, H, hf, vh: (1 + inlet.Ke) * vhHead, ho, dc, submergedOutlet }
}

export interface CulvertInput {
  /** Design discharge per barrel (or total if nBarrels given), m³/s. */
  Q: number
  section: CulvertSection
  /** Inlet id from CULVERT_INLETS. */
  inlet: string
  /** Barrel length, m. */
  L: number
  /** Barrel slope, m/m. */
  S: number
  /** Tailwater depth above the outlet invert, m. */
  TW: number
  /** Manning n override (default from the inlet type). */
  n?: number
  /** Number of identical barrels sharing Q. */
  barrels?: number
  /** Allowable headwater depth for the sizing sweep, m. */
  allowableHW?: number
}

export interface CulvertResult {
  Q: number
  barrels: number
  L: number
  S: number
  TW: number
  n: number
  section: CulvertSection
  inlet: CulvertInletDef
  inletHW: InletHW
  outletHW: OutletHW
  controlling: 'inlet' | 'outlet'
  /** Governing headwater depth above the inlet invert, m. */
  hw: number
  hwOverD: number
  outletVelocity: number
  velocityDepth: number
  notes: string[]
}

/** Full HDS-5 check: both controls, the governing headwater, outlet velocity. */
export function culvertCheck(p: CulvertInput): CulvertResult {
  const inlet = inletDef(p.inlet)
  const n = p.n ?? inlet.n
  const barrels = p.barrels ?? 1
  if (!(barrels >= 1)) throw new Error('Barrel count must be at least 1.')
  if (p.section.kind === 'circular' && !(p.section.D > 0)) throw new Error('Diameter must be positive.')
  if (p.section.kind === 'box' && !(p.section.B > 0 && p.section.D > 0)) throw new Error('Box rise and span must be positive.')
  if (!(p.TW >= 0)) throw new Error('Tailwater depth cannot be negative.')

  const qBarrel = p.Q / barrels
  const iHW = inletControlHW(qBarrel, p.section, inlet, p.S)
  const oHW = outletControlHW(qBarrel, p.section, inlet, p.L, n, p.TW)

  const controlling: 'inlet' | 'outlet' = oHW.hw >= iHW.hw ? 'outlet' : 'inlet'
  const hw = Math.max(iHW.hw, oHW.hw)
  const crown = p.section.D
  const notes: string[] = []

  // — outlet velocity per HDS-5 —
  let velocityDepth: number
  if (controlling === 'inlet') {
    try {
      velocityDepth = normalDepth(channelShape(p.section), qBarrel, n, p.S)
    } catch {
      velocityDepth = crown // over capacity: barrel runs full
    }
    velocityDepth = Math.min(velocityDepth, crown)
  } else {
    velocityDepth = p.TW <= oHW.dc ? oHW.dc : p.TW < crown ? p.TW : crown
  }
  const aV = geomAt(channelShape(p.section), velocityDepth).A
  const outletVelocity = qBarrel / aV

  if (controlling === 'outlet' && hw < crown) {
    notes.push('Outlet-control headwater sits below the crown — the full-barrel equation assumes the barrel flows full, so treat this as a screening value and check part-full flow.')
  }
  if (hw >= crown && hw < crown * 1.2) {
    notes.push('Headwater is within 20 % of the crown — check inlet transition (HW/D between 1.0 and 1.2) against the HDS-5 performance chart.')
  }
  if (p.section.kind === 'circular' && p.S > 0.03) notes.push('Slope exceeds 3 % — verify outlet velocity against scour limits.')
  if (outletVelocity > 3) notes.push('Outlet velocity above 3 m/s — erosion protection at the outlet is usually required.')
  if (inlet.slopeCoef > 0) notes.push('Mitered entrances add +0.7·S to the HW/D equations (HDS-5 Chart 5).')

  return {
    Q: p.Q,
    barrels,
    L: p.L,
    S: p.S,
    TW: p.TW,
    n,
    section: p.section,
    inlet,
    inletHW: iHW,
    outletHW: oHW,
    controlling,
    hw,
    hwOverD: hw / crown,
    outletVelocity,
    velocityDepth,
    notes,
  }
}

// ── standard-size sweep ──────────────────────────────────────────────────

/** Common diameters, m (concrete pipe sizes). */
export const STANDARD_DIAMETERS = [0.3, 0.375, 0.45, 0.6, 0.75, 0.9, 1.05, 1.2, 1.35, 1.5, 1.65, 1.8, 2.1, 2.4, 2.7, 3.0]

/**
 * Smallest standard diameter whose headwater stays under allowableHW.
 * Throws when even the largest size cannot hold the headwater down.
 */
export function minDiameter(p: Omit<CulvertInput, 'section'> & { allowableHW: number }): { D: number; result: CulvertResult } {
  if (!(p.allowableHW > 0)) throw new Error('Allowable headwater must be positive.')
  for (const D of STANDARD_DIAMETERS) {
    try {
      const result = culvertCheck({ ...p, section: { kind: 'circular', D } })
      if (result.hw <= p.allowableHW) return { D, result }
    } catch {
      // size too small for this Q (e.g. critical-depth solver limits) — keep sweeping
    }
  }
  throw new Error('No standard diameter holds the headwater under the allowable depth — try multiple barrels or a lower allowable headwater.')
}
