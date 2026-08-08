// ─────────────────────────────────────────────────────────────────────────
// Classify a SAMPLE from the tests actually run on it. Layer 8.
//
// `classifyUSCS` takes gradation and plasticity as numbers. This finds those
// numbers among a sample's laboratory tests and hands them over — which is the
// difference between a classifier an engineer retypes into and one that reads
// the laboratory record.
//
// THREE THINGS IT REFUSES TO DO:
//
//  1. It will not read a VOID test. A specimen that failed on a seating error
//     is kept in the record (see model.ts) but must not classify the soil.
//  2. It will not silently pick between two tests of the same kind. Two sieve
//     analyses on one sample means somebody re-ran it, and which one counts is
//     a decision — so the most recent COMPLETE test wins and the sheet says it
//     chose.
//  3. It will not invent a missing input. No Atterberg test on a fine-grained
//     sample means no classification, and `missing` names the test to run
//     rather than the classifier guessing from the fines content.
//
// THREE SYSTEMS, THREE QUESTIONS, ONE LABORATORY RECORD. USCS (D2487) asks what
// the soil IS, AASHTO (M 145) how it will perform under a pavement, and USDA
// what its grains ARE by size. They are computed from the same tests and
// reported side by side, never reconciled — see each engine's header for why
// they disagree by design.
//
// USDA IS THE ONE THAT CAN GO MISSING WHEN THE OTHER TWO DO NOT. Its triangle
// is drawn on the 0.002 mm clay boundary, which no sieve reaches, so a sample
// without a hydrometer gets a USCS symbol and an AASHTO group but no texture —
// `usdaGap` says so in words rather than leaving a blank.
//
// UNITS: as the underlying engines — percentages 0–100, sizes mm.
// ─────────────────────────────────────────────────────────────────────────

import type { Sample, LabTest, LabTestType } from './model'
import { classifyUSCS, type UscsResult } from './uscs'
import { classifyAASHTO, type AashtoResult } from './aashto'
import { usdaFromPassing, type UsdaResult } from './usda'
import { evaluateTest } from './lab'
import type { GradationResult } from './sieve'
import type { AtterbergResult } from './atterberg'
import type { HydrometerResult } from './lab/hydrometer'

export interface SampleClassification {
  uscs?: UscsResult
  aashto?: AashtoResult
  usda?: UsdaResult
  /** Why there is no USDA texture, when there is none. */
  usdaGap?: string
  /** The gradation the classification used, when one was found. */
  gradation?: GradationResult
  /** The limits the classification used, when they were found. */
  atterberg?: AtterbergResult
  /** Tests that would complete or improve the classification. */
  missing: LabTestType[]
  /** How the inputs were chosen, and anything odd about them. */
  notes: string[]
}

/**
 * The test of a kind that should count: the most recent COMPLETE one, falling
 * back to the most recent non-void one when none is complete yet. Ties break on
 * array order, which is entry order.
 */
export function governingTest(sample: Sample, type: LabTestType): {
  test?: LabTest; superseded: number
} {
  const candidates = sample.tests.filter((t) => t.type === type && t.status !== 'void')
  if (!candidates.length) return { superseded: 0 }

  const complete = candidates.filter((t) => t.status === 'complete')
  const pool = complete.length ? complete : candidates

  // Most recent by test date where dates exist; otherwise the last entered.
  const sorted = [...pool].sort((a, b) => (a.testDate ?? '').localeCompare(b.testDate ?? ''))
  return { test: sorted[sorted.length - 1], superseded: candidates.length - 1 }
}

