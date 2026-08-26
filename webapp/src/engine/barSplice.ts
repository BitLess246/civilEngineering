// ─────────────────────────────────────────────────────────────────────────
// LAP SPLICES — where a bar is longer than the bar you can buy.
//
// Reinforcement is delivered in a commercial stock length. A bar the detail
// asks for longer than that does not exist: it is two or more bars lapped, and
// the lap is real steel that has to be drawn, bent round and paid for. The
// cages placed bars of any length at all, so a 12 m continuous beam bar was
// drawn — and billed — as one impossible piece.
//
// TWO RULES DECIDE WHERE THE JOINT GOES.
//
//   WHERE ALONG THE BAR. A splice belongs where the bar is least stressed, so
//   the caller names preferred positions: bottom steel laps near the supports
//   and top steel near midspan, which is the standard "50% of splices each side
//   of the support" arrangement. A preference is only taken when the pieces it
//   produces still fit the stock length — geometry first, preference second.
//
//   WHICH BARS LAP TOGETHER. §25.5.2: splices are STAGGERED, so that a section
//   through the member never cuts more than half the bars at a lap. Adjacent
//   bars in a face are therefore pushed apart by at least the lap length. All
//   of them lapping at one level is the classic defect this exists to avoid.
//
// Pure geometry: it splits paths and never invents a bar, a length or a lap —
// the lap length itself comes from `devLength` and is handed in.
//
// Units: lengths m, bar sizes mm.
// ─────────────────────────────────────────────────────────────────────────
import { cutLength, type RebarCage, type RebarRun, type Vec3 } from './rebarModel'

const seg = (a: Vec3, b: Vec3) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2])

/** ACI 318-14 §10.7.4.1 — an offset bend runs six across for one over. */
export const OFFSET_SLOPE = 6

/**
 * Which way the lapping piece steps aside, as a unit vector.
 *
 * INTO THE SECTION, not sideways. A top bar cranks DOWN behind the bar it laps
 * and a bottom bar cranks UP, because the face it is on is where the stirrup
 * is: a bar stepped sideways stays on the cover line and walks straight into
 * the stirrup's leg, which is the collision the section drawing shows. Stepped
 * inward it tucks under (or over) its partner and the stirrup passes outside
 * both.
 *
 * Anything else — a vertical column bar, a footing mat bar — has no tension
 * face to move away from, so it steps horizontally across itself.
 */
export function stepDirection(role: string, a: Vec3, b: Vec3): Vec3 {
  if (role === 'top') return [0, -1, 0]
  if (role === 'bottom') return [0, 1, 0]
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const h = Math.hypot(d[0], d[2])
  if (h < 1e-9) return [1, 0, 0]
  return [-d[2] / h, 0, d[0] / h]
}

/** Developed length of a polyline, m. */
export function pathLength(path: Vec3[]): number {
  let s = 0
  for (let k = 1; k < path.length; k++) s += seg(path[k - 1], path[k])
  return s
}

/** The point `s` along a polyline, clamped to its ends. */
export function pointAt(path: Vec3[], s: number): Vec3 {
  if (path.length === 0) return [0, 0, 0]
  if (s <= 0) return path[0]
  let acc = 0
  for (let k = 1; k < path.length; k++) {
    const d = seg(path[k - 1], path[k])
    if (acc + d >= s) {
      const t = d > 1e-12 ? (s - acc) / d : 0
      const a = path[k - 1], b = path[k]
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
    }
    acc += d
  }
  return path[path.length - 1]
}

/**
 * The part of an OPEN run between two arc-length positions, with the bend
 * diameters of the corners that survive the cut.
 *
 * `bendDia[j]` belongs to the interior vertex `path[j + 1]`, so a corner kept
 * from the original keeps its own bend and a cut end gets none — a piece must
 * never claim a bend that was cut off it.
 */
