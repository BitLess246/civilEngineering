// ─────────────────────────────────────────────────────────────────────────
// Cantilever retaining wall — stability + RC design of stem, toe and heel.
// Earth pressure: Rankine active theory.
// Stability: NSCP 2015 §307 (FS_OT ≥ 2.0, FS_SL ≥ 1.5).
// RC design: ACI 318-14 §22.5 (shear) + §22.2 (flexure), φ=0.75/0.90.
// SI units throughout: geometry mm, forces kN/m, moments kN·m/m, σ kPa.
// ─────────────────────────────────────────────────────────────────────────
import { oneWayVc } from './shear'
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
//
// ── TWO LOAD LEVELS, AND WHY THEY MUST NOT BE MIXED ──────────────────────
//
// STABILITY (overturning, sliding, bearing) is a SERVICE-load check. The
// factor of safety IS the safety margin, so factoring the loads as well
// would double-count it, and the bearing pressure compared against an
// allowable qa has to be a service pressure by definition.
//
// MEMBER DESIGN (stem, toe, heel) is a STRENGTH check, so it needs FACTORED
// loads: ACI 318-14 §5.3.1(e) / NSCP 2015 §405.3.1
//
//     U = 1.2D + 1.6L + 1.6H
//
// with H the lateral earth pressure and the surcharge treated as live.
//
// This module previously compared an UNFACTORED stem moment and shear
// against φMn and φVc, which under-designed the stem by the full 1.6. The
// factors below are applied to the design actions only; every stability
// quantity above stays at service level.
// ─────────────────────────────────────────────────────────────────────────

/** Load factors, ACI 318-14 §5.3.1 / NSCP 2015 §405.3.1. */
export const LF = {
  /** Lateral earth pressure H — §5.3.1(e). */
  H: 1.6,
  /** Dead load D, where it acts unfavourably. */
  D: 1.2,
  /** Surcharge, carried as live load L. */
  L: 1.6,
} as const

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

  /** Clear cover in the base slab, mm — cast against ground, so §20.6.1.3.1
   *  asks for 75 mm rather than the 50 mm used on a formed face. */
  coverBase?: number
  /** Base-slab main bar diameter, mm (default: same as the stem bar). */
  barDiaBase?: number
}

/** One cantilever of the base slab (toe or heel), designed as a 1 m strip. */
export interface SlabCantilever {
  /** Projection length, m. */
  L: number
  /** Effective depth, mm. */
  d: number
  /** Factored moment at the critical section (the stem face), kN·m/m. */
  Mu: number
  /** Factored shear at the critical section, kN/m. */
  Vu: number
  /** Distance from the stem face to the shear critical section, m. */
  xv: number
  /** φVc = 0.75·(λ√f'c/6)·b·d, kN/m. */
  phiVc: number
  shearOK: boolean
  /** Flexural steel, mm²/m. */
  As: number
  As_min: number
  As_design: number
  /** Chosen spacing of the main bar, mm, and the area it provides. */
  spacing: number
  As_prov: number
  spacingMax: number
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

  /** Stem vertical bar spacing and the area it provides, mm / mm²/m. */
  s_stem: number
  As_stem_prov: number
  s_stem_max: number

  /** Horizontal (temperature) steel in the stem — §11.6.1 ρt = 0.0020. */
  As_horiz: number
  s_horiz: number
  /** Vertical steel on the FRONT face of the stem — §11.6.1 ρl = 0.0012. */
  As_stem_front: number

  // ── Factored statics, used for member design only ──────────────────────
  sumVu: number    // factored ΣV, kN/m
  MRu: number      // factored restoring moment about the toe, kN·m/m
  MOu: number      // factored overturning moment about the toe, kN·m/m
  xbar_u: number   // factored resultant position from the toe, m
  qu_toe: number   // factored bearing pressure at the toe, kPa
  qu_heel: number  // factored bearing pressure at the heel, kPa
  /** True when e_u > B/6, so the factored pressure block is triangular and
   *  bears on only 3·x̄u of the base rather than the whole width. */
  uplift_u: boolean

  /** Base-slab design. */
  toe: SlabCantilever
  heel: SlabCantilever
  /** Shrinkage and temperature steel in the base slab — §24.4.3.2. */
  As_temp_base: number
  s_temp_base: number
}

// ── Bar spacing ───────────────────────────────────────────────────────────

/**
 * Spacing of a single layer of ⌀db bars that provides at least As per metre,
 * rounded DOWN to a 25 mm module because that is how a bar schedule is
 * written and how a crew sets out.
 *
 * The cap is the smaller of the code maximum passed in and 450 mm, and the
 * floor is 75 mm — below that the bars are too close to place concrete
 * between, which no clause states but every pour demonstrates.
 */
