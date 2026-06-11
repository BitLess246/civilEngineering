// ─────────────────────────────────────────────────────────────────────────
// Rectangular RC beam — SRRB/DRRB flexure + one-way shear (stirrups).
// NSCP 2015 / ACI 318-14, following the legacy "Reinforced Concrete LAB"
// sheet: classify against the singly-reinforced ceiling at ρ_max = 0.75ρ_b;
// beyond it, design compression steel (DRRB) with the f's yield check.
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
  d: number            // effective depth (tension), mm
  dPrime: number       // compression-steel depth d', mm
  // ρ limits
  rhoB: number; rhoMax: number; rhoMin: number
  // SRRB ceiling
  AsMax: number; aMax: number; MnMax: number; phiMnMax: number  // mm², mm, kN·m, kN·m
  mode: FlexureMode
  // Flexure (both modes)
  As: number; rho: number; usedMin: boolean
  bars: number; barSpacing: number
  // DRRB extras (0 / true-yield defaults for SRRB)
  As1: number; As2: number; MnResid: number       // mm², mm², kN·m
  cNA: number; epsSp: number; fsPrime: number     // mm, –, MPa
  fsYields: boolean
  AsPrime: number; comprBars: number              // mm², count
  // Shear
  Vc: number; phiVc: number
  region: ShearRegion
  Av: number
  VsReq: number; VsMax: number
  sReq: number; sMax: number; sAdopt: number
}

const PHI_FLEX = 0.90
const PHI_SHEAR = 0.75
const ES = 200000
const roundDown = (v: number, step: number) => Math.floor(v / step) * step

export function designBeam(i: BeamDesignInput): BeamDesignResult {
  const fyt = i.fyt ?? i.fy
  const legs = i.legs ?? 2
  const lambda = i.lambda ?? 1
  const dbC = i.comprBarDia ?? i.barDia
  const d = i.h - i.cover - i.stirrupDia - i.barDia / 2
  const dPrime = i.cover + i.stirrupDia + dbC / 2

  // ── ρ limits (legacy: ρ_max = 0.75 ρ_balanced) ──
  const b1 = beta1(i.fc)
  const rhoB = 0.85 * b1 * (i.fc / i.fy) * (600 / (600 + i.fy))
  const rhoMaxV = 0.75 * rhoB
  const rMin = rhoMin(i.fc, i.fy)

  // ── SRRB ceiling: capacity with ρ_max ──
  const AsMax = rhoMaxV * i.b * d
  const aMax = (AsMax * i.fy) / (0.85 * i.fc * i.b)
  const MnMax = (AsMax * i.fy * (d - aMax / 2)) / 1e6        // kN·m
  const phiMnMax = PHI_FLEX * MnMax

  let mode: FlexureMode
  let As = 0, rho = 0, usedMin = false
  let As1 = 0, As2 = 0, MnResid = 0, cNA = 0, epsSp = 0, fsPrime = i.fy, fsYields = true, AsPrime = 0

  if (i.Mu <= phiMnMax) {
    // ── SRRB: ρ from Rn, floored at ρ_min ──
    mode = 'SRRB'
    const Rn = (i.Mu * 1e6) / (PHI_FLEX * i.b * d * d)
    const rhoCalc = (0.85 * i.fc / i.fy) * (1 - Math.sqrt(Math.max(0, 1 - (2 * Rn) / (0.85 * i.fc))))
    usedMin = rhoCalc < rMin
    rho = usedMin ? rMin : rhoCalc
    As = rho * i.b * d
  } else {
    // ── DRRB: tension couple at ρ_max + a steel couple for the residual ──
    mode = 'DRRB'
    As1 = AsMax
    MnResid = i.Mu / PHI_FLEX - MnMax                          // kN·m
    As2 = (MnResid * 1e6) / (i.fy * (d - dPrime))
    As = As1 + As2
    rho = As / (i.b * d)
    // Compression-steel stress check at a = a_max.
    cNA = aMax / b1
    epsSp = 0.003 * (cNA - dPrime) / cNA
    const fsUnc = ES * epsSp
    fsYields = fsUnc >= i.fy
    fsPrime = Math.min(i.fy, fsUnc)
    AsPrime = (As2 * i.fy) / fsPrime
  }

  const Ab = (Math.PI / 4) * i.barDia * i.barDia
  const bars = Math.max(2, Math.ceil(As / Ab))
  const clearW = i.b - 2 * (i.cover + i.stirrupDia) - bars * i.barDia
  const barSpacing = bars > 1 ? clearW / (bars - 1) + i.barDia : clearW
  const AbC = (Math.PI / 4) * dbC * dbC
  const comprBars = mode === 'DRRB' ? Math.max(2, Math.ceil(AsPrime / AbC)) : 0

  // ── Shear (unchanged: NSCP 2015 §422.5 / §409.4) ──
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
    d, dPrime,
    rhoB, rhoMax: rhoMaxV, rhoMin: rMin,
    AsMax, aMax, MnMax, phiMnMax,
    mode, As, rho, usedMin, bars, barSpacing,
    As1, As2, MnResid, cNA, epsSp, fsPrime, fsYields, AsPrime, comprBars,
    Vc, phiVc, region, Av, VsReq, VsMax, sReq, sMax, sAdopt,
  }
}
