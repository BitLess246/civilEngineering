// ─────────────────────────────────────────────────────────────────────────
// THE SECTION AT A STATION ON A MODELLED MEMBER
//
// `sectionDetail` draws a cut; this decides WHERE to cut and where the
// concrete is, for a member of a `StructuralModel`. It is the one place that
// has to know two conventions, both of which are easy to get silently wrong:
//
//   • A BEAM'S NODE LINE IS ITS TOP FACE. Floors are set out at the top of
//     steel, so `cageBuilder` places the cage from `ySoffit = node.y − h`. A
//     section drawn about the node with the concrete centred on it would be
//     half a depth out, with the top bars floating above the beam.
//   • A COLUMN'S SECTION READS b ACROSS z AND h ACROSS x. `columnCage` puts
//     the corner bars at h/2 along x and b/2 along z, so a section that
//     labelled the x extent `b` would be dimensioning the wrong face.
//
// Both are asserted in this module's tests against the placed cage, which is
// the only check that can catch them: they are off by a whole dimension and
// still draw a plausible-looking rectangle.
//
// Units: geometry m, sections mm.
// ─────────────────────────────────────────────────────────────────────────
import type { StructuralModel, RectSection } from './model'
import { memberCut, type CageCut } from './cageSection'
import { buildSectionDetail, type SectionDetailDrawing, type SectionOutline } from './sectionDetail'
import type { RebarCage, Vec3 } from './rebarModel'

export interface MemberSectionOptions {
  /** Sheet title. Defaults to the member id. */
  title?: string
  /** Lines printed under the drawing. */
  notes?: string[]
  /** Transverse steel within this of the cut is drawn — see `CageCut.reach`. */
  reach?: number
  dims?: boolean
}

/** Where the member is, and how its section sits about its own axis. */
export interface MemberGeometry {
  i: Vec3
  j: Vec3
  section: RectSection
  /** True where the member is vertical — a column, read as a plan. */
  vertical: boolean
}

/** Resolve a member's end points and section, or null if the model lacks either. */
export function memberGeometry(model: StructuralModel, memberId: string): MemberGeometry | null {
  const m = model.members.find((x) => x.id === memberId)
  if (!m) return null
  const ni = model.nodes.find((n) => n.id === m.i)
  const nj = model.nodes.find((n) => n.id === m.j)
  const section = model.sections.find((s) => s.id === m.section)
  if (!ni || !nj || !section) return null
  const i: Vec3 = [ni.x, ni.y, ni.z], j: Vec3 = [nj.x, nj.y, nj.z]
  const dy = Math.abs(nj.y - ni.y)
  const L = Math.hypot(nj.x - ni.x, nj.y - ni.y, nj.z - ni.z)
  return { i, j, section, vertical: L > 0 && dy / L > 0.9 }
}

/**
 * The concrete rectangle in the cut plane, m.
 *
 * A COLUMN is cut horizontally and read as a plan: the cut's origin is on the
 * column axis, which is its own centre, so the rectangle is centred — h across
 * the page (the x extent), b down it (the z extent).
 *
 * A BEAM is cut on end. The origin sits on the node line and the page's v runs
 * DOWN, so the concrete hangs from v = 0 to v = h: the node is the top face,
 * not the centroid.
 */
export function sectionOutline(g: MemberGeometry): SectionOutline {
  const b = g.section.b / 1000, h = g.section.h / 1000
  if (g.vertical) return { u0: -h / 2, v0: -b / 2, u1: h / 2, v1: b / 2 }
  return { u0: -b / 2, v0: 0, u1: b / 2, v1: h }
}

/**
 * A section sheet through one modelled member at `t` of its length.
 *
 * Only the member's OWN cage is cut. A beam sectioned at a support passes
 * through the column's steel too, and drawing it would be truthful and
 * unreadable — the schedule row is about this beam.
 */
export function memberSectionDetail(
  model: StructuralModel, cages: RebarCage[], memberId: string, t: number,
  opts: MemberSectionOptions = {},
): SectionDetailDrawing | null {
  const g = memberGeometry(model, memberId)
  if (!g) return null
  const cage = cages.find((c) => c.member === memberId)
  if (!cage) return null
  const cut: CageCut = memberCut(g.i, g.j, Math.max(0, Math.min(1, t)),
    opts.reach != null ? { reach: opts.reach } : {})
  return buildSectionDetail({
    title: opts.title ?? memberId,
    outline: sectionOutline(g),
    cages: [cage],
    cut,
    cover: g.section.cover,
    dims: opts.dims,
    notes: opts.notes,
  })
}

/** Length of a member, m — what a station in metres is measured against. */
export function memberLength(g: MemberGeometry): number {
  return Math.hypot(g.j[0] - g.i[0], g.j[1] - g.i[1], g.j[2] - g.i[2])
}
