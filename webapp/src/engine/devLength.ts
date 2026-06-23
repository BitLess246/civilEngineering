// ─────────────────────────────────────────────────────────────────────────
// Development and splice lengths — ACI 318-14 §25.4 + §25.5.
// SI units: lengths mm, stress MPa.
// Tension development: §25.4.2.3  (SI coefficient 1/1.1 ≈ 0.909).
// Compression development: §25.4.9.2.
// Splice — tension Class A/B: §25.5.2; compression: §25.5.5.1–2.
// ─────────────────────────────────────────────────────────────────────────

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
}

export function calcDevLength(i: DevLengthInput): DevLengthResult {
  const { db, fc, fy, lambda } = i
  const sqrtFc = Math.sqrt(Math.max(fc, 1))

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

  return { psi_t, psi_e, psi_s, psi_te, confine, ld_raw, ld, ldc, ls_A, ls_B, lsc }
}
