// ─────────────────────────────────────────────────────────────────────────
// Two-way slab deflection — Branson effective inertia + crossing-strip method.
// NSCP 2015 §424.2 / ACI 318-14 §24.2.
//   fr   = 0.62·λ·√f′c                                       (§419.2.3.1)
//   Mcr  = fr·Ig / yt,  Ig = b·h³/12,  yt = h/2
//   Ie   = (Mcr/Ma)³·Ig + [1−(Mcr/Ma)³]·Icr ≤ Ig            (§424.2.3.5)
//   λΔ   = ξ / (1 + 50ρ′),  ξ = 2.0 (≥ 5 yr)                (§424.2.4.1.1)
// Mid-panel deflection uses the crossing-strip model (ACI R24.2): the column
// strip in one direction plus the orthogonal middle strip. The governing
// (larger) crossing combination is reported.
//
// WITH EDGE BEAMS (`beamIg` given for a direction) the strips follow the
// Nilson–Walters equivalent-frame method (ACI 435R §4.5): the frame carries
// the whole panel load w·ℓ2 in that direction, the column strip takes its
// share LDF of it on the slab strip PLUS the edge beam (0.35·Ig), and the
// middle strip takes 1 − LDF on its own slab. LDF is the column-strip share of
// positive moment the beam earns — the no-beam split interpolated toward the
// §408.10.5.5 with-beam fraction by α·ℓ2/ℓ1:
//   δcs = k·LDF·w·ℓ2·ℓn⁴ / (384·Ec·(Ie,cs + Ibeam))
//   δms = k·(1 − LDF)·w·ℓ2·ℓn⁴ / (384·Ec·Ie,ms)
// Without it the column strip was a bare slab under its own tributary load —
// a 6 × 5 m panel on 250 × 450 beams read 42 mm at 150 mm thick, 3–7× the
// plate answer, and no practical thickness passed ℓn/240.
// Units: spans m; h/d/db mm; moments kN·m; loads kPa; deflections mm.
// ─────────────────────────────────────────────────────────────────────────

const ES = 200000               // MPa, steel modulus
const XI_LONGTERM = 2.0         // sustained-load time factor (≥ 5 years)

export const Ec = (fc: number): number => 4700 * Math.sqrt(Math.max(fc, 1))   // MPa

/** Cracked transformed moment of inertia of a singly-reinforced strip, mm⁴. */
export function crackedInertia(params: { b: number; d: number; As: number; fc: number }): number {
  const { b, d, As, fc } = params
  if (As <= 0 || b <= 0 || d <= 0) return (b * d ** 3) / 12
  const n = ES / Ec(fc)
  const rhoN = (n * As) / (b * d)
  const k = Math.sqrt(2 * rhoN + rhoN * rhoN) - rhoN     // neutral-axis depth ratio
  const kd = k * d
  return (b * kd ** 3) / 3 + n * As * (d - kd) ** 2
}

/** Branson effective moment of inertia, mm⁴ (Ig when uncracked Ma ≤ Mcr). */
export function effectiveInertia(params: {
  Ma: number; b: number; h: number; d: number; As: number; fc: number; lambda?: number
}): { Ie: number; Ig: number; Icr: number; Mcr: number } {
  const { Ma, b, h, d, As, fc } = params
  const lambda = params.lambda ?? 1
  const Ig = (b * h ** 3) / 12
  const fr = 0.62 * lambda * Math.sqrt(Math.max(fc, 1))   // MPa
  const Mcr = (fr * Ig) / (h / 2) / 1e6                   // N·mm → kN·m
  const Icr = crackedInertia({ b, d, As, fc })
  if (Ma <= Mcr || Ma <= 0) return { Ie: Ig, Ig, Icr, Mcr }
  const r = (Mcr / Ma) ** 3
  const Ie = Math.min(Ig, r * Ig + (1 - r) * Icr)
  return { Ie, Ig, Icr, Mcr }
}

/** Deflection coefficient k in δ = k·w·ℓ⁴/(384·E·I): interior (fixed–fixed) 1,
 *  end span (one discontinuous edge) 2.6, fully simple 5.0. */
const spanCoeff = (exterior: boolean): number => (exterior ? 2.6 : 1.0)

export interface StripDeflection {
  Ie: number; Icr: number; Ig: number; Mcr: number
  immD: number; immL: number; immDL: number      // immediate, mm (dead / live / D+L)
  cracked: boolean
}

/** Immediate deflection of one column strip acting as a continuous wide beam. */
export function stripDeflection(params: {
  ln: number          // clear span, m
  bStrip: number      // strip width, mm
  h: number; d: number; As: number
  wD: number; wL: number   // service line loads on the strip, kN/m
  Ma: number          // service positive moment on the strip, kN·m
  fc: number; exterior: boolean; lambda?: number
}): StripDeflection {
  const { ln, h, d, As, wD, wL, Ma, fc, exterior } = params
  const { Ie, Icr, Ig, Mcr } = effectiveInertia({ Ma, b: params.bStrip, h, d, As, fc, lambda: params.lambda })
  const E = Ec(fc) * 1000                                  // kPa (kN/m²)
  const Iem4 = Ie / 1e12                                   // mm⁴ → m⁴
  const k = spanCoeff(exterior)
  const defl = (w: number) => (k * w * ln ** 4) / (384 * E * Iem4) * 1000   // m → mm
  const immD = defl(wD)
  const immDL = defl(wD + wL)
  return { Ie, Icr, Ig, Mcr, immD, immL: immDL - immD, immDL, cracked: Ma > Mcr }
}