export function slicePath(
  path: Vec3[], bendDia: number[], s0: number, s1: number,
): { path: Vec3[]; bendDia: number[] } {
  const out: Vec3[] = [pointAt(path, s0)]
  const bends: number[] = []
  let acc = 0
  for (let k = 1; k < path.length - 1; k++) {
    acc += seg(path[k - 1], path[k])
    if (acc > s0 + 1e-9 && acc < s1 - 1e-9) {
      out.push(path[k])
      bends.push(bendDia[k - 1] ?? 0)
    }
  }
  out.push(pointAt(path, s1))
  return { path: out, bendDia: bends }
}

export interface SpliceOptions {
  /** Commercial bar length, m. */
  stock: number
  /** Lap length, m — Class B in tension (§25.5.2.1), §25.5.5 in compression. */
  lap: number
  /** Preferred splice positions as a fraction of the run, best first. */
  prefer?: number[]
  /**
   * Preferred positions PER ROLE, which is how a beam is actually spliced: the
   * two faces want OPPOSITE zones, not one shared list.
   *
   * Top steel laps in the MIDDLE HALF and bottom steel in the END QUARTERS —
   * each where its own bar is in compression rather than tension. One list for
   * both offered every bar both zones, so half the splices landed in the zone
   * the standard bar-bending sheet marks "avoid splicing in this region".
   */
  preferByRole?: Record<string, number[]>
  /** Shift every splice on this bar by this much, m — how staggering is applied. */
  stagger?: number
}

/** Splice centres, m along the run — the decision, separated so it is testable
 *  without building any geometry. Empty when the bar fits a stock length. */
export function spliceCentres(L: number, o: SpliceOptions): number[] {
  const usable = o.stock - o.lap
  if (usable <= 0 || L <= o.stock + 1e-9) return []
  const n = Math.max(2, Math.ceil(L / usable - 1e-9))
  const even = Array.from({ length: n - 1 }, (_, j) => ((j + 1) * L) / n)

  /** Do these centres give pieces that all fit a stock bar? */
  const fits = (c: number[]): boolean => {
    const cuts = [0, ...c, L]
    for (let k = 1; k < cuts.length; k++) {
      const half = k === 1 || k === cuts.length - 1 ? o.lap / 2 : o.lap
      if (cuts[k] - cuts[k - 1] + half > o.stock + 1e-9) return false
      if (cuts[k] <= cuts[k - 1] + 1e-9) return false
    }
    return true
  }

  let out = even
  // Preference: move each splice to the nearest preferred position, keeping it
  // only while every piece still fits. Geometry first, preference second.
  if (o.prefer?.length) {
    const cand = out.map((s) => {
      const want = o.prefer!.map((f) => f * L)
      // Seeded with the FIRST preference, not with `s`. Seeded with `s` the
      // comparison was `|w − s| < 0`, false for every w, so the preference could
      // never win and every splice stayed wherever the even division put it —
      // the whole mechanism was inert.
      return want.reduce((best, w) => (Math.abs(w - s) < Math.abs(best - s) ? w : best))
    })
    const sorted = [...cand].sort((a, b) => a - b)
    if (fits(sorted)) out = sorted
  }
  // Stagger: the whole bar's splices shift together, so neighbouring bars lap
  // at different sections. Dropped whole if it would overrun a stock length.
  if (o.stagger) {
    const moved = out.map((s) => s + o.stagger!)
    if (moved.every((s) => s > 0 && s < L) && fits(moved)) out = moved
  }
  return out
}

/**
 * One run as the pieces it is really made of.
 *
 * A closed run is never split: a tie is cut nested from stock and its lap is
 * the hooked overlap already in `hookAllowance`.
 */
/**
 * Where ONE run is lapped, as arc length along its own path, m.
 *
 * Split out of `spliceRun` so that anything which has to know where the laps
 * fall — the hoops, which §425.5.2 closes up through a splice — asks the same
 * function that puts them there. Derived twice, the hoops would be tightened
 * over a lap the bar does not have.
 */
export function runSpliceCentres(run: RebarRun, o: SpliceOptions): number[] {
  if (run.closed) return []
  const L = pathLength(run.path)
  // Judge against the FABRICATED length — bends and hooks are bar too, which is
  // the whole point of "consider all lengths, bend, hook, crank, anchor".
  const made = cutLength(run) / 1000
  const off = run.dia / 1000                       // one diameter, m
  // The stepped-aside piece is fractionally longer than the straight one it
  // replaces, so the allowance comes off the stock before the cuts are chosen.
  return spliceCentres(L, { ...o, stock: o.stock - Math.max(0, made - L) - off })
}

