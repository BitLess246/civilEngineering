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
  stirrupBendDiameter, stirrupHookAllowance,
  type RebarCage, type RebarRun, type Vec3,
} from './rebarModel'

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
}

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
/**
 * How many bars a rectangular perimeter can actually take, given a request.
 *
 * Bars go on in mirrored pairs — every intermediate bar on one face has a twin
 * on the opposite one — so after the four corners the remainder has to be even.
 * An odd request cannot be placed symmetrically and is rounded UP to the next
 * even count, which is what a detailer does and what `barLayers` already does
 * for a lone bar in a beam layer.
 *
 * Rounding up ADDS steel, so it is conservative against the P–M check that was
 * run on the requested count — the column is stronger than checked, not weaker.
 * It does mean the count drawn and billed can exceed the count designed, which
 * is why this is a function a caller can ask rather than something that only
 * happens inside the layout.
 */
export function placedBarCount(bars: number): number {
  const n = Math.max(4, Math.round(bars))
  const rem = n - 4
  return 4 + rem + (rem % 2)
}

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
export function buildColumnCage(i: ColumnCageInput): RebarCage {
  const runs: RebarRun[] = []
  const [cx, cz] = i.centre
  const y0 = Math.min(i.yBottom, i.yTop), y1 = Math.max(i.yBottom, i.yTop)

  perimeterBars(i).forEach(([dx, dz], k) => {
    runs.push({
      mark: `${i.mark}-V${k + 1}`,
      dia: i.barDia,
      role: 'vertical',
      member: i.mark,
      path: [
        [cx + dx / 1000, y0, cz + dz / 1000],
        [cx + dx / 1000, y1, cz + dz / 1000],
      ] as Vec3[],
      bendDia: [],
      count: 1,
    })
  })

  // The tie itself: a closed rectangle on the cover line, its corners bent to
  // the transverse-steel diameter of §425.3.2 rather than the looser hook rule.
  const tx = Math.max(0, i.h / 2 - i.cover - i.tieDia / 2) / 1000
  const tz = Math.max(0, i.b / 2 - i.cover - i.tieDia / 2) / 1000
  const D = stirrupBendDiameter(i.tieDia)
  tieLevels(i).forEach((y, k) => {
    runs.push({
      mark: `${i.mark}-T${k + 1}`,
      dia: i.tieDia,
      role: 'tie',
      member: i.mark,
      path: [
        [cx - tx, y, cz - tz], [cx + tx, y, cz - tz],
        [cx + tx, y, cz + tz], [cx - tx, y, cz + tz],
      ] as Vec3[],
      bendDia: [D, D, D, D],
      closed: true,
      // the two 135° hooks the closed loop's vertices cannot express
      hookAllowance: stirrupHookAllowance(i.tieDia),
      count: 1,
    })
  })

  return { member: i.mark, runs }
}
