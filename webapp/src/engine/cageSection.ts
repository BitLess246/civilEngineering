// ─────────────────────────────────────────────────────────────────────────
// A CROSS-SECTION CUT THROUGH A CAGE
//
// Every section drawing in the app used to be RE-DERIVED: `columnSection` laid
// its own bars out with its own nx/ny split, `BeamSchematic` laid out its own
// layers, and each drew a stirrup from the section sizes and a set of drawing
// rules. Three descriptions of one cage, and the drawings could — and did —
// disagree with the steel the schedule bills and the 3D view paints.
//
// So a section is now a CUT, not a drawing. Pass the plane, get back what the
// plane actually crosses:
//
//   • a bar the cut passes THROUGH becomes a dot, at the point it crosses;
//   • a tie, stirrup or hoop lying IN the cut becomes its own drawn polyline —
//     `runPolylines`, the very geometry the 3D scene tubes — so the hooks, the
//     135° returns, the cross ties and the corner curls are the cage's, not a
//     second opinion about what they ought to look like.
//
// Nothing here decides where steel goes. If the section comes out wrong, the
// cage is wrong, and that is the point: there is now one place to fix it.
//
// Units: geometry m, bar sizes mm — the cage's own convention.
// ─────────────────────────────────────────────────────────────────────────
import type { PlanPrimitive } from './planRenderer'
import {
  projectPoint, type RebarCage, type RebarRole, type RebarRun, type Vec3, type ViewPlane,
} from './rebarModel'
import { runPolylines, selfClearance } from './rebarWire'

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross3 = (a: Vec3, b: Vec3): Vec3 =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const len3 = (a: Vec3) => Math.hypot(a[0], a[1], a[2])
const unit = (a: Vec3): Vec3 => { const l = len3(a); return l < 1e-12 ? [0, 0, 0] : [a[0] / l, a[1] / l, a[2] / l] }

/** The cutting plane, and the sheet plane the cut is drawn on. */
export interface CageCut {
  /** A point the plane passes through, m. */
  at: Vec3
  /** Plane normal — the direction you look ALONG. Need not be unit. */
  normal: Vec3
  /** Where the cut is drawn. Its u and v span the cutting plane. */
  plane: ViewPlane
  /**
   * Transverse steel within this of the plane is drawn, m.
   *
   * Omitted, the NEAREST set is drawn and nothing else — which is what a
   * section drawing wants: a cut landing between two stirrups still shows a
   * stirrup, because the section is representative of the zone, not a
   * photograph of one millimetre of beam. `station` reports how far away the
   * set it found really was, so a caller that cares can say so.
   */
  reach?: number
  /**
   * How far a run may stray from a single plane and still be taken to LIE IN
   * the cut rather than to cross it, m. Default 5 mm — ON TOP of the drift.
   *
   * A tie is placed in one plane, but it is not drawn in one: a closed tie
   * leans a full bar diameter over its run so its two ends can pass each other
   * (`selfClearance`), and the drawn geometry is what gets cut here. So the
   * test is spread ≤ flat + one diameter, per run. A flat 5 mm rejected every
   * ⌀12 stirrup in the app and returned a section with no transverse steel at
   * all — which is worth stating, because the failure looks like "the beam has
   * no stirrups" rather than like a tolerance.
   */
  flat?: number
}

/** A longitudinal bar the plane passes through — drawn as a dot. */
export interface CutBar {
  /** Where it crosses, in the sheet plane's own coordinates, m. */
  u: number
  v: number
  dia: number
  role: RebarRole
  mark: string
}

/** Transverse steel lying in the plane — drawn as the polyline the cage bends. */
export interface CutTie {
  pts: [number, number][]
  dia: number
  role: RebarRole
  mark: string
  /** Distance of this bar's own plane from the cut, m. */
  offset: number
}

export interface CageCutResult {
  bars: CutBar[]
  ties: CutTie[]
  /**
   * How far the drawn transverse set sits from the requested plane, m.
   * `null` when the cage has no transverse steel at all.
   */
  station: number | null
}

