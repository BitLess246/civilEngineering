import { compact, positive, nonNegative, effectiveDepth } from './inputGuards'
// ─────────────────────────────────────────────────────────────────────────
// Circular RC water tank — wall design (permissible-stress / working-stress).
// Liquid-retaining crack-control philosophy of IS 3370 / ACI 350.
//   Hydrostatic pressure at depth z:  p = γw·z
//   Hoop (ring) tension per unit height (membrane):  T(z) = γw·z·D/2   → max at base
//   Vertical moment (wall fixed at base): the CYLINDRICAL SHELL solution, not a
//   free cantilever — see `cylinderWallFixedBase`. A closed ring cannot bow out
//   without stretching its hoops, so most of the pressure goes round the ring
//   and the base moment is a fraction of γw·H³/6 (≈ 1/9 of it on a 4 m × ⌀10 m
//   × 250 wall; PCA, Circular Concrete Tanks without Prestressing, Table A-7).
//   Hoop steel:   As = T / σst         Vertical steel:  As = M0 / (σst·j·d)
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

/**
 * A cylindrical wall fixed at its base and free at its top, under hydrostatic
 * pressure: thin-shell theory (Timoshenko & Woinowsky-Krieger, Theory of Plates
 * and Shells §117 — the solution the PCA tank tables tabulate).
 *
 * With w the outward deflection and x the height above the base, the wall is a
 * beam on an elastic foundation whose springs are its own hoops:
 *   D·w'''' + (E·t/a²)·w = γw·(H − x),  D = E·t³/12(1−ν²),  β⁴ = 3(1−ν²)/(a·t)².
 * Writing u = w·E·t/(γw·a²) takes E out of it:
 *   u'''' + 4β⁴u = 4β⁴(H − x),  u = (H − x) + Σ Cₖ·φₖ(x),
 * with φₖ the decaying pairs e^(−βx)(cos, sin)βx from the base and
 * e^(−β(H−x))(cos, sin)β(H−x) from the top — each small where the other end is,
 * so the 4×4 system for Cₖ stays conditioned however tall the wall.
 * Base fixed (u = u' = 0), top free (M = Q = 0). Then
 *   M = −γw·u''/(4β⁴),  Q = −γw·u'''/(4β⁴),  N_θ = γw·a·u.
 *
 * Geometry m except `t` mm; kN, kN·m per metre run. Moments are signed with
 * tension on the WATER face negative — the base moment is.
 */
export interface CylinderWall {
  /** β, 1/m, and the shape parameter H²/(D·t) the PCA tables are entered with. */
  beta: number; shape: number
  /** Base moment, kN·m/m (tension on the water face), and its coefficient on γw·H³. */
  M0: number; coefM0: number
  /** Largest span moment (tension on the OUTER face), kN·m/m, and its height above the base, m. */
  Mspan: number; xSpan: number
  /** Largest hoop tension, kN/m, and its height above the base, m. */
  Tmax: number; xT: number
  /** Base shear, kN/m. */
  Q0: number
  /** M, Q and N_θ at height x above the base. */
  at(x: number): { M: number; Q: number; N: number }
}

