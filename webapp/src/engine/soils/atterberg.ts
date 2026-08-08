// ─────────────────────────────────────────────────────────────────────────
// Atterberg limits and the Casagrande plasticity chart. Layer 8.
// ASTM D4318 (limits) · ASTM D2487 (chart lines).
//
// The limits are the water contents at which a fine-grained soil changes
// behaviour: above the LIQUID LIMIT it flows, below the PLASTIC LIMIT it
// crumbles, and the PLASTICITY INDEX between them measures how much water the
// soil can absorb while still behaving plastically. That range is what
// separates a clay from a silt on the Casagrande chart, and it is the input
// the USCS classifier leans on hardest.
//
// NON-PLASTIC IS NOT PI = 0. A soil whose plastic limit cannot be obtained —
// the thread will not roll at 3 mm — is reported NP. Recording that as PI = 0
// would place it on the chart at the origin, where it would classify as a low
// plasticity silt, which is a different claim from "this soil has no plastic
// range at all". `AtterbergResult.nonPlastic` keeps the two apart.
//
// UNITS: all water contents in %, i.e. 0–100, not 0–1.
// ─────────────────────────────────────────────────────────────────────────

import { type LabNote, info, warn } from './notes'

/** One trial in a multipoint liquid-limit determination (D4318 Method A). */
export interface FlowPoint {
  /** Blow count at closure, 25 ± range. */
  blows: number
  /** Water content of the trial, %. */
  moisture: number
}

export interface AtterbergInput {
  /** Liquid limit, %. Omit when supplying `flowPoints` instead. */
  liquidLimit?: number
  /** Multipoint trials; LL is read off the flow curve at 25 blows. */
  flowPoints?: FlowPoint[]
  /** Plastic limit, %. Omit (or pass `nonPlastic`) when no thread could be rolled. */
  plasticLimit?: number
  /** The thread would not roll — the soil has no plastic range. */
  nonPlastic?: boolean
  shrinkageLimit?: number
  /** Natural water content of the soil in place, % — gives the liquidity index. */
  naturalMoisture?: number
}

export interface AtterbergResult {
  liquidLimit: number
  plasticLimit: number
  /** LL − PL, %. Zero when non-plastic — read `nonPlastic` before using it. */
  plasticityIndex: number
  nonPlastic: boolean
  /** Slope of the flow curve, % per log cycle of blows. Multipoint only. */
  flowIndex?: number
  /** (w − PL)/PI. Undefined when non-plastic or no natural moisture given. */
  liquidityIndex?: number
  shrinkageLimit?: number
  /** Position relative to the A-line and U-line. */
  chart: ChartPosition
  /** Advisory notes — an LI above 1, a point above the U-line, and so on. */
  notes: LabNote[]
}

// ── Casagrande chart lines ────────────────────────────────────────────────

/**
 * A-line: PI = 0.73(LL − 20). Separates CLAYS (on or above) from SILTS and
 * organic soils (below). ASTM D2487 Fig. 3.
 */
export const aLine = (LL: number): number => 0.73 * (LL - 20)

/**
 * U-line: PI = 0.9(LL − 8), the empirical UPPER BOUND on natural soils.
 * A point above it has not been discovered — it has been mis-tested.
 * ASTM D2487 §Fig. 3 note.
 */
export const uLine = (LL: number): number => 0.9 * (LL - 8)

export interface ChartPosition {
  /** PI on the A-line at this LL, %. */
  aLinePI: number
  /** PI on the U-line at this LL, %. */
  uLinePI: number
  /** On or above the A-line ⇒ clay behaviour. */
  aboveALine: boolean
  /** Above the U-line ⇒ physically implausible, re-run the test. */
  aboveULine: boolean
  /** LL ≥ 50 ⇒ high plasticity (the H suffix); below ⇒ low (L). */
  highPlasticity: boolean
}

export function chartPosition(LL: number, PI: number): ChartPosition {
  const aLinePI = aLine(LL)
  const uLinePI = uLine(LL)
  return {
    aLinePI,
    uLinePI,
    // D2487 treats a point ON the A-line as clay, so the comparison is ≥.
    aboveALine: PI >= aLinePI,
    aboveULine: PI > uLinePI,
    highPlasticity: LL >= 50,
  }
}

// ── Liquid limit from a flow curve ────────────────────────────────────────

/**
 * Liquid limit from multipoint trials: the flow curve is a straight line on
 * w vs log₁₀(N), and LL is its value at 25 blows (D4318 Method A).
 *
 * Returns the fitted LL and the flow index — the slope per log cycle, which is
 * itself diagnostic: a steep flow curve means the soil loses strength quickly
 * with added water.
 */
