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
// UNITS: as the underlying engines — percentages 0–100, sizes mm.
// ─────────────────────────────────────────────────────────────────────────

import type { Sample, LabTest, LabTestType } from './model'
import { classifyUSCS, type UscsResult } from './uscs'
import { classifyAASHTO, type AashtoResult } from './aashto'
import { evaluateTest } from './lab'
import type { GradationResult } from './sieve'
import type { AtterbergResult } from './atterberg'

export interface SampleClassification {
  uscs?: UscsResult
  aashto?: AashtoResult
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

  if (grad.notes.length) notes.push(...grad.notes)
  if (limits?.notes.length) notes.push(...limits.notes)

  if (!uscs.symbol && !missing.includes('atterberg') && grad.d10 == null) {
    notes.push('The gradation curve does not reach 10% passing, so Cu and Cc are unavailable — a hydrometer analysis would complete it.')
    if (!missing.includes('hydrometer')) missing.push('hydrometer')
  }

  return { uscs, aashto, gradation: grad, atterberg: limits, missing, notes }
}

/** Percent passing a sieve size, read off the computed gradation rows. */
function passingAtSize(g: GradationResult, size: number): number {
  const sorted = [...g.rows].sort((a, b) => b.size - a.size)
  const exact = sorted.find((r) => Math.abs(r.size - size) < 1e-9)
  if (exact) return exact.percentPassing
  if (!sorted.length) return 0
  if (size >= sorted[0].size) return 100
  if (size <= sorted[sorted.length - 1].size) return sorted[sorted.length - 1].percentPassing
  for (let i = 1; i < sorted.length; i++) {
    const hi = sorted[i - 1], lo = sorted[i]
    if (size <= hi.size && size >= lo.size) {
      const f = (Math.log10(size) - Math.log10(lo.size)) / (Math.log10(hi.size) - Math.log10(lo.size))
      return lo.percentPassing + f * (hi.percentPassing - lo.percentPassing)
    }
  }
  return 0
}