export function cylinderWallFixedBase(H: number, D: number, tMm: number, nu = 0.2, gammaW = GAMMA_W): CylinderWall {
  const a = D / 2, t = tMm / 1000
  const beta = Math.pow(3 * (1 - nu * nu), 0.25) / Math.sqrt(a * t)
  // s-derivatives 0…3 of e^(−s)cos s and e^(−s)sin s
  const ec = (s: number, n: number) => { const e = Math.exp(-s), c = Math.cos(s), sn = Math.sin(s)
    return e * [c, -(c + sn), 2 * sn, 2 * (c - sn)][n] }
  const es = (s: number, n: number) => { const e = Math.exp(-s), c = Math.cos(s), sn = Math.sin(s)
    return e * [sn, c - sn, -2 * c, 2 * (c + sn)][n] }
  const phi = (k: number, x: number, n: number) => k < 2
    ? beta ** n * (k === 0 ? ec : es)(beta * x, n)
    : (-beta) ** n * (k === 2 ? ec : es)(beta * (H - x), n)
  // rows: u(0) = 0, u'(0) = 0, u''(H) = 0, u'''(H) = 0 — the particular part moved right
  const A = ([[0, 0, -H], [0, 1, 1], [H, 2, 0], [H, 3, 0]] as const)
    .map(([x, n, rhs]) => [phi(0, x, n), phi(1, x, n), phi(2, x, n), phi(3, x, n), rhs])
  for (let i = 0; i < 4; i++) {
    let p = i
    for (let j = i + 1; j < 4; j++) if (Math.abs(A[j][i]) > Math.abs(A[p][i])) p = j
    ;[A[i], A[p]] = [A[p], A[i]]
    for (let j = 0; j < 4; j++) if (j !== i) {
      const f = A[j][i] / A[i][i]
      for (let k = i; k < 5; k++) A[j][k] -= f * A[i][k]
    }
  }
  const C = A.map((r, i) => r[4] / r[i])
  const u = (x: number, n: number) => (n === 0 ? H - x : n === 1 ? -1 : 0) + C.reduce((s, c, k) => s + c * phi(k, x, n), 0)
  const k4 = 4 * beta ** 4
  const at = (x: number) => ({ M: (-gammaW * u(x, 2)) / k4, Q: (-gammaW * u(x, 3)) / k4, N: gammaW * a * u(x, 0) })
  let Mspan = 0, xSpan = 0, Tmax = 0, xT = 0
  const steps = 400
  for (let i = 0; i <= steps; i++) {
    const x = (H * i) / steps, r = at(x)
    if (r.M > Mspan) { Mspan = r.M; xSpan = x }
    if (r.N > Tmax) { Tmax = r.N; xT = x }
  }
  const base = at(0)
  return { beta, shape: (H * H) / (D * t), M0: base.M, coefM0: base.M / (gammaW * H ** 3), Mspan, xSpan, Tmax, xT, Q0: base.Q, at }
}

export interface CircularTankResult {
  T: number            // max hoop tension at base, kN/m
  /** Base moment from the fixed-base shell (magnitude; tension on the water face), kN·m/m. */
  M: number
  /** What a free cantilever would give, γw·H³/6 — shown beside M so the ring's share reads. */
  Mcantilever: number
  /** The shell solution itself: span moment, hoop distribution, coefficients. */
  shell: CylinderWall
  d: number            // effective depth, mm
  hoopAs: number; hoopSpacing: number      // ring steel, mm²/m + spacing
  vertAs: number; vertSpacing: number      // vertical steel, mm²/m + spacing
  /**
   * Whether the bar size can supply the steel at all: spacing is floored at
   * 50 mm, so a demand beyond 1000·Ab/50 was once reported as "⌀ @ 50" while
   * providing less than it asked for. False names a bigger bar or a thicker wall.
   */
  steelFits: boolean
  fct: number          // concrete tensile stress under hoop tension, MPa
  thicknessOK: boolean
  freeboardOK: boolean
  /**
   * Why this is not a tank wall — empty when it is one.
   *
   * Both verdicts are ANDed with this being empty, and `thicknessOK` in
   * particular needed it. That check is `fct ≤ sigmaCt` with
   * fct = T/(1000·t + (n−1)·As): a NEGATIVE t flips the denominator, so fct
   * comes out negative and sails under the limit. A wall of t = −250 mm
   * therefore reported `thicknessOK: true` at an effective depth of −125 mm.
   */
  inputNotes: string[]
}

/**
 * Design a circular tank wall (per metre height/width). `sigmaSt` is the
 * permissible steel tensile stress (crack control); `sigmaCt` the permissible
 * concrete direct tension; `fc` sets the modular ratio.
 */
