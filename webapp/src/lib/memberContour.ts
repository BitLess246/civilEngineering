// ─────────────────────────────────────────────────────────────────────────
// MEMBER STRESS CONTOUR — the recovered beam/column stresses, painted on the
// members that carry them.
//
// Two things this gets right that a simpler version would not:
//
// 1. IT USES THE SOLVER'S LOCAL AXES, NOT THE RENDERER'S. `Member3D` orients
//    its box with `setFromUnitVectors(+X, dir)`, which for a COLUMN puts local
//    y along global −X; `localAxes(dir, rot)` — what `frame3d` integrated the
//    stiffness in and what `memberStress` means by "the y′ fibre" — puts it
//    along global +Z. The two agree for a horizontal beam and disagree by 90°
//    for every column in the model, so painting the tension face with the
//    rendering basis would put it on the wrong side of every column while
//    looking perfectly plausible on the beams.
//
// 2. IT VARIES AROUND THE SECTION, NOT JUST ALONG IT. Normal stress is what a
//    member contour is for, and its whole content is that the top and bottom
//    faces carry opposite signs. Colouring a member by one scalar per station
//    would throw that away and draw a beam in hogging identically to one in
//    sagging.
//
// Units: model space m; stress MPa (the member engine's unit) — NOT the plate
// contour's kPa, which is why this carries its own domain and legend rather
// than sharing the plate one. It shares the RAMP, so the two contours read
// with the same colour language.
// ─────────────────────────────────────────────────────────────────────────
import { localAxes, type V3 } from '../engine/frame3d'
import {
  normalStress, fibreStress, shearStress,
  type StressSection, type MemberForceArrays, type MemberForces, type Fibre,
} from '../engine/memberStress'
import { stressDomain, normalise, type Domain } from './stressScale'

/** The quantities a member contour can paint. */
export type MemberStressKey = 'sigma' | 'vonMises' | 'tau'

export const MEMBER_STRESS_KEYS: readonly { key: MemberStressKey; label: string; hint: string }[] = [
  {
    key: 'sigma', label: 'Axial + bending σ',
    hint: 'signed, at the section corners — tension one face, compression the other',
  },
  {
    key: 'vonMises', label: 'Von Mises σvm',
    hint: 'at the section corners, where σ is largest and the transverse shear is zero',
  },
  {
    key: 'tau', label: 'Shear τ (section max)',
    hint: 'the largest τ anywhere on the section — at the neutral axis, not at the corners, so it is constant around the outline',
  },
]

export const isSignedMember = (k: MemberStressKey): boolean => k === 'sigma'

/** One member, ready to contour. */
export interface ContourMember {
  id: string
  /** World endpoints, metres. */
  a: V3; b: V3
  /** The local-axis rotation the BRIDGE resolved — not the raw model field. */
  rotDeg: number
  section: StressSection
  /** The force arrays the diagrams draw. Same object, not a recomputation. */
  forces: MemberForceArrays
  /**
   * How far below the node the section centroid sits, metres.
   *
   * A beam's node is the TOP of the member, not its centroid (`levelDrop`), so
   * a contour drawn on the centroid would float half a section depth above the
   * beam it belongs to.
   */
  drop: number
  /**
   * The member's end NODES. Optional, because a member contoured on its own
   * has no joint to meet; given, they are what lets `jointTrims` find the
   * members that share a joint and stop this one at their face.
   */
  ni?: string; nj?: string
}

/**
 * How many points each SIDE of the section outline is divided into.
 *
 * FOUR CORNERS IS NOT A MESH. The outline used to be the four corners and
 * nothing else, which is exact for σ — normal stress is linear in (y, z), so
 * the GPU's interpolation along a straight edge between two corners is the
 * right answer — and useless for everything shear carries:
 *
 *   · τ = VQ/(I·t) is PARABOLIC over the depth: zero at the extreme fibres,
 *     largest at the neutral axis. Sampled only at corners it is zero
 *     everywhere, so the contour used to paint the section MAXIMUM flat around
 *     the whole outline. That is a number, not a picture.
 *   · σvm = √(σ² + 3τ²) inherits that parabola on the side faces, and has a
 *     KINK where σ changes sign, which no straight edge between two corners
 *     can reproduce.
 *
 * Six per side = 24 points around the ring, against the 25 stations the solver
 * already gives along the length (`NS = 24` in `frame3d`), so the mesh is about
 * as fine across as it is along.
 *
 * THE COST, MEASURED rather than estimated, on a 3×3-bay 3-storey frame — 120
 * members, 300×500 — built in a vitest probe:
 *
 *   600 vertices a member · 72 000 vertices · 138 240 triangles
 *   2.68 MB of buffers · 79 ms to build the whole mesh
 *
 * Linear in members, built once per (key, domain) change, and an order of
 * magnitude under anything the pool workers carry. What it buys, on a beam of
 * that frame at its support: τ down the side face reads
 * 0 · 0.32 · 0.51 · 0.58 · 0.51 · 0.32 · 0 MPa — the parabola, free at both
 * extreme fibres, and 0.5789 at the neutral axis against the rectangle's exact
 * 1.5·V/A = 0.5789. Four corners drew all seven of those as one number.
 */
