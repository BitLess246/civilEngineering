// ─────────────────────────────────────────────────────────────────────────
// THE COLUMN CAGE — verticals and ties as bars, not as picture.
//
// Written for the beam sheet, which draws the two columns its member frames
// into and until now drew them empty: concrete outlines with nothing inside,
// while the beam bars hooked down into a joint that showed no steel to hook
// behind. It is deliberately NOT beam-sheet specific. The cage is built in
// model space, so the same object serves the elevation, a plan, a section and
// (later) the 3D view, and the take-off can weigh it.
//
// WHAT IT DOES NOT DO. This designs nothing. Bar count, bar size, tie size and
// the governing tie spacing all come from `columnDesign`, which owns §425.7.2
// and §418.7.5; this module places what that produced. Every spacing it is
// handed is used as given, so a cage can never quietly relax a rule the design
// applied.
//
// Units: plan dimensions, covers and bar sizes mm; positions and lengths m.
// ─────────────────────────────────────────────────────────────────────────
import {
  stirrupBendDiameter, stirrupHookAllowance, placedBarCount, hookBendDiameter,
  type RebarCage, type RebarRun, type Vec3,
} from './rebarModel'
import { supplementaryTies } from './columnTies'

export interface ColumnCageInput {
  /** Column mark — every bar in the cage carries it. */
  mark: string
  /** Plan dimensions, mm. `b` across the member, `h` along it. */
  b: number
  h: number
  /** Clear cover to the tie, mm. */
  cover: number
  /** Longitudinal bar Ø and how many there are around the perimeter. */
  barDia: number
  bars: number
  /** Tie Ø, mm. */
  tieDia: number
  /**
   * Tie spacing inside and outside the confinement zone, and the length of
   * that zone measured from each end of the column, mm. All three come from
   * `columnDesign` — `tieSpacingFinal`, `seismicSOut`, `seismicLoZone`. A
   * column with no seismic requirement passes the same value twice and
   * `lo = 0`.
   */
  sConfined: number
  sOutside: number
  lo: number
  /** Column centreline in plan, m. */
  centre: [number, number]
  /** The vertical extent the cage is drawn over, m. */
  yBottom: number
  yTop: number
  /**
   * A band of the column carrying no ties of its own, m — the depth of a beam
   * framing in. The joint's own hoops belong to the joint (§418.8.3) and are
   * drawn by whatever owns it, so placing column ties there too would draw the
   * steel twice and pay for it twice.
   */
  jointGap?: [number, number]
  /**
   * Lap splice projecting ABOVE `yTop`, mm — the compression splice of §25.5.5,
   * which the caller computes (`devLength.lsc`) because this module designs
   * nothing. Zero or omitted where no column continues above, e.g. at a roof.
   */
  spliceLap?: number
}

/** ACI 318-14 §10.7.4.1 — the inclined part of an offset bend may not be
 *  steeper than 1 in 6, so the crank runs six diameters for one across. */
export const OFFSET_BEND_SLOPE = 6

/** Distance from a face to the centre of the bar behind it, mm. */
export const barInset = (cover: number, tieDia: number, barDia: number) =>
  cover + tieDia + barDia / 2

/**
 * Where the longitudinal bars sit, as offsets from the column centre in plan,
 * mm — `[along h, across b]`.
 *
 * Four corners always, then the remainder shared between the two directions in
 * proportion to the clear length of each face, so a deep column gets its extra
 * bars on the deep faces where the spacing rule needs them. Bars come in
 * opposite pairs; an odd remainder goes to the longer face.
 */
export { placedBarCount }

export function perimeterBars(i: Pick<ColumnCageInput, 'b' | 'h' | 'cover' | 'barDia' | 'bars' | 'tieDia'>): [number, number][] {
  const ins = barInset(i.cover, i.tieDia, i.barDia)
  const xh = Math.max(0, i.h / 2 - ins)          // corner offset along h
  const zb = Math.max(0, i.b / 2 - ins)          // corner offset across b
  const out: [number, number][] = [[xh, zb], [xh, -zb], [-xh, zb], [-xh, -zb]]

  const rem = Math.max(0, Math.round(i.bars) - 4)
  if (rem <= 0) return out
  const clearH = 2 * xh, clearB = 2 * zb
  const half = Math.floor(rem / 2)
  const span = clearH + clearB
  let perH = span > 0 ? Math.round((half * clearH) / span) : Math.floor(half / 2)
  perH = Math.max(0, Math.min(half, perH))
  let perB = half - perH
  // an odd remainder cannot pair — give it to the longer face
  if (rem % 2 === 1) { if (clearH >= clearB) perH += 1; else perB += 1 }

  // extra bars along the two faces of length h (they vary in x, at z = ±zb)
  for (let k = 1; k <= perH; k++) {
    const x = -xh + (2 * xh * k) / (perH + 1)
    out.push([x, zb], [x, -zb])
  }
  // extra bars along the two faces of width b (they vary in z, at x = ±xh)
  for (let k = 1; k <= perB; k++) {
    const z = -zb + (2 * zb * k) / (perB + 1)
    out.push([xh, z], [-xh, z])
  }
  return out
}