export function classifySample(sample: Sample): SampleClassification {
  const notes: string[] = []
  const missing: LabTestType[] = []

  // ── Gradation ──
  const sieve = governingTest(sample, 'sieve')
  let grad: GradationResult | undefined
  if (sieve.test) {
    const { outcome, error } = evaluateTest(sieve.test)
    if (error) notes.push(`Sieve analysis could not be evaluated: ${error}`)
    else if (outcome?.kind === 'sieve') grad = outcome.result
    if (sieve.superseded > 0) {
      notes.push(
        `${sieve.superseded + 1} sieve analyses on this sample — the most recent complete one was used. Void the others if they should not count.`,
      )
    }
  } else {
    missing.push('sieve')
  }

  // ── Plasticity ──
  const atter = governingTest(sample, 'atterberg')
  let limits: AtterbergResult | undefined
  if (atter.test) {
    const { outcome, error } = evaluateTest(atter.test)
    if (error) notes.push(`Atterberg limits could not be evaluated: ${error}`)
    else if (outcome?.kind === 'atterberg') limits = outcome.result
    if (atter.superseded > 0) {
      notes.push(
        `${atter.superseded + 1} Atterberg determinations on this sample — the most recent complete one was used.`,
      )
    }
  } else {
    missing.push('atterberg')
  }

  // ── Sedimentation, for the USDA triangle only ──
  // Neither USCS nor AASHTO can use this curve: both stop at 0.075 mm and split
  // the fines by plasticity instead. It is here because 0.002 mm exists nowhere
  // else.
  const hydro = governingTest(sample, 'hydrometer')
  let hyd: HydrometerResult | undefined
  if (hydro.test) {
    const { outcome, error } = evaluateTest(hydro.test)
    if (error) notes.push(`Hydrometer analysis could not be evaluated: ${error}`)
    else if (outcome?.kind === 'hydrometer') hyd = outcome.result
  }

  if (!grad) {
    return {
      atterberg: limits, missing, notes: [
        ...notes,
        'No usable sieve analysis on this sample, so the gravel/sand/fines split is unknown and neither system can classify it.',
      ],
    }
  }

  // Carry the limits through only when the soil is plastic. A non-plastic
  // result is a real finding — it tells the classifier the fines are silty —
  // so it is passed as PI = 0 with the LL, not withheld.
  const LL = limits?.liquidLimit
  const PI = limits?.plasticityIndex

  const uscs = classifyUSCS({
    gravel: grad.gravel,
    sand: grad.sand,
    fines: grad.fines,
    cu: grad.cu,
    cc: grad.cc,
    liquidLimit: LL,
    plasticityIndex: PI,
  })

  // AASHTO needs percent passing at three sieves rather than the fractions.
  const aashto = classifyAASHTO({
    passing10: passingAtSize(grad, 2.0),
    passing40: passingAtSize(grad, 0.425),
    passing200: grad.fines,
    liquidLimit: LL,
    plasticityIndex: PI,
  })

  // ── USDA texture, off the combined sieve + sedimentation curve ──
  const { usda, usdaGap } = textureFrom(grad, hyd)

  // The sieve engine advises running a hydrometer when its curve stops short of
  // 10% passing. Once one is on file that advice is stale, and printing it
  // beside the note below reads as a contradiction — so it is replaced, not
  // stacked. Matching on the text is deliberate and pinned by a test: the two
  // modules are siblings, and the alternative is a flag the sieve engine would
  // have to keep in step with wording it already owns.
  const gradNotes = hyd ? grad.notes.filter((n) => !/hydrometer/i.test(n)) : grad.notes
  if (gradNotes.length) notes.push(...gradNotes)
  if (hyd && grad.d10 == null) {
    // Its curve reached the USDA boundaries, but D10/Cu/Cc still come off the
    // sieve alone — merging the two into one gradation is a separate change.
    notes.push(
      'The sedimentation curve was used for the USDA texture, but D₁₀, Cu and Cc above still come from the sieve alone and remain unavailable — merging the two curves into a single gradation is not yet done.',
    )
  }
  if (limits?.notes.length) notes.push(...limits.notes)
  if (usda?.notes.length) notes.push(...usda.notes)

  if (!uscs.symbol && !missing.includes('atterberg') && grad.d10 == null) {
    notes.push('The gradation curve does not reach 10% passing, so Cu and Cc are unavailable — a hydrometer analysis would complete it.')
    if (!missing.includes('hydrometer')) missing.push('hydrometer')
  }

  return { uscs, aashto, usda, usdaGap, gradation: grad, atterberg: limits, missing, notes }
}

