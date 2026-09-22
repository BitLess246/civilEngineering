// ─────────────────────────────────────────────────────────────────────────
// INFLUENCE LINES FOR BEAMS — continuous beams with internal hinges
// (Gerber / hinged-construction beams), statically determinate.
//
// MODEL: a beam of length L carries any number of supports (pin or roller,
// vertical reaction each — all loads are vertical) and any number of internal
// hinges. Each hinge splits the beam into rigid bodies; a hinge transmits
// shear only (moment release). With S supports and H hinges the beam is
// determinate and stable when S = H + 2 (H + 1 rigid bodies, two equilibrium
// equations each, S + H unknowns: reactions + hinge shears). The solver
// assembles those equations per body and eliminates; a singular system is an
// unstable mechanism (a body held at fewer points than it needs) and is
// reported, never silently solved.
//
// INFLUENCE LINES: for a unit load (1 kN, down) at station ξ the same solve
// gives every reaction and hinge shear. Internal forces then follow from the
// free body LEFT of the section — hinge forces between bodies left of the
// cut cancel, so only external forces enter:
//     V(x₀) = Σ F↑ left of x₀  (− the unit load when it stands left of x₀)
//     M(x₀) = Σ moments of those forces about x₀ (sagging positive)
// Reactions are linear in ξ, kinked only at hinges; the shear and moment
// lines add one more break at the section itself (the load crossing it — the
// shear line jumps there). Sampling exactly those stations gives the EXACT
// piecewise-linear line; nothing between them needs a ordinate.
//
// PLACEMENT: given the line, the classic questions answer themselves. The
// regions where the line has the wanted sign are where a uniform patch
// belongs ("total length to load"), loading them gives w·∫IL; a concentrated
// load goes on the extreme ordinate; dead load always covers the whole
// span, so its effect is w_dead × (total signed area). Every contribution is
// kept separate so live-only, dead-only and combined values are all readable.
//
// UNITS: positions in m; ordinates in kN per kN (reactions, shear) or
// kN·m per kN (moments).
// ─────────────────────────────────────────────────────────────────────────

export type SupportKind = 'pin' | 'roller'

export interface BeamSupport { x: number; kind: SupportKind }

export interface BeamInput {
  length: number
  supports: BeamSupport[]
  hinges: number[]
}

/** The quantity whose influence line is traced. */
export type Effect =
  | { kind: 'reaction'; support: number }   // index into supports
  | { kind: 'shear'; x: number }            // section position
  | { kind: 'moment'; x: number }
  | { kind: 'hinge'; hinge: number }        // index into hinges (shear it transmits)

export interface ILPoint {
  x: number
  /** Ordinate: kN/kN for reactions and shear, kN·m/kN for moments. */
  v: number
  /** Side note at a jump — e.g. the two shear values just left / just right of the section. */
  tag?: string
}

export interface BeamModel {
  length: number
  supports: BeamSupport[]
  hinges: number[]
  /** Rigid bodies between hinges, left → right. */
  bodies: { a: number; b: number }[]
  /** Which body carries each support's reaction (a hinge-sized support belongs to the left body). */
  supportBody: number[]
  problems: string[]
}

// ── validation & model building ───────────────────────────────────────────

export function validateBeamInput(p: BeamInput): string[] {
  const out: string[] = []
  const S = p.supports.length, H = p.hinges.length
  if (!(p.length > 0)) out.push(`Beam length must be greater than zero (got ${p.length})`)
  if (p.length > 0) {
    p.supports.forEach((s, i) => {
      if (!(s.x >= 0 && s.x <= p.length)) out.push(`Support ${i + 1} sits outside the beam (x = ${s.x})`)
    })
    p.hinges.forEach((h, i) => {
      if (!(h > 0 && h < p.length)) out.push(`Hinge ${i + 1} must be strictly inside the span (x = ${h})`)
    })
  }
  const dupS = [...p.supports.map((s) => s.x)].sort((a, b) => a - b)
  dupS.forEach((x, i) => { if (i > 0 && Math.abs(x - dupS[i - 1]) < 1e-9) out.push(`Two supports share x = ${x} — move or delete one`) })
  const dupH = [...p.hinges].sort((a, b) => a - b)
  dupH.forEach((x, i) => { if (i > 0 && Math.abs(x - dupH[i - 1]) < 1e-9) out.push(`Two hinges share x = ${x} — move or delete one`) })
  if (S < 1) out.push('The beam needs at least one support')
  if (out.length === 0 && S !== H + 2)
    out.push(
      `A determinate hinged beam needs supports = hinges + 2 — got ${S} support${S === 1 ? '' : 's'} for ${H} hinge${H === 1 ? '' : 's'}. ` +
      (S > H + 2 ? 'It would be indeterminate: remove a support or add a hinge.' : 'It would be a mechanism: add a support or remove a hinge.'),
    )
  return out
}

