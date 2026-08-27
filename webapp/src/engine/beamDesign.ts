// ─────────────────────────────────────────────────────────────────────────
// Rectangular RC beam — SRRB/DRRB flexure + one-way shear (stirrups).
// NSCP 2015 / ACI 318-14, per the lecture references:
//   · ρ_max (tension-controlled) = (0.85 f'c/fy · β1)(3/8)(dt/d)
//   · DRRB compression steel: f's = 600(1 − d'/c) ≤ fy and
//     A's (f's − 0.85f'c) = As2·fy   (displaced concrete accounted)
//   · Bars are laid out with the §407.7.1 minimum clear spacing
//     (max(db, 25 mm)); when one layer can't fit them, layers are added
//     (25 mm clear, §407.7.2) and d is recomputed from the bar-group
//     centroid (Varignon) — the design then re-runs at the new d until
//     the layer arrangement stabilises.
// Convention: lengths mm, stresses MPa, Mu kN·m, Vu/V_* kN, Es = 200 GPa.
// ─────────────────────────────────────────────────────────────────────────
import { rhoMin } from './flexure'
import { beta1 } from './loads'
import { Ec as concreteEc } from './slabDeflection'
import { crackedInertia, deflCoeff, longTermMultiplier, minBeamThickness, type BeamSupport } from './beamDeflection'
import { splitLayers, centroidRise } from './barLayers'

export interface BeamDesignInput {
  b: number            // web width, mm
  h: number            // total depth, mm
  cover: number        // clear cover to stirrup, mm
  barDia: number       // main tension bar Ø, mm
  comprBarDia?: number // compression bar Ø, mm (default barDia)
  stirrupDia: number   // stirrup Ø, mm
  /**
   * Nominal maximum aggregate size, mm — §25.2.1's third term.
   *
   * Defaults to the usual local 20 mm mix. It was missing entirely, so a
   * layer was packed on max(db, 25) alone; on 20 mm aggregate the real
   * minimum is 4/3 · 20 = 26.7 mm, and the engine could lay out a layer that
   * did not comply. The optimiser re-checked and rejected those with the
   * clause, which is the safe direction, but the number belongs here.
   */
  aggregate?: number
  fc: number; fy: number
  fyt?: number         // stirrup yield (default fy)
  Mu: number           // factored moment, kN·m
  Vu: number           // factored shear, kN
  /** Width used for the §9.6.1.2 minimum-steel floor (defaults to b). A
   *  flanged sagging section passes bf as b but keeps the WEB width here —
   *  min steel is a web property, it must not scale with the flange. */
  bMin?: number
  legs?: number        // stirrup legs — explicit override (else auto: width + shear)
  legSpacingLimit?: number  // max transverse leg spacing hx, mm (350 seismic, 600 gravity)
  /**
   * The seismic system this beam belongs to.
   *
   * It caps the hoop spacing in the HINGE ZONE — the 2h at each support face —
   * which shear demand alone does not. Columns have had this since they were
   * written (`columnDesign`'s `seismicSConf`); beams were left with the gravity
   * limits of §409.7.6.2.2, so a special moment frame was detailed exactly as a
   * gravity frame: on a 300×500 beam, 220 mm where §418.6.4.4 allows 110.
   *
   * The cap is returned, not applied, because this function designs a SECTION
   * and does not know where along the span it sits. The caller knows which of
   * its sections are at a support, and applies it there.
   */
  system?: 'gravity' | 'imf' | 'smf'
  lambda?: number      // lightweight factor (default 1)
}

export type ShearRegion = 'none' | 'minimum' | 'designed' | 'inadequate'
export type FlexureMode = 'SRRB' | 'DRRB'

