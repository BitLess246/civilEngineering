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
  normalStress, fibreStress, shearStress, stationStress,
  type StressSection, type MemberForceArrays, type MemberForces,
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

/** The four section corners, in a consistent go-around order so consecutive
 *  pairs are the four faces. */
export function sectionCorners(s: StressSection): { y: number; z: number }[] {
  return [
    { y: s.cy, z: s.cz }, { y: s.cy, z: -s.cz },
    { y: -s.cy, z: -s.cz }, { y: -s.cy, z: s.cz },
  ]
}

const forcesAt = (f: MemberForceArrays, i: number): MemberForces => ({
  N: f.N[i] ?? 0, Vy: f.Vy[i] ?? 0, Vz: f.Vz[i] ?? 0,
  T: f.T[i] ?? 0, My: f.My[i] ?? 0, Mz: f.Mz[i] ?? 0,
})

/**
 * Contour values for one member: `[station][corner]`, MPa.
 *
 * `sigma` and `vonMises` are evaluated AT each corner fibre, so they vary
 * around the section. `tau` is the section ENVELOPE — the largest shear
 * anywhere on the section, which is at the neutral axis and not at a corner —
 * so it is the same at all four and the legend says so. Painting the corner's
 * own τ instead would draw zero on every member with no torsion, which is true
 * of the corner and useless as a picture of shear.
 */
export function memberValues(m: ContourMember, key: MemberStressKey): number[][] {
  const corners = sectionCorners(m.section)
  const out: number[][] = []
  for (let i = 0; i < m.forces.xs.length; i++) {
    const f = forcesAt(m.forces, i)
    if (key === 'tau') {
      const t = stationStress(m.section, f).tauMax
      out.push([t, t, t, t])
      continue
    }
    out.push(corners.map((c) => key === 'sigma'
      ? normalStress(m.section, f, c.y, c.z)
      : fibreStress(m.section, f, { y: c.y, z: c.z, label: '' }).vonMises))
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
 * Build the contour skin: one four-sided prism per member, subdivided at the
 * force stations, vertex-coloured at the section corners.
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
    const corners = sectionCorners(m.section)
    const vals = memberValues(m, key)
    const base = pos.length / 3

    for (let i = 0; i < n; i++) {
      const t = Math.max(0, Math.min(1, (m.forces.xs[i] ?? 0) / L))
      const px = m.a[0] + dir[0] * t
      const py = m.a[1] + dir[1] * t - m.drop
      const pz = m.a[2] + dir[2] * t
      for (let c = 0; c < 4; c++) {
        // mm → m, and out to the drawn face.
        const oy = (corners[c].y / 1000) * PROUD, oz = (corners[c].z / 1000) * PROUD
        pos.push(
          px + yp[0] * oy + zp[0] * oz,
          py + yp[1] * oy + zp[1] * oz,
          pz + yp[2] * oy + zp[2] * oz,
        )
        val.push(normalise(vals[i]?.[c] ?? 0, domain))
      }
    }
    // Four faces per bay, two triangles each. The corner vertices are SHARED
    // between adjacent faces, so the colour interpolates around the section as
    // well as along the member.
    for (let i = 0; i < n - 1; i++) {
      for (let c = 0; c < 4; c++) {
        const d = (c + 1) % 4
        const p0 = base + i * 4 + c, p1 = base + i * 4 + d
        const q0 = base + (i + 1) * 4 + c, q1 = base + (i + 1) * 4 + d
        idx.push(p0, p1, q1, p0, q1, q0)
      }
    }
  }
  if (idx.length === 0) return null
  return { position: new Float32Array(pos), value: new Float32Array(val), index: idx }
}

export { shearStress }
