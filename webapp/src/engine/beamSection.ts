// ─────────────────────────────────────────────────────────────────────────
// A BEAM, CUT
//
// An elevation shows where the steel starts and stops. It cannot show how
// many bars are in a layer, which face they are on, or how the stirrup wraps
// them — for that a reader needs the beam cut, and the three cuts that matter
// are the two support faces and midspan: hogging steel at the ends, sagging
// at the middle, and the hoop spacing changing between them.
//
// The cut is taken from the CAGE, not from the schedule. A bar appears in a
// section if its own path crosses the cutting station, so a curtailed bar is
// absent from the section where it has stopped — which is the whole reason
// the three sections differ, and the reason a "typical section" printed once
// on a sheet has always been a small lie.
//
// Section axes: `across` is the beam's width (+ to the right of the span
// direction, looking along it), `up` is world up. Both in metres, measured
// from the beam's own centre and soffit respectively, so a caller scales them
// into a box without knowing where in the world the beam is.
// ─────────────────────────────────────────────────────────────────────────
import type { RebarCage, RebarRun, Vec3 } from './rebarModel'

/** One bar, cut. */
export interface SectionBar {
  /** Across the width from the beam's centreline, m. + is to the right. */
  across: number
  /** Above the soffit, m. */
  up: number
  /** Bar Ø, mm. */
  dia: number
  role: RebarRun['role']
}

/** One beam, cut at a station. */
export interface BeamSection {
  /** Distance along the span the cut was taken at, m. */
  at: number
  /** What the cut is called on the sheet. */
  label: string
  /** Beam width and depth, m. */
  b: number
  h: number
  bars: SectionBar[]
  /** The stirrup's outline in section, as (across, up) pairs, m — closed. */
  stirrup: [number, number][]
  /** Stirrup Ø, mm, and the spacing in force at this station, mm. */
  stirrupDia: number
  spacing: number | null
}

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

/** Where a path sits at a given station along `along`, or null if it does not
 *  reach that far. Interpolated, so a bar that starts mid-span is caught at
 *  the exact point it starts rather than at its nearest vertex. */
function pointAt(path: Vec3[], along: Vec3, origin: Vec3, s: number): Vec3 | null {
  const t = path.map((p) => dot([p[0] - origin[0], p[1] - origin[1], p[2] - origin[2]], along))
  for (let k = 0; k + 1 < path.length; k++) {
    const a = t[k], b = t[k + 1]
    if ((s < Math.min(a, b) - 1e-9) || (s > Math.max(a, b) + 1e-9)) continue
    const f = Math.abs(b - a) < 1e-12 ? 0 : (s - a) / (b - a)
    return [
      path[k][0] + (path[k + 1][0] - path[k][0]) * f,
      path[k][1] + (path[k + 1][1] - path[k][1]) * f,
      path[k][2] + (path[k + 1][2] - path[k][2]) * f,
    ]
  }
  return null
}

export interface CutInput {
  cage: RebarCage
  /** The beam's own direction, a unit vector. */
  along: Vec3
  /** A point on the beam's axis — the i-end node. */
  origin: Vec3
  /** Beam width and depth, m. */
  b: number
  h: number
  /** Soffit level, m — bar heights are reported above this. */
  soffit: number
  /** The beam's centreline offset across the span, m (usually 0). */
  centre?: number
}

/**
 * Cut the cage at a station.
 *
 * `label` is the caller's — the sheet knows whether this is a support face or
 * midspan; the geometry does not.
 */
export function cutBeam(i: CutInput, at: number, label: string): BeamSection {
  const across: Vec3 = [
    -i.along[2], 0, i.along[0],                       // along × up, normalised below
  ]
  const la = Math.hypot(across[0], across[2]) || 1
  const ax: Vec3 = [across[0] / la, 0, across[2] / la]
  const c = i.centre ?? 0

  const bars: SectionBar[] = []
  for (const r of i.cage.runs) {
    if (r.role === 'stirrup' || r.role === 'tie' || r.role === 'hoop') continue
    const p = pointAt(r.path, i.along, i.origin, at)
    if (!p) continue
    const d: Vec3 = [p[0] - i.origin[0], p[1] - i.origin[1], p[2] - i.origin[2]]
    bars.push({ across: dot(d, ax) - c, up: p[1] - i.soffit, dia: r.dia, role: r.role })
  }
  bars.sort((p, q) => (q.up - p.up) || (p.across - q.across))

  // The stirrup nearest the cut, in the section's own axes. Taken from a real
  // hoop rather than drawn from the cover, so a beam whose cage was built with
  // a different cover or bend shows that.
  const hoops = i.cage.runs.filter((r) => r.role === 'stirrup' || r.role === 'hoop')
  const stationOf = (r: RebarRun) => {
    const p = r.path[0]
    return dot([p[0] - i.origin[0], p[1] - i.origin[1], p[2] - i.origin[2]], i.along)
  }
  const sorted = [...hoops].sort((p, q) => Math.abs(stationOf(p) - at) - Math.abs(stationOf(q) - at))
  const near = sorted[0]
  const stirrup: [number, number][] = near
    ? near.path.map((p) => {
      const d: Vec3 = [p[0] - i.origin[0], p[1] - i.origin[1], p[2] - i.origin[2]]
      return [dot(d, ax) - c, p[1] - i.soffit] as [number, number]
    })
    : []

  // The spacing in force here: the gap to the next hoop along, which is what a
  // fixer measures. Read off the two nearest, so it changes between the end
  // zone and the middle exactly where the cage changes it.
  const stations = hoops.map(stationOf).sort((p, q) => p - q)
  let spacing: number | null = null
  for (let k = 0; k + 1 < stations.length; k++) {
    if (at >= stations[k] - 1e-6 && at <= stations[k + 1] + 1e-6) {
      spacing = Math.round((stations[k + 1] - stations[k]) * 1000)
      break
    }
  }
  if (spacing === null && stations.length > 1) {
    spacing = Math.round((stations[1] - stations[0]) * 1000)
  }

  return {
    at, label, b: i.b, h: i.h, bars, stirrup,
    stirrupDia: near?.dia ?? 0, spacing,
  }
}

/**
 * The three cuts a span is detailed by: both support FACES and midspan.
 *
 * The faces, not the centrelines — half a column sits inside each end of a
 * beam, and the hogging steel is checked at the face it actually starts from.
 */
export function spanSections(
  i: CutInput, u0: number, u1: number, faceI = 0, faceJ = 0,
): BeamSection[] {
  const a = u0 + faceI, b = u1 - faceJ
  if (!(b > a)) return []
  const eps = Math.min(0.02, (b - a) / 20)            // just inside the face
  return [
    cutBeam(i, a + eps, 'A'),
    cutBeam(i, (a + b) / 2, 'B'),
    cutBeam(i, b - eps, 'C'),
  ]
}

/** How the section's bars group into a callout: "3-⌀20 TOP, 2-⌀20 BOT." */
export function sectionTally(s: BeamSection): { top: string; bot: string } {
  const count = (role: 'top' | 'bottom') => {
    const g = new Map<number, number>()
    for (const b of s.bars) if (b.role === role) g.set(b.dia, (g.get(b.dia) ?? 0) + 1)
    return [...g.entries()].sort((p, q) => q[0] - p[0])
      .map(([d, n]) => `${n}-⌀${d}`).join(' + ')
  }
  return { top: count('top'), bot: count('bottom') }
}
