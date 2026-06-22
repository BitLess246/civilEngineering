// ─────────────────────────────────────────────────────────────────────────
// RC column design — NSCP 2015 / ACI 318-14, following the review sheets:
//  · Axial (short): Po = 0.85f'c(Ag − Ast) + fy·Ast (§422.4.2.2);
//    Pn,max = 0.80Po tied / 0.85Po spiral; φ = 0.65 / 0.75.
//    Steel 1–8% of Ag (§410.6.1.1); ≥4 bars tied rect, ≥6 spiral (§410.7.3.1).
//    Ties §425.7.2 (Ø ≥ 10 mm up to ⌀32 bars else 12; s ≤ min(16db, 48dt, least
//    dimension)). Spirals §425.7.3 (Ø ≥ 10; clear pitch 25–75 mm;
//    ρs ≥ max[0.45(Ag/Ach − 1), 0.12]·f'c/fyt).
//  · Eccentric (short, tied rectangular): strain-compatibility interaction —
//    ε_cu = 0.003, fs = clamp(600(c−d)/c, ±fy), displaced concrete deducted
//    for bars inside the stress block, moments about the plastic centroid.
//    Balanced condition cb = 600dt/(600+fy). φ from ε_t (0.65/0.75 → 0.90).
//  · Slender (braced/nonsway): neglect when kLu/r ≤ 34 + 12(M1/M2) ≤ 40
//    (M1/M2 negative in single curvature — sheet convention);
//    Cm = 0.6 − 0.4(M1/M2); Pc = π²EI/(kLu)²; δ = Cm/(1 − Pu/0.75Pc) ≥ 1;
//    Mc = δ·max(M2, M2,min = Pu(15 + 0.03h)).
//  · Bresler reciprocal for biaxial: 1/Pn = 1/Pnx + 1/Pny − 1/Po.
// Units: mm, MPa, kN, kN·m.
// ─────────────────────────────────────────────────────────────────────────
import { beta1 } from './loads'

export type ColumnShape  = 'tied' | 'spiral'
export type LateralSystem = 'gravity' | 'imf' | 'smf'

// ── Axial (short, concentric) ────────────────────────────────────────────
export interface AxialColumnInput {
  shape: ColumnShape
  b?: number; h?: number       // tied rectangular, mm
  D?: number                   // spiral circular, mm
  cover: number                // clear cover, mm
  barDia: number
  tieDia: number               // tie or spiral wire Ø
  fc: number; fy: number
  fyt?: number                 // tie/spiral yield (default fy)
  Pu: number                   // factored axial demand, kN
  /** Provide to ANALYZE a chosen bar count; omit to DESIGN the steel. */
  numBars?: number
  /** Lateral system — drives seismic tie requirements. Default: 'gravity'. */
  system?: LateralSystem
  columnLength?: number        // mm, clear height (needed for SMF lo; §418.7.5.1)
  hx?: number                  // mm, max horiz. spacing of laterally restrained bars
}

export interface AxialColumnResult {
  shape: ColumnShape
  Ag: number                   // mm²
  alpha: number                // 0.80 tied / 0.85 spiral
  phi: number                  // 0.65 / 0.75
  AstReq: number               // mm² required (0 when ρmin governs the bars)
  rhoReq: number
  bars: number
  Ast: number                  // provided, mm²
  rho: number
  rhoOK: boolean               // 0.01 ≤ ρ ≤ 0.08
  minBars: number
  Po: number                   // kN
  PnMax: number                // kN
  phiPnMax: number             // kN
  axialOK: boolean             // φPn,max ≥ Pu
  // Tie detailing (tied)
  tieDiaMin: number
  tieSpacing: number           // governing §425.7.2 s, mm
  tieGovern: string
  // Seismic tie detailing (when system !== 'gravity')
  seismicLoZone?: number       // mm, required confinement zone length
  seismicSConf?: number        // mm, max spacing within confinement zone
  seismicSOut?: number         // mm, max spacing outside confinement zone
  tieSpacingFinal: number      // mm, min(tieSpacing, seismicSConf if seismic)
  tieSpacingLabel: string      // human-readable governing clause
  // Spiral detailing (spiral)
  Ach: number
  rhoS: number                 // required volumetric ratio
  spiralPitch: number          // clear-pitch-capped pitch, mm
  pitchClearOK: boolean        // 25 ≤ clear ≤ 75
}