export function barSpacing(As: number, db: number, sMax: number):
  { spacing: number; As_prov: number } {
  const Ab = (Math.PI / 4) * db * db
  const sCalc = As > 1e-9 ? (Ab * 1000) / As : sMax
  const spacing = Math.max(75, Math.min(Math.floor(sCalc / 25) * 25, sMax))
  return { spacing, As_prov: (Ab * 1000) / spacing }
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

  const sqrtFc = Math.sqrt(Math.max(i.fc, 1))
  const b = 1000   // mm — per unit length

  // Flexural steel for a 1 m strip: Rn → ρ → As, ACI 318-14 §22.2 with φ=0.90.
  // Returns null-safe zero when the section cannot develop the moment (the
  // discriminant goes negative), which the caller sees as As = 0 alongside a
  // failing shear or a visibly impossible spacing rather than a NaN.
  const flexuralAs = (Mu: number, d: number): number => {
    if (!(d > 0) || Mu <= 0) return 0
    const Rn = (Mu * 1e6 / 0.9) / (b * d * d)
    const m = i.fy / (0.85 * i.fc)
    const disc = 1 - 2 * m * Rn / i.fy
    if (disc < 0) return Infinity          // section too shallow — no valid ρ
    return ((1 / m) * (1 - Math.sqrt(disc))) * b * d
  }

  // §9.6.1.2 minimum flexural steel.
  const rho_min = Math.max(0.25 * sqrtFc / i.fy, 1.4 / i.fy)

  // §22.5.5.1 one-way shear: φVc = φ·(λ√f'c/6)·b·d, kN/m with λ = 1.
  // §422.5.5.1 through the shared expression — this carried its own /6, the
  // exact conversion of the inch-pound 2√f'c, where the SI code prints 0.17.
  const phiVcOf = (d: number) => 0.75 * oneWayVc({ fc: i.fc, b, d, lambda: 1 })

  // ── STEM — factored, §5.3.1(e) ──────────────────────────────────────────
  const d_stem = i.ts - i.cover - i.barDia / 2

  // Service thrusts on the stem, over the STEM height only: the base slab is
  // below the stem's fixed end and its share of the wedge does not bend it.
  const Pa_stem = 0.5 * Ka * i.gamma_s * hs * hs   // kN/m
  const Pq_stem = Ka * i.q_sur * hs                 // kN/m

  // Factored: earth pressure and surcharge are both multiplied by 1.6.
  const Vu_stem = LF.H * Pa_stem + LF.L * Pq_stem
  const Mu_stem = LF.H * Pa_stem * (hs / 3) + LF.L * Pq_stem * (hs / 2)

  const Vc_stem = phiVcOf(d_stem)

  const As_stem = flexuralAs(Mu_stem, d_stem)
  const As_min = rho_min * b * d_stem
  const As_design = Math.max(As_stem, As_min)

  // §11.7.2.1 — spacing of the stem's vertical steel: min(3h, 450).
  const s_stem_max = Math.min(3 * i.ts, 450)
  const stemBars = barSpacing(As_design, i.barDia, s_stem_max)

  // §11.6.1 minimum wall reinforcement, as ratios of the GROSS section:
  // ρt = 0.0020 horizontal, ρl = 0.0012 vertical. The vertical minimum is the
  // front (compression) face — the earth face is governed by flexure above.
  const As_horiz = 0.0020 * b * i.ts
  const As_stem_front = 0.0012 * b * i.ts
  const s_horiz = barSpacing(As_horiz, i.barDia, Math.min(3 * i.ts, 450)).spacing

  // ── FACTORED BASE PRESSURE, for toe and heel design ─────────────────────
  // Same statics as the service check, re-run with §5.3.1(e) factors. Dead
  // weights ×1.2, surcharge ×1.6, lateral thrust ×1.6.
  const W_stem_u = LF.D * W_stem, W_base_u = LF.D * W_base
  const W_soil_u = LF.D * W_soil, W_sur_u = LF.L * W_sur
  const sumVu = W_stem_u + W_base_u + W_soil_u + W_sur_u
  const MRu = W_stem_u * arm_stem + W_base_u * arm_base +
              W_soil_u * arm_soil + W_sur_u * arm_sur
  const MOu = LF.H * Pa * (H / 3) + LF.L * Pq * (H / 2)
  const xbar_u = (MRu - MOu) / sumVu
  const e_u = B / 2 - xbar_u

  // Soil cannot pull the base down, so once e > B/6 the pressure block is a
  // TRIANGLE bearing on 3·x̄ of the width, not a trapezoid with a negative
  // corner. Designing the toe off a negative q_min would understate it.
  const uplift_u = Math.abs(e_u) > B / 6 + 1e-12
  const contact = 3 * xbar_u              // bearing length, from the toe
  const qu_toe = uplift_u
    ? (contact > 1e-9 ? (2 * sumVu) / contact : 0)
    : (sumVu / B) * (1 + 6 * e_u / B)
  const qu_heel = uplift_u ? 0 : (sumVu / B) * (1 - 6 * e_u / B)

  /** Factored bearing pressure at distance x from the toe, kPa. */
  const qu = (x: number): number => {
    if (x < 0 || x > B) return 0
    if (!uplift_u) return qu_toe + (qu_heel - qu_toe) * (x / B)
    return x >= contact ? 0 : qu_toe * (1 - x / contact)
  }

  // Simpson's rule — exact for the quadratic integrand of ∫w(x)·x dx and for
  // the linear ∫w(x) dx, so the toe/heel actions carry no quadrature error.
  const simpson = (f: (x: number) => number, a: number, z: number, n = 200): number => {
    if (!(z > a)) return 0
    const h2 = (z - a) / n
    let s = f(a) + f(z)
    for (let k = 1; k < n; k++) s += f(a + k * h2) * (k % 2 ? 4 : 2)
    return (s * h2) / 3
  }

  const d_base = i.tb - (i.coverBase ?? 75) - (i.barDiaBase ?? i.barDia) / 2
  const s_base_max = Math.min(3 * i.tb, 450)
  const dbBase = i.barDiaBase ?? i.barDia

  // The base slab is a ONE-WAY SLAB, so its minimum flexural steel is
  // §7.6.1.1 → §24.4.3.2: ρ·Ag on the GROSS section, not the beam formula of
  // §9.6.1.2 on b·d. On a 500 mm base the two differ by better than 50%, and
  // the beam value is not the applicable clause.
  const rho_slab_min = i.fy >= 420 ? 0.0018 : 0.0020

  const cantilever = (
    L: number, w: (u: number) => number, xv: number,
  ): SlabCantilever => {
    // u measured from the stem face outward. Mu about the face; Vu is the
    // net load beyond the shear critical section.
    const Mu = Math.max(0, simpson((u) => w(u) * u, 0, L))
    const Vu = Math.max(0, simpson(w, 0, Math.max(0, L - xv)))
    const As = flexuralAs(Mu, d_base)
    const As_min_c = rho_slab_min * b * i.tb
    const As_design_c = Math.max(As, As_min_c)
    const bars = barSpacing(As_design_c, dbBase, s_base_max)
    const phiVc = phiVcOf(d_base)
    return {
      L, d: d_base, Mu, Vu, xv, phiVc, shearOK: Vu <= phiVc + 1e-9,
      As, As_min: As_min_c, As_design: As_design_c,
      spacing: bars.spacing, As_prov: bars.As_prov, spacingMax: s_base_max,
    }
  }

  // TOE — net UPWARD. The self-weight of the toe slab and any soil over it
  // relieve the pressure; both are neglected, which is conservative and
  // sidesteps applying a load factor to a favourable action.
  // Shear critical section at d from the face, §22.5.1.1: the bearing
  // reaction puts the region into compression, so the relief applies.
  const toe = cantilever(b_t, (u) => qu(b_t - u), d_base / 1000)

  // HEEL — net DOWNWARD: the backfill, the surcharge and the slab's own
  // weight, less the upward pressure. Here the load acts AWAY from the
  // support, so §22.5.1.1 does not apply and the critical section stays at
  // the face of the stem.
  const w_heel_down = LF.D * gamma_c * t_b + LF.D * i.gamma_s * hs + LF.L * i.q_sur
  const heel = cantilever(b_h, (u) => w_heel_down - qu(b_t + t_s + u), 0)

  // §24.4.3.2 shrinkage and temperature steel in the base slab, on the gross
  // section; §24.4.3.3 caps the spacing at min(5h, 450).
  const rho_temp = i.fy >= 420 ? 0.0018 : 0.0020
  const As_temp_base = rho_temp * b * i.tb
  const s_temp_base = barSpacing(As_temp_base, dbBase, Math.min(5 * i.tb, 450)).spacing

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
    s_stem: stemBars.spacing, As_stem_prov: stemBars.As_prov, s_stem_max,
    As_horiz, s_horiz, As_stem_front,
    sumVu, MRu, MOu, xbar_u, qu_toe, qu_heel, uplift_u,
    toe, heel, As_temp_base, s_temp_base,
  }
}
