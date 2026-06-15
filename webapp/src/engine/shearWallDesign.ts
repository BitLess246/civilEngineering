// ─────────────────────────────────────────────────────────────────────────
// Shear-wall reinforcement — in-plane (web) shear design.
// NSCP 2015 §418.10 / ACI 318-14 §11 & §18.10 (structural walls).
//   Acv = ℓw·t                                              (gross web area)
//   Vn  = Acv·(αc·λ·√f′c + ρt·fy)                           (§418.10.4.1)
//   φVn ≥ Vu,  φ = 0.75;   Vn ≤ 0.83·Acv·√f′c (cap, §418.10.4.4)
//   αc = 0.25 (hw/ℓw ≤ 1.5) … 0.17 (hw/ℓw ≥ 2.0), linear between
//   minimum ρt, ρℓ = 0.0025;  two curtains if Vu > 0.17·Acv·λ√f′c or t ≥ 250
//   spacing s ≤ min(ℓw/5, 3t, 450)                          (§411.7.2/3)
// Units: ℓw, hw in m; t, db, spacing in mm; fc, fy in MPa; forces in kN.
// ─────────────────────────────────────────────────────────────────────────

const PHI_SHEAR = 0.75
const RHO_MIN = 0.0025          // §411.6 distributed web steel minimum

export interface ShearWallInput {
  lw: number          // horizontal wall length, m
  hw: number          // wall (storey) height, m
  thickness: number   // web thickness t, mm
  fc: number
  fy: number
  Vu: number          // factored in-plane shear, kN
  Pu?: number         // factored axial (compression +), kN — boundary-element trigger
  Mu?: number         // factored in-plane moment, kN·m — boundary-element trigger
  barDia?: number     // distributed-bar diameter, mm (default 12)
  lambda?: number     // lightweight factor (default 1)
}

export interface WallCurtainSteel {
  rhoReq: number      // demand reinforcement ratio (before the minimum)
  rho: number         // adopted ratio (≥ ρ_min)
  spacing: number     // bar spacing, mm
  usedMin: boolean
}

export interface ShearWallResult {
  Acv: number         // gross web area, mm²
  aspect: number      // hw/ℓw
  alphaC: number
  Vc: number          // concrete contribution φ-less, kN
  Vn: number          // nominal shear with adopted ρt, kN
  phiVn: number       // design shear, kN
  VnCap: number       // 0.83·Acv·√fc, kN
  shearOK: boolean    // φVn ≥ Vu and within the cap
  capOK: boolean      // Vu ≤ φ·VnCap (web crushing limit)
  twoCurtains: boolean
  horiz: WallCurtainSteel   // ρt — horizontal (transverse) bars resist shear
  vert: WallCurtainSteel    // ρℓ — vertical (longitudinal) distributed bars
  sMax: number        // governing maximum spacing, mm
  boundaryElement: boolean  // §418.10.6 special boundary element indicated
  notes: string[]
}

export function designShearWall(i: ShearWallInput): ShearWallResult {
  const lambda = i.lambda ?? 1
  const db = i.barDia ?? 12
  const Ab = (Math.PI / 4) * db * db
  const lwmm = i.lw * 1000
  const t = i.thickness
  const Acv = lwmm * t                                    // mm²
  const aspect = i.lw > 0 ? i.hw / i.lw : 0
  const rootFc = Math.sqrt(Math.max(i.fc, 1))

  // αc by aspect ratio (linear 0.25 → 0.17 over hw/ℓw 1.5 → 2.0)
  const alphaC = aspect <= 1.5 ? 0.25 : aspect >= 2.0 ? 0.17 : 0.25 + (0.17 - 0.25) * (aspect - 1.5) / 0.5

  const Vc = (alphaC * lambda * rootFc * Acv) / 1000     // kN (concrete term)
  const VnCap = (0.83 * rootFc * Acv) / 1000             // kN — web crushing cap
  const capOK = i.Vu <= PHI_SHEAR * VnCap

  // required horizontal ratio ρt from φ·Acv·(αc·λ√fc + ρt·fy) ≥ Vu
  const rhoTreq = Math.max(0, (i.Vu * 1000 / (PHI_SHEAR * Acv) - alphaC * lambda * rootFc) / i.fy)
  const rhoT = Math.max(rhoTreq, RHO_MIN)

  // vertical ratio: §418.10.4.3 — for hw/ℓw ≤ 2.0, ρℓ ≥ ρt; else ≥ ρ_min
  const rhoLreq = aspect <= 2.0 ? Math.max(rhoT, RHO_MIN) : RHO_MIN
  const rhoL = Math.max(rhoLreq, RHO_MIN)

  // two curtains of reinforcement (§418.10.2.2)
  const twoCurtains = i.Vu > 0.17 * lambda * rootFc * Acv / 1000 || t >= 250
  const curtains = twoCurtains ? 2 : 1
  const AvLayer = curtains * Ab                            // steel area per spacing in the wall thickness

  // maximum spacing (§411.7.2.1 / §411.7.3.1)
  const sMax = Math.min(lwmm / 5, 3 * t, 450)

  // spacing from ratio: ρ = Av/(t·s) → s = Av/(ρ·t), capped at sMax
  const spacingFrom = (rho: number): number =>
    Math.min(sMax, AvLayer / (rho * t))

  const Vn = Math.min((alphaC * lambda * rootFc + rhoT * i.fy) * Acv / 1000, VnCap)
  const phiVn = PHI_SHEAR * Vn
  const shearOK = phiVn >= i.Vu && capOK

  // §418.10.6.2 stress-based boundary-element trigger:
  // extreme-fibre compressive stress under Pu + Mu > 0.2 f′c.
  const Ag = Acv
  const Ig = (t * lwmm ** 3) / 12                          // mm⁴ (about the wall's strong axis)
  const sigma = (i.Pu ?? 0) * 1000 / Ag
    + (i.Mu ?? 0) * 1e6 * (lwmm / 2) / Math.max(Ig, 1)     // MPa
  const boundaryElement = sigma > 0.2 * i.fc

  const notes: string[] = []
  if (!capOK) notes.push(`Web shear stress exceeds the §418.10.4.4 cap φ·0.83·Acv·√f′c = ${(PHI_SHEAR * VnCap).toFixed(0)} kN — thicken the wall or add a pier.`)
  if (twoCurtains) notes.push('Two curtains of reinforcement required (Vu > 0.17·Acv·λ√f′c or t ≥ 250 mm, §418.10.2.2).')
  else notes.push('Single curtain permitted (low shear, t < 250 mm).')
  if (aspect <= 2.0) notes.push('Squat wall (hw/ℓw ≤ 2): vertical ratio ρℓ ≥ ρt (§418.10.4.3).')
  if (boundaryElement) notes.push('Extreme-fibre stress > 0.2 f′c → special boundary elements indicated (§418.10.6.2); detail confined boundary zones.')
  notes.push('Distributed web steel governs in-plane shear; flexural boundary reinforcement is designed separately.')

  return {
    Acv, aspect, alphaC, Vc, Vn, phiVn, VnCap, shearOK, capOK, twoCurtains,
    horiz: { rhoReq: rhoTreq, rho: rhoT, spacing: spacingFrom(rhoT), usedMin: rhoTreq <= RHO_MIN + 1e-12 },
    vert: { rhoReq: rhoLreq, rho: rhoL, spacing: spacingFrom(rhoL), usedMin: rhoLreq <= RHO_MIN + 1e-12 },
    sMax, boundaryElement, notes,
  }
}
