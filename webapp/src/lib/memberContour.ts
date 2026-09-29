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
  type End = { m: ContourMember; away: V3; end: 0 | 1 }
  const at = new Map<string, End[]>()
  for (const m of ms) {
    if (m.ni === undefined || m.nj === undefined) continue
    const d: V3 = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]]
    const L = Math.hypot(...d)
    if (!(L > 1e-9)) continue
    const u: V3 = [d[0] / L, d[1] / L, d[2] / L]
    for (const [node, away, end] of [[m.ni, u, 0], [m.nj, [-u[0], -u[1], -u[2]], 1]] as const) {
      const list = at.get(node) ?? []
      list.push({ m, away: away as V3, end: end as 0 | 1 })
      at.set(node, list)
    }
  }
  const out = new Map<string, [number, number]>()
  for (const ends of at.values()) {
    const rank = ends.map((e) => jointRank(e.away, ends.filter((o) => o !== e).map((o) => o.away)))
    ends.forEach((e, i) => {
      let trim = 0
      ends.forEach((k, j) => {
        if (j === i || rank[j] <= rank[i]) return
        const par = Math.abs(e.away[0] * k.away[0] + e.away[1] * k.away[1] + e.away[2] * k.away[2])
        if (par > 0.999) return            // collinear: end to end, nothing to cut
        trim = Math.max(trim, exitDistance(e.away, k.m))
      })
      if (trim > 0) {
        const t = out.get(e.m.id) ?? [0, 0]
        t[e.end] = trim
        out.set(e.m.id, t)
      }
    })
  }
  for (const m of ms) {
    const t = out.get(m.id)
    if (!t) continue
    const L = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2])
    const sum = t[0] + t[1]
    if (sum > 0.9 * L) { t[0] *= (0.9 * L) / sum; t[1] *= (0.9 * L) / sum }
  }
  return out
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
): Station[] {
  const xs = m.forces.xs
  if (xs.length < 2) return []
  const L = Math.hypot(m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2])
  const x0 = trim[0], x1 = L - trim[1]
  const ring = sectionRing(m.section), centre = fibreAt(m.section, 0, 0)
  const at = (x: number, f: MemberForces): Station => ({
    x, ring: ring.map((fib) => stressAt(m.section, f, fib, key)), centre: stressAt(m.section, f, centre, key),
  })
  if (!(trim[0] > 0) && !(trim[1] > 0)) return xs.map((x, i) => at(x, forcesAt(m.forces, i)))
  const out: Station[] = [at(x0, forcesAtX(m.forces, x0))]
  xs.forEach((x, i) => { if (x > x0 + 1e-9 && x < x1 - 1e-9) out.push(at(x, forcesAt(m.forces, i))) })
  out.push(at(x1, forcesAtX(m.forces, x1)))
  return out
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

export interface MemberContourGeometry {
  position: Float32Array
  /** NORMALISED value per vertex, 0–1 — see `lib/contourMaterial` for why this
   *  is not a colour. */
  value: Float32Array
  index: number[]
}

/** Grow the drawn prism slightly so it sits proud of the solid member instead
 *  of z-fighting with it. 1.5% — enough to win the depth test, small enough
 *  that the contour still reads as the member's own surface. */
const PROUD = 1.015

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
): MemberContourGeometry | null {
  const pos: number[] = [], val: number[] = [], idx: number[] = []
  const trims = jointTrims(ms)
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
    const stations = drawnStations(m, key, trims.get(m.id))
    const n = stations.length
    const base = pos.length / 3

    const axisAt = (x: number): V3 => {
      const t = Math.max(0, Math.min(1, x / L))
      return [m.a[0] + dir[0] * t, m.a[1] + dir[1] * t - m.drop, m.a[2] + dir[2] * t]
    }
    const pushRing = (st: Station) => {
      const [px, py, pz] = axisAt(st.x)
      for (let c = 0; c < R; c++) {
        // mm → m, and out to the drawn face.
        const oy = (ring[c].y / 1000) * PROUD, oz = (ring[c].z / 1000) * PROUD
        pos.push(
          px + yp[0] * oy + zp[0] * oz,
          py + yp[1] * oy + zp[1] * oz,
          pz + yp[2] * oy + zp[2] * oz,
        )
        val.push(normalise(st.ring[c] ?? 0, domain))
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
      pos.push(...axisAt(st.x)); val.push(normalise(st.centre, domain))
      pushRing(st)
      for (let c = 0; c < R; c++) idx.push(hub, hub + 1 + c, hub + 1 + ((c + 1) % R))
    }
  }
  if (idx.length === 0) return null
  return { position: new Float32Array(pos), value: new Float32Array(val), index: idx }
}

export { shearStress }