/** One point on a grading curve, whatever apparatus produced it. */
interface CurvePoint { size: number; percentPassing: number }

/**
 * The USDA texture from the laboratory record, or the reason there isn't one.
 *
 * THE TWO CURVES ARE READ AS ONE. The sieve ends at 0.075 mm and the
 * sedimentation run begins around 0.05–0.07 mm, so the 0.05 mm sand/silt
 * boundary usually falls in the join between them — interpolating across it is
 * how a combined grading curve is read off a chart, and it is why this is done
 * here rather than inside `usda`, which takes finished percentages.
 *
 * Without a hydrometer there is no 0.002 mm point at any price, and this
 * declines with a sentence rather than substituting the 0.075 mm fines content
 * for a clay fraction — those are different populations by a factor of about
 * two in a typical clay.
 */
function textureFrom(g: GradationResult, h?: HydrometerResult): {
  usda?: UsdaResult; usdaGap?: string
} {
  if (!h) {
    return {
      usdaGap: 'A USDA texture needs the clay fraction finer than 0.002 mm, which is two orders of magnitude below the finest sieve. Run a hydrometer (ASTM D7928) on this sample and the texture follows; the fines content from the sieve is not a substitute for it.',
    }
  }
  const curve: CurvePoint[] = [
    ...g.rows.map((r) => ({ size: r.size, percentPassing: r.percentPassing })),
    ...h.rows.map((r) => ({ size: r.diameter, percentPassing: r.percentFiner })),
  ]
  const clay = interpolatePassing(curve, 0.002) ?? h.clayFraction
  const silt = interpolatePassing(curve, 0.05)
  if (clay == null || silt == null) {
    const ends = [...curve].sort((a, b) => b.size - a.size)
    return {
      usdaGap: `The combined grading curve runs from ${ends[0].size.toFixed(3)} mm down to ${ends[ends.length - 1].size.toFixed(4)} mm, which does not span both USDA boundaries (0.05 mm and 0.002 mm). Readings at either end of the sedimentation run would close it.`,
    }
  }
  const usda = usdaFromPassing({
    gravelBoundary: passingAtSize(g, 2.0),
    sandBoundary: silt,
    clayBoundary: clay,
  })
  return usda
    ? { usda }
    : { usdaGap: 'The combined grading curve does not descend with size across the USDA boundaries, so no texture can be read from it. Check that the hydrometer percentages were scaled to the whole sample.' }
}

/**
 * Percent passing at a size, log-linear between the two bracketing points.
 * Undefined off either end of the curve — extrapolating a grading curve past
 * its finest reading is how a clay fraction gets invented.
 */
function interpolatePassing(points: CurvePoint[], size: number): number | undefined {
  const sorted = [...points].sort((a, b) => b.size - a.size)
  const exact = sorted.find((r) => Math.abs(r.size - size) < 1e-9)
  if (exact) return exact.percentPassing
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i - 1], lo = sorted[i]
    if (size <= hi.size && size >= lo.size && hi.size > lo.size) {
      const f = (Math.log10(size) - Math.log10(lo.size)) / (Math.log10(hi.size) - Math.log10(lo.size))
      return lo.percentPassing + f * (hi.percentPassing - lo.percentPassing)
    }
  }
  return undefined
}

/**
 * Percent passing a sieve size, read off the computed gradation rows. Clamps
 * off the ends — a size coarser than the top sieve passes 100% of the sample,
 * which is a fact rather than an extrapolation.
 */
function passingAtSize(g: GradationResult, size: number): number {
  const sorted = [...g.rows].sort((a, b) => b.size - a.size)
  const exact = sorted.find((r) => Math.abs(r.size - size) < 1e-9)
  if (exact) return exact.percentPassing
  if (!sorted.length) return 0
  if (size >= sorted[0].size) return 100
  if (size <= sorted[sorted.length - 1].size) return sorted[sorted.length - 1].percentPassing
  return interpolatePassing(sorted, size) ?? 0
}
