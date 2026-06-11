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
  /** False when the bar layout diverges (d collapses toward d') — the section
   *  cannot accommodate the required steel; enlarge it. */
  flexOK: boolean
  // Shear
  Vc: number; phiVc: number
  region: ShearRegion
  Av: number
  VsReq: number; VsMax: number
  sReq: number; sMax: number; sAdopt: number
}

const PHI_FLEX = 0.90
const PHI_SHEAR = 0.75
const LAYER_CLEAR = 25       // §407.7.2 clear distance between layers, mm
const roundDown = (v: number, step: number) => Math.floor(v / step) * step

/** Split n bars into layers of at most maxPerLayer, fullest at the bottom. */
function splitLayers(n: number, maxPerLayer: number): number[] {
  const layers: number[] = []
  let left = n
  while (left > 0) {
    const take = Math.min(left, maxPerLayer)
    layers.push(take)
    left -= take
  }
  return layers
}

/** Centroid rise of the bar group above the extreme (bottom) layer — Varignon. */
function centroidRise(layers: number[], pitch: number): number {
  const n = layers.reduce((s, k) => s + k, 0)
  const sum = layers.reduce((s, k, i) => s + k * i * pitch, 0)
  return n > 0 ? sum / n : 0
}

export function designBeam(i: BeamDesignInput): BeamDesignResult {
  const fyt = i.fyt ?? i.fy
  const legs = i.legs ?? 2
  const lambda = i.lambda ?? 1
  const dbC = i.comprBarDia ?? i.barDia
  const b1 = beta1(i.fc)
  const rMin = rhoMin(i.fc, i.fy)
  const Ab = (Math.PI / 4) * i.barDia * i.barDia
  const AbC = (Math.PI / 4) * dbC * dbC

  // Extreme tension layer & compression-steel depth — fixed by the section.
  const dt = i.h - i.cover - i.stirrupDia - i.barDia / 2
  const dPrime = i.cover + i.stirrupDia + dbC / 2

  // §407.7.1 — clear spacing ≥ max(db, 25 mm); bars per layer that fit:
  // n·db + (n−1)·s_min ≤ b − 2(cover + ds).
  const bw = i.b - 2 * (i.cover + i.stirrupDia)
  const sMinClear = Math.max(i.barDia, 25)
  const maxPerLayer = Math.max(1, Math.floor((bw + sMinClear) / (i.barDia + sMinClear)))
  const pitch = i.barDia + LAYER_CLEAR     // layer-to-layer centroid distance

  // ── Iterate: layout → Varignon d → redesign, until the layers stabilise ──
  let d = dt
  let layers: number[] = [0]
  let layerIters = 0
  let mode: FlexureMode = 'SRRB'
  let rhoB = 0, rhoMaxV = 0, AsMax = 0, aMax = 0, MnMax = 0, phiMnMax = 0
  let As = 0, rho = 0, usedMin = false, bars = 0, yBar = 0
  let As1 = 0, As2 = 0, MnResid = 0, cNA = 0, fsPrime = i.fy, fsYields = true
  let AsPrime = 0, comprEffective = true
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
      usedMin = rhoCalc < rMin
      rho = usedMin ? rMin : rhoCalc
      As = rho * i.b * d
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

    bars = Math.max(2, Math.ceil(As / Ab))
    const newLayers = splitLayers(bars, maxPerLayer)
    yBar = centroidRise(newLayers, pitch)
    const dNew = dt - yBar

    // Divergence guard: each added layer lowers d, which demands more steel,
    // which adds layers — if d collapses toward d' (or the layer stack keeps
    // growing), the section physically cannot take the steel.
    if (dNew <= dPrime + i.barDia || newLayers.length > 6) {
      flexOK = false
      layers = newLayers
      d = Math.max(dNew, dPrime + i.barDia)
      break
    }

    const stable = newLayers.length === layers.length && newLayers.every((k, j) => k === layers[j])
    layers = newLayers
    if (stable && Math.abs(dNew - d) < 1e-9) break
    d = dNew
  }

  // Actual clear spacing in the fullest (bottom) layer.
  const nBot = layers[0]
  const sClear = nBot > 1 ? (bw - nBot * i.barDia) / (nBot - 1) : bw
  const comprBars = mode === 'DRRB' && comprEffective ? Math.max(2, Math.ceil(AsPrime / AbC)) : 0

  // ── Shear (NSCP 2015 §422.5 / §409.4) ──
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
    Vc, phiVc, region, Av, VsReq, VsMax, sReq, sMax, sAdopt,
  }
}
