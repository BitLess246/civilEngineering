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
  stirrupBendDiameter, placedBarCount, hookBendDiameter,
  closedTieClosureAllowance, crossTieHookAllowance, turnAngles,
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
   * Bands of the column carrying no ties of their own, m — the depth of a beam
   * framing in, at each end that has one. The joint's own hoops belong to the joint (§418.8.3) and are
   * drawn by whatever owns it, so placing column ties there too would draw the
   * steel twice and pay for it twice.
   */
  jointGaps?: [number, number][]
  /**
   * Spacing of the hoops THROUGH a joint band, mm.
   *
   * §418.8.3.1: the column's confinement carries on through the joint — the
   * joint is the most heavily worked part of the column and the one place the
   * bars of two beams and two columns all pass at once. Defaults to the
   * column's own confined spacing, which is the strict requirement; §418.8.3.2
   * permits half the amount at 150 mm where beams frame in on all four sides
   * and each is at least 3/4 of the column width, and that relaxation is the
   * caller's to claim because only the caller knows the framing.
   */
  jointHoopSpacing?: number
  /**
   * How much higher the ALTERNATE bars start their lap, m.
   *
   * Every bar lapping at one level puts a section through the column that cuts
   * EVERY bar at a splice. §25.5.2 is written the other way round — a lap is
   * Class B unless no more than half the bars are spliced within one lap
   * length — and the standard column detail staggers alternate bars by a full
   * lap for exactly that reason. Zero (the default) is the unstaggered
   * arrangement, and the cage says so in a note when there was no room for it.
   */
  spliceStagger?: number
  /**
   * Lap splice projecting ABOVE `yTop`, mm — the compression splice of §25.5.5,
   * which the caller computes (`devLength.lsc`) because this module designs
   * nothing. Zero or omitted where no column continues above, e.g. at a roof.
   */
  spliceLap?: number
  /**
   * The column ABOVE, where it is not the same size — its plan dimensions and
   * cover/bar/tie, mm. The projecting bar is cranked to meet the bar it laps
   * onto, not merely a diameter inboard.
   *
   * A reduction in column size is the ordinary case that needs this: the bar
   * above stands further in, and the bar below has to reach it. Cranked by a
   * fixed diameter the two never met, and the drawing showed a lap between
   * bars in different places.
   */
  above?: { b: number; h: number; cover?: number; barDia?: number; tieDia?: number }
  /**
   * Where a column that STOPS here turns its bars in, m relative to `yTop` —
   * negative to turn them in below it, which is where the beam's top steel is.
   *
   * A roof column laps onto nothing, and its verticals were drawn simply
   * ending at the top of the member. A bar that stops is not anchored:
   * §425.4.2 wants it developed, and the standard roof-joint detail turns it
   * 90° into the beam and runs ℓext = 12·db across, passing UNDER the beam's
   * top steel so the column bar and the beam bar hold each other. Set this to
   * put that leg just below the beam's top bars. Ignored where `spliceLap` is
   * non-zero, because then the bar carries on instead.
   */
  topHookRise?: number
  /**
   * How far ABOVE `yTop` the lap onto the column above begins, m —
   * ACI 318-14 §18.7.4.3 / NSCP §418.7.4.3.
   *
   * A column lap splice must sit within the CENTRE HALF of the member length,
   * so the bars below run on past the floor into the middle of the storey above
   * before lapping. Left at zero the lap starts at the floor itself, which is
   * the end quarter — the high-tensile-stress zone under lateral load, and
   * exactly where the rule forbids it. The 2D column sheet has drawn the centre
   * -half splice window all along; only the cage disagreed.
   *
   * METRES — unlike `spliceLap` beside it, which is mm. The cage's vertical
   * extents (`yBottom`, `yTop`, `centre`) are all metres and this is measured
   * against them, so it belongs to that group; but the two sit next to each
   * other in the same interface and the mismatch has caught a caller, which is
   * why it is spelt out here.
   */
  spliceRise?: number
}

/** ACI 318-14 §10.7.4.1 — the inclined part of an offset bend may not be
 *  steeper than 1 in 6, so the crank runs six diameters for one across. */
export const OFFSET_BEND_SLOPE = 6

/** §410.7.4.5 — past this offset the bar may not be bent at all: the column
 *  above is dowelled instead, and the dowels lap with the bars below. mm. */
export const OFFSET_DOWEL_LIMIT = 75

/** Table 425.3.1 — straight extension beyond a standard 90° hook, in bar Ø. */
export const HOOK_EXTENSION = 12

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
 * A tie that would land inside a `jointGaps` band is dropped: that band belongs
 * to the joint hoops.
 *
 * There is one band at each END that has a joint, not just at the top. A column
 * only ever cleared the joint above it, so at every floor the column starting
 * there filled the band the column below had deliberately left empty — the
 * joint came out with column ties AND joint hoops through it, drawn twice and
 * paid for twice.
 */
export function tieLevels(i: Pick<ColumnCageInput, 'yBottom' | 'yTop' | 'lo' | 'sConfined' | 'sOutside' | 'jointGaps'>): number[] {
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

  const gaps = i.jointGaps ?? []
  return out.filter((y) => gaps.every((g) => y < Math.min(...g) - 1e-9 || y > Math.max(...g) + 1e-9))
}

