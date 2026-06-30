// ─────────────────────────────────────────────────────────────────────────
// Wood-Armer slab design — shell FE moment field → orthogonal reinforcement.
//
// A flat-shell (DKT) analysis returns the plate bending field per element as the
// moment triad (Mx, My, Mxy) per unit width. Reinforcement, however, runs in two
// orthogonal directions and cannot carry the twisting moment Mxy directly. The
// Wood & Armer (1968) rules convert (Mx, My, Mxy) into equivalent NORMAL design
// moments that the x- and y-bars must resist, separately for the bottom face
// (sagging, +M) and the top face (hogging, −M):
//
//   bottom:  M*x = Mx + |Mxy|,           M*y = My + |Mxy|
//            if M*x < 0 → M*x = 0, M*y = My + |Mxy²/Mx|   (and clamp ≥ 0)
//            if M*y < 0 → M*y = 0, M*x = Mx + |Mxy²/My|
//   top:     M*x = Mx − |Mxy|,           M*y = My − |Mxy|
//            if M*x > 0 → M*x = 0, M*y = My − |Mxy²/Mx|   (and clamp ≤ 0)
//            if M*y > 0 → M*y = 0, M*x = Mx − |Mxy²/My|
//
// Each design moment is then sized for flexure to NSCP 2015 / ACI 318-14
// (φ = 0.90), per metre width, with the slab effective depth.
// Units: moments kN·m/m; thickness/cover/bar mm; fc/fy MPa; As mm²/m; spacing mm.
// ─────────────────────────────────────────────────────────────────────────
import { flexuralSteel, rhoMin } from './flexure'

/** Wood-Armer normal design moments (kN·m/m). Bottom values are sagging
 *  magnitudes (≥ 0); top values are hogging magnitudes (≥ 0, sign removed). */
export interface WoodArmerMoments {
  mxBottom: number; myBottom: number
  mxTop: number; myTop: number
}

/**
 * Wood-Armer design moments from a shell moment triad (per unit width).
 * `Mx`, `My`, `Mxy` follow the DKT sign convention (sagging +). The returned
 * bottom/top moments are non-negative magnitudes ready for flexural design.
 */
export function woodArmer(Mx: number, My: number, Mxy: number): WoodArmerMoments {
  const a = Math.abs(Mxy)

  // ── Bottom face (sagging) ──────────────────────────────────────────────
  let mxb = Mx + a
  let myb = My + a
  if (mxb < 0) {
    mxb = 0
    myb = My + (a * a) / Math.abs(Mx)
  } else if (myb < 0) {
    myb = 0
    mxb = Mx + (a * a) / Math.abs(My)
  }
  mxb = Math.max(0, mxb); myb = Math.max(0, myb)

  // ── Top face (hogging) ─────────────────────────────────────────────────
  let mxt = Mx - a
  let myt = My - a
  if (mxt > 0) {
    mxt = 0
    myt = My - (a * a) / Math.abs(Mx)
  } else if (myt > 0) {
    myt = 0
    mxt = Mx - (a * a) / Math.abs(My)
  }
  mxt = Math.min(0, mxt); myt = Math.min(0, myt)

  return { mxBottom: mxb, myBottom: myb, mxTop: Math.abs(mxt), myTop: Math.abs(myt) }
}

/** Reinforcement for one slab strip (one direction, one face), per metre width. */
export interface SlabStripDesign {
  /** Design moment carried by this strip, kN·m/m. */
  Mu: number
  /** Required steel area per metre width, mm²/m (≥ ρ_min·1000·d). */
  As: number
  /** Bar spacing for the chosen bar diameter, mm (capped at min(3t, 450)). */
  spacing: number
  /** Steel actually provided at the adopted spacing, mm²/m. */
  AsProvided: number
  /** True when ρ_min (shrinkage/temperature or flexural minimum) governed. */
  usedMin: boolean
}

