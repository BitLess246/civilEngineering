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
import { combineGrading, passingOnCurve, passingOrClamp, type CombinedGrading } from './grading'
import { evaluateTest } from './lab'
import { type LabNote, warn, info } from './notes'
import { passingAt, type GradationResult } from './sieve'
import type { AtterbergResult } from './atterberg'
import type { HydrometerResult } from './lab/hydrometer'

export interface SampleClassification {
  uscs?: UscsResult
  aashto?: AashtoResult
  usda?: UsdaResult
  /** Why there is no USDA texture, when there is none. */
  usdaGap?: string
  /** The sieve result on its own, as the laboratory reported it. */
  gradation?: GradationResult
  /**
   * The curve everything above was read off: the sieve joined to the
   * sedimentation run when there is one, the sieve alone when there is not.
   */
  curve?: CombinedGrading
  /** The limits the classification used, when they were found. */
  atterberg?: AtterbergResult
  /** Tests that would complete or improve the classification. */
  missing: LabTestType[]
  /** How the inputs were chosen, and anything odd about them. */
  notes: LabNote[]
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

/**
 * The sieve engine's "a hydrometer analysis would complete the grading",
 * which stops being true the moment one is on file.
 *
 * Exported because TWO places have to suppress it — this module, and the
 * report's laboratory section, which tabulates each test on its own and would
 * otherwise print the advice beside the very sedimentation run that answers
 * it. One definition, so they cannot drift; matching on the text is the
 * deliberate trade named in the header.
 */
export const isStaleHydrometerAdvice = (n: LabNote): boolean => /hydrometer/i.test(n.text)

export function classifySample(sample: Sample): SampleClassification {
  const notes: LabNote[] = []
  const missing: LabTestType[] = []

  // ── Gradation ──
  const sieve = governingTest(sample, 'sieve')
  let grad: GradationResult | undefined
  if (sieve.test) {
    const { outcome, error } = evaluateTest(sieve.test)
    if (error) notes.push(warn(`Sieve analysis could not be evaluated: ${error}`))
    else if (outcome?.kind === 'sieve') grad = outcome.result
    if (sieve.superseded > 0) {
      notes.push(warn(
        `${sieve.superseded + 1} sieve analyses on this sample — the most recent complete one was used. Void the others if they should not count.`,
      ))
    }
  } else {
    missing.push('sieve')
  }

  // ── Plasticity ──
  const atter = governingTest(sample, 'atterberg')
  let limits: AtterbergResult | undefined
  if (atter.test) {
    const { outcome, error } = evaluateTest(atter.test)
    if (error) notes.push(warn(`Atterberg limits could not be evaluated: ${error}`))
    else if (outcome?.kind === 'atterberg') limits = outcome.result
    if (atter.superseded > 0) {
      notes.push(warn(
        `${atter.superseded + 1} Atterberg determinations on this sample — the most recent complete one was used.`,
      ))
    }
  } else {
    missing.push('atterberg')
  }

  // ── Sedimentation ──
  // Joined to the sieve curve below. It is what carries the grading past the
  // finest sieve — the only route to D₁₀ on a soil with more than ~10% fines,
  // and the only route to the 0.002 mm boundary the USDA triangle is drawn on.
  const hydro = governingTest(sample, 'hydrometer')
  let hyd: HydrometerResult | undefined
  if (hydro.test) {
    const { outcome, error } = evaluateTest(hydro.test)
    if (error) notes.push(warn(`Hydrometer analysis could not be evaluated: ${error}`))
    else if (outcome?.kind === 'hydrometer') hyd = outcome.result
  }

  if (!grad) {
    return {
      atterberg: limits, missing, notes: [
        ...notes,
        warn('No usable sieve analysis on this sample, so the gravel/sand/fines split is unknown and neither system can classify it.'),
      ],
    }
  }

  // Carry the limits through only when the soil is plastic. A non-plastic
  // result is a real finding — it tells the classifier the fines are silty —
  // so it is passed as PI = 0 with the LL, not withheld.
  const LL = limits?.liquidLimit
  const PI = limits?.plasticityIndex

  // ── One curve, sieve and sedimentation together ──
  // Everything downstream reads THIS rather than the sieve result, so a sample
  // with a hydrometer gets shape parameters the sieve alone could not reach.
  // With no hydrometer it is the sieve curve unchanged.
  const curve = combineGrading(grad, hyd)

  const uscs = classifyUSCS({
    gravel: curve.gravel,
    sand: curve.sand,
    fines: curve.fines,
    cu: curve.cu,
    cc: curve.cc,
    liquidLimit: LL,
    plasticityIndex: PI,
  })

  // AASHTO needs percent passing at three sieves rather than the fractions.
  const aashto = classifyAASHTO({
    passing10: passingAt(grad.rows, 2.0),
    passing40: passingAt(grad.rows, 0.425),
    passing200: grad.fines,
    liquidLimit: LL,
    plasticityIndex: PI,
  })

  // ── USDA texture, off the same joined curve ──
  const { usda, usdaGap } = textureFrom(curve)

  // The sieve engine advises running a hydrometer when its own curve stops
  // short of 10% passing. Once one is on file that advice is stale — the join
  // either reached D₁₀ or did not, and `curve.notes` says which — so it is
  // replaced rather than stacked. Matching on the text is deliberate and
  // pinned by a test: the two modules are siblings, and the alternative is a
  // flag the sieve engine would have to keep in step with wording it owns.
  const gradNotes = curve.combined ? grad.notes.filter((n) => !isStaleHydrometerAdvice(n)) : grad.notes
  if (gradNotes.length) notes.push(...gradNotes)
  if (curve.notes.length) notes.push(...curve.notes)
  if (curve.combined && curve.d10 == null) {
    notes.push(info(
      'Even joined with the sedimentation run the curve does not reach 10% passing, so D₁₀, Cu and Cc remain unavailable. On a soil this fine that is the expected answer rather than a gap in the testing.',
    ))
  }
  if (limits?.notes.length) notes.push(...limits.notes)
  if (usda?.notes.length) notes.push(...usda.notes)

  if (!uscs.symbol && !missing.includes('atterberg') && curve.d10 == null && !curve.combined) {
    notes.push(warn('The gradation curve does not reach 10% passing, so Cu and Cc are unavailable — a hydrometer analysis would complete it.'))
    if (!missing.includes('hydrometer')) missing.push('hydrometer')
  }

  return { uscs, aashto, usda, usdaGap, gradation: grad, curve, atterberg: limits, missing, notes }
}

/**
 * The USDA texture from the joined curve, or the reason there isn't one.
 *
 * The 0.05 mm sand/silt boundary usually falls in the join between the finest
 * sieve and the first sedimentation reading, and the 0.002 mm clay boundary
 * lies well inside the sedimentation range — so this is a read off
 * `combineGrading`'s curve rather than arithmetic of its own.
 *
 * Without a sedimentation run there is no 0.002 mm point at any price, and this
 * declines with a sentence rather than substituting the 0.075 mm fines content
 * for a clay fraction — those differ by about a factor of two in a typical clay.
 */
function textureFrom(c: CombinedGrading): { usda?: UsdaResult; usdaGap?: string } {
  if (!c.combined) {
    return {
      usdaGap: 'A USDA texture needs the clay fraction finer than 0.002 mm, which is two orders of magnitude below the finest sieve. Run a hydrometer (ASTM D7928) on this sample and the texture follows; the fines content from the sieve is not a substitute for it.',
    }
  }
  const clay = c.clay
  const silt = passingOnCurve(c.points, USDA_SILT_SIZE)
  if (clay == null || silt == null) {
    const ends = c.points
    return {
      usdaGap: `The joined grading curve runs from ${ends[0].size.toFixed(3)} mm down to ${ends[ends.length - 1].size.toFixed(4)} mm, which does not span both USDA boundaries (0.05 mm and 0.002 mm). Readings at either end of the sedimentation run would close it.`,
    }
  }
  const usda = usdaFromPassing({
    gravelBoundary: passingOrClamp(c, USDA_GRAVEL_SIZE),
    sandBoundary: silt,
    clayBoundary: clay,
  })
  return usda
    ? { usda }
    : { usdaGap: 'The joined grading curve does not descend with size across the USDA boundaries, so no texture can be read from it. Check that the hydrometer percentages were scaled to the whole sample.' }
}

/** USDA size boundaries, mm — deliberately not the sieve openings. */
const USDA_GRAVEL_SIZE = 2.0
const USDA_SILT_SIZE = 0.05