const ES = 600 // 0.003·Es with Es = 200 GPa → fs = 600(c−d)/c

export function designAxialColumn(i: AxialColumnInput): AxialColumnResult {
  const fyt = i.fyt ?? i.fy
  const tied = i.shape === 'tied'
  const Ag = tied ? (i.b ?? 0) * (i.h ?? 0) : (Math.PI / 4) * (i.D ?? 0) ** 2
  const alpha = tied ? 0.80 : 0.85
  const phi = tied ? 0.65 : 0.75
  const Ab = (Math.PI / 4) * i.barDia ** 2
  const minBars = tied ? 4 : 6

  // Required steel from Pu = φ·α·[0.85f'c(Ag − Ast) + fy·Ast]
  const num = (i.Pu * 1000) / (phi * alpha) - 0.85 * i.fc * Ag
  const AstReq = Math.max(0.01 * Ag, num / (i.fy - 0.85 * i.fc))
  const rhoReq = AstReq / Ag

  const bars = i.numBars ?? Math.max(minBars, Math.ceil(AstReq / Ab))
  const Ast = bars * Ab
  const rho = Ast / Ag
  const rhoOK = rho >= 0.01 - 1e-9 && rho <= 0.08 + 1e-9

  const Po = (0.85 * i.fc * (Ag - Ast) + i.fy * Ast) / 1000
  const PnMax = alpha * Po
  const phiPnMax = phi * PnMax

  // §425.7.2 ties (gravity / upper bound)
  const tieDiaMin = i.barDia <= 32 ? 10 : 12
  const least = tied ? Math.min(i.b ?? 0, i.h ?? 0) : (i.D ?? 0)
  const sCands: [number, string][] = [
    [16 * i.barDia, '16d_b'],
    [48 * i.tieDia, '48d_tie'],
    [least, 'least dim'],
  ]
  const [tieSpacing, tieGovern] = sCands.reduce((a, c) => (c[0] < a[0] ? c : a))

  // Seismic confinement (tied columns)
  const system = i.system ?? 'gravity'
  const bDim = i.b ?? least, hDim = i.h ?? least   // column cross-section dims
  const bMin = Math.min(bDim, hDim), bMax = Math.max(bDim, hDim)
  let seismicLoZone: number | undefined
  let seismicSConf: number | undefined
  let seismicSOut:  number | undefined

  if (tied && system !== 'gravity') {
    if (system === 'smf') {
      // §418.7.5.1 — confinement zone length lo
      const Lu = i.columnLength ?? 3000   // default 3 m if not given
      seismicLoZone = Math.max(bMax, Lu / 6, 450)

      // §418.7.5.3/4 — spacing within lo
      const hx = Math.min(i.hx ?? bMin, 350)   // max lateral spacing ≤ 350
      const so  = Math.min(Math.max(100 + (350 - hx) / 3, 100), 150)
      seismicSConf = Math.min(bMin / 4, 6 * i.barDia, so)

      // §418.7.5.5 — spacing outside lo
      seismicSOut = Math.min(6 * i.barDia, 150)
    } else {
      // IMF §418.4.3 — hinge zone = max(bMax, 450); s ≤ min(8db, 24dt, bMin/2, 300)
      seismicLoZone = Math.max(bMax, 450)
      seismicSConf  = Math.min(8 * i.barDia, 24 * i.tieDia, bMin / 2, 300)
      seismicSOut   = tieSpacing   // outside hinge: ordinary §425.7.2 applies
    }
  }

  const tieSpacingFinal = seismicSConf !== undefined
    ? Math.min(tieSpacing, seismicSConf)
    : tieSpacing
  const tieSpacingLabel = seismicSConf !== undefined && seismicSConf < tieSpacing
    ? (system === 'smf' ? '§418.7.5 SMF conf.' : '§418.4.3 IMF conf.')
    : `§425.7.2 (${tieGovern})`

  // §425.7.3 spiral
  const Dch = (i.D ?? 0) - 2 * i.cover
  const Ach = (Math.PI / 4) * Dch ** 2
  const rhoS = tied ? 0 : Math.max(0.45 * (Ag / Ach - 1), 0.12) * (i.fc / fyt)
  const Asp = (Math.PI / 4) * i.tieDia ** 2
  let spiralPitch = 0, pitchClearOK = true
  if (!tied && rhoS > 0) {
    // ρs = 4Asp / (s·Dch) → s = 4Asp / (ρs·Dch); clear pitch 25–75 mm.
    const sReq = (4 * Asp) / (rhoS * Dch)
    const clear = sReq - i.tieDia
    spiralPitch = Math.min(Math.max(clear, 25), 75) + i.tieDia
    pitchClearOK = clear >= 25 - 1e-9
  }

  return {
    shape: i.shape, Ag, alpha, phi, AstReq, rhoReq,
    bars, Ast, rho, rhoOK, minBars,
    Po, PnMax, phiPnMax, axialOK: phiPnMax >= i.Pu - 1e-9,
    tieDiaMin, tieSpacing, tieGovern,
    seismicLoZone, seismicSConf, seismicSOut,
    tieSpacingFinal, tieSpacingLabel,
    Ach, rhoS, spiralPitch, pitchClearOK,
  }
}

