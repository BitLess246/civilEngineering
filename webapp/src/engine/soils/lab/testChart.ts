// ─────────────────────────────────────────────────────────────────────────
// Which chart belongs to which laboratory test. Layer 8.
//
// ONE MAPPING, ONE HOME. The test card on `/soils` and the investigation
// report both need "the drawing for this result", and they need the SAME one:
// a report whose compaction curve differs from the one on screen is worse than
// a report with no curve at all. This module has already made the two-homes
// mistake three times (see `soilFamily`, and the note in `chartKit`), so the
// switch lives here and both callers read it.
//
// Some charts need data the RESULT does not carry — the direct-shear specimens
// and the CBR readings live on the test blob, and the compaction ZAV bound
// needs the specific gravity. Those are pulled through the same guards every
// other reader goes through, so a malformed blob degrades to "no chart" rather
// than a thrown error mid-render.
//
// A test with no chart is not a defect: a water content is a number, and there
// is nothing to plot.
// ─────────────────────────────────────────────────────────────────────────

import type { Drawing } from '../../planRenderer'
import type { LabTest } from '../model'
import {
  type LabOutcome, readDirectShear, readCompaction, readCbr,
} from './index'
import {
  shearEnvelopeChart, consolidationChart, gradingChart, compactionChart,
  mohrChart, cbrChart, hydrometerChart,
} from './plots'

/**
 * The drawing for a computed result, or undefined when the test has no chart.
 *
 * `test` is needed as well as `outcome` because three of the charts plot the
 * MEASUREMENTS beside the fit, and those live on the test rather than the
 * result — plotting a fitted envelope without the specimens it was fitted
 * through is exactly the picture that hides an outlier.
 */
export function labChart(test: LabTest, outcome: LabOutcome): Drawing | undefined {
  switch (outcome.kind) {
    case 'direct-shear':
      return shearEnvelopeChart(outcome.result, readDirectShear(test)?.points ?? [])
    case 'consolidation':
      return consolidationChart(outcome.result)
    case 'sieve':
      return gradingChart(outcome.result)
    case 'compaction':
      // Without Gs there is no zero-air-voids bound; the chart draws the curve
      // without one rather than inventing a specific gravity to bound it with.
      return compactionChart(outcome.result, readCompaction(test)?.specificGravity)
    case 'triaxial':
      return mohrChart(outcome.result)
    case 'cbr':
      return cbrChart(outcome.result, readCbr(test)?.points ?? [])
    case 'hydrometer':
      return hydrometerChart(outcome.result)
    // moisture, specific gravity, Atterberg, UCS, permeability and swell each
    // produce a number rather than a curve.
    default:
      return undefined
  }
}
