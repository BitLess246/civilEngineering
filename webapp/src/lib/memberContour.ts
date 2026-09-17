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
 * Six per side = 24 points around the ring, against 25-odd stations the solver
 * already gives along the length (`NS = 24` in `frame3d`), so the mesh is about
 * as fine across as it is along. 600 vertices a member: a 26-member frame is
 * 15 600, which is nothing, and the count is linear in members.
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
  const h = 2 * s.cy, b = 2 * s.cz
  const Qz = (y: number) => (b * (h * h / 4 - y * y)) / 2
  const Qy = (z: number) => (h * (b * b / 4 - z * z)) / 2
  const at = (y: number, z: number): Fibre => {
    const qz = Math.max(0, Qz(y)), qy = Math.max(0, Qy(z))
    return {
      y, z, label: '',
      // Omitted rather than zero where there is no flow: `shearStress` treats a
      // missing pair as a free surface, which is the same answer and says so.
      ...(qz > 0 && b > 0 ? { Qz: qz, tz: b } : {}),
      ...(qy > 0 && h > 0 ? { Qy: qy, ty: h } : {}),
    }
  }
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

/** The domain every member shares, so two members are comparable. */
export function memberContourDomain(ms: readonly ContourMember[], key: MemberStressKey): Domain {
  const all: number[] = []
  for (const m of ms) for (const row of memberValues(m, key)) all.push(...row)
  return stressDomain(all, isSignedMember(key))
}

/** The extreme value and where it is, for the read-out beside the legend. */
export function memberPeak(
  ms: readonly ContourMember[], key: MemberStressKey,
): { id: string; value: number; x: number } | null {
  let best: { id: string; value: number; x: number } | null = null
  for (const m of ms) {
    const vals = memberValues(m, key)
    for (let i = 0; i < vals.length; i++) {
      for (const v of vals[i]) {
        if (!Number.isFinite(v)) continue
        if (!best || Math.abs(v) > Math.abs(best.value)) best = { id: m.id, value: v, x: m.forces.xs[i] ?? 0 }
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
  for (const m of ms) {
    const n = m.forces.xs.length
    if (n < 2) continue
    const dir: V3 = [m.b[0] - m.a[0], m.b[1] - m.a[1], m.b[2] - m.a[2]]
    const L = Math.hypot(...dir)
    if (!(L > 1e-9)) continue
    // THE SOLVER'S BASIS. See the file header — the renderer's is different for
    // every column.
    const [, yp, zp] = localAxes(dir, m.rotDeg)
    const ring = sectionRing(m.section)
    const R = ring.length
    const vals = memberValues(m, key)
    const base = pos.length / 3

    for (let i = 0; i < n; i++) {
      const t = Math.max(0, Math.min(1, (m.forces.xs[i] ?? 0) / L))
      const px = m.a[0] + dir[0] * t
      const py = m.a[1] + dir[1] * t - m.drop
      const pz = m.a[2] + dir[2] * t
      for (let c = 0; c < R; c++) {
        // mm → m, and out to the drawn face.
        const oy = (ring[c].y / 1000) * PROUD, oz = (ring[c].z / 1000) * PROUD
        pos.push(
          px + yp[0] * oy + zp[0] * oz,
          py + yp[1] * oy + zp[1] * oz,
          pz + yp[2] * oy + zp[2] * oz,
        )
        val.push(normalise(vals[i]?.[c] ?? 0, domain))
      }
    }
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
  }
  if (idx.length === 0) return null
  return { position: new Float32Array(pos), value: new Float32Array(val), index: idx }
}

export { shearStress }