/**
 * The sheet plane for a cut across a member running along `axis`.
 *
 * A VERTICAL member is cut horizontally and read as a plan — x across the page,
 * z down it — which is how a column section is drawn and how its b×h reads.
 * Anything else is cut vertically and read as an elevation-on-end: the page's
 * down is the world's down, so the top steel is at the top of the drawing.
 */
export function crossSectionPlane(axis: Vec3, origin: Vec3 = [0, 0, 0]): ViewPlane {
  const a = unit(axis)
  if (Math.abs(a[1]) > 0.9) return { origin, u: [1, 0, 0], v: [0, 0, 1] }
  const u = unit(cross3(a, [0, 1, 0]))
  return { origin, u: len3(u) < 0.5 ? [1, 0, 0] : u, v: [0, -1, 0] }
}

/**
 * A cut across the member i→j, at `t` of the way along it (0 = i, 1 = j).
 *
 * The plane is square to the member's own axis, which is what a section on a
 * detail means — not square to a global axis, so a raked or sloping member
 * still sections truly.
 */
export function memberCut(i: Vec3, j: Vec3, t: number, opts: Partial<CageCut> = {}): CageCut {
  const axis = sub3(j, i)
  const at: Vec3 = [i[0] + axis[0] * t, i[1] + axis[1] * t, i[2] + axis[2] * t]
  return { at, normal: axis, plane: crossSectionPlane(axis, at), ...opts }
}

/**
 * Cut a cage, and get back what the plane crosses.
 *
 * The geometry read is `runPolylines` — the run AS DRAWN, filleted corners,
 * hook tails and the tie's own drift included — so a section cannot show a
 * shape the 3D view does not.
 */
export function cutCage(cage: RebarCage, cut: CageCut): CageCutResult {
  const n = unit(cut.normal)
  const flat = cut.flat ?? 0.005
  const s = (p: Vec3) => dot3(sub3(p, cut.at), n)

  const bars: CutBar[] = []
  // `s` is the SIGNED distance of the run's own plane from the cut; `offset`
  // is how far away it is. Both are needed: the offset ranks the sets, the
  // sign keeps a set on one side of the cut from being merged with the set on
  // the other side when the cut lands exactly between them.
  const flats: { run: RebarRun; polys: Vec3[][]; s: number; offset: number }[] = []

  for (const run of cage.runs) {
    const polys = runPolylines(run)
    const all = polys.flat()
    if (all.length < 2) continue
    const ds = all.map(s)
    const lo = Math.min(...ds), hi = Math.max(...ds)
    if (hi - lo <= flat + selfClearance(run.dia)) {
      // It lies in a plane parallel to the cut — a tie, a stirrup, a hoop.
      const mid = (lo + hi) / 2
      flats.push({ run, polys, s: mid, offset: Math.abs(mid) })
      continue
    }
    // Otherwise it is a bar going somewhere: take every crossing.
    for (const poly of polys) {
      for (let k = 1; k < poly.length; k++) {
        const a = poly[k - 1]!, b = poly[k]!
        const sa = s(a), sb = s(b)
        // A segment ENDING exactly on the plane is counted by the next segment
        // that leaves it, never twice — hence `sa` open and `sb` closed.
        if (sa === sb) continue
        const t = sa / (sa - sb)
        if (t <= 0 || t > 1) continue
        const p: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
        const [u, v] = projectPoint(p, cut.plane)
        bars.push({ u, v, dia: run.dia, role: run.role, mark: run.mark })
      }
    }
  }

  // ── which transverse set to draw ────────────────────────────────────────
  //
  // An explicit `reach` is a band, and takes everything in it. Without one it
  // is the NEAREST SET — and a set is not one bar at one level. A hoop and the
  // cross ties threaded through it physically rest on one another, so the cage
  // stacks them a tie diameter apart (`stackAt`); asking for the runs at
  // exactly the nearest level returns whichever one of them happened to land
  // closest and drops the rest, which is how a 12-bar column comes out drawn
  // with a cross tie and no hoop around it.
  //
  // So the set is grown by CHAINING: start at the nearest, and take in any run
  // within a diameter or so of one already taken. That is the stacking rule
  // itself — members of a set are a diameter apart, the next set is a whole
  // spacing away — so it needs to be told neither the set size nor the
  // spacing.
  let station: number | null = null
  let keep: typeof flats = []
  if (flats.length) {
    const sorted = [...flats].sort((a, b) => a.offset - b.offset)
    station = sorted[0]!.offset
    if (cut.reach != null) {
      keep = flats.filter((f) => f.offset <= cut.reach! + 1e-9)
    } else {
      keep = [sorted[0]!]
      let last = sorted[0]!.s
      for (const f of sorted.slice(1)) {
        const tol = Math.max(1.5 * f.run.dia / 1000, 1e-4)
        if (Math.abs(f.s - last) > tol) break
        keep.push(f)
        last = f.s
      }
    }
  }

  const ties: CutTie[] = keep.flatMap((f) => f.polys.map((poly) => ({
    pts: poly.map((p) => projectPoint(p, cut.plane)),
    dia: f.run.dia,
    role: f.run.role,
    mark: f.run.mark,
    offset: f.offset,
  })))

  return { bars, ties, station }
}