export const RING_PER_SIDE = 6

/**
 * The section outline as a closed ring of fibres, each carrying its own
 * shear-flow data so the stress can actually be evaluated there.
 *
 * Q AND t ARE THE POINT. `Qz(y) = b(h²/4 − y²)/2` with `t = b` is the first
 * moment of the area above a cut at height y — it falls to zero at y = ±h/2,
 * which is what makes the extreme fibres shear-free, and peaks at the centroid.
 * `Qy(z)` is the same statement across the width. Both are evaluated at every
 * ring point, so a corner (where both vanish) comes out shear-free without any
 * special case, and a mid-face point gets the real parabola.
 *
 * The outline is the bounding rectangle for every section, steel shapes
 * included — which is what the four-corner outline already drew, so this
 * refines the sampling of the shape that ships rather than changing the shape.
 * `sectionRing(s, 1)` IS those four corners, so the ring is a strict
 * generalisation of what it replaces.
 */
export function sectionRing(s: StressSection, perSide = RING_PER_SIDE): Fibre[] {
  const n = Math.max(1, Math.floor(perSide))
  const at = (y: number, z: number) => fibreAt(s, y, z)
  const ring: Fibre[] = []
  // Counter-clockwise from (+cy, +cz), each side split n ways and its END
  // corner left to the next side, so the ring closes without a duplicate.
  const walk = (y0: number, z0: number, y1: number, z1: number) => {
    for (let k = 0; k < n; k++) {
      const t = k / n
      ring.push(at(y0 + (y1 - y0) * t, z0 + (z1 - z0) * t))
    }
  }
  walk(s.cy, s.cz, s.cy, -s.cz)      // top face, +z → −z
  walk(s.cy, -s.cz, -s.cy, -s.cz)    // −z side, top → bottom
  walk(-s.cy, -s.cz, -s.cy, s.cz)    // bottom face, −z → +z
  walk(-s.cy, s.cz, s.cy, s.cz)      // +z side, bottom → top
  return ring
}

/**
 * One point of the bounding-rectangle section as a `Fibre`, carrying the
 * rectangle's shear-flow data there: `Qz(y) = b(h²/4 − y²)/2` with `t = b`,
 * and `Qy(z)` the same across the width.
 *
 * Shared by the ring and the end caps, so a cap's CENTROID is evaluated with
 * the same Q the side faces use — which matters for τ, whose peak is at the
 * centroid and which a cap averaged from its ring would understate.
 */
function fibreAt(s: StressSection, y: number, z: number): Fibre {
  const h = 2 * s.cy, b = 2 * s.cz
  const qz = Math.max(0, (b * (h * h / 4 - y * y)) / 2)
  const qy = Math.max(0, (h * (b * b / 4 - z * z)) / 2)
  return {
    y, z, label: '',
    // Omitted rather than zero where there is no flow: `shearStress` treats a
    // missing pair as a free surface, which is the same answer and says so.
    ...(qz > 0 && b > 0 ? { Qz: qz, tz: b } : {}),
    ...(qy > 0 && h > 0 ? { Qy: qy, ty: h } : {}),
  }
}

const forcesAt = (f: MemberForceArrays, i: number): MemberForces => ({
  N: f.N[i] ?? 0, Vy: f.Vy[i] ?? 0, Vz: f.Vz[i] ?? 0,
  T: f.T[i] ?? 0, My: f.My[i] ?? 0, Mz: f.Mz[i] ?? 0,
})

/**
 * Contour values for one member: `[station][ringPoint]`, MPa.
 *
 * EVERY KEY IS NOW EVALUATED AT THE POINT IT IS DRAWN AT, which τ was not. It
 * used to be painted as the section ENVELOPE — one number, the largest shear
 * anywhere on the section — repeated at all four corners, because the corners
 * are shear-free and their own τ is zero. That was the honest thing to do with
 * four samples, and it drew a member in uniform colour: a reading of the peak
 * rather than a picture of the distribution.
 *
 * With the ring there are real fibres between the corners, so τ is the actual
 * VQ/(I·t) at each: zero at the extreme fibres, parabolic down the side faces,
 * peaking at the neutral axis. σvm follows it, and picks up the kink where σ
 * changes sign. σ is unchanged in value — it is linear in (y, z), so the extra
 * points sit exactly on the line the corners already defined — but the extra
 * points are what let the BANDS land where the iso-lines are.
 */