export interface BeamDesignResult {
  d: number            // effective depth to the bar-group centroid, mm
  dt: number           // depth to the extreme tension layer, mm
  dPrime: number       // compression-steel depth d', mm
  // ρ limits (both include the dt/d factor)
  rhoB: number; rhoMax: number; rhoMin: number
  // SRRB ceiling at ρ_max
  AsMax: number; aMax: number; MnMax: number; phiMnMax: number
  mode: FlexureMode
  // Flexure
  As: number; rho: number; usedMin: boolean
  bars: number
  // Bar layout (§407.7)
  sMinClear: number    // required clear spacing = max(db, 25, 4/3·d_agg), mm
  maxPerLayer: number  // bars that fit one layer at s_min
  layers: number[]     // bars per layer, bottom (extreme) first
  sClear: number       // actual clear spacing in the fullest layer, mm
  yBar: number         // centroid rise above the extreme layer (Varignon), mm
  layerIters: number   // d-recompute passes until stable
  // DRRB extras
  As1: number; As2: number; MnResid: number
  cNA: number; fsPrime: number; fsYields: boolean
  AsPrime: number; comprBars: number
  /** False when f's ≤ 0.85f'c (compression steel ineffective) — enlarge the section. */
  comprEffective: boolean
  // Compression-bar layout (same §407.7 technique, layered downward from the top)
  comprSMinClear: number
  comprMaxPerLayer: number
  comprLayers: number[]    // bars per layer, top (extreme) first; [] when no compression steel
  comprSClear: number
  comprYBar: number        // centroid drop below the extreme top layer (Varignon), mm
  /** Depth of the DEEPEST compression layer, mm. */
  dPrimeExtreme: number
  /** Deepest compression layer stays above the neutral axis (in compression). */
  comprNAOK: boolean
  // Stirrup detailing (§407.3.2 bend, §425.3.2 hook)
  stirrupBendDia: number   // inside bend diameter = 4·ds (⌀16 and smaller), mm
  stirrupHookExt: number   // 135° hook extension = max(6·ds, 75), mm
  /** False when the bar layout diverges (d collapses toward d') — the section
   *  cannot accommodate the required steel; enlarge it. */
  flexOK: boolean
  // Shear
  Vc: number; phiVc: number
  region: ShearRegion
  legs: number           // stirrup legs — width-driven (hx ≤ limit), bumped by shear
  legSpacingLimit: number // the transverse leg-spacing limit hx used, mm
  Av: number
  VsReq: number; VsMax: number
  sReq: number; sMax: number; sAdopt: number
  /**
   * Maximum hoop spacing in the 2h hinge zone, mm — the seismic cap, or
   * undefined on a gravity frame where there is none.
   *
   * SMF §418.6.4.4: the smallest of d/4, 6·db of the smallest longitudinal
   * bar, and 150 mm.
   * IMF §418.4.2: the smallest of d/4, 8·db, 24·d_hoop and 300 mm.
   *
   * `sAdopt` is NOT reduced by it here — see `BeamDesignInput.system`.
   */
  seismicSConf?: number
  /** What set `sHinge` — the clause, or the shear demand that beat it. */
  hingeGovern?: string
  /** The spacing to use at a support: `sAdopt` capped by `seismicSConf`. */
  sHinge: number
}

const PHI_FLEX = 0.90
const PHI_SHEAR = 0.75
const LAYER_CLEAR = 25       // §407.7.2 clear distance between layers, mm
// The lone-bar pairing rule and the Varignon centroid live in `barLayers` so
// the T-beam engine uses the SAME rule — it used to have its own greedy loop
// and could detail a single bar alone in the top layer.
const roundDown = (v: number, step: number) => Math.floor(v / step) * step


/** Minimum practical stirrup spacing, mm — the tightest a designer will place
 *  transverse steel before adding legs instead (placement / congestion). Used as
 *  the SECONDARY (shear-congestion) leg driver; beam legs are primarily set by the
 *  transverse leg-spacing limit hx (beam width). */
export const S_MIN_STIRRUP = 75