/** The fields `tankInputNotes` reads. Geometry m, section mm, stress MPa. */
export type TankInputs = {
  H: number; D: number; t: number; freeboard?: number
  fc: number; sigmaSt?: number; sigmaCt?: number
  cover: number; barDia: number; gammaW?: number
}

/**
 * Geometry and permissible stresses that must be physical before the hoop and
 * cantilever algebra means anything.
 *
 * Measured on a 4 m × ⌀10 m tank, t 250, f'c 28, cover 40, ⌀16 — every one of
 * these reported BOTH `thicknessOK` and `freeboardOK` true:
 *
 *   t = −250      d = −125 mm; fct's denominator flips sign and "passes"
 *   H = −4        hoopAs = −1509 mm² — negative steel
 *   sigmaSt = 0   hoopAs = Infinity
 *   cover = −40   d 202 → 282 mm
 *   f'c = 0, H = 0, D = 0
 */
export function tankInputNotes(p: TankInputs): string[] {
  return compact([
    positive(p.H, 'water depth H'),
    positive(p.D, 'tank diameter D'),
    positive(p.t, 'wall thickness t'),
    positive(p.fc, "concrete strength f'c"),
    p.sigmaSt != null ? positive(p.sigmaSt, 'permissible steel stress σst') : null,
    p.sigmaCt != null ? positive(p.sigmaCt, 'permissible concrete tension σct') : null,
    p.gammaW != null ? positive(p.gammaW, 'water unit weight γw') : null,
    positive(p.barDia, 'bar Ø'),
    nonNegative(p.cover, 'clear cover'),
    p.freeboard != null ? nonNegative(p.freeboard, 'freeboard') : null,
    effectiveDepth(p.t, p.cover, 0, p.barDia, 'cover and half a bar'),
  ])
}

export function designCircularTank(p: TankInputs): CircularTankResult {
  const inputNotes = tankInputNotes(p)
  const real = inputNotes.length === 0
  const gammaW = p.gammaW ?? GAMMA_W
  const sigmaSt = p.sigmaSt ?? 130
  const sigmaCt = p.sigmaCt ?? 1.3
  const T = hoopTension(p.H, p.D, undefined, gammaW)        // kN/m
  const Mcantilever = wallCantileverMoment(p.H, gammaW)
  const shell = cylinderWallFixedBase(p.H, p.D, Math.max(p.t, 1), 0.2, gammaW)
  const M = real ? Math.abs(shell.M0) : Mcantilever          // kN·m/m
  const d = Math.max(p.t - p.cover - p.barDia / 2, 0.5 * p.t)

  const hoopAs = (T * 1000) / sigmaSt                       // N / (N/mm²) = mm²/m
  const vertAs = (M * 1e6) / (sigmaSt * J * d)              // N·mm / (N/mm² · mm) = mm²/m

  const Ec = 4700 * Math.sqrt(Math.max(p.fc, 1))
  const n = 200000 / Ec
  const fct = (T * 1000) / (1000 * p.t + (n - 1) * hoopAs)  // MPa

  const Ab = (Math.PI / 4) * p.barDia ** 2
  const sMax = Math.min(3 * p.t, 300)                       // tighter cap for liquid tightness
  const spacing = (As: number) => As > 0 ? Math.max(50, Math.min(sMax, Math.floor((1000 * Ab) / As / 5) * 5)) : sMax
  const hoopSpacing = spacing(hoopAs), vertSpacing = spacing(vertAs)
  const fits = (As: number, s: number) => (1000 * Ab) / s >= As * (1 - 1e-9)

  return {
    T, M, Mcantilever, shell, d,
    hoopAs, hoopSpacing,
    vertAs, vertSpacing,
    steelFits: real && fits(hoopAs, hoopSpacing) && fits(vertAs, vertSpacing),
    fct, thicknessOK: real && fct <= sigmaCt,
    freeboardOK: real && (p.freeboard ?? 0.3) >= 0.3,
    inputNotes,
  }
}