/**
 * Where the hoops go INSIDE each joint band, m.
 *
 * `tieLevels` deliberately leaves these bands empty because the joint's hoops
 * own them (§418.8.3) — but nothing filled them, so a joint came out of the
 * viewer as a bare gap in the cage with the beam bars passing through it. The
 * general notes said "column ties stop at the joint and the joint hoops take
 * over"; the joint hoops were never drawn.
 *
 * Divided rather than stepped from the bottom of the band. A joint is one beam
 * deep — a few hundred millimetres — and stepping at the spacing leaves a
 * remainder that is the difference between a hoop and none. Centring the set
 * in the band also keeps the first one clear of the last column tie at the
 * band's edge.
 */
export function jointHoopLevels(i: Pick<ColumnCageInput,
  'jointGaps' | 'sConfined' | 'jointHoopSpacing'>): number[] {
  const want = i.jointHoopSpacing && i.jointHoopSpacing > 0 ? i.jointHoopSpacing : i.sConfined
  const s = Math.max(0.02, want / 1000)
  const out: number[] = []
  for (const g of i.jointGaps ?? []) {
    const lo = Math.min(...g), hi = Math.max(...g)
    const H = hi - lo
    if (H <= 1e-9) continue
    const n = Math.max(1, Math.round(H / s))
    for (let k = 0; k < n; k++) out.push(lo + (H * (k + 0.5)) / n)
  }
  return out.sort((a, b) => a - b)
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
  // Where the bars of the column ABOVE stand. Same size unless told otherwise.
  const up = i.above
  const upIns = up
    ? barInset(up.cover ?? i.cover, up.tieDia ?? i.tieDia, up.barDia ?? i.barDia)
    : ins
  const upXhF = up ? Math.max(0, up.h / 2 - upIns) : xhF
  const upZbF = up ? Math.max(0, up.b / 2 - upIns) : zbF
  const lap = Math.max(0, i.spliceLap ?? 0) / 1000
  // §418.7.4.3 — the lap onto the column above starts inside the CENTRE HALF of
  // that column, not at the floor. Only meaningful where there IS a lap.
  const rise = lap > 0 ? Math.max(0, i.spliceRise ?? 0) : 0
  // Alternate bars lap a stagger higher — see `spliceStagger`. `perimeterBars`
  // walks the perimeter in order, so alternating on its index puts every bar
  // in the opposite group from the two either side of it, which is what
  // "staggered relative to the adjacent bars" means on a section.
  const stag = lap > 0 ? Math.max(0, i.spliceStagger ?? 0) : 0
  if (lap > 0 && stag < lap - 1e-9) {
    notes.push(stag <= 1e-9
      ? `column bars all lap at one level — a section here cuts every bar at a splice (§25.5.2); the storey above has no room to stagger them by the ${Math.round(lap * 1000)} mm lap inside the centre half (§418.7.4.3)`
      : `column laps are staggered ${Math.round(stag * 1000)} mm, short of the ${Math.round(lap * 1000)} mm lap — a section still cuts more than half the bars (§25.5.2)`)
  }
  const onFace = (v: number, face: number) => face > 0 && Math.abs(Math.abs(v) - face) < 1e-6

  perimeterBars(i).forEach(([dx, dz], k) => {
    const x = cx + dx / 1000, z = cz + dz / 1000
    const riseK = rise + (k % 2 ? stag : 0)
    const path: Vec3[] = [[x, y0, z]]
    const bendDia: number[] = []
    // How far the bar has to move to meet the one it laps onto.
    //
    // Where the column above is the same size that is one diameter, to stand
    // clear of it. Where the column above is SMALLER the bar has to reach all
    // the way in to the upper bar's own line, which is what makes the crank on
    // a size reduction the shape it is — and what a fixed one-diameter offset
    // never drew.
    const step = (v: number, face: number, upFace: number) => {
      if (!onFace(v, face)) return 0
      const target = Math.min(Math.abs(v), upFace)          // the bar above
      return (-Math.sign(v) * Math.max(i.barDia, Math.abs(v) - target)) / 1000
    }
    const ox = step(dx, xhF, upXhF)
    const oz = step(dz, zbF, upZbF)
    // 1 in 6 applies to the BAR, so the run is six times the resultant offset.
    // Six diameters per axis would put a corner bar — which moves in on both —
    // on a 1-in-4.2 slope, steeper than §10.7.4.1 permits.
    const crankRun = OFFSET_BEND_SLOPE * Math.hypot(ox, oz)
    // §410.7.4.5 — past 75 mm the bar may not be bent to reach the one above;
    // the column above is dowelled and the dowels lap with these bars. The
    // cage says so rather than drawing a bend nobody is allowed to make.
    const offsetMm = Math.hypot(ox, oz) * 1000
    if (offsetMm > OFFSET_DOWEL_LIMIT + 1e-9) {
      if (!notes.some((n) => n.includes('may not be bent'))) {
        notes.push(`the column reduces by more than the bars can be cranked — a ${Math.round(offsetMm)} mm offset, past the ${OFFSET_DOWEL_LIMIT} mm of §410.7.4.5, so the bars may not be bent; dowel the column above and lap the dowels with these bars`)
      }
      path.push([x, y1 + riseK + lap, z])
    } else if (lap > 0 && crankRun > 0 && y1 - y0 > crankRun && (ox !== 0 || oz !== 0)) {
      const D = hookBendDiameter(i.barDia)
      // the crank is finished by the floor; the straight run above it carries
      // the bar up into the splice window
      path.push([x, y1 - crankRun, z], [x + ox, y1, z + oz], [x + ox, y1 + riseK + lap, z + oz])
      bendDia.push(D, D)
    } else if (lap <= 0 && i.topHookRise != null) {
      // ── the roof hook ────────────────────────────────────────────────────
      // Nothing above to lap onto, so the bar has to develop itself. It turns
      // 90° in under the beam's top steel and runs its extension across, which
      // is what makes the joint close: the column bar hooks over the beam's
      // bars and the beam's bars hook down past the column's.
      // Not clamped to zero: the node is the TOP of the beam, so the hook
      // turns in BELOW it, under the beam's own top steel.
      const yh = y1 + i.topHookRise
      // Inward, along whichever axis leaves the most room: from where the bar
      // stands to the bar line on the far side. Turning along the axis the bar
      // sits FURTHEST out on looks right for a corner bar and is wrong for one
      // mid-face, which has no run at all that way and the whole half-width the
      // other.
      const runX = Math.abs(dx) + xhF
      const runZ = Math.abs(dz) + zbF
      const ax = runX >= runZ
      const room = ax ? runX : runZ
      const want = HOOK_EXTENSION * i.barDia
      const reach = Math.min(want, room) / 1000
      if (reach < want / 1000 - 1e-9) {
        notes.push(`the top hook turns in ${Math.round(reach * 1000)} mm, short of the ${HOOK_EXTENSION}db = ${Math.round(want)} mm extension Table 425.3.1 asks for — the column is not deep enough to lay the bar across`)
      }
      const away = (v: number) => (v !== 0 ? -Math.sign(v) : 1)
      const tx = ax ? away(dx) * reach : 0
      const tz = ax ? 0 : away(dz) * reach
      path.push([x, yh, z], [x + tx, yh, z + tz])
      bendDia.push(hookBendDiameter(i.barDia))
    } else {
      path.push([x, y1 + riseK + lap, z])
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
  /** Centre-to-centre radius of a tie bent around a longitudinal bar, mm —
   *  what it is drawn to, and so what its hooks are billed at. */
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

  // THE JOINT'S OWN HOOPS ARE THE COLUMN'S TIES, CONTINUED.
  //
  // Same loop, same cross ties, same rotating hook corner — the only
  // differences are the spacing (§418.8.3) and the role, so that a viewer can
  // tell joint steel from column steel. Building them from one list keeps the
  // hook rotation running unbroken up the column, which is the point of it:
  // rotating only within each stretch would put the same corner at the top of
  // one and the bottom of the next.
  const jointSet = new Set(jointHoopLevels(i).map((y) => y.toFixed(9)))
  const levels = [...tieLevels(i), ...jointHoopLevels(i)].sort((a, b) => a - b)

  levels.forEach((y, k) => {
    const inJoint = jointSet.has(y.toFixed(9))
    const yh = y + stackAt(0)
    runs.push({
      mark: `${i.mark}-${inJoint ? 'J' : 'T'}${k + 1}`,
      dia: i.tieDia,
      role: inJoint ? 'hoop' : 'tie',
      member: i.mark,
      // §418.7.5.3 — successive ties have their hooks at DIFFERENT corners.
      // Stacked in one corner every hook in the column lands on the same two
      // bars, and the splitting they resist is left unrestrained everywhere
      // else. Rotating the loop's start rotates the corner they meet at.
      path: rotateLoop(hoop, k).map(([x, , z]) => [x, yh, z] as Vec3),
      bendDia: [D, D, D, D],
      closed: true,
      wrapDia: i.barDia,
      // the two 135° hooks the closed loop's vertices cannot express — and
      // the 90° bend it deducts at that corner, which the bar never makes
      hookAllowance: closedTieClosureAllowance(turnAngles(hoop, true)[0], R, i.tieDia),
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
        role: inJoint ? 'hoop' : 'tie',
        member: i.mark,
        path: t.closed ? rotateLoop(pts, k) : (k % 2 ? [...pts].reverse() : pts),
        bendDia: pts.map(() => D),
        closed: t.closed,
        wrapDia: i.barDia,
        // A cross tie is a single bar hooked at BOTH ends (§425.3.2), but it
        // is not a loop: each end turns a full 180° around the bar it grips.
        hookAllowance: t.closed
          ? closedTieClosureAllowance(turnAngles(pts, true)[0], R, i.tieDia)
          : crossTieHookAllowance(R, i.tieDia),
        count: 1,
      })
    })
  })
  for (const n of extra.notes) notes.push(n)

  return { member: i.mark, runs, ...(notes.length ? { notes } : {}) }
}