export function designBeam(i: BeamDesignInput): BeamDesignResult {
  const fyt = i.fyt ?? i.fy
  const lambda = i.lambda ?? 1
  const dbC = i.comprBarDia ?? i.barDia
  const b1 = beta1(i.fc)
  const rMin = rhoMin(i.fc, i.fy)
  const Ab = (Math.PI / 4) * i.barDia * i.barDia
  const AbC = (Math.PI / 4) * dbC * dbC

  // Extreme tension layer & compression-steel base depth — fixed by the section.
  const dt = i.h - i.cover - i.stirrupDia - i.barDia / 2
  const dPrimeBase = i.cover + i.stirrupDia + dbC / 2

  // §407.7.1 / ACI 318-14 §25.2.1 — clear spacing ≥ max(db, 25 mm, 4/3·d_agg);
  // bars per layer that fit: n·db + (n−1)·s_min ≤ b − 2(cover + ds). Same rule
  // on both faces. The aggregate term is what keeps a poker-vibrated mix able
  // to pass between the bars, and it governs whenever db < 4/3·d_agg.
  const dAgg = i.aggregate ?? 20
  const bw = i.b - 2 * (i.cover + i.stirrupDia)
  const sMinClear = Math.max(i.barDia, 25, (4 / 3) * dAgg)
  const maxPerLayer = Math.max(1, Math.floor((bw + sMinClear) / (i.barDia + sMinClear)))
  const pitch = i.barDia + LAYER_CLEAR     // layer-to-layer centroid distance
  const comprSMinClear = Math.max(dbC, 25, (4 / 3) * dAgg)
  const comprMaxPerLayer = Math.max(1, Math.floor((bw + comprSMinClear) / (dbC + comprSMinClear)))
  const pitchC = dbC + LAYER_CLEAR

  // ── Iterate BOTH faces: layout → Varignon d & d' → redesign, until the
  //    layer arrangements stabilise ──
  let d = dt
  let dPrime = dPrimeBase
  let layers: number[] = [0]
  let comprLayers: number[] = []
  let layerIters = 0
  let mode: FlexureMode = 'SRRB'
  let rhoB = 0, rhoMaxV = 0, AsMax = 0, aMax = 0, MnMax = 0, phiMnMax = 0
  let As = 0, rho = 0, usedMin = false, bars = 0, yBar = 0, comprYBar = 0
  let As1 = 0, As2 = 0, MnResid = 0, cNA = 0, fsPrime = i.fy, fsYields = true
  let AsPrime = 0, comprEffective = true, comprBars = 0
  let flexOK = true

  for (let iter = 0; iter < 12; iter++) {
    layerIters = iter + 1

    // ρ limits at the current d (reference: both carry dt/d).
    rhoB = 0.85 * b1 * (i.fc / i.fy) * (600 / (600 + i.fy)) * (dt / d)
    rhoMaxV = 0.85 * (i.fc / i.fy) * b1 * (3 / 8) * (dt / d)

    // Singly-reinforced ceiling at ρ_max (ε_t = 0.005 → φ = 0.90).
    AsMax = rhoMaxV * i.b * d
    aMax = (AsMax * i.fy) / (0.85 * i.fc * i.b)
    MnMax = (AsMax * i.fy * (d - aMax / 2)) / 1e6
    phiMnMax = PHI_FLEX * MnMax

    if (i.Mu <= phiMnMax) {
      mode = 'SRRB'
      const Rn = (i.Mu * 1e6) / (PHI_FLEX * i.b * d * d)
      const rhoCalc = (0.85 * i.fc / i.fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (0.85 * i.fc))))
      const AsMinArea = rMin * (i.bMin ?? i.b) * d
      const AsCalc = rhoCalc * i.b * d
      usedMin = AsCalc < AsMinArea
      As = usedMin ? AsMinArea : AsCalc
      rho = As / (i.b * d)
      As1 = 0; As2 = 0; MnResid = 0; cNA = 0; fsPrime = i.fy; fsYields = true; AsPrime = 0
      comprEffective = true
    } else {
      mode = 'DRRB'
      As1 = AsMax
      MnResid = i.Mu / PHI_FLEX - MnMax
      As2 = (MnResid * 1e6) / (i.fy * (d - dPrime))
      As = As1 + As2
      rho = As / (i.b * d)
      usedMin = false
      // f's = 600(1 − d'/c) ≤ fy at c = a_max/β1; A's accounts for the
      // concrete displaced by the compression bars.
      cNA = aMax / b1
      const fsUnc = 600 * (1 - dPrime / cNA)
      fsYields = fsUnc >= i.fy
      fsPrime = Math.min(i.fy, Math.max(0, fsUnc))
      comprEffective = fsPrime > 0.85 * i.fc
      AsPrime = comprEffective ? (As2 * i.fy) / (fsPrime - 0.85 * i.fc) : 0
    }

    // Tension side: bars → layers (lone-bar pairing) → Varignon → new d.
    const tenSplit = splitLayers(Math.max(2, Math.ceil(As / Ab)), maxPerLayer)
    bars = tenSplit.bars
    const newLayers = tenSplit.layers
    yBar = centroidRise(newLayers, pitch)
    const dNew = dt - yBar

    // Compression side: same technique, layered downward from the top face —
    // stacking layers DEEPENS d' (centroid drops), which feeds back into As2.
    const comprSplit = mode === 'DRRB' && comprEffective
      ? splitLayers(Math.max(2, Math.ceil(AsPrime / AbC)), comprMaxPerLayer) : { bars: 0, layers: [] as number[] }
    comprBars = comprSplit.bars
    const newComprLayers = comprSplit.layers
    comprYBar = centroidRise(newComprLayers, pitchC)
    const dPrimeNew = dPrimeBase + comprYBar

    // Divergence guard: each added layer lowers d (and raises d'), which
    // demands more steel, which adds layers — if the two centroids close in
    // on each other (or a stack keeps growing), the section can't take it.
    if (dNew <= dPrimeNew + i.barDia || newLayers.length > 6 || newComprLayers.length > 6) {
      flexOK = false
      layers = newLayers
      comprLayers = newComprLayers
      d = Math.max(dNew, dPrimeNew + i.barDia)
      dPrime = dPrimeNew
      break
    }

    const sameVec = (a: number[], b: number[]) => a.length === b.length && a.every((k, j) => k === b[j])
    const stable = sameVec(newLayers, layers) && sameVec(newComprLayers, comprLayers)
    layers = newLayers
    comprLayers = newComprLayers
    if (stable && Math.abs(dNew - d) < 1e-9 && Math.abs(dPrimeNew - dPrime) < 1e-9) break
    d = dNew
    dPrime = dPrimeNew
  }

  // Actual clear spacing in the fullest layer on each face.
  const nBot = layers[0]
  const sClear = nBot > 1 ? (bw - nBot * i.barDia) / (nBot - 1) : bw
  const nTop = comprLayers[0] ?? 0
  const comprSClear = nTop > 1 ? (bw - nTop * dbC) / (nTop - 1) : bw

  // NA check (legacy): the DEEPEST compression layer must stay above the
  // neutral axis c — a bar at or below c is not in compression at all.
  const dPrimeExtreme = comprLayers.length > 0 ? dPrimeBase + (comprLayers.length - 1) * pitchC : 0
  const comprNAOK = comprLayers.length === 0 || dPrimeExtreme < cNA

  // Stirrup detailing — §407.3.2: inside bend ≥ 4ds for ⌀16 and smaller;
  // §425.3.2: 135° stirrup hook extension = max(6ds, 75 mm).
  const stirrupBendDia = 4 * i.stirrupDia
  const stirrupHookExt = Math.max(6 * i.stirrupDia, 75)

  // ── Shear (NSCP 2015 §422.5 / §409.4) ──
  const Vc = (lambda * Math.sqrt(i.fc) * i.b * d) / 6 / 1000
  const phiVc = PHI_SHEAR * Vc
  const VsMax = (2 / 3) * Math.sqrt(i.fc) * i.b * d / 1000
  const avPerLeg = (Math.PI / 4) * i.stirrupDia * i.stirrupDia

  // Region + Vs demand (independent of the leg count).
  let region: ShearRegion
  let VsReq = 0
  if (i.Vu <= 0.5 * phiVc) region = 'none'
  else if (i.Vu <= phiVc) region = 'minimum'
  else { VsReq = i.Vu / PHI_SHEAR - Vc; region = VsReq > VsMax ? 'inadequate' : 'designed' }

  // Legs — PRIMARY driver is beam WIDTH: the transverse (horizontal) spacing
  // between legs must stay within hx so the stirrup engages the full width and
  // laterally supports the bars (hx ≤ 350 mm seismic §418.6.4.3; ~600 mm gravity).
  // legSpan = c/c of the two outer perimeter legs → n_legs = ⌈legSpan/hx⌉ + 1.
  const legSpacingLimit = i.legSpacingLimit ?? 600
  const legWidth = i.bMin ?? i.b                    // stirrups sit in the web (T-beams)
  const legSpan = legWidth - 2 * (i.cover + i.stirrupDia / 2)
  const widthLegs = Math.max(1, Math.ceil(legSpan / legSpacingLimit)) + 1
  // SECONDARY: a shear-congestion bump — a 2-leg tie at the minimum practical
  // spacing may not supply the Aᵥ/s the shear demands (§422.5.10.5.3).
  const shearLegs = region === 'designed'
    ? Math.max(2, Math.ceil((((VsReq * 1000) / (fyt * d)) * S_MIN_STIRRUP) / avPerLeg))
    : 2
  const legs = i.legs ?? Math.max(widthLegs, shearLegs)
  const Av = legs * avPerLeg
  const sMinArea = (Av * fyt) / Math.max(0.062 * Math.sqrt(i.fc) * i.b, 0.35 * i.b)

  let sReq = 0, sMax = 0, sAdopt = 0
  if (region === 'minimum') {
    sMax = Math.min(d / 2, 600)
    sAdopt = roundDown(Math.min(sMinArea, sMax), 10)
  } else if (region === 'designed') {
    sReq = (Av * fyt * d) / (VsReq * 1000)
    const sCap = VsReq <= Math.sqrt(i.fc) * i.b * d / 3 / 1000 ? Math.min(d / 2, 600) : Math.min(d / 4, 300)
    sMax = sCap
    sAdopt = roundDown(Math.min(sReq, sCap, sMinArea), 10)
  }

  // ── the hinge zone (§418.6.4.4 SMF / §418.4.2 IMF) ──────────────────────
  //
  // Over 2h from each support face the hoops confine a plastic hinge, and the
  // spacing there is a DETAILING limit — it does not fall out of the shear
  // demand, which on a lightly loaded beam is satisfied by the §409.7.6.2.2
  // gravity maximum of d/2. Left uncapped, a special moment frame came out
  // detailed exactly like a gravity frame.
  //
  // Returned rather than applied to `sAdopt`: this designs a section and does
  // not know whether that section is at a support or at midspan. The caller
  // does, and `sHinge` is what it uses at the two ends.
  const sys = i.system ?? 'gravity'
  const dHoop = i.stirrupDia ?? 10
  const seismicSConf = sys === 'smf'
    ? Math.min(d / 4, 6 * i.barDia, 150)
    : sys === 'imf'
      ? Math.min(d / 4, 8 * i.barDia, 24 * dHoop, 300)
      : undefined
  // A zone with no shear steel at all still needs its hoops: the confinement
  // is required by the hinge, not by Vu, so an `sAdopt` of 0 takes the cap.
  const sHinge = seismicSConf === undefined
    ? sAdopt
    : roundDown(sAdopt > 0 ? Math.min(sAdopt, seismicSConf) : seismicSConf, 10)
  const hingeGovern = seismicSConf === undefined
    ? undefined
    : (sAdopt > 0 && sAdopt <= seismicSConf
      ? 'shear demand'
      : sys === 'smf' ? '§418.6.4.4 SMF conf.' : '§418.4.2 IMF conf.')

  return {
    seismicSConf, hingeGovern, sHinge,
    d, dt, dPrime,
    rhoB, rhoMax: rhoMaxV, rhoMin: rMin,
    AsMax, aMax, MnMax, phiMnMax,
    mode, As, rho, usedMin, bars,
    sMinClear, maxPerLayer, layers, sClear, yBar, layerIters,
    As1, As2, MnResid, cNA, fsPrime, fsYields, AsPrime, comprBars, comprEffective, flexOK,
    comprSMinClear, comprMaxPerLayer, comprLayers, comprSClear, comprYBar,
    dPrimeExtreme, comprNAOK,
    stirrupBendDia, stirrupHookExt,
    Vc, phiVc, region, legs, legSpacingLimit, Av, VsReq, VsMax, sReq, sMax, sAdopt,
  }
}