export function buildBeam(p: BeamInput): BeamModel {
  const problems = validateBeamInput(p)
  if (problems.length) throw new Error(problems[0])
  const hinges = [...p.hinges].sort((a, b) => a - b)
  const bodies: { a: number; b: number }[] = []
  let a = 0
  for (const h of hinges) { bodies.push({ a, b: h }); a = h }
  bodies.push({ a, b: p.length })
  // Support at exactly a hinge position joins the body on its LEFT.
  const supportBody = p.supports.map((s) => {
    const k = bodies.findIndex((bd) => s.x > bd.a && s.x <= bd.b)
    return k === -1 ? 0 : k
  })
  return { length: p.length, supports: p.supports, hinges, bodies, supportBody, problems }
}

// ── the solve ─────────────────────────────────────────────────────────────

/** Dense Gaussian elimination with partial pivoting (same numerics as the
 *  truss engine); throws on a singular system = unstable mechanism. */
function solveLinear(A: number[][], b: number[]): number[] {
  const N = b.length
  const M = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < N; col++) {
    let piv = col
    for (let r = col + 1; r < N; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r
    if (Math.abs(M[piv][col]) < 1e-10) throw new Error('Unstable configuration — a rigid body is not held against rotation; move the hinges or supports')
    if (piv !== col) { const t = M[piv]; M[piv] = M[col]; M[col] = t }
    const d = M[col][col]
    for (let r = col + 1; r < N; r++) {
      const f = M[r][col] / d
      if (f === 0) continue
      for (let c = col; c <= N; c++) M[r][c] -= f * M[col][c]
    }
  }
  const x = new Array<number>(N).fill(0)
  for (let r = N - 1; r >= 0; r--) {
    let s = M[r][N]
    for (let c = r + 1; c < N; c++) s -= M[r][c] * x[c]
    x[r] = s / M[r][r]
  }
  return x
}

export interface UnitState { reactions: number[]; hingeShears: number[] }

/**
 * Reactions and hinge shears for 1 kN down at ξ. Unknown order: the S
 * reactions, then the H hinge shears (H = upward force on the RIGHT body
 * from the left body). Two equations per rigid body: ΣFy and ΣM about its
 * left edge. A load standing exactly on a hinge joins the LEFT body by
 * default; `side: 'right'` puts it on the body after the boundary instead —
 * the one-sided limits the hinge-shear influence line jumps between.
 */
export function solveUnitAt(m: BeamModel, xi: number, side: 'left' | 'right' = 'left'): UnitState {
  const S = m.supports.length, H = m.hinges.length, N = S + H
  const A: number[][] = []
  const b: number[] = []
  // body holding the load: (a, b] counting from the left; 'right' claims the
  // body whose left edge the load stands on
  const kLoad = (() => {
    if (side === 'right') {
      const k = m.bodies.findIndex((bd) => xi >= bd.a && xi < bd.b)
      if (k !== -1) return k
    }
    const k = m.bodies.findIndex((bd) => xi > bd.a && xi <= bd.b)
    return k === -1 ? 0 : k
  })()
  m.bodies.forEach((bd, k) => {
    const fy = new Array<number>(N).fill(0)
    const mz = new Array<number>(N).fill(0)
    m.supports.forEach((s, i) => {
      if (m.supportBody[i] !== k) return
      fy[i] += 1
      mz[i] += s.x - bd.a
    })
    if (k > 0) fy[S + k - 1] += 1                       // hinge at the left edge pulls... pushes this body up when H > 0
    if (k < H) { fy[S + k] -= 1; mz[S + k] -= bd.b - bd.a }  // hinge at the right edge reacts with −H
    const loaded = k === kLoad
    A.push(fy, mz)
    b.push(loaded ? 1 : 0, loaded ? xi - bd.a : 0)
  })
  const x = solveLinear(A, b)
  return { reactions: x.slice(0, S), hingeShears: x.slice(S, S + H) }
}

// ── influence lines ───────────────────────────────────────────────────────

/**
 * Exact influence line of one effect, as ordered points. The line is
 * piecewise linear between them; a shear line carries BOTH one-sided values
 * at its section (tagged), drawn as the classical vertical jump.
 */