export function memberValues(m: ContourMember, key: MemberStressKey): number[][] {
  const ring = sectionRing(m.section)
  const out: number[][] = []
  for (let i = 0; i < m.forces.xs.length; i++) {
    const f = forcesAt(m.forces, i)
    out.push(ring.map((fib) => {
      if (key === 'sigma') return normalStress(m.section, f, fib.y, fib.z)
      if (key === 'tau') return shearStress(m.section, f, fib)
      return fibreStress(m.section, f, fib).vonMises
    }))
  }
  return out
}

const stressAt = (s: StressSection, f: MemberForces, fib: Fibre, key: MemberStressKey): number =>
  key === 'sigma' ? normalStress(s, f, fib.y, fib.z)
    : key === 'tau' ? shearStress(s, f, fib)
      : fibreStress(s, f, fib).vonMises

/** Forces at an arbitrary x, linear between the solver's stations — the same
 *  assumption the GPU makes when it interpolates between two drawn rings. */
function forcesAtX(f: MemberForceArrays, x: number): MemberForces {
  const xs = f.xs
  for (let i = 0; i < xs.length - 1; i++) {
    if (x >= xs[i] && x <= xs[i + 1] && xs[i + 1] > xs[i]) {
      const t = (x - xs[i]) / (xs[i + 1] - xs[i])
      const A = forcesAt(f, i), B = forcesAt(f, i + 1)
      return {
        N: A.N + (B.N - A.N) * t, Vy: A.Vy + (B.Vy - A.Vy) * t, Vz: A.Vz + (B.Vz - A.Vz) * t,
        T: A.T + (B.T - A.T) * t, My: A.My + (B.My - A.My) * t, Mz: A.Mz + (B.Mz - A.Mz) * t,
      }
    }
  }
  return forcesAt(f, x <= (xs[0] ?? 0) ? 0 : xs.length - 1)
}

// ── Joints ──────────────────────────────────────────────────────────────────
//
// WHY A MEMBER STOPS AT THE FACE. Every member used to be drawn node to node,
// centreline to centreline. At a beam–column joint that put the beam's prism
// and the column's prism in the SAME volume, carrying two different stress
// fields, and the depth test cut between them along whatever line their
// surfaces happened to cross — a patchwork where the colour should flow from
// one member into the next. It also painted the beam's NODE value, its largest,
// inside the column, where there is no beam: the critical sections of a beam
// are measured from the support FACE (ACI 318-14 §9.4.3.2), and the node
// moment of a centreline model is an idealisation of the joint, not a stress
// anything in the joint carries.
//
// So the joint belongs to one member, the way ETABS and SAP2000 draw it: a
// column owns the joints it passes through; a beam that CONTINUES through a
// node owns it over one that stops there (a girder over the secondary beam it
// carries). Everything else stops at the owner's face.

/** Which member owns a joint it meets: 2 vertical, 1 continuous, 0 neither. */
function jointRank(away: V3, others: readonly V3[]): number {
  if (Math.abs(away[1]) > 0.98) return 2
  return others.some((o) => away[0] * o[0] + away[1] * o[1] + away[2] * o[2] < -0.999) ? 1 : 0
}

/**
 * How far along `away` (a unit vector) a ray from the joint travels before it
 * leaves member `k`'s cross-section, metres.
 *
 * The EXIT distance, not the half-width: a beam meeting a column square-on
 * leaves at b/2, but one meeting it on a skew, or a brace coming in on a slope,
 * travels c/|cos θ| to reach the same face, and trimming it by the half-width
 * would leave its end buried in the column or short of it.
 */
function exitDistance(away: V3, k: ContourMember): number {
  const dir: V3 = [k.b[0] - k.a[0], k.b[1] - k.a[1], k.b[2] - k.a[2]]
  const [, yk, zk] = localAxes(dir, k.rotDeg)
  let best = Infinity
  for (const [ax, c] of [[yk, k.section.cy], [zk, k.section.cz]] as const) {
    const d = Math.abs(away[0] * ax[0] + away[1] * ax[1] + away[2] * ax[2])
    if (d > 1e-9) best = Math.min(best, c / 1000 / d)
  }
  return Number.isFinite(best) ? best : 0
}

/**
 * How much of each end to leave undrawn because another member owns the joint
 * there: `id → [atStart, atEnd]`, metres along the member.
 *
 * Only members that carry their node ids take part — without them there is no
 * way to know two members share a joint rather than merely touch. Both trims
 * together are capped at 90% of the length, so a stub between two columns is
 * drawn short rather than inside out.
 */
