// ─────────────────────────────────────────────────────────────────────────
// Torsion design for a rectangular RC section.
// NSCP 2015 / ACI 318-14 §22.7 (torsion) + §22.5 (shear) + §9.7.6 (spacing).
// SI units throughout: lengths mm, forces kN, moments kN·m, stress MPa.
// φ = 0.75 for shear and torsion (§21.2.1).
// ─────────────────────────────────────────────────────────────────────────

const PHI = 0.75

export interface TorsionInput {
  b: number; h: number          // overall dimensions, mm
  cover: number                 // clear cover to stirrup outer face, mm
  stirrupDia: number            // ds, mm
  barDia: number                // main bar db (to find d), mm
  fc: number; fy: number        // MPa
  fyt: number                   // stirrup yield, MPa
  Tu: number                    // factored torsion, kN·m
  Vu: number                    // factored shear, kN
  legs?: number                 // closed-stirrup legs (default 2)
  lambda?: number               // lightweight factor (default 1)
}

export interface TorsionResult {
  // Section geometry
  d: number                     // effective depth (single layer), mm
  Acp: number; pcp: number      // gross section mm², mm
  cSt: number                   // cover to stirrup CL = cover + ds/2, mm
  x1: number; y1: number        // inner (stirrup CL) dimensions, mm
  Aoh: number                   // area enclosed by stirrup CL, mm²
  ph: number                    // perimeter of Aoh, mm
  Ao: number                    // 0.85·Aoh, mm²

  // Torsional thresholds (SI — §22.7.4.1 / §22.7.3)
  Tu_th: number                 // threshold: φ·λ·√f'c·Acp²/(12·pcp), kN·m
  Tcr: number                   // cracking torsion: λ·√f'c·Acp²/(3·pcp), kN·m
  torsionNeeded: boolean        // Tu ≥ Tu_th

  // Shear
  Vc: number; phiVc: number     // kN

  // Section interaction check §22.7.7.1
  lhs: number                   // √[(Vu/bwd)² + (Tu·ph/1.7Aoh²)²], MPa
  rhs: number                   // φ·(Vc/bwd + (2/3)√f'c), MPa
  interactionOK: boolean

  // Transverse torsional steel per leg §22.7.6.1
  AtPerS: number                // At/s from Tu, mm²/mm
  AtPerS_min: number            // minimum per §22.7.6.1(b)
  AtPerS_design: number         // governing

  // Longitudinal torsional steel §22.7.5
  Al: number                    // At/s·ph·(fyt/fy), mm²
  Al_min: number                // minimum §22.7.5.2
  Al_design: number             // governing

  // Combined stirrup design
  Vs: number                    // required shear-steel capacity, kN
  AvPerS: number                // Av/s (all shear legs), mm²/mm
  AvPlus2At: number             // (Av + 2At)/s governing, mm²/mm
  AvPlus2At_min: number         // minimum §22.5.10.5 (combined), mm²/mm
  sReq: number                  // required stirrup spacing, mm
  sMax: number                  // max spacing = min(ph/8, 300, d/2, 600), mm
  sAdopt: number                // min(sReq, sMax), mm
}

export function designTorsion(i: TorsionInput): TorsionResult {
  const lambda = i.lambda ?? 1
  const legs = i.legs ?? 2
  const { b, h, cover, fc, fy, fyt } = i
  const ds = i.stirrupDia, db = i.barDia
  const sqrtFc = Math.sqrt(Math.max(fc, 1))

  // Effective depth (single bottom layer)
  const d = h - cover - ds - db / 2

  // Gross section
  const Acp = b * h
  const pcp = 2 * (b + h)

  // Stirrup centerline geometry
  const cSt = cover + ds / 2
  const x1 = b - 2 * cSt
  const y1 = h - 2 * cSt
  const Aoh = x1 * y1
  const ph = 2 * (x1 + y1)
  const Ao = 0.85 * Aoh

  // Threshold and cracking torsion (§22.7.4.1, §22.7.3 — SI, result in kN·m)
  const Acp2_pcp = (Acp * Acp) / pcp               // mm³
  const Tu_th = PHI * lambda * sqrtFc * Acp2_pcp / 12 / 1e6
  const Tcr   = lambda * sqrtFc * Acp2_pcp / 3 / 1e6
  const torsionNeeded = i.Tu >= Tu_th - 1e-9

  // Shear concrete capacity
  const Vc    = (lambda * sqrtFc * b * d) / (6 * 1000)  // kN
  const phiVc = PHI * Vc

  // Interaction check §22.7.7.1 (all terms in MPa)
  const vu    = (i.Vu * 1000) / (b * d)               // Vu/(bw·d), MPa
  const tu    = (i.Tu * 1e6 * ph) / (1.7 * Aoh * Aoh) // Tu·ph/(1.7·Aoh²), MPa
  const lhs   = Math.sqrt(vu * vu + tu * tu)
  const rhs   = PHI * (Vc * 1000 / (b * d) + (2 / 3) * sqrtFc)
  const interactionOK = lhs <= rhs + 1e-9

  // Transverse torsional steel per leg §22.7.6.1(a)
  const Tu_Nmm    = i.Tu * 1e6
  const AtPerS    = torsionNeeded ? Tu_Nmm / (PHI * 2 * Ao * fyt) : 0
  // §22.7.6.1(b) minimum (SI): max(0.0625√f'c/fyt, 0.35/fyt) per leg
  const AtPerS_min = torsionNeeded ? Math.max(0.0625 * sqrtFc / fyt, 0.35 / fyt) : 0
  const AtPerS_design = Math.max(AtPerS, AtPerS_min)

  // Longitudinal torsional steel §22.7.5.1
  const Al     = AtPerS_design * ph * (fyt / fy)
  // §22.7.5.2 minimum
  const Al_min = Math.max(0, 5 * sqrtFc * Acp / (12 * fy) - AtPerS_design * ph * (fyt / fy))
  const Al_design = Math.max(Al, Al_min)

  // Combined stirrups
  const Vs        = Math.max(0, i.Vu / PHI - Vc)             // kN
  const AvPerS    = Vs > 0 ? (Vs * 1000) / (fyt * d) : 0    // mm²/mm (all legs)
  const AvPlus2At_raw = AvPerS + 2 * AtPerS_design            // mm²/mm

  // Combined minimum §22.5.10.5: max(0.0625√f'c, 0.35)·bw/fyt
  const AvPlus2At_min = Math.max(0.0625 * sqrtFc, 0.35) * b / fyt
  const AvPlus2At     = Math.max(AvPlus2At_raw, torsionNeeded ? AvPlus2At_min : 0)

  // Required spacing for `legs`-leg closed stirrup of diameter ds
  const Ab   = (Math.PI / 4) * ds * ds
  const sReq = AvPlus2At > 0 ? (legs * Ab) / AvPlus2At : Infinity

  // Maximum spacing §9.7.6.3.2 (torsion) + §9.7.6.2.2 (shear)
  const sMax = Math.min(ph / 8, 300, d / 2, 600)

  const sAdopt = Math.min(sReq, sMax)

  return {
    d, Acp, pcp, cSt, x1, y1, Aoh, ph, Ao,
    Tu_th, Tcr, torsionNeeded,
    Vc, phiVc,
    lhs, rhs, interactionOK,
    AtPerS, AtPerS_min, AtPerS_design,
    Al, Al_min, Al_design,
    Vs, AvPerS, AvPlus2At, AvPlus2At_min,
    sReq, sMax, sAdopt,
  }
}