/** Cut several cages at once — a beam-column joint is more than one cage. */
export function cutCages(cages: RebarCage[], cut: CageCut): CageCutResult {
  const parts = cages.map((c) => cutCage(c, cut))
  const stations = parts.map((p) => p.station).filter((v): v is number => v != null)
  return {
    bars: parts.flatMap((p) => p.bars),
    ties: parts.flatMap((p) => p.ties),
    station: stations.length ? Math.min(...stations) : null,
  }
}

export interface CutStyle {
  /** Fill of a cut bar. */
  bar?: string
  /** Stroke of transverse steel. */
  tie?: string
  /** Transverse stroke weight, px. */
  tieWidth?: number
  /** Least radius a bar dot is drawn at, m — so a ⌀10 still reads on a sheet
   *  scaled to a whole column. Omitted, bars are drawn true to size. */
  minBarRadius?: number
}

/** The cut, as something a sheet can paint. */
export function cutPrimitives(res: CageCutResult, style: CutStyle = {}): PlanPrimitive[] {
  const bar = style.bar ?? '#37526e'
  const tie = style.tie ?? '#37526e'
  const P: PlanPrimitive[] = []
  // Transverse steel first, so a bar dot sits ON its tie rather than under it —
  // which is the reading that says the tie restrains the bar.
  for (const t of res.ties) {
    if (t.pts.length < 2) continue
    P.push({
      kind: 'path',
      stroke: tie,
      width: style.tieWidth ?? 1.2,
      fill: 'none',
      cap: 'round',
      join: 'round',
      cmds: t.pts.map(([x, y], k) => ({ c: k === 0 ? 'M' : 'L', x, y } as const)),
    })
  }
  for (const b of res.bars) {
    P.push({ kind: 'circle', cx: b.u, cy: b.v, r: Math.max(style.minBarRadius ?? 0, b.dia / 2000), fill: bar })
  }
  return P
}

/** Bounding box of a cut, m — for a caller sizing a viewbox around it. */
export function cutBounds(res: CageCutResult): { minU: number; maxU: number; minV: number; maxV: number } | null {
  const us: number[] = [], vs: number[] = []
  for (const b of res.bars) { us.push(b.u - b.dia / 2000, b.u + b.dia / 2000); vs.push(b.v - b.dia / 2000, b.v + b.dia / 2000) }
  for (const t of res.ties) for (const [u, v] of t.pts) { us.push(u); vs.push(v) }
  if (!us.length) return null
  return { minU: Math.min(...us), maxU: Math.max(...us), minV: Math.min(...vs), maxV: Math.max(...vs) }
}