export function jointTrims(ms: readonly ContourMember[]): Map<string, [number, number]> {
  return buildJoints(ms).trims
}

/** One member end at one joint: which way the member leaves the node, how it
 *  ranks for ownership, and how much of it the joint takes (metres). */
interface JointEnd { m: ContourMember; away: V3; end: 0 | 1; rank: number; trim: number }

function buildJoints(ms: readonly ContourMember[]): {
  trims: Map<string, [number, number]>; joints: JointEnd[][]
} {
  const at = new Map<string, JointEnd[]>()
  for (const m of ms) {
    if (m.ni === undefined || m.nj === undefined) continue
    const d: V3 = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]]
    const L = Math.hypot(...d)
    if (!(L > 1e-9)) continue
    const u: V3 = [d[0] / L, d[1] / L, d[2] / L]
    for (const [node, away, end] of [[m.ni, u, 0], [m.nj, [-u[0], -u[1], -u[2]], 1]] as const) {
      const list = at.get(node) ?? []
      list.push({ m, away: away as V3, end: end as 0 | 1, rank: 0, trim: 0 })
      at.set(node, list)
    }
  }
  const trims = new Map<string, [number, number]>()
  const joints = [...at.values()]
  for (const ends of joints) {
    for (const e of ends) e.rank = jointRank(e.away, ends.filter((o) => o !== e).map((o) => o.away))
    for (const e of ends) {
      let trim = 0
      for (const k of ends) {
        if (k === e || k.rank <= e.rank) continue
        const par = Math.abs(e.away[0] * k.away[0] + e.away[1] * k.away[1] + e.away[2] * k.away[2])
        if (par > 0.999) continue          // collinear: end to end, nothing to cut
        trim = Math.max(trim, exitDistance(e.away, k.m))
      }
      e.trim = trim
      if (trim > 0) {
        const t = trims.get(e.m.id) ?? [0, 0]
        t[e.end] = trim
        trims.set(e.m.id, t)
      }
    }
  }
  const scale = new Map<string, number>()
  for (const m of ms) {
    const t = trims.get(m.id)
    if (!t) continue
    const L = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2])
    const sum = t[0] + t[1]
    if (sum > 0.9 * L) { const k = (0.9 * L) / sum; t[0] *= k; t[1] *= k; scale.set(m.id, k) }
  }
  for (const ends of joints) for (const e of ends) e.trim *= scale.get(e.m.id) ?? 1
  return { trims, joints }
}

/** One drawn station: where it is, and the value at every ring point and at
 *  the centroid (the latter for the end caps). */
interface Station { x: number; ring: number[]; centre: number }

/**
 * The stations a member is DRAWN at: the solver's own, clipped to the part of
 * the member outside the joints, with a station added exactly at each face so
 * the drawn end carries the stress AT the face rather than at the nearest
 * solver station inside the joint.
 */
function drawnStations(
  m: ContourMember, key: MemberStressKey, trim: readonly [number, number] = [0, 0],
  extra: readonly number[] = [],
): Station[] {
  const xs = m.forces.xs
  if (xs.length < 2) return []
  const L = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2])
  const x0 = trim[0], x1 = L - trim[1]
  const ring = sectionRing(m.section), centre = fibreAt(m.section, 0, 0)
  const at = (x: number, f: MemberForces): Station => ({
    x, ring: ring.map((fib) => stressAt(m.section, f, fib, key)), centre: stressAt(m.section, f, centre, key),
  })
  if (!(trim[0] > 0) && !(trim[1] > 0) && extra.length === 0) {
    return xs.map((x, i) => at(x, forcesAt(m.forces, i)))
  }
  // The solver's stations keep their own forces (a duplicated x at a point
  // load is a real jump and stays one); an inserted station is interpolated.
  const pts: { x: number; f: MemberForces }[] = [{ x: x0, f: forcesAtX(m.forces, x0) }]
  xs.forEach((x, i) => { if (x > x0 + 1e-9 && x < x1 - 1e-9) pts.push({ x, f: forcesAt(m.forces, i) }) })
  for (const x of extra) {
    if (x > x0 + 1e-6 && x < x1 - 1e-6 && !xs.some((sx) => Math.abs(sx - x) < 1e-6)) pts.push({ x, f: forcesAtX(m.forces, x) })
  }
  pts.push({ x: x1, f: forcesAtX(m.forces, x1) })
  pts.sort((p, q) => p.x - q.x)
  return pts.map((p) => at(p.x, p.f))
}

/** The domain every member shares, so two members are comparable.
 *
 *  Taken over the DRAWN stations, joints trimmed, so the legend's extremes are
 *  values the picture actually shows — not a node value hidden inside a
 *  column, which would stretch the scale and wash out everything drawn. */
