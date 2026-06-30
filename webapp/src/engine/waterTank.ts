// ─────────────────────────────────────────────────────────────────────────
// Circular RC water tank — wall design (permissible-stress / working-stress).
// Liquid-retaining crack-control philosophy of IS 3370 / ACI 350.
//   Hydrostatic pressure at depth z:  p = γw·z
//   Hoop (ring) tension per unit height (membrane):  T(z) = γw·z·D/2   → max at base
//   Vertical cantilever moment (wall fixed at base):  M = γw·H³/6      per metre width
//   Hoop steel:   As = T / σst         Vertical steel:  As = M / (σst·j·d)
//   Wall thickness adequacy (no crack): fct = T / (Ac + (n−1)·As) ≤ σct
// where σst = permissible steel tensile stress (≈130 MPa, crack control), σct =
// permissible concrete direct tension, n = modular ratio, j ≈ 0.87.
// Units: γw kN/m³; H,D,z m; t/d/cover/db mm; stresses MPa; T kN/m; M kN·m/m; As mm²/m.
// ─────────────────────────────────────────────────────────────────────────

const GAMMA_W = 9.81          // kN/m³, water
const J = 0.87               // lever-arm factor (working stress)

/** Hoop (ring) tension per unit height at depth z (default base z = H), kN/m. */
export function hoopTension(H: number, D: number, z?: number, gammaW = GAMMA_W): number {
  return (gammaW * (z ?? H) * D) / 2
}

/** Vertical cantilever moment at the wall base (triangular hydrostatic load), kN·m/m. */
export function wallCantileverMoment(H: number, gammaW = GAMMA_W): number {
  return (gammaW * H ** 3) / 6
}

export interface CircularTankResult {
  T: number            // max hoop tension at base, kN/m
  M: number            // base cantilever moment, kN·m/m
  d: number            // effective depth, mm
  hoopAs: number; hoopSpacing: number      // ring steel, mm²/m + spacing
  vertAs: number; vertSpacing: number      // vertical steel, mm²/m + spacing
  fct: number          // concrete tensile stress under hoop tension, MPa
  thicknessOK: boolean
  freeboardOK: boolean
}

/**
 * Design a circular tank wall (per metre height/width). `sigmaSt` is the
 * permissible steel tensile stress (crack control); `sigmaCt` the permissible
 * concrete direct tension; `fc` sets the modular ratio.
 */
export function designCircularTank(p: {
  H: number; D: number; t: number; freeboard?: number;
  fc: number; sigmaSt?: number; sigmaCt?: number;
  cover: number; barDia: number; gammaW?: number;
}): CircularTankResult {
  const gammaW = p.gammaW ?? GAMMA_W
  const sigmaSt = p.sigmaSt ?? 130
  const sigmaCt = p.sigmaCt ?? 1.3
  const T = hoopTension(p.H, p.D, undefined, gammaW)        // kN/m
  const M = wallCantileverMoment(p.H, gammaW)              // kN·m/m
  const d = Math.max(p.t - p.cover - p.barDia / 2, 0.5 * p.t)

  const hoopAs = (T * 1000) / sigmaSt                       // N / (N/mm²) = mm²/m
  const vertAs = (M * 1e6) / (sigmaSt * J * d)              // N·mm / (N/mm² · mm) = mm²/m

  const Ec = 4700 * Math.sqrt(Math.max(p.fc, 1))
  const n = 200000 / Ec
  const fct = (T * 1000) / (1000 * p.t + (n - 1) * hoopAs)  // MPa

  const Ab = (Math.PI / 4) * p.barDia ** 2
  const sMax = Math.min(3 * p.t, 300)                       // tighter cap for liquid tightness
  const spacing = (As: number) => As > 0 ? Math.max(50, Math.min(sMax, Math.floor((1000 * Ab) / As / 5) * 5)) : sMax

  return {
    T, M, d,
    hoopAs, hoopSpacing: spacing(hoopAs),
    vertAs, vertSpacing: spacing(vertAs),
    fct, thicknessOK: fct <= sigmaCt,
    freeboardOK: (p.freeboard ?? 0.3) >= 0.3,
  }
}