export function liquidLimitFromFlow(points: FlowPoint[]): { liquidLimit: number; flowIndex: number } {
  const usable = points.filter((p) => p.blows > 0 && Number.isFinite(p.moisture))
  if (usable.length < 2) {
    throw new Error('A flow curve needs at least two trials with a positive blow count.')
  }

  // Least squares on w = a + b·log₁₀(N); the flow index is −b (w falls as N rises).
  const xs = usable.map((p) => Math.log10(p.blows))
  const ys = usable.map((p) => p.moisture)
  const n = xs.length
  const mx = xs.reduce((s, x) => s + x, 0) / n
  const my = ys.reduce((s, y) => s + y, 0) / n
  const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
  const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0)

  // All trials at the same blow count: no slope is defined, so the mean water
  // content is the best available estimate and the flow index is zero.
  const b = sxx > 1e-12 ? sxy / sxx : 0
  const a = my - b * mx
  // `-b` on a zero slope yields negative zero, which prints as "-0" on a test
  // sheet — cosmetic, but not something to hand an engineer.
  return { liquidLimit: a + b * Math.log10(25), flowIndex: b === 0 ? 0 : -b }
}

// ── Main entry ────────────────────────────────────────────────────────────

export function atterberg(i: AtterbergInput): AtterbergResult {
  const notes: LabNote[] = []

  let flowIndex: number | undefined
  let LL: number
  if (i.flowPoints?.length) {
    const fit = liquidLimitFromFlow(i.flowPoints)
    LL = fit.liquidLimit
    flowIndex = fit.flowIndex
    const spread = i.flowPoints.map((p) => p.blows)
    if (Math.min(...spread) > 25 || Math.max(...spread) < 25) {
      notes.push(warn('All trials fall on one side of 25 blows — the liquid limit is extrapolated, not interpolated.'))
    }
    if (i.flowPoints.some((p) => p.blows < 15 || p.blows > 40)) {
      notes.push(warn('D4318 asks for trials between 15 and 40 blows; a point outside that range weakens the fit.'))
    }
  } else if (i.liquidLimit != null) {
    LL = i.liquidLimit
  } else {
    throw new Error('Supply either a liquid limit or the flow-curve trials it is read from.')
  }

  const nonPlastic = i.nonPlastic === true || i.plasticLimit == null
  const PL = nonPlastic ? 0 : i.plasticLimit!
  // PI is clamped at zero: a negative plasticity index is not a soil property,
  // it is a failed test, and validateAtterberg reports it as an error.
  const PI = nonPlastic ? 0 : Math.max(LL - PL, 0)

  if (!nonPlastic && LL - PL < 0) {
    notes.push(warn('The plastic limit exceeds the liquid limit — one of the two determinations is wrong.'))
  }

  let liquidityIndex: number | undefined
  if (!nonPlastic && PI > 0 && i.naturalMoisture != null) {
    liquidityIndex = (i.naturalMoisture - PL) / PI
    if (liquidityIndex > 1) {
      notes.push(info('Natural moisture is above the liquid limit (LI > 1) — the soil may be sensitive or quick.'))
    } else if (liquidityIndex < 0) {
      notes.push(info('Natural moisture is below the plastic limit (LI < 0) — the soil is in a desiccated or overconsolidated state.'))
    }
  }

  const chart = chartPosition(LL, PI)
  if (chart.aboveULine && !nonPlastic) {
    notes.push(warn('The point plots above the U-line, which no natural soil does — re-run the limits before classifying.'))
  }
  if (nonPlastic) {
    notes.push(info('Reported non-plastic: no thread could be rolled, so the soil has no plastic range. This is not the same as PI = 0.'))
  }

  return {
    liquidLimit: LL,
    plasticLimit: PL,
    plasticityIndex: PI,
    nonPlastic,
    flowIndex,
    liquidityIndex,
    shrinkageLimit: i.shrinkageLimit,
    chart,
    notes,
  }
}

/**
 * Consistency of a cohesive soil from its liquidity index — the descriptive
 * term that goes on a borehole log. Ranges follow common practice rather than
 * a code table, so the log should record how it was arrived at.
 */
export function consistencyFromLI(LI: number): string {
  if (LI >= 1) return 'very soft / liquid'
  if (LI >= 0.75) return 'soft'
  if (LI >= 0.5) return 'firm'
  if (LI >= 0.25) return 'stiff'
  if (LI >= 0) return 'very stiff'
  return 'hard (desiccated)'
}
