// ─────────────────────────────────────────────────────────────────────────
// THE FOOTING CAGE — the mat, and the dowels the column laps onto.
//
// The third member cage, and the one that makes a lap splice visible in a
// building that has only one storey: a column's bars do not start at the floor,
// they lap onto STARTER BARS cast into the footing. Without the dowels the
// column cage stood on nothing and the only splice in the model was the one at
// a floor above, which a single-storey frame does not have.
//
// WHAT IT DOES NOT DO. It designs nothing. B, thickness, bar size, bar count
// and spacing all come from `isolatedFooting`; the lap comes from `devLength`.
// This module places what those produced.
//
// Units: plan dimensions and levels m, bar sizes and covers mm. Model space,
// y up.
// ─────────────────────────────────────────────────────────────────────────
import { hookBendDiameter, type RebarCage, type RebarRun, type Vec3 } from './rebarModel'

export interface FootingCageInput {
  /** Footing mark — every bar carries it. */
  mark: string
  /** Plan side, m, and thickness, mm. */
  B: number
  Dc: number
  /** Cover to the mat, mm. §20.6.1.3.1 gives 75 against earth. */
  cover: number
  /** The mat's own bar Ø and how many run each way. */
  barDia: number
  bars: number
  /** Plan centre, m, and the level of the footing's TOP. */
  centre: [number, number]
  yTop: number
  /**
   * The column's vertical bars, as plan offsets from the footing centre in mm —
   * `columnCage.perimeterBars` output — and their diameter. One dowel per bar.
   */
  colBars: [number, number][]
  colBarDia: number
  /** Lap the dowel projects ABOVE the footing, mm (§25.5.5 compression lap). */
  lap: number
}

/** §425.3.1 ℓext on the 90° hook that turns the dowel onto the mat. */
export const DOWEL_TAIL_DB = 12

export function buildFootingCage(i: FootingCageInput): RebarCage {
  const runs: RebarRun[] = []
  const [cx, cz] = i.centre
  const yBot = i.yTop - i.Dc / 1000
  const half = i.B / 2
  const edge = Math.max(0, half - i.cover / 1000)          // bars stop at cover
  const n = Math.max(2, Math.round(i.bars))

  // ── the bottom mat, both ways ───────────────────────────────────────────
  // Two layers: the first sits on the cover, the second on top of it, so the
  // effective depth of the upper layer really is one diameter less — which is
  // what `isolatedFooting` designs to.
  const y0 = yBot + (i.cover + i.barDia / 2) / 1000
  const y1 = y0 + i.barDia / 1000
  const spread = (k: number) => (n === 1 ? 0 : -edge + (2 * edge * k) / (n - 1))
  for (let k = 0; k < n; k++) {
    const t = spread(k)
    runs.push({
      mark: `${i.mark}-MX${k + 1}`, dia: i.barDia, role: 'mat', member: i.mark,
      path: [[cx - edge, y0, cz + t], [cx + edge, y0, cz + t]] as Vec3[],
      bendDia: [], count: 1,
    })
    runs.push({
      mark: `${i.mark}-MZ${k + 1}`, dia: i.barDia, role: 'mat', member: i.mark,
      path: [[cx + t, y1, cz - edge], [cx + t, y1, cz + edge]] as Vec3[],
      bendDia: [], count: 1,
    })
  }

  // ── the dowels ──────────────────────────────────────────────────────────
  // Each one is an L: down the column bar's own line to the mat, then a 90°
  // hook turning ℓext = 12db across it so it is anchored in the pad rather than
  // standing loose in it. Above the footing it projects the lap the column bar
  // splices onto — the joint the cage was missing entirely.
  const lap = Math.max(0, i.lap) / 1000
  const tailWant = (DOWEL_TAIL_DB * i.colBarDia) / 1000
  const D = hookBendDiameter(i.colBarDia)
  const yHook = y1 + (i.barDia + i.colBarDia) / 2000        // sitting on the mat
  // How far the tail can reach before it hits the side cover.
  const room = Math.max(0, half - i.cover / 1000)
  i.colBars.forEach(([dx, dz], k) => {
    const x = cx + dx / 1000, z = cz + dz / 1000
    // The tail turns OUTWARD, away from the column. That is how a starter bar
    // is bent: the foot splays out under the pad so the bar bears against the
    // concrete outside the column footprint and the whole group opens up rather
    // than crowding the little square of pad the column stands on. Turned
    // inboard — which is what this did — every tail pointed into the same
    // congested core and several of them crossed.
    const sx = Math.abs(dx) >= Math.abs(dz) ? Math.sign(dx) || 1 : 0
    const sz = sx === 0 ? (Math.sign(dz) || 1) : 0
    // …but never through the cover on the way out. A pad too small for the
    // full 12db gets the tail it has room for, which is a real constraint
    // rather than a drawing that runs steel out of the concrete.
    const reach = sx !== 0 ? room - Math.abs(dx / 1000) : room - Math.abs(dz / 1000)
    const tail = Math.max(0, Math.min(tailWant, reach))
    runs.push({
      mark: `${i.mark}-D${k + 1}`, dia: i.colBarDia, role: 'dowel', member: i.mark,
      path: [
        [x + sx * tail, yHook, z + sz * tail],
        [x, yHook, z],
        [x, i.yTop + lap, z],
      ] as Vec3[],
      bendDia: tail > 0 ? [D] : [], count: 1,
    })
  })

  return { member: i.mark, runs }
}
