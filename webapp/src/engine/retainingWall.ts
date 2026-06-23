// ─────────────────────────────────────────────────────────────────────────
// Cantilever retaining wall — stability + stem RC design.
// Earth pressure: Rankine active theory.
// Stability: NSCP 2015 §307 (FS_OT ≥ 2.0, FS_SL ≥ 1.5).
// Stem design: ACI 318-14 §22.5 (shear) + §22.2 (flexure), φ=0.75/0.90.
// SI units throughout: geometry mm, forces kN/m, moments kN·m/m, σ kPa.
// ─────────────────────────────────────────────────────────────────────────
//
// Wall cross-section (per unit length):
//
//            |← ts →|
//            +-------+  ← top of wall
//            | stem  |
//     H_s    |       |
//   ─────────+───────+──────────  ← top of base
//   |← bt →|← ts →|←── bh ──→|
//   |           base           |
//   |___________________________|  tb
//
// Retained height for earth pressure: H = Hs + tb (includes base thickness).
// Moments taken about the toe (front edge of base).
// ─────────────────────────────────────────────────────────────────────────

export interface RetainingWallInput {
  // Geometry (mm)
  Hs: number       // stem height, top of base to top of wall
  tb: number       // base thickness
  ts: number       // stem width at base
  bt: number       // toe projection from front stem face to toe
  bh: number       // heel projection from back stem face to heel

  // Soil
  gamma_s: number  // unit weight of retained soil, kN/m³
  phi_deg: number  // angle of internal friction, degrees
  q_sur: number    // uniform surcharge on retained fill, kPa (0 = none)
  mu: number       // coefficient of friction, base slab vs. soil
  qa: number       // allowable bearing pressure, kPa

  // Concrete
  fc: number       // f'c, MPa
  fy: number       // bar yield, MPa
  cover: number    // clear cover to main bar (retained side of stem), mm
  barDia: number   // main stem bar diameter, mm
  gamma_c?: number // unit weight of concrete, kN/m³ (default 23.6)
}

export interface RetainingWallResult {
  // Derived geometry
  B: number        // total base width (bt + ts + bh), m
  H: number        // total retained height (Hs + tb), m
  Ka: number       // Rankine active coefficient

  // Earth pressure forces (kN per m length)
  Pa: number       // active resultant: ½·Ka·γs·H²
  Pq: number       // surcharge resultant: Ka·q·H
  Fh: number       // total horizontal: Pa + Pq

  // Vertical loads per m (kN/m) and moment arms from toe (m)
  W_stem: number; arm_stem: number
  W_base: number; arm_base: number
  W_soil: number; arm_soil: number
  W_sur:  number; arm_sur:  number
  sumV: number     // ΣV total vertical, kN/m
  MR: number       // total restoring moment about toe, kN·m/m
  MO: number       // total overturning moment about toe, kN·m/m

  // Stability factors of safety
  FS_OT: number    // overturning (≥ 2.0)
  FS_SL: number    // sliding (≥ 1.5)
  stableOT: boolean
  stableSL: boolean

  // Bearing pressures (kPa)
  xbar: number     // resultant location from toe, m
  e: number        // eccentricity from base midpoint (+ = toward toe)
  q_max: number    // at toe
  q_min: number    // at heel
  bearingOK: boolean
  tensionOK: boolean  // q_min ≥ 0

  // Stem design — per m width at base of stem (kN/m, kN·m/m, mm²/m)
  d_stem: number
  Pa_stem: number; Pq_stem: number
  Vu_stem: number   // Pa_stem + Pq_stem, kN/m
  Mu_stem: number   // Pa_stem·Hs/3 + Pq_stem·Hs/2, kN·m/m
  Vc_stem: number   // φVc = 0.75·(√f'c/6)·1000·d, kN/m
  shearOK: boolean

  As_stem: number   // from flexure (may be < As_min)
  As_min: number    // §9.6.1.2 max(0.25√f'c/fy, 1.4/fy)·b·d
  As_design: number // governing
}

