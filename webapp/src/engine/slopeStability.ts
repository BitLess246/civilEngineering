// ─────────────────────────────────────────────────────────────────────────
// Slope stability by the METHOD OF SLICES — global (circular) failure surface
// factor of safety, the check `infiniteSlopeFS` (geotech.ts) can't cover.
//
// Three limit-equilibrium methods on the same set of vertical slices:
//   • Fellenius / Ordinary (OMS) — direct, ignores inter-slice forces
//        FS = Σ[c·l + (W·cosα − u·l)·tanφ] / Σ[W·sinα]
//   • Bishop's Simplified — horizontal inter-slice forces, iterative
//        FS = Σ[ (c·b + (W − u·b)·tanφ) / mα ] / Σ[W·sinα],
//        mα = cosα + sinα·tanφ/FS
//   • Janbu's Simplified — force equilibrium + empirical f0 correction
//        FS = f0·Σ[ (c·b + (W − u·b)·tanφ) / nα ] / Σ[W·tanα],
//        nα = cosα·mα
// with a grid search for the critical (minimum-FS) circle.
//
// Sign convention: base inclination α = asin((x − xc)/R); α > 0 on the toe
// (down-slope) side so W·sinα is the driving component. Per metre run.
// Units: geometry m, angles DEG (input), cohesion c kPa, γ kN/m³, forces kN/m.
// Refs: Bishop (1955); Janbu (1954/1973); Das, Principles of Geotechnical Eng.
// ─────────────────────────────────────────────────────────────────────────

const rad = (deg: number) => (deg * Math.PI) / 180
const GAMMA_W = 9.81 // kN/m³

export interface SlopeSoil {
  c: number          // effective cohesion, kPa
  phiDeg: number     // effective friction angle, degrees
  gamma: number      // moist/bulk unit weight, kN/m³
}

export interface Pt { x: number; y: number }
export interface SlipCircle { xc: number; yc: number; R: number }

/** One vertical slice of the sliding mass. */
export interface Slice {
  x: number          // slice mid-x, m
  b: number          // width, m
  h: number          // mid-height (ground → arc), m
  alpha: number      // base inclination, rad
  W: number          // weight, kN/m
  u: number          // pore pressure on the base, kPa
  l: number          // base length b/cosα, m
}

/** Linear interpolation of a left→right polyline surface at x (clamped ends). */
export function surfaceY(poly: Pt[], x: number): number {
  if (x <= poly[0].x) return poly[0].y
  const last = poly[poly.length - 1]
  if (x >= last.x) return last.y
  for (let i = 1; i < poly.length; i++) {
    if (x <= poly[i].x) {
      const a = poly[i - 1], b = poly[i]
      const t = (x - a.x) / (b.x - a.x)
      return a.y + t * (b.y - a.y)
    }
  }
  return last.y
}

export interface WaterModel {
  /** Pore-pressure ratio ru = u/(γ·h); constant over the surface. */
  ru?: number
  /** Piezometric line (left→right); u = γw·(yWT − yBase) where positive. */
  table?: Pt[]
}

/**
 * Discretise the mass bounded above by `ground` and below by the LOWER arc of
 * `circle` into `n` vertical slices. Returns null when the circle does not cut
 * a valid mass out of the ground (no daylighting entry/exit, or a slice runs
 * inverted). Entry/exit are the outer roots of g(x) = ground(x) − yArc(x).
 */
export function sliceCircle(ground: Pt[], circle: SlipCircle, n: number, water?: WaterModel, gamma = 0): Slice[] | null {
  const { xc, yc, R } = circle
  const yArc = (x: number) => yc - Math.sqrt(Math.max(0, R * R - (x - xc) ** 2))
  const g = (x: number) => surfaceY(ground, x) - yArc(x)   // >0 ⇒ soil above the arc
  const xL = xc - R, xR = xc + R
  // scan for the sign-change roots of g on [xL, xR]
  const N = 400, roots: number[] = []
  let xp = xL, gp = g(xL)
  for (let i = 1; i <= N; i++) {
    const x = xL + ((xR - xL) * i) / N, gc = g(x)
    if (gp === 0) roots.push(xp)
    else if (gp * gc < 0) {
      // bisection
      let a = xp, bb = x
      for (let k = 0; k < 40; k++) {
        const mid = (a + bb) / 2
        if (g(a) * g(mid) <= 0) bb = mid; else a = mid
      }
      roots.push((a + bb) / 2)
    }
    xp = x; gp = gc
  }
  if (roots.length < 2) return null
  const x0 = roots[0], x1 = roots[roots.length - 1]
  if (!(x1 - x0 > 1e-6)) return null
  // the mid-span must sit inside the mass (guards against picking a chord above ground)
  if (g((x0 + x1) / 2) <= 0) return null

  const b = (x1 - x0) / n
  const slices: Slice[] = []
  for (let i = 0; i < n; i++) {
    const x = x0 + b * (i + 0.5)
    const s = (x - xc) / R
    if (Math.abs(s) >= 1) return null                     // slice base past the circle edge
    const alpha = Math.asin(s)
    const yTop = surfaceY(ground, x), yBase = yArc(x)
    const h = yTop - yBase
    if (!(h > 0)) return null                             // inverted slice ⇒ invalid circle
    const l = b / Math.cos(alpha)
    let u = 0
    if (water?.ru) u = water.ru * gamma * h
    else if (water?.table) u = Math.max(0, GAMMA_W * (surfaceY(water.table, x) - yBase))
    slices.push({ x, b, h, alpha, W: gamma * b * h, u, l })
  }
  return slices
}

