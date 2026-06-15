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

/**
 * Mid-panel deflection by the crossing-strip method: δ = δ(column strip, dir A)
 * + δ(middle strip, dir B). Both crossing combinations are evaluated and the
 * larger governs. Live deflection → ℓn/360; long-term + live → ℓn/240.
 */
export function slabPanelDeflection(params: {
  x: { ln: number; csW: number; msW: number; h: number; d: number; AsCol: number; AsMid: number; MaCol: number; MaMid: number; exterior: boolean }
  y: { ln: number; csW: number; msW: number; h: number; d: number; AsCol: number; AsMid: number; MaCol: number; MaMid: number; exterior: boolean }
  wD: number; wL: number      // service AREA loads, kPa
  fc: number; lambda?: number
}): SlabDeflectionResult {
  const { wD, wL, fc } = params
  const lambda = params.lambda ?? 1

  // Per-direction column-strip & middle-strip deflections (load on the strip =
  // area load × strip width).
  const strip = (s: typeof params.x, which: 'col' | 'mid') => {
    const bStrip = (which === 'col' ? s.csW : s.msW) * 1000
    const As = which === 'col' ? s.AsCol : s.AsMid
    const Ma = which === 'col' ? s.MaCol : s.MaMid
    const wWidth = which === 'col' ? s.csW : s.msW
    return stripDeflection({
      ln: s.ln, bStrip, h: s.h, d: s.d, As,
      wD: wD * wWidth, wL: wL * wWidth, Ma, fc, exterior: s.exterior, lambda,
    })
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