export interface SlabDeflectionResult {
  immediate: number       // mid-panel immediate D+L, mm
  immLive: number         // immediate live only, mm
  longTerm: number        // long-term (sustained dead × λΔ), mm
  total: number           // long-term sustained + immediate live, mm
  lambdaDelta: number
  ln: number              // governing clear span used for the limits, m
  limitLive: number       // ℓn/360, mm
  limitTotal: number      // ℓn/240, mm
  liveOK: boolean
  totalOK: boolean
  cracked: boolean        // any contributing strip cracked under service load
}

export interface SlabDirParams {
  ln: number; csW: number; msW: number; h: number; d: number
  AsCol: number; AsMid: number; MaCol: number; MaMid: number; exterior: boolean
  /** GROSS inertia of the edge beam in this direction's column strip, mm⁴ — credited
   *  at 0.35·Ig (§406.6.3.1.1, cracked). Absent ⇒ no beam credited. */
  beamIg?: number
  /** Centre-to-centre span in this direction, m (for ℓ2/ℓ1). */
  l1?: number
}

/** Column-strip share of positive moment for α·ℓ2/ℓ1 ≥ 1 (§408.10.5.5 / ACI Table 8.10.5.5). */
const csPositiveWithBeams = (r: number) =>
  r <= 0.5 ? 0.9 : r >= 2 ? 0.45 : r <= 1 ? 0.9 - 0.15 * (r - 0.5) / 0.5 : 0.75 - 0.3 * (r - 1)

/**
 * Mid-panel deflection by the crossing-strip method: δ = δ(column strip, dir A)
 * + δ(middle strip, dir B). Both crossing combinations are evaluated and the
 * larger governs. Live deflection → ℓn/360; long-term + live → ℓn/240.
 */
export function slabPanelDeflection(params: {
  x: SlabDirParams
  y: SlabDirParams
  wD: number; wL: number      // service AREA loads, kPa
  fc: number; lambda?: number
}): SlabDeflectionResult {
  const { wD, wL, fc } = params
  const lambda = params.lambda ?? 1

  // Per-direction column-strip & middle-strip deflections (without a beam: load
  // on the strip = area load × strip width).
  const strip = (s: SlabDirParams, which: 'col' | 'mid') => {
    const bStrip = (which === 'col' ? s.csW : s.msW) * 1000
    const As = which === 'col' ? s.AsCol : s.AsMid
    const Ma = which === 'col' ? s.MaCol : s.MaMid
    if (s.beamIg === undefined) {
      const wWidth = which === 'col' ? s.csW : s.msW
      return stripDeflection({
        ln: s.ln, bStrip, h: s.h, d: s.d, As,
        wD: wD * wWidth, wL: wL * wWidth, Ma, fc, exterior: s.exterior, lambda,
      })
    }
    // Nilson–Walters: the strip's moment share of the whole frame load, on the
    // strip's slab (Branson Ie) plus — for the column strip — the edge beam.
    // The share is the one the beam earns: the DDM's no-beam split, moved
    // toward the with-beam column-strip fraction by α·ℓ2/ℓ1 (capped at 1),
    // the linear interpolation §408.10.5 permits. α from gross inertias.
    const l2 = s.csW + s.msW
    const total = s.MaCol + s.MaMid
    const ldf0 = total > 1e-12 ? s.MaCol / total : s.csW / l2
    const l1 = s.l1 ?? s.ln
    const alpha = s.beamIg / ((l2 * 1000 * s.h ** 3) / 12)
    const t = Math.min(1, (alpha * l2) / l1)
    const ldfCol = ldf0 + t * (csPositiveWithBeams(l2 / l1) - ldf0)
    const share = which === 'col' ? ldfCol : 1 - ldfCol
    const sl = effectiveInertia({ Ma, b: bStrip, h: s.h, d: s.d, As, fc, lambda })
    const I = sl.Ie + (which === 'col' ? 0.35 * s.beamIg : 0)
    const E = Ec(fc) * 1000, k = spanCoeff(s.exterior)
    const defl = (w: number) => (k * share * w * l2 * s.ln ** 4) / (384 * E * (I / 1e12)) * 1000
    const immD = defl(wD), immDL = defl(wD + wL)
    return { Ie: I, Icr: sl.Icr, Ig: sl.Ig, Mcr: sl.Mcr, immD, immL: immDL - immD, immDL, cracked: Ma > sl.Mcr }
  }

  const xc = strip(params.x, 'col'), xm = strip(params.x, 'mid')
  const yc = strip(params.y, 'col'), ym = strip(params.y, 'mid')

  // Crossing combinations: column strip in one dir + middle strip in the other.
  const combo = (a: StripDeflection, b: StripDeflection) => ({
    immDL: a.immDL + b.immDL, immD: a.immD + b.immD, immL: a.immL + b.immL,
    cracked: a.cracked || b.cracked,
  })
  const cAB = combo(xc, ym)   // column strip x + middle strip y
  const cBA = combo(yc, xm)   // column strip y + middle strip x
  const gov = cAB.immDL >= cBA.immDL ? cAB : cBA
  const govDir = cAB.immDL >= cBA.immDL ? params.x : params.y

  const lambdaDelta = XI_LONGTERM / (1 + 50 * 0)          // ρ′ = 0 in a slab
  const longTerm = lambdaDelta * gov.immD
  const total = longTerm + gov.immL
  const ln = govDir.ln
  const limitLive = (ln * 1000) / 360
  const limitTotal = (ln * 1000) / 240

  return {
    immediate: gov.immDL, immLive: gov.immL, longTerm, total, lambdaDelta, ln,
    limitLive, limitTotal,
    liveOK: gov.immL <= limitLive, totalOK: total <= limitTotal, cracked: gov.cracked,
  }
}
