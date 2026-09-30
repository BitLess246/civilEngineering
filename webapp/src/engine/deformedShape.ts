// ─────────────────────────────────────────────────────────────────────────
// DEFORMED SHAPE — where every point of the structure goes, not just its
// joints.
//
// `analysisDiagram.memberDeflectedCurve` draws a member as the element's own
// cubic from its END displacements and rotations. That is the homogeneous
// solution only: a beam carrying a UDL between two stiff columns has almost
// no end rotation, so the cubic draws it nearly straight while the real beam
// sags wL⁴/384EI in the middle. For a displacement CONTOUR that is the wrong
// half of the picture — the colour is supposed to peak at midspan.
//
// So this builds each member's displacement from the analysis itself:
//
//   v(x) = v_p(x) + v₁ + (v₂ − v₁ − v_p(L))·x/L
//
// where v_p is the member's own moment diagram double-integrated over the SAME
// EI the solver used (v_p(0) = v_p′(0) = 0), and the linear term puts the ends
// exactly on the solver's nodal displacements. Only the end DISPLACEMENTS are
// imposed, never the rotations — so a released (pinned) end needs no special
// case: its moment diagram already goes to zero there and the kink falls out.
// With the Euler–Bernoulli element this is the exact elastic curve, and its end
// slopes reproduce the solver's end rotations (a test pins that); with
// Timoshenko shear deformation on, the shear strain V/(G·As) is integrated in
// as well, so it stays consistent with the displacements the solver found.
//
// Conventions, taken from `memberStress` (both MEASURED there against the
// solver, not reasoned): Mz bends in the x′–y′ plane with EI·v″ = +Mz; My bends
// in x′–z′ with EI·w″ = −My.
//
// Units: coordinates and displacements m; rotations rad; E, G MPa; I mm⁴;
// A mm²; M kN·m; V kN. EI in kN·m² = E·I·1e-9; G·As in kN = G·As·1e-3.
// ─────────────────────────────────────────────────────────────────────────
import { localAxes, type V3 } from './frame3d'

/** What one member needs to draw its displaced shape. */
export interface DeformMember {
  id: string
  /** World node positions, m. */
  a: V3; b: V3
  /** Local-axis rotation the BRIDGE resolved (verticals default to 90°). */
  rotDeg: number
  /** Global nodal displacements at i and j: [ux, uy, uz, θx, θy, θz], m / rad. */
  di: readonly number[]; dj: readonly number[]
  /** The solver's member result: stations along the flexible length, m, and
   *  the moment/shear diagrams at them, kN·m / kN. */
  forces: { xs: readonly number[]; Mz: readonly number[]; My: readonly number[]; Vy: readonly number[]; Vz: readonly number[] }
  /** Section properties AS SOLVED (cracked modifiers already applied). */
  E: number; Iz: number; Iy: number
  /** Timoshenko shear: G, MPa, and shear areas, mm². Omit for Euler. */
  G?: number; Asy?: number; Asz?: number
  /** Rigid end offsets, global m, as the bridge set them. */
  offI?: V3; offJ?: V3
}

/** One member's displaced field, sampled at its stations. */
export interface MemberDisplacement {
  id: string
  /** Undeformed centreline points, m. */
  base: V3[]
  /** Global displacement vector at each point, m. */
  disp: V3[]
}

const add = (p: V3, q: V3): V3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]]
const dot = (p: readonly number[], q: readonly number[]) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2]
const cross = (p: readonly number[], q: readonly number[]): V3 =>
  [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]]

/**
 * `w_p(x)` with `w_p(0) = w_p′(0) = 0`, from a curvature φ AND its slope φ′
 * sampled at `xs`, plus an optional extra SLOPE term (the shear strain).
 *
 * THE SLOPE IS WHAT MAKES IT EXACT. Treating φ as linear between stations
 * misses the parabola a UDL puts in the moment diagram — measured at 0.3% of
 * the peak against a twelve-element solve, and 3% near a support. But the
 * solver hands over the shear too, and V IS dM/dx, so each segment carries a
 * cubic Hermite φ from its end values and end slopes: exact for any moment up
 * to cubic (UDL, triangular VDL), and a point load's kink sits on a station.
 * With H the Hermite basis on [0, s], integrated in closed form:
 *
 *   θ₁ = θ₀ + s(φ₀+φ₁)/2 + s²(φ₀′−φ₁′)/12
 *   w₁ = w₀ + θ₀s + s²(7φ₀+3φ₁)/20 + s³(φ₀′/20 − φ₁′/30)
 *
 * which reduce to the linear formulas when φ′ is the chord slope.
 */