export function memberContourDomain(ms: readonly ContourMember[], key: MemberStressKey): Domain {
  const trims = jointTrims(ms)
  const all: number[] = []
  for (const m of ms) for (const st of drawnStations(m, key, trims.get(m.id))) all.push(...st.ring, st.centre)
  return stressDomain(all, isSignedMember(key))
}

/** The extreme value and where it is, for the read-out beside the legend. */
export function memberPeak(
  ms: readonly ContourMember[], key: MemberStressKey,
): { id: string; value: number; x: number } | null {
  // Over the same drawn stations as the domain, so the read-out names a place
  // on the picture — the face of a support, not a node inside a column.
  const trims = jointTrims(ms)
  let best: { id: string; value: number; x: number } | null = null
  for (const m of ms) {
    for (const st of drawnStations(m, key, trims.get(m.id))) {
      for (const v of [...st.ring, st.centre]) {
        if (!Number.isFinite(v)) continue
        if (!best || Math.abs(v) > Math.abs(best.value)) best = { id: m.id, value: v, x: st.x }
      }
    }
  }
  return best
}

/** Grow the drawn prism slightly so it sits proud of the solid member instead
 *  of z-fighting with it. 1.5% — enough to win the depth test, small enough
 *  that the contour still reads as the member's own surface. */
const PROUD = 1.015

// ── Joint blending (display) ──────────────────────────────────────────────
//
// WHY THE COLOUR STOPS AT A JOINT, AND WHAT BLENDING DOES ABOUT IT. Outside a
// joint the contour is exact beam theory, and beam theory makes the field
// discontinuous at every joint for a real reason: a beam's σ acts along the
// beam and a column's along the column — two different stress components on
// two different sections — and the joint panel between them carries a 2-D/3-D
// state that no frame analysis computes. Drawing each member exactly therefore
// shows a hard seam wherever members meet.
//
// Commercial post-processors answer the same problem for shells with AVERAGED
// contours (SAP2000/ETABS "stress averaging at joints"): a display smoothing,
// labelled as one, that lets the field read continuously. This is that, for
// frames, and it is confined to the joint panel:
//
//   · across every seam the two members meet at their AVERAGE: on the owner
//     (the column), each vertex blends toward the incoming member's face
//     stress read at that vertex's position in the incoming section — half
//     weight where the vertex lies on the face the beam frames into, falling
//     smoothly to nothing round the corners and within half a section above
//     and below the beam; on the incoming member (the beam), each vertex
//     within one section width of the face blends the same way toward the
//     column's field — so the colour flows both ways and meets in the middle,
//     and neither member's extreme is left sitting on the seam as a line;
//   · where two owners meet end to end (the column below and above a floor),
//     each blends halfway toward the other within its own half-depth of the
//     node, so the field is continuous through the node too.
//
// Every blended value is a convex combination of values the analysis produced,
// so the legend's range cannot grow; the incoming members are not touched, so
// everything outside the joints still reads exactly. It is OFF unless asked
// for, and the page says what it is.

/** 1 at t = 0, 0 at t ≥ 1, smooth at both ends. */
const fall = (t: number): number => (t >= 1 ? 0 : t <= 0 ? 1 : 1 - t * t * (3 - 2 * t))

const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

/** A member evaluated as a FIELD in space at one of its stations: origin on its
 *  drawn axis, its solver axes, and the forces there. */
interface SectionField { s: StressSection; f: MemberForces; o: V3; y: V3; z: V3 }

function sectionField(m: ContourMember, x: number): SectionField {
  const dir: V3 = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]]
  const L = Math.hypot(...dir), t = Math.max(0, Math.min(1, x / L))
  const [, y, z] = localAxes(dir, m.rotDeg)
  return {
    s: m.section, f: forcesAtX(m.forces, x), y, z,
    o: [m.a[0] + dir[0] * t, m.a[1] + dir[1] * t - m.drop, m.a[2] + dir[2] * t],
  }
}

/** The field's stress at world point p, read at p's position in the section
 *  (clamped to the outline — p sits on another member's surface, a few mm
 *  proud of this one's). */
function fieldAt(F: SectionField, p: V3, key: MemberStressKey): number {
  const d = sub3(p, F.o)
  const y = Math.max(-F.s.cy, Math.min(F.s.cy, dot3(d, F.y) * 1000))
  const z = Math.max(-F.s.cz, Math.min(F.s.cz, dot3(d, F.z) * 1000))
  return stressAt(F.s, F.f, fibreAt(F.s, y, z), key)
}

/** One incoming member, as the owner's joint sees it. */
interface Inflow { F: SectionField; u: V3; trim: number; rho: number }