export interface MethodResult {
  FS: number
  converged: boolean
  iterations: number
  driving: number    // Σ W·sinα (Fellenius/Bishop) — for reporting
  resisting: number  // numerator Σ at the solution
}

const drivingMoment = (sl: Slice[]) => sl.reduce((s, x) => s + x.W * Math.sin(x.alpha), 0)

/**
 * Orient the slice set so the net driving Σ W·sinα is non-negative. Mirroring
 * x (α → −α) is an exact symmetry of the plane mechanics, so this makes every
 * method orientation-agnostic — the slope may descend either way.
 */
function orient(sl: Slice[]): Slice[] {
  return drivingMoment(sl) >= 0 ? sl : sl.map((x) => ({ ...x, alpha: -x.alpha }))
}

/** Fellenius / Ordinary Method of Slices — non-iterative. */
export function felleniusFS(slIn: Slice[], soil: SlopeSoil): MethodResult {
  const sl = orient(slIn)
  const tanphi = Math.tan(rad(soil.phiDeg))
  const driving = drivingMoment(sl)
  const resisting = sl.reduce((s, x) => s + soil.c * x.l + (x.W * Math.cos(x.alpha) - x.u * x.l) * tanphi, 0)
  return { FS: driving > 0 ? resisting / driving : Infinity, converged: true, iterations: 0, driving, resisting }
}

/** Bishop's Simplified — iterate mα(FS) to convergence. */
export function bishopFS(slIn: Slice[], soil: SlopeSoil, tol = 1e-6, maxIter = 100): MethodResult {
  const sl = orient(slIn)
  const tanphi = Math.tan(rad(soil.phiDeg))
  const driving = drivingMoment(sl)
  if (!(driving > 0)) return { FS: Infinity, converged: true, iterations: 0, driving, resisting: 0 }
  let FS = Math.max(0.5, felleniusFS(sl, soil).FS), it = 0, resisting = 0
  for (; it < maxIter; it++) {
    resisting = 0
    for (const x of sl) {
      const mAlpha = Math.cos(x.alpha) + (Math.sin(x.alpha) * tanphi) / FS
      resisting += (soil.c * x.b + (x.W - x.u * x.b) * tanphi) / mAlpha
    }
    const next = resisting / driving
    if (Math.abs(next - FS) < tol) { FS = next; it++; break }
    FS = next
  }
  return { FS, converged: it < maxIter, iterations: it, driving, resisting }
}

/**
 * Janbu simplified correction factor f0 for a c-φ soil (Janbu 1973 chart fit):
 * f0 = 1 + b1·[d/L − 1.4·(d/L)²], b1 = 0.5 (c-φ), 0.31 (φ-only), 0.69 (c-only).
 * d = max slip depth below the chord joining crest/toe exits, L = chord length.
 */
export function janbuF0(sl: Slice[], soil: SlopeSoil): number {
  const b1 = soil.c > 0 && soil.phiDeg > 0 ? 0.5 : soil.c > 0 ? 0.69 : 0.31
  const x0 = sl[0].x - sl[0].b / 2, x1 = sl[sl.length - 1].x + sl[sl.length - 1].b / 2
  const L = Math.hypot(x1 - x0, 0) || 1     // horizontal chord proxy (near-level crest/toe)
  const d = Math.max(...sl.map((s) => s.h)) // max mass depth as the slip-depth proxy
  const dL = Math.min(0.5, d / L)
  return 1 + b1 * (dL - 1.4 * dL * dL)
}

