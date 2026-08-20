// ─────────────────────────────────────────────────────────────────────────
// THE BEAM CAGE — the bars of one beam, as geometry.
//
// The companion to `columnCage`, and the thing that lets the beam elevation,
// the take-off and a 3D view describe the same steel. Before this the sheet
// drew one arrangement and the take-off costed another: every longitudinal bar
// was billed at the full span plus 40db at each end, whether the detail ran it
// through or curtailed it at 0.15L; stirrups were billed at the tightest
// spacing over the WHOLE beam, though the detail only closes them up over 2h
// at each end; and the corner bars a face gets when the analysis asked for
// none were not billed at all.
//
// The arrangement here is the one `beamDetail` draws, and the clauses are the
// same ones:
//
//   THROUGH   the four corner bars and whatever else §409.7.3.8.1/.8.4 keeps
//             continuous. Straight, never cranked, hooked at an end support.
//   EXTRA     curtailed — top bars 0.25L from each support, bottom bars from
//             0.15L off each support — and cranked where they stop.
//   STIRRUPS  closed, at the confinement spacing over 2h from each support
//             face (§418.6.4.1) and the designed spacing through the middle.
//
// Units: geometry m, bar sizes mm. Model space, y up.
// ─────────────────────────────────────────────────────────────────────────
import {
  continuousBars, stirrupBendDiameter, stirrupHookAllowance,
  hookBendDiameter, KEEP_TOP, KEEP_BOTTOM,
  type RebarCage, type RebarRun, type Vec3,
} from './rebarModel'

export interface BeamCageInput {
  /** Member mark — every bar in the cage carries it. */
  mark: string
  /** Span, m, support centreline to centreline; and the two support widths, mm. */
  L: number
  colBLeft?: number
  colBRight?: number
  /** Web width and overall depth, mm. */
  b: number
  h: number
  /** Clear cover to the stirrup, mm. */
  cover: number
  /** Longitudinal and stirrup Ø, mm. */
  barDia: number
  stirrupDia: number
  /** Designed bars in each face: the worst hogging count at either support,
   *  and the sagging count at midspan. Either may be zero. */
  topBars: number
  botBars: number
  /** Stirrup spacing at the supports and through the middle, mm. */
  sEnd: number
  sMid: number
  /** Whether the beam continues past each support. An end support hooks. */
  continuousLeft?: boolean
  continuousRight?: boolean
  /** Beam centreline in plan, m, and the level of its SOFFIT. */
  axis: { x0: number; z0: number; x1: number; z1: number }
  ySoffit: number
}

/** §418.6.4.1 — stirrups are closely spaced over 2h from each support face. */
export const HOOP_ZONE_DEPTHS = 2
/** Extra TOP bars run this fraction of the span from the support centreline. */
export const EXTRA_TOP_FRACTION = 0.25
/** Extra BOTTOM bars start this fraction of the span off each support. */
export const EXTRA_BOTTOM_FRACTION = 0.15

/**
 * Where the stirrups go, m along the span from the left support centreline.
 *
 * Tight over 2h from each support face, the designed spacing between. The two
 * zones are laid out from their own ends so the first stirrup at each support
 * lands where §418.6.4.4 puts it rather than wherever a single run from one end
 * happened to reach.
 */
export function stirrupStations(i: Pick<BeamCageInput,
  'L' | 'h' | 'sEnd' | 'sMid' | 'colBLeft' | 'colBRight'>): number[] {
  const hM = i.h / 1000
  const faceL = (i.colBLeft ?? 0) / 2000
  const faceR = i.L - (i.colBRight ?? 0) / 2000
  const clear = Math.max(0, faceR - faceL)
  if (clear <= 0) return []
  const zone = Math.min(HOOP_ZONE_DEPTHS * hM, clear / 2)
  const sE = Math.max(0.025, (i.sEnd > 0 ? i.sEnd : i.sMid) / 1000)
  const sM = Math.max(0.025, (i.sMid > 0 ? i.sMid : i.sEnd) / 1000)
  const out: number[] = []
  const push = (x: number) => { if (x >= faceL - 1e-9 && x <= faceR + 1e-9) out.push(x) }
  // Each end zone is laid out from ITS OWN support, so the first stirrup lands
  // 50 mm off the face where §418.6.4.4 puts it (a single run from one end
  // would leave the far support wherever the arithmetic happened to reach).
  let lastL = faceL, firstR = faceR
  for (let x = faceL + 0.05; x < faceL + zone; x += sE) { push(x); lastL = x }
  for (let x = faceR - 0.05; x > faceR - zone; x -= sE) { push(x); firstR = x }
  // The middle picks up a full spacing after the last end-zone stirrup, not at
  // the nominal zone boundary — starting there can drop a stirrup a few
  // millimetres from its neighbour, which is a drawing artefact, not a detail.
  for (let x = lastL + sM; x < firstR - sM * 0.5; x += sM) push(x)
  return [...new Set(out.map((v) => Math.round(v * 1e6) / 1e6))].sort((p, q) => p - q)
}

/**
 * The bars of one beam.
 *
 * A through bar at an END support turns down (top) or up (bottom) into the
 * column with a standard hook; at a continuous support it runs on. An extra
 * bar stops where it is curtailed and cranks towards the opposite face.
 */