/** The blend context for one OWNER end at one joint. */
interface JointBlend {
  node: V3; axis: V3; inflows: Inflow[]; partner: SectionField | null; rhoPartner: number; zone: number
  /**
   * How far the owner's drawn end must reach PAST the node to cover what comes
   * into it, metres. Every prism is drawn PROUD (1.5% over size) to win the
   * depth test against its solid member, so a beam hung flush with the top of
   * a roof column pokes a few mm above the column's end cap, and that sliver of
   * the beam's own end cap read as a dark line along every seam. Zero where a
   * column continues above — there is no cap there to fall short.
   */
  overshoot: number
}

function jointBlends(ms: readonly ContourMember[]): Map<string, JointBlend[]> {
  const out = new Map<string, JointBlend[]>()
  for (const ends of buildJoints(ms).joints) {
    const top = Math.max(...ends.map((e) => e.rank))
    for (const o of ends) {
      if (o.rank !== top) continue
      const inflows: Inflow[] = []
      for (const k of ends) {
        if (k === o || !(k.trim > 0)) continue
        const Lk = Math.hypot(k.m.b[0] - k.m.a[0], k.m.b[1] - k.m.a[1], k.m.b[2] - k.m.a[2])
        const F = sectionField(k.m, k.end === 0 ? k.trim : Lk - k.trim)
        inflows.push({ F, u: k.away, trim: k.trim, rho: Math.min(k.m.section.cy, k.m.section.cz) / 1000 })
      }
      const mate = ends.find((k) => k !== o && k.rank === top && dot3(k.away, o.away) < -0.999)
      const Lo = Math.hypot(o.m.b[0] - o.m.a[0], o.m.b[1] - o.m.a[1], o.m.b[2] - o.m.a[2])
      const nodeX = o.end === 0 ? 0 : Lo
      const self = sectionField(o.m, nodeX)
      let partner: SectionField | null = null
      if (mate) {
        const Lm = Math.hypot(mate.m.b[0] - mate.m.a[0], mate.m.b[1] - mate.m.a[1], mate.m.b[2] - mate.m.a[2])
        partner = sectionField(mate.m, mate.end === 0 ? 0 : Lm)
      }
      if (inflows.length === 0 && !partner) continue
      const rhoPartner = Math.max(o.m.section.cy, o.m.section.cz) / 1000
      // How far along the owner the joint reaches: each incoming section's
      // extent along the owner axis, from where its centroid sits, plus its
      // fade — so the refinement covers the whole blend and nothing more.
      let zone = partner ? rhoPartner : 0, overshoot = 0
      for (const q of inflows) {
        const along = dot3(sub3(q.F.o, self.o), o.away)
        const ext = (Math.abs(dot3(o.away, q.F.y)) * q.F.s.cy + Math.abs(dot3(o.away, q.F.z)) * q.F.s.cz) / 1000
        zone = Math.max(zone, Math.abs(along) + ext + q.rho)
        // `away` points INTO the owner, so past the node is along −away.
        if (!partner) overshoot = Math.max(overshoot, ext * PROUD - along)
      }
      const list = out.get(o.m.id) ?? []
      list.push({ node: self.o, axis: o.away, inflows, partner, rhoPartner, zone: Math.min(zone, 0.45 * Lo), overshoot: Math.max(0, overshoot) })
      out.set(o.m.id, list)
    }
  }
  return out
}

/** The displayed value at world point p on an owner, given its exact value v. */
function blendValue(p: V3, v: number, blends: readonly JointBlend[], key: MemberStressKey): number {
  let out = v
  for (const J of blends) {
    const s = Math.abs(dot3(sub3(p, J.node), J.axis))
    if (s > J.zone + 1e-9) continue
    if (J.partner) {
      const w = 0.5 * fall(s / J.rhoPartner)
      if (w > 0) out = (1 - w) * out + w * fieldAt(J.partner, p, key)
    }
    let sw = 0, sv = 0
    for (const q of J.inflows) {
      const d = sub3(p, q.F.o)
      const along = Math.abs(dot3(d, q.u))
      const ey = Math.max(0, Math.abs(dot3(d, q.F.y)) - q.F.s.cy / 1000)
      const ez = Math.max(0, Math.abs(dot3(d, q.F.z)) - q.F.s.cz / 1000)
      const phi = fall(along / (2 * q.trim)) * fall(ey / q.rho) * fall(ez / q.rho)
      if (phi > 0) { sw += phi; sv += phi * fieldAt(q.F, p, key) }
    }
    if (sw > 0) { const W = 0.5 * Math.min(1, sw); out = (1 - W) * out + W * (sv / sw) }
  }
  return out
}

/** The incoming side of a seam: where the face is, which way the member runs
 *  from it, how far the blend reaches, and the owner it blends toward. */
interface SeamBlend { face: V3; u: V3; rho: number; owner: ContourMember }

