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

export interface BeamDesignInput {
  b: number            // web width, mm
  h: number            // total depth, mm
  cover: number        // clear cover to stirrup, mm
  barDia: number       // main tension bar Ø, mm
  comprBarDia?: number // compression bar Ø, mm (default barDia)
  stirrupDia: number   // stirrup Ø, mm
  fc: number; fy: number
  fyt?: number         // stirrup yield (default fy)
  Mu: number           // factored moment, kN·m
  Vu: number           // factored shear, kN
  /** Width used for the §9.6.1.2 minimum-steel floor (defaults to b). A
   *  flanged sagging section passes bf as b but keeps the WEB width here —
   *  min steel is a web property, it must not scale with the flange. */
  bMin?: number
  legs?: number        // stirrup legs (default 2)
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
  sMinClear: number    // required clear spacing = max(db, 25), mm
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
  legs: number           // stirrup legs: 2 (perimeter) + crossties (§25.7.2.3)
  Av: number
  VsReq: number; VsMax: number
  sReq: number; sMax: number; sAdopt: number
}

const PHI_FLEX = 0.90
const PHI_SHEAR = 0.75
const LAYER_CLEAR = 25       // §407.7.2 clear distance between layers, mm
const roundDown = (v: number, step: number) => Math.floor(v / step) * step

/** Split n bars into layers of at most maxPerLayer, fullest at the bottom.
 *  Detailing rule: no layer carries a single bar — a lone bar in the top
 *  (least-full) layer is paired with a second so the two sit beside the
 *  stirrup legs on each side. Pairing adds one bar (conservative on As).
 *  Returns the (possibly bumped) total count alongside the layer vector. */
function splitLayers(n: number, maxPerLayer: number): { bars: number; layers: number[] } {
  let total = n
  const build = (m: number): number[] => {
    const out: number[] = []
    let left = m
    while (left > 0) { const take = Math.min(left, maxPerLayer); out.push(take); left -= take }
    return out
  }
  let layers = build(total)
  // pair a lone top-layer bar (only meaningful once the section holds ≥ 2/layer)
  if (maxPerLayer >= 2 && layers.length > 1 && layers[layers.length - 1] === 1) {
    total += 1
    layers = build(total)
  }
  return { bars: total, layers }
}

/** Centroid rise of the bar group above the extreme (bottom) layer — Varignon. */
function centroidRise(layers: number[], pitch: number): number {
  const n = layers.reduce((s, k) => s + k, 0)
  const sum = layers.reduce((s, k, i) => s + k * i * pitch, 0)
  return n > 0 ? sum / n : 0
}

/** Transverse legs for lateral support of the longitudinal bars
 *  (ACI 318-14 §25.7.2.3): the closed perimeter tie restrains the two corner
 *  bars; a crosstie (one extra leg) is added ONLY where a bar would otherwise be
 *  more than 150 mm clear from a laterally supported bar. Closely-spaced bars
 *  (the usual case) therefore need no crosstie — 2 legs.
 *
 *  With bars evenly spaced at centre-to-centre pitch `p = sClear + db`, a
 *  supported bar keeps `reach = ⌊(150 + db)/p⌋` bars on each side within the
 *  150 mm limit, so consecutive supported legs may span up to `2·reach + 1`
 *  bar spaces. Returns ≥ 2. */
export function stirrupLegs(barsWidestLayer: number, sClear: number, db: number): number {
  if (barsWidestLayer <= 2) return 2
  const pitch = Math.max(sClear, 0) + db
  const reach = Math.floor((150 + db) / pitch)
  const gap = 2 * reach + 1                                   // bar spaces between supported legs
  return 2 + Math.max(0, Math.ceil((barsWidestLayer - 1) / gap) - 1)
}

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

  // §407.7.1 — clear spacing ≥ max(db, 25 mm); bars per layer that fit:
  // n·db + (n−1)·s_min ≤ b − 2(cover + ds). Same rule on both faces.
  const bw = i.b - 2 * (i.cover + i.stirrupDia)
  const sMinClear = Math.max(i.barDia, 25)
  const maxPerLayer = Math.max(1, Math.floor((bw + sMinClear) / (i.barDia + sMinClear)))
  const pitch = i.barDia + LAYER_CLEAR     // layer-to-layer centroid distance
  const comprSMinClear = Math.max(dbC, 25)
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
  // Legs: explicit override, else lateral-support detailing of the widest tension
  // layer (§25.7.2.3) — a crosstie only where a bar would be > 150 mm clear from a
  // supported bar. The extra crosstie legs also raise Av.
  const nWide = Math.max(...layers, 1)
  const sClearWide = nWide > 1 ? (bw - nWide * i.barDia) / (nWide - 1) : bw
  const legs = i.legs ?? stirrupLegs(nWide, sClearWide, i.barDia)
  const Vc = (lambda * Math.sqrt(i.fc) * i.b * d) / 6 / 1000
  const phiVc = PHI_SHEAR * Vc
  const Av = legs * (Math.PI / 4) * i.stirrupDia * i.stirrupDia
  const VsMax = (2 / 3) * Math.sqrt(i.fc) * i.b * d / 1000
  const sMinArea = (Av * fyt) / Math.max(0.062 * Math.sqrt(i.fc) * i.b, 0.35 * i.b)

  let region: ShearRegion
  let VsReq = 0, sReq = 0, sMax = 0, sAdopt = 0
  if (i.Vu <= 0.5 * phiVc) {
    region = 'none'
  } else if (i.Vu <= phiVc) {
    region = 'minimum'
    sMax = Math.min(d / 2, 600)
    sAdopt = roundDown(Math.min(sMinArea, sMax), 10)
  } else {
    VsReq = i.Vu / PHI_SHEAR - Vc
    if (VsReq > VsMax) {
      region = 'inadequate'
    } else {
      region = 'designed'
      sReq = (Av * fyt * d) / (VsReq * 1000)
      const sCap = VsReq <= Math.sqrt(i.fc) * i.b * d / 3 / 1000 ? Math.min(d / 2, 600) : Math.min(d / 4, 300)
      sMax = sCap
      sAdopt = roundDown(Math.min(sReq, sCap, sMinArea), 10)
    }
  }

  return {
    d, dt, dPrime,
    rhoB, rhoMax: rhoMaxV, rhoMin: rMin,
    AsMax, aMax, MnMax, phiMnMax,
    mode, As, rho, usedMin, bars,
    sMinClear, maxPerLayer, layers, sClear, yBar, layerIters,
    As1, As2, MnResid, cNA, fsPrime, fsYields, AsPrime, comprBars, comprEffective, flexOK,
    comprSMinClear, comprMaxPerLayer, comprLayers, comprSClear, comprYBar,
    dPrimeExtreme, comprNAOK,
    stirrupBendDia, stirrupHookExt,
    Vc, phiVc, region, legs, Av, VsReq, VsMax, sReq, sMax, sAdopt,
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