export function buildBeamCage(i: BeamCageInput): RebarCage {
  const runs: RebarRun[] = []
  const { x0, z0, x1, z1 } = i.axis
  const dx = x1 - x0, dz = z1 - z0
  const span = Math.hypot(dx, dz) || 1
  const ux = dx / span, uz = dz / span            // along the beam
  const px = -uz, pz = ux                         // across it

  const inset = (i.cover + i.stirrupDia + i.barDia / 2) / 1000
  const yBot = i.ySoffit + inset
  const yTop = i.ySoffit + i.h / 1000 - inset
  const half = Math.max(0, i.b / 2000 - inset)    // corner bars sit at the web faces

  /** A point at `u` along the span, `v` across it, at height `y`. */
  const at = (u: number, v: number, y: number): Vec3 =>
    [x0 + ux * u + px * v, y, z0 + uz * u + pz * v]

  const thruTop = continuousBars(i.topBars, KEEP_TOP)
  const thruBot = continuousBars(i.botBars, KEEP_BOTTOM)
  const extraTop = Math.max(0, i.topBars - thruTop)
  const extraBot = Math.max(0, i.botBars - thruBot)

  const hookD = hookBendDiameter(i.barDia)
  const tail = (12 * i.barDia) / 1000             // ℓext = 12db, Table 425.3.1
  const faceL = (i.colBLeft ?? 0) / 2000
  const faceR = i.L - (i.colBRight ?? 0) / 2000

  // ── through bars: the corners, plus the code's continuous share ──
  for (const [role, y, down, n] of [
    ['top', yTop, true, thruTop], ['bottom', yBot, false, thruBot],
  ] as const) {
    for (let k = 0; k < n; k++) {
      // spread across the web between the two corner positions
      const v = n === 1 ? 0 : -half + (2 * half * k) / (n - 1)
      const path: Vec3[] = []
      const bends: number[] = []
      if (!i.continuousLeft) {
        path.push(at(faceL, v, y + (down ? -tail : tail)))
        bends.push(hookD)
      }
      path.push(at(faceL, v, y), at(faceR, v, y))
      if (!i.continuousRight) {
        path.push(at(faceR, v, y + (down ? -tail : tail)))
        bends.push(hookD)
      }
      runs.push({
        mark: `${i.mark}-${role === 'top' ? 'T' : 'B'}${k + 1}`,
        dia: i.barDia, role, member: i.mark, path, bendDia: bends, count: 1,
      })
    }
  }

  // ── extra bars: curtailed, and cranked where they stop ──
  const crankRun = Math.min(0.33 * i.h, 0.05 * i.L * 1000) / 1000
  const crankD = hookBendDiameter(i.barDia)
  if (extraTop > 0) {
    const stop = EXTRA_TOP_FRACTION * i.L
    for (const [end, from, to] of [
      ['L', faceL, stop], ['R', faceR, i.L - stop],
    ] as const) {
      const dir = to > from ? 1 : -1
      for (let k = 0; k < extraTop; k++) {
        const v = extraTop === 1 ? 0 : -half + (2 * half * k) / (extraTop - 1)
        runs.push({
          mark: `${i.mark}-XT${end}${k + 1}`,
          dia: i.barDia, role: 'top', member: i.mark,
          path: [at(from, v, yTop), at(to, v, yTop), at(to + dir * crankRun, v, yTop - crankRun)],
          bendDia: [crankD], count: 1,
        })
      }
    }
  }
  if (extraBot > 0) {
    const a = EXTRA_BOTTOM_FRACTION * i.L, b2 = i.L - a
    for (let k = 0; k < extraBot; k++) {
      const v = extraBot === 1 ? 0 : -half + (2 * half * k) / (extraBot - 1)
      runs.push({
        mark: `${i.mark}-XB${k + 1}`,
        dia: i.barDia, role: 'bottom', member: i.mark,
        path: [
          at(a - crankRun, v, yBot + crankRun), at(a, v, yBot),
          at(b2, v, yBot), at(b2 + crankRun, v, yBot + crankRun),
        ],
        bendDia: [crankD, crankD], count: 1,
      })
    }
  }

  // ── stirrups ──
  const sx = Math.max(0, i.b / 2000 - i.cover / 1000 - i.stirrupDia / 2000)
  const sy0 = i.ySoffit + (i.cover + i.stirrupDia / 2) / 1000
  const sy1 = i.ySoffit + i.h / 1000 - (i.cover + i.stirrupDia / 2) / 1000
  const D = stirrupBendDiameter(i.stirrupDia)
  stirrupStations(i).forEach((u, k) => {
    runs.push({
      mark: `${i.mark}-S${k + 1}`,
      dia: i.stirrupDia, role: 'stirrup', member: i.mark,
      path: [at(u, -sx, sy0), at(u, sx, sy0), at(u, sx, sy1), at(u, -sx, sy1)],
      bendDia: [D, D, D, D],
      closed: true,
      hookAllowance: stirrupHookAllowance(i.stirrupDia),
      count: 1,
    })
  })

  return { member: i.mark, runs }
}