/** The owner's own stress at world point p: its section at the station p
 *  projects to, read at p's position in that section. */
function ownerAt(o: ContourMember, p: V3, key: MemberStressKey): number {
  const dir: V3 = [o.b[0] - o.a[0], o.b[1] - o.a[1], o.b[2] - o.a[2]]
  const L = Math.hypot(...dir)
  const u: V3 = [dir[0] / L, dir[1] / L, dir[2] / L]
  const x = Math.max(0, Math.min(L, dot3(sub3(p, [o.a[0], o.a[1] - o.drop, o.a[2]]), u)))
  return fieldAt(sectionField(o, x), p, key)
}

function seamValue(p: V3, v: number, seams: readonly SeamBlend[], key: MemberStressKey): number {
  let out = v
  for (const q of seams) {
    const s = Math.max(0, dot3(sub3(p, q.face), q.u))
    const w = 0.5 * fall(s / q.rho)
    if (w > 0) out = (1 - w) * out + w * ownerAt(q.owner, p, key)
  }
  return out
}

function seamBlends(ms: readonly ContourMember[]): Map<string, SeamBlend[]> {
  const out = new Map<string, SeamBlend[]>()
  for (const ends of buildJoints(ms).joints) {
    const top = Math.max(...ends.map((e) => e.rank))
    const owners = ends.filter((e) => e.rank === top)
    for (const k of ends) {
      if (!(k.trim > 0)) continue
      // The owner whose face this member stops at: the one that set its trim.
      let best: JointEnd | null = null, bestD = -1
      for (const o of owners) {
        if (o === k) continue
        const d = exitDistance(k.away, o.m)
        if (d > bestD) { bestD = d; best = o }
      }
      if (!best) continue
      const Lk = Math.hypot(k.m.b[0] - k.m.a[0], k.m.b[1] - k.m.a[1], k.m.b[2] - k.m.a[2])
      const F = sectionField(k.m, k.end === 0 ? k.trim : Lk - k.trim)
      const list = out.get(k.m.id) ?? []
      list.push({ face: F.o, u: k.away, rho: (2 * Math.min(k.m.section.cy, k.m.section.cz)) / 1000, owner: best.m })
      out.set(k.m.id, list)
    }
  }
  return out
}

/**
 * The value the contour DISPLAYS for member `id` at world point p: its exact
 * stress there (read at the station p projects to, at p's position in the
 * section), passed through the same joint blend the mesh uses. The mesh's own
 * vertices are this function sampled at the ring points; tests use it to ask
 * about points that are not vertices — a seam, a node plane.
 */
export function displayValueAt(
  ms: readonly ContourMember[], key: MemberStressKey, id: string, p: V3,
  opts: { blendJoints?: boolean } = {},
): number {
  const m = ms.find((x) => x.id === id)
  if (!m) return NaN
  const v = ownerAt(m, p, key)
  if (!opts.blendJoints) return v
  const seams = seamBlends(ms).get(id) ?? []
  if (seams.length) return seamValue(p, v, seams, key)
  const blends = jointBlends(ms).get(id) ?? []
  return blends.length ? blendValue(p, v, blends, key) : v
}

export interface MemberContourGeometry {
  position: Float32Array
  /** NORMALISED value per vertex, 0–1 — see `lib/contourMaterial` for why this
   *  is not a colour. */
  value: Float32Array
  index: number[]
}


/**
 * Build the contour skin: a prism per member, ringed at `RING_PER_SIDE` points
 * a side and subdivided at the solver's force stations, carrying one NORMALISED
 * VALUE per vertex.
 *
 * The value, not a colour — see `lib/contourMaterial`. Interpolating colour
 * walks a straight line through RGB that misses the ramp's centre; interpolating
 * the scalar and evaluating the ramp per fragment is what puts the band
 * boundaries on the iso-lines, and it is the whole reason a finer ring is worth
 * anything.
 *
 * Returns null rather than an empty mesh, so a caller can tell "nothing to
 * draw" from "a mesh of nothing".
 */