// ─── Service deflection (simple span) — ACI 318-14 §24.2 ──────────────────
// Branson effective Ie at full service moment; long-term multiplier §24.2.4.
// Kept separate so deflection inputs stay optional in the UI.

export interface BeamDeflectionInput {
  b: number; h: number; d: number   // section, mm
  As: number                        // tension steel area, mm²
  AsPrime?: number                  // compression steel area, mm² (cracked Icr + λΔ; default 0)
  dPrime?: number                   // compression-steel depth d′, mm (default 0)
  fc: number                        // MPa
  fy?: number                       // for the min-thickness fy factor (default 420)
  lambda?: number                   // lightweight factor (default 1)
  span: number                      // span, m
  support?: BeamSupport             // support condition (default 'simple')
  wD: number; wL: number           // unfactored service loads, kN/m
}

export interface BeamDeflectionResult {
  Ig: number; Icr: number; Mcr: number; Ie: number   // mm⁴
  cracked: boolean
  deltaD: number; deltaL: number                       // immediate, mm
  lambdaDelta: number; deltaLong: number               // long-term dead, mm
  deltaTotal: number                                   // long-term dead + immediate live, mm
  limitL360: number; limitL240: number                 // mm
  liveOK: boolean; totalOK: boolean
  hMin: number; hMinOK: boolean; support: BeamSupport   // Table 409.3.1.1
}