/**
 * Tie levels up the column, m.
 *
 * Tight within `lo` of each end — that is where the plastic hinge forms and
 * where §418.7.5 asks for the close spacing — and wider through the middle.
 * A tie that would land inside `jointGap` is dropped: that band belongs to the
 * joint hoops.
 */
export function tieLevels(i: Pick<ColumnCageInput, 'yBottom' | 'yTop' | 'lo' | 'sConfined' | 'sOutside' | 'jointGap'>): number[] {
  const y0 = Math.min(i.yBottom, i.yTop), y1 = Math.max(i.yBottom, i.yTop)
  const H = y1 - y0
  if (H <= 0) return []
  const lo = Math.max(0, Math.min(i.lo / 1000, H / 2))
  const sc = Math.max(0.02, i.sConfined / 1000)
  const so = Math.max(sc, i.sOutside / 1000)      // never looser inside than out
  const spacingAt = (y: number) => (y - y0 <= lo + 1e-9 || y1 - y <= lo + 1e-9 ? sc : so)

  const out: number[] = []
  for (let y = y0; y <= y1 + 1e-9; y += spacingAt(y)) out.push(Math.min(y, y1))
  if (out.length === 0 || Math.abs(out[out.length - 1] - y1) > 1e-9) out.push(y1)

  const gap = i.jointGap
  return out.filter((y) => !gap || y < Math.min(...gap) - 1e-9 || y > Math.max(...gap) + 1e-9)
}

/**
 * The cage: one run per vertical bar, one per tie.
 *
 * Verticals are separate runs rather than one run with a count because they
 * really are at different places — which is the whole reason the model carries
 * a path instead of a length. Ties at the same spacing ARE identical, but they
 * sit at different levels, so they are separate runs too; `count` is reserved
 * for copies that share a shape AND a position, which in a cage means none.
 */
/** The same loop, started `k` corners round — how a hook is moved from one
 *  corner to the next without changing the bar. */
export function rotateLoop<T>(loop: T[], k: number): T[] {
  if (loop.length === 0) return loop
  const n = ((k % loop.length) + loop.length) % loop.length
  return [...loop.slice(n), ...loop.slice(0, n)]
}

/**
 * Push a tie's corners OUT off the bars they wrap.
 *
 * A supplementary tie is specified by the bars it engages, but the bar sits
 * inside the curl — so the tie's own corner is further out, by exactly enough
 * that its arc of radius `R` is centred on the bar. For an included angle θ
 * that offset is R/sin(θ/2) along the outward bisector.
 *
 * Placed ON the bars, as they were, the tie's centreline ran straight through
 * them: two bars in the same space, and the restraint drawn as an intersection
 * rather than a grip.
 */
export function wrapCorners(pts: [number, number][], R: number): [number, number][] {
  const n = pts.length
  if (n < 3) return pts
  return pts.map((c, i) => {
    const p = pts[(i - 1 + n) % n], q = pts[(i + 1) % n]
    const u = [p[0] - c[0], p[1] - c[1]], v = [q[0] - c[0], q[1] - c[1]]
    const lu = Math.hypot(u[0], u[1]), lv = Math.hypot(v[0], v[1])
    if (lu < 1e-9 || lv < 1e-9) return c
    const un = [u[0] / lu, u[1] / lu], vn = [v[0] / lv, v[1] / lv]
    const theta = Math.acos(Math.min(1, Math.max(-1, un[0] * vn[0] + un[1] * vn[1])))
    const bx = un[0] + vn[0], bz = un[1] + vn[1]
    const lb = Math.hypot(bx, bz)
    const sin = Math.sin(theta / 2)
    if (lb < 1e-9 || sin < 1e-6) return c
    const d = R / sin
    return [c[0] - (bx / lb) * d, c[1] - (bz / lb) * d] as [number, number]
  })
}