export function designRetainingWall(i: RetainingWallInput): RetainingWallResult {
  const gamma_c = i.gamma_c ?? 23.6

  // Dimensions in metres
  const hs = i.Hs / 1000
  const t_b = i.tb / 1000
  const t_s = i.ts / 1000
  const b_t = i.bt / 1000
  const b_h = i.bh / 1000
  const B   = b_t + t_s + b_h
  const H   = hs + t_b

  // Rankine Ka (Eq. Ka = tan²(45 − φ/2))
  const phi = i.phi_deg * (Math.PI / 180)
  const Ka  = Math.tan(Math.PI / 4 - phi / 2) ** 2

  // Horizontal forces
  const Pa  = 0.5 * Ka * i.gamma_s * H * H
  const Pq  = Ka * i.q_sur * H
  const Fh  = Pa + Pq

  // Overturning moment about toe
  const MO = Pa * (H / 3) + Pq * (H / 2)

  // Vertical loads and arms from toe
  const W_stem = gamma_c * t_s * hs
  const arm_stem = b_t + t_s / 2

  const W_base = gamma_c * B * t_b
  const arm_base = B / 2

  const W_soil = i.gamma_s * b_h * hs
  const arm_soil = b_t + t_s + b_h / 2

  const W_sur = i.q_sur * b_h
  const arm_sur = b_t + t_s + b_h / 2

  const sumV = W_stem + W_base + W_soil + W_sur
  const MR   = W_stem * arm_stem + W_base * arm_base +
               W_soil * arm_soil + W_sur * arm_sur

  // Stability
  const FS_OT = MR / MO
  const FS_SL = (i.mu * sumV) / Fh

  // Bearing pressure
  const xbar = (MR - MO) / sumV
  const e    = B / 2 - xbar
  const q_avg = sumV / B
  const q_max = q_avg * (1 + 6 * e / B)
  const q_min = q_avg * (1 - 6 * e / B)

  // Stem design at base of stem
  const sqrtFc = Math.sqrt(Math.max(i.fc, 1))
  const b = 1000   // mm — per unit length
  const d_stem = i.ts - i.cover - i.barDia / 2

  const Pa_stem = 0.5 * Ka * i.gamma_s * hs * hs   // kN/m
  const Pq_stem = Ka * i.q_sur * hs                 // kN/m
  const Vu_stem = Pa_stem + Pq_stem
  const Mu_stem = Pa_stem * (hs / 3) + Pq_stem * (hs / 2)  // kN·m/m

  // Shear §22.5.5 (simplified): φVc = φ·(λ√f'c/6)·b·d (kN/m, λ=1)
  const Vc_stem = 0.75 * (sqrtFc / 6) * b * d_stem / 1000

  // Flexure §22.2 (b = 1000 mm/m)
  const Rn  = (Mu_stem * 1e6 / 0.9) / (b * d_stem * d_stem)
  const m   = i.fy / (0.85 * i.fc)
  const rho = (1 / m) * (1 - Math.sqrt(Math.max(0, 1 - 2 * m * Rn / i.fy)))
  const As_stem = rho * b * d_stem

  // Minimum §9.6.1.2
  const rho_min  = Math.max(0.25 * sqrtFc / i.fy, 1.4 / i.fy)
  const As_min   = rho_min * b * d_stem
  const As_design = Math.max(As_stem, As_min)

  return {
    B, H, Ka,
    Pa, Pq, Fh,
    W_stem, arm_stem, W_base, arm_base, W_soil, arm_soil, W_sur, arm_sur,
    sumV, MR, MO,
    FS_OT, FS_SL,
    stableOT: FS_OT >= 2.0 - 1e-9,
    stableSL: FS_SL >= 1.5 - 1e-9,
    xbar, e, q_max, q_min,
    bearingOK: q_max <= i.qa + 1e-9,
    tensionOK: q_min >= -1e-9,
    d_stem, Pa_stem, Pq_stem, Vu_stem, Mu_stem, Vc_stem,
    shearOK: Vu_stem <= Vc_stem + 1e-9,
    As_stem, As_min, As_design,
  }
}