// ── Strain-compatibility interaction (tied rectangular, two-face bars) ──
export interface InteractionInput {
  b: number; h: number          // mm; bending about the axis ⟂ h
  cover: number; barDia: number; tieDia: number
  fc: number; fy: number
  numBars: number               // split evenly between the two faces ⟂ to h
}

export interface PMPoint { c: number; Pn: number; Mn: number; phi: number; et: number }
export interface InteractionResult {
  dPrime: number; dt: number
  AsFace: number                // mm² per face
  Po: number; PnMax: number; phiC: number
  balanced: { c: number; Pb: number; Mb: number; eb: number }
  curve: PMPoint[]              // c sweep, Pn descending
}

function pmAt(i: InteractionInput, dPrime: number, dt: number, AsFace: number, c: number): PMPoint {
  const b1 = beta1(i.fc)
  const a = Math.min(b1 * c, i.h)
  const Cc = (0.85 * i.fc * a * i.b) / 1000
  const layerF = (d: number): number => {
    const fs = Math.max(-i.fy, Math.min(i.fy, (ES * (c - d)) / c))
    const displaced = d <= a ? 0.85 * i.fc : 0
    return (AsFace * (fs - displaced)) / 1000
  }
  const F1 = layerF(dPrime)
  const F2 = layerF(dt)
  const Pn = Cc + F1 + F2
  const Mn = (Cc * (i.h / 2 - a / 2) + F1 * (i.h / 2 - dPrime) + F2 * (i.h / 2 - dt)) / 1000
  const et = (0.003 * (dt - c)) / c
  const ety = i.fy / 200000
  const phi = et >= 0.005 ? 0.90 : et <= ety ? 0.65 : 0.65 + (0.25 * (et - ety)) / (0.005 - ety)
  return { c, Pn, Mn, phi, et }
}

export function interaction(i: InteractionInput): InteractionResult {
  const dPrime = i.cover + i.tieDia + i.barDia / 2
  const dt = i.h - dPrime
  const Ab = (Math.PI / 4) * i.barDia ** 2
  const AsFace = (i.numBars / 2) * Ab
  const Ast = i.numBars * Ab
  const Ag = i.b * i.h
  const Po = (0.85 * i.fc * (Ag - Ast) + i.fy * Ast) / 1000
  const PnMax = 0.80 * Po

  const cb = (600 / (600 + i.fy)) * dt
  const bal = pmAt(i, dPrime, dt, AsFace, cb)

  const curve: PMPoint[] = []
  // Sweep from near-pure-bending (small c) to pure compression. The top end
  // needs c ≥ 600·dt/(600 − fy) for the far-face steel to reach fy so the
  // curve actually closes at Po — 8h covers practical fy.
  const cMin = dPrime * 0.25
  const cMaxV = i.h * 8
  const N = 80
  for (let k = 0; k <= N; k++) {
    const c = cMin * Math.pow(cMaxV / cMin, k / N)   // log sweep
    curve.push(pmAt(i, dPrime, dt, AsFace, c))
  }

  return {
    dPrime, dt, AsFace, Po, PnMax, phiC: 0.65,
    balanced: { c: cb, Pb: bal.Pn, Mb: bal.Mn, eb: bal.Pn > 1e-9 ? bal.Mn / bal.Pn : 0 },
    curve,
  }
}