export function buildColumnCage(i: ColumnCageInput): RebarCage {
  const runs: RebarRun[] = []
  const notes: string[] = []
  const [cx, cz] = i.centre
  const y0 = Math.min(i.yBottom, i.yTop), y1 = Math.max(i.yBottom, i.yTop)

  // ── verticals, with the lap splice that carries them into the storey above ──
  //
  // A column bar does not stop at the floor: it runs on past it and the column
  // above laps onto it (§25.5.5). To leave room for that bar the projecting
  // part is CRANKED one diameter inboard, on the 1-in-6 offset bend §10.7.4.1
  // allows, which is the kink you see on every column cage on site. Drawn
  // straight to the top of the member, the cage claimed a splice that had
  // nowhere to happen.
  const ins = barInset(i.cover, i.tieDia, i.barDia)
  const xhF = Math.max(0, i.h / 2 - ins), zbF = Math.max(0, i.b / 2 - ins)
  const lap = Math.max(0, i.spliceLap ?? 0) / 1000
  const onFace = (v: number, face: number) => face > 0 && Math.abs(Math.abs(v) - face) < 1e-6

  perimeterBars(i).forEach(([dx, dz], k) => {
    const x = cx + dx / 1000, z = cz + dz / 1000
    const path: Vec3[] = [[x, y0, z]]
    const bendDia: number[] = []
    // A bar is cranked only on the faces it actually sits against: a corner bar
    // moves in on both axes, a mid-face bar only off its own face.
    const ox = onFace(dx, xhF) ? (-Math.sign(dx) * i.barDia) / 1000 : 0
    const oz = onFace(dz, zbF) ? (-Math.sign(dz) * i.barDia) / 1000 : 0
    // 1 in 6 applies to the BAR, so the run is six times the resultant offset.
    // Six diameters per axis would put a corner bar — which moves in on both —
    // on a 1-in-4.2 slope, steeper than §10.7.4.1 permits.
    const crankRun = OFFSET_BEND_SLOPE * Math.hypot(ox, oz)
    if (lap > 0 && crankRun > 0 && y1 - y0 > crankRun && (ox !== 0 || oz !== 0)) {
      const D = hookBendDiameter(i.barDia)
      path.push([x, y1 - crankRun, z], [x + ox, y1, z + oz], [x + ox, y1 + lap, z + oz])
      bendDia.push(D, D)
    } else {
      path.push([x, y1 + lap, z])
    }
    runs.push({
      mark: `${i.mark}-V${k + 1}`,
      dia: i.barDia,
      role: 'vertical',
      member: i.mark,
      path,
      bendDia,
      count: 1,
    })
  })

  // The tie itself: a closed rectangle on the cover line, its corners bent to
  // the transverse-steel diameter of §425.3.2 rather than the looser hook rule.
  const tx = Math.max(0, i.h / 2 - i.cover - i.tieDia / 2) / 1000
  const tz = Math.max(0, i.b / 2 - i.cover - i.tieDia / 2) / 1000
  const D = stirrupBendDiameter(i.tieDia)
  /** Centre-to-centre radius of a tie bent around a longitudinal bar, mm. */
  const R = (i.barDia + i.tieDia) / 2
  const hoop: Vec3[] = [
    [cx - tx, 0, cz - tz], [cx + tx, 0, cz - tz],
    [cx + tx, 0, cz + tz], [cx - tx, 0, cz + tz],
  ]
  // §425.7.2.3 / §418.7.5.2 — what the bars themselves ask for beyond the hoop.
  const extra = supplementaryTies(perimeterBars(i), i.barDia)

  // ── one SET of ties, stacked ────────────────────────────────────────────
  //
  // The hoop and every supplementary tie at a level are separate bars laid on
  // top of one another, not co-planar: each rests on the last, a diameter
  // apart. Drawn all at the same y they interpenetrated at every shared corner
  // — four bars occupying one bar's space. The stack is centred on the level,
  // so `sConfined` / `sOutside` stay centre-of-set to centre-of-set, which is
  // what a spacing on a schedule means.
  const setSize = 1 + extra.ties.length
  const stackAt = (j: number) => ((j - (setSize - 1) / 2) * i.tieDia) / 1000

  tieLevels(i).forEach((y, k) => {
    const yh = y + stackAt(0)
    runs.push({
      mark: `${i.mark}-T${k + 1}`,
      dia: i.tieDia,
      role: 'tie',
      member: i.mark,
      // §418.7.5.3 — successive ties have their hooks at DIFFERENT corners.
      // Stacked in one corner every hook in the column lands on the same two
      // bars, and the splitting they resist is left unrestrained everywhere
      // else. Rotating the loop's start rotates the corner they meet at.
      path: rotateLoop(hoop, k).map(([x, , z]) => [x, yh, z] as Vec3),
      bendDia: [D, D, D, D],
      closed: true,
      wrapDia: i.barDia,
      // the two 135° hooks the closed loop's vertices cannot express
      hookAllowance: stirrupHookAllowance(i.tieDia),
      count: 1,
    })
    extra.ties.forEach((t, j) => {
      // Closed ties wrap the bars at their corners. A cross tie ENDS at its
      // bars — pushing its ends outward to wrap them put the ends, and the
      // hooks beyond them, outside the hoop and through the cover.
      const plan = t.closed ? wrapCorners(t.corners, R) : t.corners
      const yj = y + stackAt(j + 1)
      const pts = plan.map(([dx, dz]) => [cx + dx / 1000, yj, cz + dz / 1000] as Vec3)
      runs.push({
        mark: `${i.mark}-${t.kind === 'cross' ? 'X' : t.kind === 'diamond' ? 'D' : 'I'}${k + 1}.${j + 1}`,
        dia: i.tieDia,
        role: 'tie',
        member: i.mark,
        path: t.closed ? rotateLoop(pts, k) : (k % 2 ? [...pts].reverse() : pts),
        bendDia: pts.map(() => D),
        closed: t.closed,
        wrapDia: i.barDia,
        // A cross tie is a single bar hooked at BOTH ends (§425.3.2), so it
        // carries the same allowance as a loop even though it is not one.
        hookAllowance: stirrupHookAllowance(i.tieDia),
        count: 1,
      })
    })
  })
  for (const n of extra.notes) notes.push(n)

  return { member: i.mark, runs, ...(notes.length ? { notes } : {}) }
}
