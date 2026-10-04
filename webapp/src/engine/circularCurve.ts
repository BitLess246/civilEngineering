// ─────────────────────────────────────────────────────────────────────────
// SIMPLE CIRCULAR CURVE — full elements + deflection-angle staking table.
//
// Given any two of the classical independent pairs the engine solves the
// whole curve (radius R, central angle Δ, tangent T, long chord LC, middle
// ordinate M, external E, arc length L, degree of curve D):
//
//   T  = R·tan(Δ/2)          LC = 2R·sin(Δ/2)      M  = R(1 − cos(Δ/2))
//   E  = R(sec(Δ/2) − 1)     L  = R·Δ (rad)        D  = 5729.578/R  (arc basis)
//
// Stationing runs PI − T → PC, PC + L → PT. The staking table walks the
// curve from the PC at half-station intervals the traditional way: each
// total deflection is δ = (c/2R) radians for the chord c from the PC, and
// the chord itself is c = 2R·sin(δ) — the chord, not the arc, is what is
// taped on the ground, so the table prints both.
// ─────────────────────────────────────────────────────────────────────────

export interface CurveInput {
  /** Radius (m). */
  R: number
  /** Central / intersection angle Δ (decimal degrees). */
  deltaDeg: number
  /** PI station (m along the alignment). Default 0. */
  piStation?: number
  /** Staking interval (m), default 20 (metric full station). */
  interval?: number
}

export interface CurveElements {
  R: number
  deltaDeg: number
  deltaRad: number
  T: number
  L: number
  LC: number
  M: number
  E: number
  /** Degree of curve, arc basis (degrees per 20 m chord? — per 100 m? no: degrees subtended by a 20 m arc). */
  /** We report both classical definitions:
   *  D20 = arc degrees per 20 m arc (metric practice), D100ft per 100 ft arc (US). */
  D20: number
  D100ft: number
  pc: number
  pi: number
  pt: number
}

export interface StakeRow {
  /** Station (m) along the centreline. */
  station: number
  /** Distance from the PC along the arc to this point (m). */
  arcFromPc: number
  /** Chord length from the PC (m). */
  chord: number
  /** Incremental deflection angle for this chord (degrees). */
  incDef: number
  /** Total deflection angle from the PC (degrees) = Δ/2 at the PT. */
  totDef: number
}

export interface CurveResult {
  el: CurveElements
  stakes: StakeRow[]
  /** First sub-chord (PC to the first full station) and last (last full station to PT). */
  firstSub: number
  lastSub: number
}

export function solveCurve(input: CurveInput): CurveResult {
  const R = input.R
  const deltaDeg = input.deltaDeg
  if (!(R > 0)) throw new Error('Radius must be positive.')
  if (!(deltaDeg > 0 && deltaDeg < 180)) throw new Error('Δ must be between 0° and 180°.')
  const deltaRad = (deltaDeg * Math.PI) / 180
  const half = deltaRad / 2

  const T = R * Math.tan(half)
  const L = R * deltaRad
  const LC = 2 * R * Math.sin(half)
  const M = R * (1 - Math.cos(half))
  const E = R * (1 / Math.cos(half) - 1)
  // Degree of curve: degrees subtended by a standard arc — 20 m (metric full
  // station) and 100 ft (US highway practice).
  const D20 = (20 / L) * deltaDeg
  // 100 ft = 30.48 m of arc (US highway practice): D = 5729.578/R_ft.
  // The arc basis must be converted TO metres (×0.3048) to match L in metres.
  const D100ft = ((100 * 0.3048) / L) * deltaDeg

  const pi = input.piStation ?? 0
  const pc = pi - T
  const pt = pc + L
  if (pc < 0) throw new Error('PC station is negative — move the PI forward.')

  const interval = input.interval ?? 20
  if (!(interval > 0)) throw new Error('Staking interval must be positive.')

  // ── staking table ──
  const stakes: StakeRow[] = []
  // First full station multiple of the interval after the PC.
  const firstFull = Math.ceil((pc + 1e-9) / interval) * interval
  const stops: number[] = [pc]
  for (let s = firstFull; s < pt - 1e-9; s += interval) stops.push(Math.round(s * 1000) / 1000)
  stops.push(pt)

  let totDefRad = 0
  let prevStation = pc
  for (let k = 0; k < stops.length; k++) {
    const st = stops[k]
    const arc = st - pc
    // Chord from the PC to this station: c = 2R·sin(arc/2R)
    const chord = 2 * R * Math.sin(arc / (2 * R))
    // Incremental deflection for the chord [prev, st]: δ = (c_inc/2R)
    const cInc = st - prevStation
    const incDef = (cInc / (2 * R)) * (180 / Math.PI)
    totDefRad += (cInc / (2 * R))
    stakes.push({
      station: st, arcFromPc: arc, chord,
      incDef, totDef: (totDefRad * 180) / Math.PI,
    })
    prevStation = st
  }
  // The total deflection at the PT must be exactly Δ/2 — the check the
  // surveyor runs in the field; assert it to numerical noise.
  if (Math.abs(stakes[stakes.length - 1].totDef - deltaDeg / 2) > 1e-6) {
    throw new Error('Deflection check failed: total deflection ≠ Δ/2 — internal error.')
  }

  const firstSub = stops[1] - pc
  const lastSub = pt - stops[stops.length - 2]

  return {
    el: { R, deltaDeg, deltaRad, T, L, LC, M, E, D20, D100ft, pc, pi, pt },
    stakes, firstSub, lastSub,
  }
}