/** ACI 318-14 §7.7.2.3 / §8.7.2.2 maximum slab bar spacing: min(3h, 450 mm). */
export function maxSlabSpacing(t: number): number {
  return Math.min(3 * t, 450)
}

/**
 * Size one slab strip for a Wood-Armer design moment. Designs per metre width
 * (b = 1000 mm) at the mat effective depth d = t − cover − 1.5·db (the inner of
 * the two orthogonal layers, conservative for both directions). The bar spacing
 * is rounded down to a 5 mm module and capped at the ACI maximum.
 */
export function designSlabStrip(params: {
  Mu: number; t: number; cover: number; barDia: number; fc: number; fy: number
}): SlabStripDesign {
  const { Mu, t, cover, barDia, fc, fy } = params
  const d = Math.max(t - cover - 1.5 * barDia, 0.5 * t)        // mm
  const flex = flexuralSteel({ Mu, b: 1000, d, fc, fy })
  // shrinkage/temperature floor still applies even where flexure needs nothing
  const AsMin = rhoMin(fc, fy) * 1000 * d
  const As = Math.max(flex.As, AsMin)
  const Ab = (Math.PI / 4) * barDia * barDia                  // mm² per bar
  const sMax = maxSlabSpacing(t)
  const sRaw = As > 0 ? (1000 * Ab) / As : sMax               // mm c/c for As over 1 m
  const spacing = Math.max(50, Math.min(sMax, Math.floor(sRaw / 5) * 5))
  const AsProvided = (1000 * Ab) / spacing
  return { Mu, As, spacing, AsProvided, usedMin: flex.usedMin || flex.As <= AsMin }
}

/** Full Wood-Armer reinforcement design for a slab panel (both faces, both dirs). */
export interface SlabFEDesign {
  /** Governing (envelope) Wood-Armer design moments over the panel, kN·m/m. */
  moments: WoodArmerMoments
  bottomX: SlabStripDesign; bottomY: SlabStripDesign
  topX: SlabStripDesign; topY: SlabStripDesign
  /** Element id where the peak bottom (sagging) moment occurs, for traceability. */
  govBottom: string
  /** Element id where the peak top (hogging) moment occurs. */
  govTop: string
}

/** A shell moment sample: element id + the local moment triad (kN·m/m). */
export interface ShellMomentSample { id: string; Mx: number; My: number; Mxy: number }

/**
 * Design a slab panel from its shell FE moment field. Takes the ENVELOPE of the
 * Wood-Armer moments across every sub-element (worst sagging and worst hogging
 * per direction) and sizes the four reinforcement strips. Returns null if the
 * sample set is empty.
 */
export function designSlabFE(
  samples: ShellMomentSample[],
  sec: { t: number; cover: number; barDia: number; fc: number; fy: number },
): SlabFEDesign | null {
  if (samples.length === 0) return null
  const env: WoodArmerMoments = { mxBottom: 0, myBottom: 0, mxTop: 0, myTop: 0 }
  let govBottom = samples[0].id, govTop = samples[0].id
  let peakBottom = -Infinity, peakTop = -Infinity
  for (const s of samples) {
    const wa = woodArmer(s.Mx, s.My, s.Mxy)
    env.mxBottom = Math.max(env.mxBottom, wa.mxBottom)
    env.myBottom = Math.max(env.myBottom, wa.myBottom)
    env.mxTop = Math.max(env.mxTop, wa.mxTop)
    env.myTop = Math.max(env.myTop, wa.myTop)
    const b = Math.max(wa.mxBottom, wa.myBottom)
    if (b > peakBottom) { peakBottom = b; govBottom = s.id }
    const tp = Math.max(wa.mxTop, wa.myTop)
    if (tp > peakTop) { peakTop = tp; govTop = s.id }
  }
  const strip = (Mu: number) => designSlabStrip({ Mu, ...sec })
  return {
    moments: env,
    bottomX: strip(env.mxBottom), bottomY: strip(env.myBottom),
    topX: strip(env.mxTop), topY: strip(env.myTop),
    govBottom, govTop,
  }
}