export function spliceRun(run: RebarRun, o: SpliceOptions): RebarRun[] {
  if (run.closed) return [run]
  const L = pathLength(run.path)
  const off = run.dia / 1000                       // one diameter, m
  const centres = runSpliceCentres(run, o)
  if (!centres.length) return [run]

  const cuts = [0, ...centres, L]
  const pieces: RebarRun[] = []
  const letter = 'abcdefghijklmnopqrstuvwxyz'
  for (let k = 1; k < cuts.length; k++) {
    // each piece runs half a lap past the joint at each end it shares
    const s0 = Math.max(0, cuts[k - 1] - (k > 1 ? o.lap / 2 : 0))
    const s1 = Math.min(L, cuts[k] + (k < cuts.length - 1 ? o.lap / 2 : 0))
    const { path, bendDia } = slicePath(run.path, run.bendDia, s0, s1)
    pieces.push({
      ...run,
      mark: `${run.mark}${letter[k - 1] ?? k}`,
      // Every piece but the first steps one diameter aside over the length it
      // laps, and cranks back onto line beyond it. Two bars lapped on the same
      // centreline occupy the same space — impossible to build, and invisible
      // to look at, which is the state the cages were in.
      ...stepAside(path, bendDia, k > 1 ? o.lap : 0, off, run.dia, run.role),
      // a cut end is not a hook; only the original ends keep theirs
      hookAllowance: undefined,
    })
  }
  return pieces
}

/**
 * Offset the first `lap` of a piece one diameter across the bar, cranking back
 * onto line over the §10.7.4.1 slope.
 *
 * Left alone when the lap does not fit inside the piece's first straight leg —
 * a crank folded through a bend the bar already has would move the bar
 * somewhere it was never detailed to go, and a straight lap is the lesser
 * wrong.
 */
export function stepAside(
  path: Vec3[], bendDia: number[], lap: number, off: number, dia: number, role = 'bottom',
): { path: Vec3[]; bendDia: number[] } {
  const crank = OFFSET_SLOPE * off
  if (lap <= 0 || path.length < 2) return { path, bendDia }
  const first = seg(path[0], path[1])
  if (first < lap + crank + 1e-9) return { path, bendDia }

  const n = stepDirection(role, path[0], path[1])
  const shift = (p: Vec3): Vec3 => [p[0] + n[0] * off, p[1] + n[1] * off, p[2] + n[2] * off]
  const at = (s: number) => pointAt(path, s)
  const D = Math.max(6 * dia, 1)                   // §425.3.1 minimum bend
  return {
    path: [shift(path[0]), shift(at(lap)), at(lap + crank), ...path.slice(1)],
    bendDia: [D, D, ...bendDia],
  }
}

/** Roles that are cut, not lapped — closed loops nested out of stock bars. */
const NEVER_SPLICED = new Set(['stirrup', 'tie', 'hoop'])

/**
 * Every run in a cage, spliced where it exceeds a stock bar, with the splices
 * of neighbouring bars in the same face staggered against each other.
 *
 * The stagger alternates ±lap/2 by position within the face, so a section never
 * cuts more than half the bars at a lap (§25.5.2) and the two groups are a full
 * lap apart — the difference between the two details in every splicing guide.
 */
export function spliceCage(cage: RebarCage, o: SpliceOptions): RebarCage {
  const byRole = new Map<string, number>()
  const runs: RebarRun[] = []
  for (const r of cage.runs) {
    if (NEVER_SPLICED.has(r.role)) { runs.push(r); continue }
    const k = byRole.get(r.role) ?? 0
    byRole.set(r.role, k + 1)
    const prefer = o.preferByRole?.[r.role] ?? o.prefer
    runs.push(...spliceRun(r, { ...o, prefer, stagger: k % 2 === 0 ? -o.lap / 2 : o.lap / 2 }))
  }
  return { ...cage, runs }
}