export function effectPoints(m: BeamModel, e: Effect): ILPoint[] {
  const st = (xi: number, side: 'left' | 'right' = 'left') => solveUnitAt(m, xi, side)
  const leftSum = (x0: number, s: UnitState) =>
    m.supports.reduce((acc, sp, i) => (sp.x < x0 ? acc + s.reactions[i] : acc), 0)

  if (e.kind === 'reaction' || e.kind === 'hinge') {
    const xs = stations(m)
    if (e.kind === 'reaction')
      return xs.map((x) => ({ x, v: st(x).reactions[e.support] }))
    // The hinge shear IS a section shear — it jumps when the load crosses the
    // hinge (the whole load suddenly hangs on the other body), so both
    // one-sided values get an ordinate, exactly like the section shear line.
    const hx = m.hinges[e.hinge]
    const pts: ILPoint[] = []
    for (const x of xs) {
      if (Math.abs(x - hx) < 1e-9) {
        pts.push({ x, v: st(x, 'left').hingeShears[e.hinge], tag: 'load just left of the hinge' })
        pts.push({ x, v: st(x, 'right').hingeShears[e.hinge], tag: 'load just right of the hinge' })
      } else {
        pts.push({ x, v: st(x).hingeShears[e.hinge] })
      }
    }
    return pts
  }
  const x0 = e.x
  const xs = [...new Set([...stations(m), x0])].sort((a, b) => a - b)
  if (e.kind === 'moment') {
    return xs.map((x) => {
      const s = st(x)
      const base = m.supports.reduce((acc, sp, i) => (sp.x < x0 ? acc + s.reactions[i] * (x0 - sp.x) : acc), 0)
      return { x, v: base - (x < x0 ? x0 - x : 0) }
    })
  }
  // shear — the section splits the load path; emit the jump honestly
  const pts: ILPoint[] = []
  for (const x of xs) {
    if (Math.abs(x - x0) < 1e-9) {
      pts.push({ x, v: leftSum(x0, st(x)) - 1, tag: 'just left of the section' })
      pts.push({ x, v: leftSum(x0, st(x)), tag: 'just right of the section' })
    } else {
      const s = st(x)
      pts.push({ x, v: leftSum(x0, s) - (x < x0 ? 1 : 0) })
    }
  }
  return pts
}

/** Stations worth an ordinate: ends, hinges, supports (collinear on the
 *  straight stretches, but they are the values a table wants to show). */
function stations(m: BeamModel): number[] {
  return [...new Set([0, ...m.hinges, ...m.supports.map((s) => s.x), m.length])].sort((a, b) => a - b)
}

// ── reading the lines ─────────────────────────────────────────────────────

const EPS = 1e-9

/** Ordinate at an arbitrary x — linear between points; exactly at a jump the
 *  first (left-limit) ordinate is returned. */
export function ilValueAt(pts: ILPoint[], x: number): number {
  if (x <= pts[0].x + EPS) return pts[0].v
  for (let k = 1; k < pts.length; k++) {
    if (x <= pts[k].x + EPS) {
      const A = pts[k - 1], B = pts[k]
      if (B.x - A.x < EPS) return B.v
      const t = (x - A.x) / (B.x - A.x)
      return A.v + t * (B.v - A.v)
    }
  }
  return pts[pts.length - 1].v
}

/** Exact ∫ IL dx over [a, b] — trapezoids, jumps carry zero width. */
export function ilAreaRange(pts: ILPoint[], a: number, b: number): number {
  const lo = Math.min(a, b), hi = Math.max(a, b)
  let sum = 0
  for (let k = 1; k < pts.length; k++) {
    const A = pts[k - 1], B = pts[k]
    const x0 = Math.max(A.x, lo), x1 = Math.min(B.x, hi)
    if (x1 - x0 < EPS) continue
    const va = A.x >= lo - EPS ? A.v : ilValueAt(pts, x0)
    const vb = B.x <= hi + EPS ? B.v : ilValueAt(pts, x1)
    sum += (va + vb) / 2 * (x1 - x0)
  }
  return sum
}

/** Signed area over the whole span — what a full-length uniform load w multiplies. */
export function ilTotalArea(pts: ILPoint[]): number {
  const a = pts[0].x, b = pts[pts.length - 1].x
  return ilAreaRange(pts, a, b)
}

export interface SignRegion { a: number; b: number; length: number; area: number }

/**
 * Contiguous spans where the line has the wanted sign, with exact signed
 * areas — the answer to "how much of the beam should the patch cover".
 * A region's area is ∫ v dx over it (so w·area is the effect of the patch).
 */
