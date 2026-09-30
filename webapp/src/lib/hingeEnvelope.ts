// ─────────────────────────────────────────────────────────────────────────
// HOW A YIELDED HINGE IS REPORTED — shared by the Nonlinear panel and the
// report appendix (E.1), so the two can never describe the same run apart.
//
// A time-history hinge is "yielded" if it yielded at ANY step, so the numbers
// printed beside it have to be the ones that made it yield: the peak moment
// and the capacity it met, not the residual the record ends on. And a hinge
// that only just touched its capacity is a different finding from one that
// rotated plastically; the summary says which.
// Units: moments kN·m, rotations rad, time s.
// ─────────────────────────────────────────────────────────────────────────
import type { HingeReport } from '../engine/nonlinearFrame'

/** Below this peak plastic rotation a hinge has reached its capacity but not
 *  rotated in any structurally meaningful way: 0.1 mrad, a hundredth of the
 *  ~0.01 rad Immediate Occupancy limit ASCE 41 Table 10-7 gives RC beams. */
export const ONSET_PLASTIC_RAD = 1e-4

/** Peak moment, capacity and peak plastic rotation — envelope when the run
 *  recorded one, else the end state (a pushover's end state IS its peak). */
export function hingeDemand(h: HingeReport): { moment: number; capacity: number | null; plastic: number; firstYield: number | null } {
  const e = h.envelope
  return e
    ? { moment: e.peakMoment, capacity: e.capacity, plastic: e.maxPlastic, firstYield: e.firstYield }
    : { moment: h.moment, capacity: null, plastic: Math.abs(h.plastic), firstYield: null }
}

/** Yielded hinges, most plastic rotation first, then highest M/capacity. */
export function yieldedByDemand(hinges: HingeReport[]): HingeReport[] {
  const ratio = (h: HingeReport) => {
    const d = hingeDemand(h)
    return d.capacity ? Math.abs(d.moment) / d.capacity : 0
  }
  return hinges.filter((h) => h.yielded)
    .sort((a, b) => hingeDemand(b).plastic - hingeDemand(a).plastic || ratio(b) - ratio(a))
}

/** What the yielding amounted to, or null when nothing yielded: a `tag` short
 *  enough for a summary row's side note, and the full `sentence`. */
export function yieldSummary(hinges: HingeReport[]): { tag: string; sentence: string } | null {
  const y = yieldedByDemand(hinges)
  if (!y.length) return null
  const worst = hingeDemand(y[0]).plastic
  const mrad = (worst * 1000).toFixed(3)
  return worst < ONSET_PLASTIC_RAD
    ? { tag: 'onset of yield', sentence: `onset of yield only — the hinges reached their capacity but the largest plastic rotation is ${mrad} mrad` }
    : { tag: `θp up to ${mrad} mrad`, sentence: `largest plastic rotation ${mrad} mrad` }
}