function integrate(
  xs: readonly number[], phi: readonly number[], dphi: readonly number[], gamma?: readonly number[],
): number[] {
  const n = xs.length
  const w = new Array<number>(n).fill(0)
  let theta = 0
  for (let k = 1; k < n; k++) {
    const s = xs[k] - xs[k - 1]
    if (!(s > 0)) { w[k] = w[k - 1]; continue }       // a duplicated station at a point load
    const p0 = phi[k - 1], p1 = phi[k], d0 = dphi[k - 1], d1 = dphi[k]
    const g0 = gamma?.[k - 1] ?? 0, g1 = gamma?.[k] ?? 0
    w[k] = w[k - 1] + theta * s + s * s * (7 * p0 + 3 * p1) / 20 + s ** 3 * (d0 / 20 - d1 / 30) + 0.5 * (g0 + g1) * s
    theta += s * (p0 + p1) / 2 + s * s * (d0 - d1) / 12
  }
  return w
}

/**
 * The displaced field of one member.
 *
 * Returns the undeformed points and their displacement vectors separately so a
 * caller can amplify the second without re-running this, and colour by its
 * magnitude or any component.
 */
export function memberDisplacement(m: DeformMember): MemberDisplacement | null {
  const f = m.forces
  const n = Math.min(f.xs.length, f.Mz.length, f.My.length)
  if (n < 2) return null
  // The flexible element runs between the OFFSET ends; the arms are rigid.
  const oI: V3 = m.offI ?? [0, 0, 0], oJ: V3 = m.offJ ?? [0, 0, 0]
  const A = add(m.a, oI), B = add(m.b, oJ)
  const dir: V3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]]
  const L = Math.hypot(...dir)
  if (!(L > 1e-9)) return null
  const [ex, ey, ez] = localAxes(dir, m.rotDeg)
  // A rigid arm carries its node's rotation: the offset end moves d + θ × off.
  const endDisp = (d: readonly number[], off: V3): V3 => {
    const t = [d[3] ?? 0, d[4] ?? 0, d[5] ?? 0]
    const r = cross(t, off)
    return [(d[0] ?? 0) + r[0], (d[1] ?? 0) + r[1], (d[2] ?? 0) + r[2]]
  }
  const D1 = endDisp(m.di, oI), D2 = endDisp(m.dj, oJ)
  const u1 = dot(D1, ex), v1 = dot(D1, ey), w1 = dot(D1, ez)
  const u2 = dot(D2, ex), v2 = dot(D2, ey), w2 = dot(D2, ez)

  const xs = f.xs.slice(0, n)
  const x0 = xs[0], span = xs[n - 1] - x0 || L
  const EIz = m.E * m.Iz * 1e-9, EIy = m.E * m.Iy * 1e-9
  const phiV = xs.map((_, k) => (EIz > 0 ? f.Mz[k] / EIz : 0))
  const phiW = xs.map((_, k) => (EIy > 0 ? -f.My[k] / EIy : 0))
  // φ′ from the shear: dMz/dx = +Vy and dMy/dx = −Vz (memberStress § signs),
  // so v‴ = Vy/EIz and w‴ = −(−Vz)/EIy = Vz/EIy.
  const dV = xs.map((_, k) => (EIz > 0 ? (f.Vy[k] ?? 0) / EIz : 0))
  const dW = xs.map((_, k) => (EIy > 0 ? (f.Vz[k] ?? 0) / EIy : 0))
  // Shear strain, only if the solver itself used shear deformation:
  // γ = −V/(G·As) in both planes. The sign is pinned by the engine-vs-engine
  // runs under UDL (a normal beam for y′, one rolled 90° for z′) — NOT by the
  // tip-load cantilevers: constant V makes γ's term linear in x, and the chord
  // correction absorbs a linear term whatever its sign.
  const GAy = m.G && m.Asy ? m.G * m.Asy * 1e-3 : 0
  const GAz = m.G && m.Asz ? m.G * m.Asz * 1e-3 : 0
  const gV = GAy > 0 ? xs.map((_, k) => -(f.Vy[k] ?? 0) / GAy) : undefined
  const gW = GAz > 0 ? xs.map((_, k) => -(f.Vz[k] ?? 0) / GAz) : undefined
  const pv = integrate(xs, phiV, dV, gV), pw = integrate(xs, phiW, dW, gW)

  const base: V3[] = [], disp: V3[] = []
  for (let k = 0; k < n; k++) {
    const t = (xs[k] - x0) / span
    const u = u1 + (u2 - u1) * t
    const v = pv[k] + v1 + (v2 - v1 - pv[n - 1]) * t
    const w = pw[k] + w1 + (w2 - w1 - pw[n - 1]) * t
    const s = (xs[k] - x0) / span
    base.push([A[0] + dir[0] * s, A[1] + dir[1] * s, A[2] + dir[2] * s])
    disp.push([
      u * ex[0] + v * ey[0] + w * ez[0],
      u * ex[1] + v * ey[1] + w * ez[1],
      u * ex[2] + v * ey[2] + w * ez[2],
    ])
  }
  return { id: m.id, base, disp }
}

/** The displacement quantity a contour can show. `total` is |U|; the others are
 *  the global components, signed. */
