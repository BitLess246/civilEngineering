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
  /**
   * Turn the mat bars UP at each end with a 90° hook, or leave them straight.
   *
   * A choice, not a rule: §413.3.3.3 lets a footing's flexural steel be
   * developed by embedment where the pad is wide enough, and a straight bar is
   * what most pads get. Where it is not wide enough the bar is hooked, and the
   * hook is STEEL — it changes the cut length and the tonnage, so it belongs
   * here and not in a drawing switch. The sheet's own `endHook` used to draw
   * these hooks without the cage having them, so the drawing showed a bar the
   * 3D view and the take-off did not know about.
   */
  matEndHook?: '90' | 'none'
}

/** §425.3.1 ℓext on the 90° hook that turns the dowel onto the mat. */
export const DOWEL_TAIL_DB = 12
/** §425.3.1 ℓext on a 90° hook, in bar diameters. */
export const HOOK_EXT_DB = 12
/** §420.6.1.3.1 — cover to the TOP of a footing, which is not cast against
 *  earth, mm. The `cover` on the input is the 75 mm against-earth figure for
 *  the bottom and sides; a bar turned up has the other one to live within. */
export const MAT_TOP_COVER = 40

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
  // ── the mat's end hooks, where the pad can take them ────────────────────
  //
  // §425.3.1 gives the straight extension beyond a 90° bend as 12db, and the
  // bar turns UP, which is the only direction a pad offers any concrete in. So
  // whether a hook FITS is a property of the pad: the depth left above the
  // bar's own line, less the top cover.
  //
  // On this app's own demo frame it does not fit and never could — a 150 mm pad
  // with 75 mm cover leaves the bar at mid-depth with 35 mm of room, against
  // the 150 mm a ⌀10 hook needs. The footing SHEET drew one anyway, at
  // min(120, 0.07·B) — a length taken from the pad's WIDTH, which has nothing
  // to do with whether the bar can be turned up. It drew a 60 mm hook into a
  // pad with no room for one, and neither the 3D view nor the take-off knew
  // that steel existed.
  const hooked = i.matEndHook === '90'
  const ext = Math.max(HOOK_EXT_DB * i.barDia, 150) / 1000
  const hookD = hookBendDiameter(i.barDia)
  /** Depth above a bar at level `y` that a turned-up leg has to live in, m. */
  const turnUpRoom = (y: number) => i.yTop - MAT_TOP_COVER / 1000 - y
  const notes: string[] = []
  const fits0 = hooked && turnUpRoom(y0) >= ext - 1e-9
  const fits1 = hooked && turnUpRoom(y1) >= ext - 1e-9
  if (hooked && !(fits0 && fits1)) {
    notes.push(`mat bars left straight — a ${i.barDia} mm 90° hook needs ${Math.round(ext * 1000)} mm of turn-up (§425.3.1) and the ${Math.round(i.Dc)} mm pad offers ${Math.round(Math.min(turnUpRoom(y0), turnUpRoom(y1)) * 1000)} mm above the bar`)
  }
  for (let k = 0; k < n; k++) {
    const t = spread(k)
    runs.push({
      mark: `${i.mark}-MX${k + 1}`, dia: i.barDia, role: 'mat', member: i.mark,
      path: (fits0
        ? [[cx - edge, y0 + ext, cz + t], [cx - edge, y0, cz + t], [cx + edge, y0, cz + t], [cx + edge, y0 + ext, cz + t]]
        : [[cx - edge, y0, cz + t], [cx + edge, y0, cz + t]]) as Vec3[],
      bendDia: fits0 ? [hookD, hookD] : [],
      count: 1,
    })
    runs.push({
      mark: `${i.mark}-MZ${k + 1}`, dia: i.barDia, role: 'mat', member: i.mark,
      path: (fits1
        ? [[cx + t, y1 + ext, cz - edge], [cx + t, y1, cz - edge], [cx + t, y1, cz + edge], [cx + t, y1 + ext, cz + edge]]
        : [[cx + t, y1, cz - edge], [cx + t, y1, cz + edge]]) as Vec3[],
      bendDia: fits1 ? [hookD, hookD] : [],
      count: 1,
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
  // A bar is on a face when it sits at that face's offset — the same test the
  // column cage cranks its splices by.
  const faceX = Math.max(...i.colBars.map(([dx]) => Math.abs(dx)))
  const faceZ = Math.max(...i.colBars.map(([, dz]) => Math.abs(dz)))
  const on = (v: number, face: number) => face > 0 && Math.abs(Math.abs(v) - face) < 1e-6

  i.colBars.forEach(([dx, dz], k) => {
    const x = cx + dx / 1000, z = cz + dz / 1000
    // The tail turns OUTWARD, away from the column: a starter bar's foot splays
    // out under the pad so it bears on concrete outside the column footprint
    // and the group opens up, rather than crowding the little square of pad the
    // column stands on. Turned inboard, every tail pointed into the same
    // congested core and several crossed.
    //
    // A CORNER bar is on two faces, so it goes out along the DIAGONAL — which
    // is the only direction that takes it away from both. Sent along one axis
    // it would run parallel to the face it is standing on, and the four corners
    // of the cage would splay into two directions instead of four.
    const cx1 = on(dx, faceX), cz1 = on(dz, faceZ)
    const oz = cz1 ? Math.sign(dz) || 1 : 0
    // a bar on neither face is not a perimeter bar, but it still needs a way out
    const ox = cx1 ? Math.sign(dx) || 1 : (oz === 0 ? Math.sign(dx) || 1 : 0)
    const mag = Math.hypot(ox, oz) || 1
    const sx = ox / mag, sz = oz / mag
    // …but never through the cover on the way out. A pad too small for the
    // full 12db gets the tail it has room for, which is a real constraint
    // rather than a drawing that runs steel out of the concrete.
    const reachX = sx !== 0 ? (room - Math.abs(dx / 1000)) / Math.abs(sx) : Infinity
    const reachZ = sz !== 0 ? (room - Math.abs(dz / 1000)) / Math.abs(sz) : Infinity
    const tail = Math.max(0, Math.min(tailWant, reachX, reachZ))
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

  return { member: i.mark, runs, ...(notes.length ? { notes } : {}) }
}