/** Capacity along the demand ray e = Mu/Pu — bisection on c (e decreases with c). */
export function capacityAtEccentricity(i: InteractionInput, e: number): PMPoint {
  const dPrime = i.cover + i.tieDia + i.barDia / 2
  const dt = i.h - dPrime
  const AsFace = ((i.numBars / 2) * Math.PI * i.barDia ** 2) / 4
  let lo = dPrime * 0.1, hi = i.h * 20
  for (let k = 0; k < 80; k++) {
    const mid = (lo + hi) / 2
    const p = pmAt(i, dPrime, dt, AsFace, mid)
    const eAt = p.Pn > 1e-9 ? p.Mn / p.Pn : Infinity
    if (eAt > e) lo = mid
    else hi = mid
  }
  return pmAt(i, dPrime, dt, AsFace, (lo + hi) / 2)
}

/** Bresler reciprocal load for biaxial bending: 1/Pn = 1/Pnx + 1/Pny − 1/Po. */
export function breslerReciprocal(Pnx: number, Pny: number, Po: number): number {
  return 1 / (1 / Pnx + 1 / Pny - 1 / Po)
}

// ── Slenderness — braced (nonsway) moment magnification ─────────────────
export interface SlendernessInput {
  Pu: number                   // kN
  M1: number; M2: number       // kN·m, |M2| ≥ |M1|; sign of M1/M2 < 0 = single curvature
  k: number                    // effective length factor
  Lu: number                   // unsupported length, m
  h: number                    // section dimension in the bending plane, mm
  shape?: ColumnShape          // r = 0.3h rect (default) / 0.25D circular
  /** Flexural rigidity EI, kN·m². Omit to use 0.4EcIg/(1+βd). */
  EI?: number
  fc?: number; b?: number      // needed when EI is derived
  betaD?: number               // default 0.6
}

export interface SlendernessResult {
  r: number                    // mm
  kLuOverR: number
  limit: number                // 34 + 12(M1/M2) ≤ 40
  slender: boolean             // effects must be considered
  Cm: number
  EI: number                   // kN·m²
  Pc: number                   // kN
  delta: number
  M2min: number                // kN·m
  Mc: number                   // kN·m
}

export function momentMagnificationNonsway(i: SlendernessInput): SlendernessResult {
  const r = (i.shape === 'spiral' ? 0.25 : 0.30) * i.h
  const kLuOverR = (i.k * i.Lu * 1000) / r
  // Sheet convention (RC-06): M1/M2 is NEGATIVE for single curvature.
  // limit = 34 + 12(M1/M2) ≤ 40;  Cm = 0.6 − 0.4(M1/M2).
  const ratio = i.M2 !== 0 ? i.M1 / i.M2 : 0
  const lim = Math.min(34 + 12 * ratio, 40)
  const slender = kLuOverR > lim
  const Cm = 0.6 - 0.4 * ratio

  let EI = i.EI ?? 0
  if (!EI) {
    const Ec = 4700 * Math.sqrt(i.fc ?? 28) * 1000          // kPa
    const Ig = ((i.b ?? i.h) * Math.pow(i.h, 3)) / 12 * 1e-12  // m⁴
    EI = (0.4 * Ec * Ig) / (1 + (i.betaD ?? 0.6))
  }
  const Pc = (Math.PI ** 2 * EI) / Math.pow(i.k * i.Lu, 2)
  const delta = Math.max(1, Cm / (1 - i.Pu / (0.75 * Pc)))
  const M2min = (i.Pu * (15 + 0.03 * i.h)) / 1000
  const Mc = delta * Math.max(Math.abs(i.M2), M2min)
  return { r, kLuOverR, limit: lim, slender, Cm, EI, Pc, delta, M2min, Mc }
}