export type DisplacementKey = 'total' | 'ux' | 'uy' | 'uz'

export const DISPLACEMENT_KEYS: readonly { key: DisplacementKey; label: string }[] = [
  { key: 'total', label: 'Total |U|' },
  { key: 'ux', label: 'Ux (global X)' },
  { key: 'uy', label: 'Uy (vertical)' },
  { key: 'uz', label: 'Uz (global Z)' },
]

export const isSignedDisplacement = (k: DisplacementKey): boolean => k !== 'total'

/** The scalar a key reads off a displacement vector, m. */
export function displacementValue(d: V3, key: DisplacementKey): number {
  if (key === 'ux') return d[0]
  if (key === 'uy') return d[1]
  if (key === 'uz') return d[2]
  return Math.hypot(d[0], d[1], d[2])
}

/** The largest |U| anywhere on the members, m — what an automatic scale and a
 *  "max displacement" read-out both need. */
export function maxDisplacement(fields: readonly MemberDisplacement[]): { value: number; id: string | null } {
  let value = 0, id: string | null = null
  for (const f of fields) for (const d of f.disp) {
    const v = Math.hypot(d[0], d[1], d[2])
    if (v > value) { value = v; id = f.id }
  }
  return { value, id }
}

/**
 * The amplification that draws the largest displacement at `fraction` of the
 * model's bounding diagonal — the post-processor default, so a 2 mm sag and a
 * 200 mm drift both read as a visible, not absurd, deformation. 0 when nothing
 * moved (nothing to amplify).
 */
export function autoScale(maxDisp: number, diagonal: number, fraction = 0.06): number {
  if (!(maxDisp > 0) || !(diagonal > 0)) return 0
  return (fraction * diagonal) / maxDisp
}

// ── Slabs: a Coons patch over the deformed edge members ────────────────────
//
// A slab drawn from its four displaced CORNERS is a flat quad; its edges would
// part company with the sagging beams they sit on. A bilinearly blended Coons
// patch takes the four edge CURVES instead — the same displacement fields the
// beams draw — so the slab's boundary IS the beam's deflected line, and the
// interior blends between them. It carries no plate bending of its own (that is
// the shell analysis's job); it is the slab moving with its supports, stated as
// such in the page caption.

/** A displacement along one edge, t ∈ [0, 1] from its first corner to its
 *  second. */
export type EdgeField = (t: number) => V3

/** Sample a member's displacement at a fraction of its length, measured from
 *  whichever end sits at `from`. Linear between stations. */
export function edgeFromMember(f: MemberDisplacement, reversed: boolean): EdgeField {
  const n = f.disp.length
  const p0 = f.base[0], pn = f.base[n - 1]
  const len = Math.hypot(pn[0] - p0[0], pn[1] - p0[1], pn[2] - p0[2]) || 1
  const ts = f.base.map((p) => Math.hypot(p[0] - p0[0], p[1] - p0[1], p[2] - p0[2]) / len)
  return (t: number) => {
    const s = reversed ? 1 - t : t
    let k = 0
    while (k < n - 2 && ts[k + 1] < s) k++
    const span = ts[k + 1] - ts[k]
    const r = span > 0 ? Math.min(1, Math.max(0, (s - ts[k]) / span)) : 0
    const a = f.disp[k], b = f.disp[k + 1]
    return [a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r, a[2] + (b[2] - a[2]) * r]
  }
}

/** A straight-line edge between two corner displacements — for a slab edge
 *  with no member along it. */
export const straightEdge = (d0: V3, d1: V3): EdgeField => (t) =>
  [d0[0] + (d1[0] - d0[0]) * t, d0[1] + (d1[1] - d0[1]) * t, d0[2] + (d1[2] - d0[2]) * t]

/**
 * Displacement at (s, t) ∈ [0,1]² of a quad whose corners are c00, c10, c11,
 * c01 (counter-clockwise) and whose edges are e0 (c00→c10), e1 (c10→c11),
 * e2 (c01→c11), e3 (c00→c01):
 *
 *   S = (1−t)e0(s) + t·e2(s) + (1−s)e3(t) + s·e1(t) − bilinear(corners)
 *
 * Reproduces each edge exactly on its boundary, which is the property the
 * slab needs.
 */
export function coonsDisplacement(e0: EdgeField, e1: EdgeField, e2: EdgeField, e3: EdgeField, s: number, t: number): V3 {
  const a = e0(s), c = e2(s), d = e3(t), b = e1(t)
  const c00 = e0(0), c10 = e0(1), c01 = e2(0), c11 = e2(1)
  const out: V3 = [0, 0, 0]
  for (let i = 0; i < 3; i++) {
    const bil = (1 - s) * (1 - t) * c00[i] + s * (1 - t) * c10[i] + (1 - s) * t * c01[i] + s * t * c11[i]
    out[i] = (1 - t) * a[i] + t * c[i] + (1 - s) * d[i] + s * b[i] - bil
  }
  return out
}
