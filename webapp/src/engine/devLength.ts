// ─────────────────────────────────────────────────────────────────────────
// Development and splice lengths — ACI 318-14 §25.4 + §25.5.
// SI units: lengths mm, stress MPa.
// Tension development: §25.4.2.3  (SI coefficient 1/1.1 ≈ 0.909).
// Standard hook in tension: §25.4.3.1, with the §25.3.1 hook geometry.
// Compression development: §25.4.9.2.
// Splice — tension Class A/B: §25.5.2; compression: §25.5.5.1–2.
// ─────────────────────────────────────────────────────────────────────────

/**
 * §25.4.1.4 — the value of √f'c used to calculate a development length shall
 * not exceed 8.3 MPa, i.e. f'c is effectively capped at about 69 MPa.
 *
 * The clause exists because the splitting bond tests behind §25.4 were run on
 * ordinary-strength concrete; above that range the measured bond strength
 * stops tracking √f'c. Without the cap, a high-strength mix buys a shorter
 * development length than it has been shown to deliver — which is why this is
 * a cap and not a convenience.
 */
export const SQRT_FC_MAX = 8.3

/** √f'c as §25.4.1.4 allows it to be used. */
export const devSqrtFc = (fc: number): number =>
  Math.min(Math.sqrt(Math.max(fc, 1)), SQRT_FC_MAX)

/** Epoxy-coating case for ψe factor (§25.4.2.4b). */
export type EpoxyCase =
  | 'none'            // uncoated / zinc-and-epoxy — ψe = 1.0
  | 'coated-light'    // epoxy, cover ≥ 3db AND clear spacing ≥ 6db — ψe = 1.2
  | 'coated-heavy'    // epoxy, cover < 3db OR clear spacing < 6db — ψe = 1.5

const PSI_E: Record<EpoxyCase, number> = {
  'none': 1.0,
  'coated-light': 1.2,
  'coated-heavy': 1.5,
}

export interface DevLengthInput {
  db: number           // bar diameter, mm
  fc: number           // f'c, MPa
  fy: number           // bar yield, MPa
  topBar: boolean      // >300 mm fresh concrete below bar at casting → ψt = 1.3
  epoxy: EpoxyCase     // coating → ψe
  lambda: number       // lightweight factor §19.2.4.1: 1.0 normal, 0.75 lightweight
  cbKtr_db: number     // (cb + Ktr)/db confinement term; internally capped at 2.5

  /**
   * §25.4.3.2 ψc — side cover to the hook ≥ 65 mm AND, for a 90° hook, cover
   * on the tail extension ≥ 50 mm. Worth 0.7 for ⌀36 and smaller.
   */
  hookCover?: boolean
  /**
   * §25.4.3.2 ψr — the hook is enclosed within ties or stirrups perpendicular
   * to the bar at s ≤ 3db. Worth 0.8 for ⌀36 and smaller.
   */
  hookTies?: boolean
}

export interface DevLengthResult {
  // Modification factors
  psi_t: number        // casting-position factor
  psi_e: number        // epoxy factor
  psi_s: number        // bar-size factor (0.8 for db ≤ 20, 1.0 for db > 20)
  psi_te: number       // ψt × ψe capped at 1.7 (§25.4.2.4)

  // Confinement
  confine: number      // (cb+Ktr)/db actually used (≤ 2.5)

  // Tension development §25.4.2.3
  ld_raw: number       // formula result before 300 mm floor, mm
  ld: number           // development length in tension, mm (≥ 300)

  // Compression development §25.4.9.2
  ldc: number          // development length in compression, mm (≥ 200)

  // Tension splices §25.5.2
  ls_A: number         // Class A splice (1.0 × ld), mm (≥ 300)
  ls_B: number         // Class B splice (1.3 × ld), mm (≥ 300)

  // Compression splice §25.5.5
  lsc: number          // compression splice length, mm (≥ 300)

  /** √f'c as §25.4.1.4 permits it to be used, and whether the cap bit. */
  sqrtFc: number
  sqrtFcCapped: boolean

  // Standard hook in tension §25.4.3
  psi_c: number        // §25.4.3.2 cover factor  (0.7 or 1.0)
  psi_r: number        // §25.4.3.2 confining factor (0.8 or 1.0)
  ldh_raw: number      // formula result, before the 8db / 150 mm floor
  ldh: number          // adopted, mm
  /** §25.3.1 hook geometry, for detailing and for the drawing. */
  hookTail: number     // 90° hook tail extension, 12db
  hookBendDia: number  // minimum inside bend diameter, 6db or 8db
}

// ── Does the hook fit the member it anchors into? ──────────────────────────
//
// A hooked bar has to be developed INSIDE the supporting member, and ℓdh is
// measured from the critical section (the face of the support) to the OUTSIDE
// END OF THE BEND. The room available for that is not the member depth: the
// hook turns down behind the far-face longitudinal bar, inside the ties, so
//
//     available = depth − cover − tie Ø − far-face bar Ø
//
// Two things this does NOT allow, both of them common on site:
//
//   • A LONGER TAIL does not buy anything. The 12db tail (§425.3.1) runs
//     perpendicular to ℓdh, so lengthening it adds nothing the code counts.
//     "Add the shortfall to the hook" is a real detailing habit and it does
//     not develop the bar.
//   • Measuring to the far face instead of to the far BAR overstates the room
//     by one column-bar diameter, which is the whole margin on a small column.
//
// The code-legal ways out of a shortfall are a deeper member, a smaller bar,
// a higher f'c, earning ψc/ψr (§425.4.3.2), or abandoning the hook for a
// headed bar or mechanical anchorage (§425.4.4).