/** Janbu's Simplified — force equilibrium with the f0 correction. */
export function janbuFS(slIn: Slice[], soil: SlopeSoil, tol = 1e-6, maxIter = 100): MethodResult {
  const sl = orient(slIn)
  const tanphi = Math.tan(rad(soil.phiDeg))
  const driving = sl.reduce((s, x) => s + x.W * Math.tan(x.alpha), 0)
  if (!(driving > 0)) return { FS: Infinity, converged: true, iterations: 0, driving, resisting: 0 }
  const f0 = janbuF0(sl, soil)
  let FS = Math.max(0.5, felleniusFS(sl, soil).FS), it = 0, resisting = 0
  for (; it < maxIter; it++) {
    resisting = 0
    for (const x of sl) {
      const mAlpha = Math.cos(x.alpha) + (Math.sin(x.alpha) * tanphi) / FS
      const nAlpha = Math.cos(x.alpha) * mAlpha
      resisting += (soil.c * x.b + (x.W - x.u * x.b) * tanphi) / nAlpha
    }
    const next = (f0 * resisting) / driving
    if (Math.abs(next - FS) < tol) { FS = next; it++; break }
    FS = next
  }
  return { FS, converged: it < maxIter, iterations: it, driving, resisting }
}

export interface CircleResult {
  circle: SlipCircle
  slices: Slice[]
  fellenius: MethodResult
  bishop: MethodResult
  janbu: MethodResult
  f0: number
}

/** Analyse one trial circle with all three methods. Null when invalid. */
export function analyzeCircle(ground: Pt[], soil: SlopeSoil, circle: SlipCircle, opts?: { n?: number; water?: WaterModel }): CircleResult | null {
  const sl = sliceCircle(ground, circle, opts?.n ?? 30, opts?.water, soil.gamma)
  if (!sl) return null
  return {
    circle, slices: sl,
    fellenius: felleniusFS(sl, soil),
    bishop: bishopFS(sl, soil),
    janbu: janbuFS(sl, soil),
    f0: janbuF0(sl, soil),
  }
}

export interface SearchOpts {
  n?: number                 // slices per circle (default 30)
  water?: WaterModel
  /** Circle-centre grid, m. Defaults bracket a typical slope above the crest. */
  xc?: { min: number; max: number; step: number }
  yc?: { min: number; max: number; step: number }
  /** Radii, m. Default: sweep so the arc reaches from above the toe. */
  R?: { min: number; max: number; step: number }
}

export interface SearchResult {
  critical: CircleResult     // minimum Bishop FS
  FS: number                 // its Bishop FS
  evaluated: number          // valid circles tried
}

/**
 * Grid search for the critical circle (minimum Bishop FS). When the grids are
 * omitted, they are auto-bracketed from the ground extent: centres span the
 * plan width above the crest and radii from a fraction of the slope height up
 * to the full ground width.
 */
export function searchCriticalCircle(ground: Pt[], soil: SlopeSoil, opts?: SearchOpts): SearchResult | null {
  const xs = ground.map((p) => p.x), ys = ground.map((p) => p.y)
  const xmin = Math.min(...xs), xmax = Math.max(...xs)
  const ymin = Math.min(...ys), ymax = Math.max(...ys)
  const W = xmax - xmin, Hh = ymax - ymin
  const xcG = opts?.xc ?? { min: xmin + 0.2 * W, max: xmax - 0.1 * W, step: Math.max(W / 12, 0.5) }
  const ycG = opts?.yc ?? { min: ymax, max: ymax + 1.5 * Math.max(Hh, W * 0.4), step: Math.max(Hh / 6, 0.5) }
  const RG = opts?.R ?? { min: 0.6 * Math.max(Hh, 1), max: 1.6 * Math.hypot(W, Hh), step: Math.max(Hh / 6, 0.5) }

  let best: CircleResult | null = null, evaluated = 0
  for (let xc = xcG.min; xc <= xcG.max + 1e-9; xc += xcG.step)
    for (let yc = ycG.min; yc <= ycG.max + 1e-9; yc += ycG.step)
      for (let R = RG.min; R <= RG.max + 1e-9; R += RG.step) {
        const res = analyzeCircle(ground, soil, { xc, yc, R }, { n: opts?.n ?? 30, water: opts?.water })
        if (!res || !res.bishop.converged || !Number.isFinite(res.bishop.FS)) continue
        // require a real slip (non-degenerate driving)
        if (res.bishop.driving <= 1e-6) continue
        evaluated++
        if (!best || res.bishop.FS < best.bishop.FS) best = res
      }
  if (!best) return null
  return { critical: best, FS: best.bishop.FS, evaluated }
}