export function memberContourGeometry(
  ms: readonly ContourMember[], key: MemberStressKey, domain: Domain,
  opts: { blendJoints?: boolean } = {},
): MemberContourGeometry | null {
  const pos: number[] = [], val: number[] = [], idx: number[] = []
  const trims = jointTrims(ms)
  const blends = opts.blendJoints ? jointBlends(ms) : new Map<string, JointBlend[]>()
  const seams = opts.blendJoints ? seamBlends(ms) : new Map<string, SeamBlend[]>()
  for (const m of ms) {
    if (m.forces.xs.length < 2) continue
    const dir: V3 = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]]
    const L = Math.hypot(...dir)
    if (!(L > 1e-9)) continue
    // THE SOLVER'S BASIS. See the file header — the renderer's is different for
    // every column.
    const [, yp, zp] = localAxes(dir, m.rotDeg)
    const ring = sectionRing(m.section)
    const R = ring.length
    const mine = blends.get(m.id) ?? []
    const mySeams = seams.get(m.id) ?? []
    // Inside a blended joint the solver's stations (L/24 apart) are too coarse
    // for a transition half a section long, so the zone gets ten of its own.
    const extra: number[] = []
    for (const J of mine) {
      const fromA = Math.abs(dot3(sub3(J.node, [m.a[0], m.a[1] - m.drop, m.a[2]]), J.axis)) < 1e-6
      for (let k = 1; k <= 10; k++) extra.push(fromA ? (J.zone * k) / 10 : L - (J.zone * k) / 10)
    }
    const tr = trims.get(m.id) ?? [0, 0]
    for (const q of mySeams) {
      const fromA = Math.abs(dot3(sub3(q.face, [m.a[0], m.a[1] - m.drop, m.a[2]]), q.u) - tr[0]) < 1e-6
      for (let k = 1; k <= 8; k++) extra.push(fromA ? tr[0] + (q.rho * k) / 8 : L - tr[1] - (q.rho * k) / 8)
    }
    const shade = (p: V3, v: number) =>
      mySeams.length ? seamValue(p, v, mySeams, key) : mine.length ? blendValue(p, v, mine, key) : v
    const stations = drawnStations(m, key, trims.get(m.id), extra)
    // Reach past a covered node (see JointBlend.overshoot). Only the POSITION
    // moves; the ring keeps the node's values.
    for (const J of mine) {
      if (!(J.overshoot > 0)) continue
      const fromA = Math.abs(dot3(sub3(J.node, [m.a[0], m.a[1] - m.drop, m.a[2]]), J.axis)) < 1e-6
      if (fromA) stations[0] = { ...stations[0], x: stations[0].x - J.overshoot }
      else stations[stations.length - 1] = { ...stations[stations.length - 1], x: stations[stations.length - 1].x + J.overshoot }
    }
    const n = stations.length
    const base = pos.length / 3

    const axisAt = (x: number): V3 => {
      // Unclamped: an end reaching past its node (overshoot) is the one case
      // x leaves [0, L], and it is bounded by a few millimetres.
      const t = x / L
      return [m.a[0] + dir[0] * t, m.a[1] + dir[1] * t - m.drop, m.a[2] + dir[2] * t]
    }
    const pushRing = (st: Station) => {
      const [px, py, pz] = axisAt(st.x)
      for (let c = 0; c < R; c++) {
        // mm → m, and out to the drawn face.
        const oy = (ring[c].y / 1000) * PROUD, oz = (ring[c].z / 1000) * PROUD
        const p: V3 = [
          px + yp[0] * oy + zp[0] * oz,
          py + yp[1] * oy + zp[1] * oz,
          pz + yp[2] * oy + zp[2] * oz,
        ]
        pos.push(...p)
        const v = st.ring[c] ?? 0
        val.push(normalise(shade(p, v), domain))
      }
    }
    for (const st of stations) pushRing(st)
    // R quads per bay, two triangles each, the ring closing on itself via the
    // modulo. Ring vertices are SHARED between adjacent quads, so the value
    // interpolates continuously around the section as well as along the member
    // — no seam at a corner, which a per-face mesh would have.
    for (let i = 0; i < n - 1; i++) {
      for (let c = 0; c < R; c++) {
        const d = (c + 1) % R
        const p0 = base + i * R + c, p1 = base + i * R + d
        const q0 = base + (i + 1) * R + c, q1 = base + (i + 1) * R + d
        idx.push(p0, p1, q1, p0, q1, q0)
      }
    }
    // END CAPS. The prism used to be an open tube, and down its open end the
    // viewer saw the dark solid member it is drawn over — the black slab on top
    // of every roof column and at the end of every beam. Each end is closed by
    // a fan from the centroid, on its OWN vertices (a cap shares an edge with
    // the side faces but not a surface), carrying the section's stress: the
    // ring's values on the rim and the centroid's own value at the hub, so τ
    // peaks at the middle of the cap exactly as it does on the side faces.
    for (const st of [stations[0], stations[n - 1]]) {
      const hub = pos.length / 3
      const hp = axisAt(st.x)
      pos.push(...hp); val.push(normalise(shade(hp, st.centre), domain))
      pushRing(st)
      for (let c = 0; c < R; c++) idx.push(hub, hub + 1 + c, hub + 1 + ((c + 1) % R))
    }
  }
  if (idx.length === 0) return null
  return { position: new Float32Array(pos), value: new Float32Array(val), index: idx }
}

export { shearStress }