export interface HookFitInput {
  /** ℓdh required, mm — `calcDevLength(...).ldh`, or §418.8.5.1 at a joint. */
  ldh: number
  /** Depth of the supporting member PARALLEL to the hooked bar, mm. */
  memberDepth: number
  /** Clear cover on the far face, mm. */
  cover: number
  /** Tie or hoop diameter crossing that cover, mm. */
  tieDia: number
  /** The far-face longitudinal bar the hook turns down behind, mm. */
  farBarDia: number
}

export interface HookFitResult {
  /** Embedment the hook can actually occupy, mm. */
  avail: number
  fits: boolean
  /** ℓdh with nowhere to go, mm — 0 when it fits. */
  shortfall: number
  /** Member depth that would just develop the bar, mm. */
  depthNeeded: number
}

/**
 * Clear distance from the far FACE of the member to the outside of the bend, mm.
 *
 * This is where the hook physically sits, so it is both what the drawing must
 * place it at and what the note beside it must say. Every sheet that draws a
 * hooked bar takes it from here — a sheet that draws the hook at one distance
 * and annotates it with another is worse than one that does neither.
 */
export const hookClearToFace = (
  cover: number, tieDia: number, farBarDia: number,
): number => cover + tieDia + farBarDia

/** Embedment available to a hook inside a member, mm — never negative. */
export const hookEmbedmentAvailable = (
  memberDepth: number, cover: number, tieDia: number, farBarDia: number,
): number => Math.max(0, memberDepth - hookClearToFace(cover, tieDia, farBarDia))

export function hookFit(i: HookFitInput): HookFitResult {
  const avail = hookEmbedmentAvailable(i.memberDepth, i.cover, i.tieDia, i.farBarDia)
  const fits = i.ldh <= avail + 1e-9
  return {
    avail,
    fits,
    shortfall: fits ? 0 : i.ldh - avail,
    depthNeeded: i.ldh + i.cover + i.tieDia + i.farBarDia,
  }
}

export function calcDevLength(i: DevLengthInput): DevLengthResult {
  const { db, fc, fy, lambda } = i
  // §25.4.1.4 — the cap applies to every length in §25.4, not just to ld.
  const sqrtFc = devSqrtFc(fc)
  const sqrtFcCapped = Math.sqrt(Math.max(fc, 1)) > SQRT_FC_MAX + 1e-12

  // §25.4.2.4 modification factors
  const psi_t = i.topBar ? 1.3 : 1.0
  const psi_e = PSI_E[i.epoxy]
  const psi_s = db <= 20 ? 0.8 : 1.0                // bar-size factor
  const psi_te = Math.min(psi_t * psi_e, 1.7)        // product cap

  // §25.4.2.3 confinement term
  const confine = Math.min(i.cbKtr_db, 2.5)

  // Tension development (SI form of §25.4.2.3: coefficient = 1/1.1)
  const ld_raw = (fy * psi_te * psi_s * db) / (1.1 * lambda * sqrtFc * confine)
  const ld = Math.max(ld_raw, 300)

  // Compression development §25.4.9.2
  const ldc_1 = (0.24 * fy * db) / (lambda * sqrtFc)  // main formula
  const ldc_2 = 0.043 * fy * db                        // secondary minimum
  const ldc   = Math.max(ldc_1, ldc_2, 200)

  // Tension splices §25.5.2
  const ls_A = Math.max(1.0 * ld, 300)
  const ls_B = Math.max(1.3 * ld, 300)

  // Compression splice §25.5.5.1
  const lsc_raw = fy <= 420
    ? 0.0725 * fy * db
    : (0.13 * fy - 24) * db
  // §25.5.5.2 low-f'c correction: if f'c < 21 MPa → increase by 1/0.83 (= ×4/3)
  const lsc_fc  = fc < 21 ? (4 / 3) : 1.0
  const lsc     = Math.max(lsc_raw * lsc_fc, 300)

  // ── Standard hook in tension §25.4.3.1 ─────────────────────────────────
  //
  //     ldh = ( 0.24 · ψe · ψc · ψr · fy ) / ( λ √f'c ) · db
  //
  // measured from the CRITICAL SECTION to the OUTSIDE END of the hook, not to
  // the bend. ψt does NOT appear: the casting-position penalty is a straight-
  // bar bond effect, and a hook anchors mostly by bearing inside the bend.
  //
  // The ψc / ψr reductions apply only to ⌀36 and smaller (§25.4.3.2).
  const hookEligible = db <= 36
  const psi_c = hookEligible && i.hookCover ? 0.7 : 1.0
  const psi_r = hookEligible && i.hookTies ? 0.8 : 1.0
  // §25.4.3.2: ψe for a hook is 1.2 for epoxy-coated bars and 1.0 otherwise —
  // it does not carry the 1.5 heavy-coating case that straight bars do.
  const psi_e_hook = i.epoxy === 'none' ? 1.0 : 1.2
  const ldh_raw = (0.24 * psi_e_hook * psi_c * psi_r * fy * db) / (lambda * sqrtFc)
  const ldh = Math.max(ldh_raw, 8 * db, 150)

  // §25.3.1 hook geometry — a 90° hook carries a 12db tail, and the minimum
  // inside bend diameter steps up at ⌀28.
  const hookTail = 12 * db
  const hookBendDia = (db <= 25 ? 6 : 8) * db

  return {
    psi_t, psi_e, psi_s, psi_te, confine, ld_raw, ld, ldc, ls_A, ls_B, lsc,
    sqrtFc, sqrtFcCapped,
    psi_c, psi_r, ldh_raw, ldh, hookTail, hookBendDia,
  }
}