export function signRegions(pts: ILPoint[], sign: 1 | -1): SignRegion[] {
  const out: SignRegion[] = []
  let curA: number | null = null
  let curB = 0
  let curArea = 0
  const close = () => {
    if (curA != null) out.push({ a: curA, b: curB, length: curB - curA, area: curArea })
    curA = null
  }
  const push = (a: number, b: number, va: number, vb: number) => {
    const area = (va + vb) / 2 * (b - a)
    if (curA != null && Math.abs(a - curB) < 1e-7) { curB = b; curArea += area }
    else { close(); curA = a; curB = b; curArea = area }
  }
  for (let k = 1; k < pts.length; k++) {
    const A = pts[k - 1], B = pts[k]
    if (B.x - A.x < 1e-9) continue                      // the jump itself carries no length
    const fa = A.v * sign, fb = B.v * sign
    const sec = (v1: number, v2: number) => A.x + (B.x - A.x) * (v1 / (v1 - v2))
    if (fa > 0 && fb > 0) push(A.x, B.x, A.v, B.v)
    else if (fa > 0 && fb <= 0) push(A.x, fb < 0 ? sec(fa, fb) : B.x, A.v, fb < 0 ? 0 : B.v)
    else if (fa <= 0 && fb > 0) push(fa < 0 ? sec(fa, fb) : A.x, B.x, fa < 0 ? 0 : A.v, B.v)
  }
  close()
  return out.filter((r) => r.length > 1e-7 && Math.abs(r.area) > 1e-9)
}

/** Extreme ordinate of the wanted sign and where the unit load must stand. */
export function ilExtreme(pts: ILPoint[], sign: 1 | -1): { v: number; x: number; tag?: string } | null {
  let best: ILPoint | null = null
  for (const p of pts) {
    if (p.v * sign <= EPS) continue
    if (!best || (sign === 1 ? p.v > best.v : p.v < best.v)) best = p
  }
  return best ? { v: best.v, x: best.x, tag: best.tag } : null
}

// ── load placement (the classic questions) ────────────────────────────────

export interface LoadScenario {
  /** Uniform patches (w signed, kN/m, down positive). */
  udls: { a: number; b: number; w: number }[]
  /** Single concentrated load, kN, down positive. */
  point: { x: number; p: number } | null
}

/** What a scenario of patches + one point load produces in every reaction. */
export function reactionsUnder(m: BeamModel, sc: LoadScenario): number[] {
  return m.supports.map((_, i) => {
    const pts = effectPoints(m, { kind: 'reaction', support: i })
    let v = sc.udls.reduce((acc, u) => acc + u.w * ilAreaRange(pts, u.a, u.b), 0)
    if (sc.point) v += sc.point.p * ilValueAt(pts, sc.point.x)
    return v
  })
}

export interface Placement {
  /** Where a uniform patch of the wanted sign belongs. */
  regions: SignRegion[]
  /** Total patch length ("total length of beam which should be loaded"). */
  udlLength: number
  /** Effect of the patch: w · Σ area. */
  udlEffect: number
  /** Effect of the concentrated load on the extreme ordinate (null when the line never takes the wanted sign). */
  pointEffect: number | null
  pointX: number | null
  pointTag?: string
  /** udlEffect + pointEffect — the live-load result. */
  liveTotal: number
}

export function placeLoads(pts: ILPoint[], w: number, p: number, sign: 1 | -1): Placement {
  const regions = signRegions(pts, sign)
  const udlArea = regions.reduce((acc, r) => acc + r.area, 0)
  const udlEffect = w * udlArea
  const ext = ilExtreme(pts, sign)
  const pointEffect = ext ? p * ext.v : null
  return {
    regions,
    udlLength: regions.reduce((acc, r) => acc + r.length, 0),
    udlEffect,
    pointEffect,
    pointX: ext ? ext.x : null,
    pointTag: ext?.tag,
    liveTotal: udlEffect + (pointEffect ?? 0),
  }
}

// ── station lettering (A, B, C, D — the classic figure labels) ────────────

/** Key stations in order, lettered A, B, C… — ends, supports, hinges and the
 *  section of interest. The board-exam figure names fall out of this. */
export function stationLetters(m: BeamModel, sectionX: number | null): { x: number; letter: string }[] {
  const xs = [...new Set([0, m.length, ...m.supports.map((s) => s.x), ...m.hinges, ...(sectionX != null ? [sectionX] : [])])]
    .sort((a, b) => a - b)
  return xs.map((x, i) => ({ x, letter: i < 26 ? String.fromCharCode(65 + i) : `S${i + 1}` }))
}

export const letterAt = (letters: { x: number; letter: string }[], x: number) =>
  letters.find((l) => Math.abs(l.x - x) < 1e-9)?.letter ?? `x=${x}`