export function beamServiceDeflection(i: BeamDeflectionInput): BeamDeflectionResult {
  const { b, h, d, As, fc, span } = i
  const lambda = i.lambda ?? 1
  const AsPrime = i.AsPrime ?? 0
  const support = i.support ?? 'simple'
  const Lmm = span * 1000

  const Ec = concreteEc(fc)                // 4700√f′c, MPa
  const Ig = (b * h ** 3) / 12

  // Cracked transformed Icr — now accounts for compression steel A′s at d′.
  const Icr = crackedInertia({ b, d, As, fc, AsPrime, dPrime: i.dPrime })

  // Cracking moment: fr = 0.62λ√f'c (§419.2.3.1); Mcr = fr·Ig/yt
  const fr = 0.62 * lambda * Math.sqrt(Math.max(fc, 1))
  const Mcr = (fr * Ig) / (h / 2) / 1e6   // kN·m

  // Service moment at full load (simple span): Ma = w·L²/8 (conservative for Ie)
  const Ma = ((i.wD + i.wL) * span ** 2) / 8   // kN·m

  // Branson effective Ie (§24.2.3.5)
  const cracked = Ma > Mcr && Ma > 0
  const Ie = cracked ? Math.min(Ig, (Mcr / Ma) ** 3 * Ig + (1 - (Mcr / Ma) ** 3) * Icr) : Ig

  // Immediate deflection δ = k·w·L⁴/(384·Ec·Ie), k by support condition.
  // w [kN/m] = w [N/mm] numerically; Ec [MPa]; I [mm⁴]; L [mm] → δ [mm].
  const coef = (deflCoeff(support) * Lmm ** 4) / (384 * Ec * Ie)
  const deltaD = i.wD * coef
  const deltaL = i.wL * coef

  // Long-term multiplier λΔ = ξ/(1+50ρ′), ξ = 2.0 (≥5 yr) — §24.2.4.1.1.
  const lambdaDelta = longTermMultiplier(AsPrime / (b * d))
  const deltaLong = lambdaDelta * deltaD
  const deltaTotal = deltaLong + deltaL   // §24.2.2 Table R24.2.2

  const limitL360 = Lmm / 360
  const limitL240 = Lmm / 240
  const hMin = minBeamThickness(span, support, i.fy ?? 420)

  return {
    Ig, Icr, Mcr, Ie, cracked,
    deltaD, deltaL, lambdaDelta, deltaLong, deltaTotal,
    limitL360, limitL240,
    liveOK: deltaL <= limitL360, totalOK: deltaTotal <= limitL240,
    hMin, hMinOK: h >= hMin - 1e-9, support,
  }
}
