// ─────────────────────────────────────────────────────────────────────────
// Rectangular RC beam — singly-reinforced flexure + one-way shear (stirrups).
// NSCP 2015 / ACI 318-14. Demands Mu (kN·m) and Vu (kN) are given (from
// analysis); the tool sizes tension steel and vertical stirrups.
// Convention: lengths mm, stresses MPa, Mu kN·m, Vu/V_* kN.
// ─────────────────────────────────────────────────────────────────────────
import { flexuralSteel, barLayout, rhoMin } from './flexure'
import { beta1 } from './loads'

export interface BeamDesignInput {
  b: number            // web width, mm
  h: number            // total depth, mm
  cover: number        // clear cover to stirrup, mm
  barDia: number       // main bar Ø, mm
  stirrupDia: number   // stirrup Ø, mm
  fc: number; fy: number
  fyt?: number         // stirrup yield (default fy)
  Mu: number           // factored moment, kN·m
  Vu: number           // factored shear, kN
  legs?: number        // stirrup legs (default 2)
  lambda?: number      // lightweight factor (default 1)
}

export type ShearRegion = 'none' | 'minimum' | 'designed' | 'inadequate'

export interface BeamDesignResult {
  d: number            // effective depth, mm
  // Flexure
  As: number; rho: number; rhoMin: number; rhoMax: number
  usedMin: boolean; tensionControlled: boolean
  bars: number; barSpacing: number
  // Shear
  Vc: number; phiVc: number          // kN
  region: ShearRegion
  Av: number                          // mm²
  VsReq: number; VsMax: number        // kN
  sReq: number; sMax: number; sAdopt: number   // mm
}

const PHI_SHEAR = 0.75
const roundDown = (v: number, step: number) => Math.floor(v / step) * step

export function designBeam(i: BeamDesignInput): BeamDesignResult {
  const fyt = i.fyt ?? i.fy
  const legs = i.legs ?? 2
  const lambda = i.lambda ?? 1
  const d = i.h - i.cover - i.stirrupDia - i.barDia / 2

  // ── Flexure (singly reinforced) ──
  const flex = flexuralSteel({ Mu: i.Mu, b: i.b, d, fc: i.fc, fy: i.fy })
  const rMin = rhoMin(i.fc, i.fy)
  // Tension-controlled limit (εt = 0.005): ρmax = 0.85β1(f'c/fy)(0.003/0.008).
  const rhoMax = 0.85 * beta1(i.fc) * (i.fc / i.fy) * (0.003 / 0.008)
  const layout = barLayout({ As: flex.As, db: i.barDia, b: i.b, cover: i.cover + i.stirrupDia })

  // ── Shear ──
  const Vc = (lambda * Math.sqrt(i.fc) * i.b * d) / 6 / 1000          // kN
  const phiVc = PHI_SHEAR * Vc
  const Av = legs * (Math.PI / 4) * i.stirrupDia * i.stirrupDia        // mm²
  const VsMax = (2 / 3) * Math.sqrt(i.fc) * i.b * d / 1000             // kN
  // Minimum-stirrup spacing cap: Av,min = max(0.062√f'c·b, 0.35·b)·s/fyt.
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
      region = 'inadequate'                 // section too small — enlarge or raise f'c
    } else {
      region = 'designed'
      sReq = (Av * fyt * d) / (VsReq * 1000)
      // tighter spacing cap once Vs exceeds (1/3)√f'c·b·d
      const sCap = VsReq <= Math.sqrt(i.fc) * i.b * d / 3 / 1000 ? Math.min(d / 2, 600) : Math.min(d / 4, 300)
      sMax = sCap
      sAdopt = roundDown(Math.min(sReq, sCap, sMinArea), 10)
    }
  }

  return {
    d,
    As: flex.As, rho: flex.rho, rhoMin: rMin, rhoMax,
    usedMin: flex.usedMin, tensionControlled: flex.rho <= rhoMax,
    bars: layout.n, barSpacing: layout.spacing,
    Vc, phiVc, region, Av, VsReq, VsMax, sReq, sMax, sAdopt,
  }
}
