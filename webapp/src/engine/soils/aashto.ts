// ─────────────────────────────────────────────────────────────────────────
// AASHTO soil classification. Layer 8. AASHTO M 145 Table 1.
//
// The highway-engineering counterpart to USCS, and it answers a different
// question. USCS asks "what IS this soil"; AASHTO asks "how well will it
// perform under a pavement", and ranks A-1 (best) through A-7 (worst) with a
// GROUP INDEX that penalises fines and plasticity.
//
// The two systems disagree by design and both answers are correct. AASHTO puts
// the silt/clay boundary at 35% passing the No. 200 sieve where USCS puts it at
// 50%, so a soil with 40% fines is "granular" to AASHTO and "coarse-grained" to
// USCS but sits in different families. A report that quotes both should not
// try to reconcile them.
//
// THE TABLE IS READ LEFT TO RIGHT: M 145 is an elimination procedure, and the
// first group whose criteria are all satisfied is the answer. Implementing it
// as independent tests rather than in order gives the wrong group for soils
// that satisfy more than one.
//
// UNITS: percentages 0–100; LL and PI in %.
// ─────────────────────────────────────────────────────────────────────────

export interface AashtoInput {
  /** Percent passing the 2.00 mm (No. 10) sieve, %. */
  passing10: number
  /** Percent passing the 0.425 mm (No. 40) sieve, %. */
  passing40: number
  /** Percent passing the 0.075 mm (No. 200) sieve, %. */
  passing200: number
  liquidLimit?: number
  plasticityIndex?: number
}

export interface AashtoResult {
  /** Group, e.g. 'A-2-6' or 'A-7-6'. Undefined when unclassifiable. */
  group?: string
  /**
   * Group index, rounded to the nearest whole number and floored at zero.
   * Printed in parentheses after the group: 'A-6 (12)'.
   */
  groupIndex: number
  /** Group with its index, ready for a log: 'A-7-6 (18)'. */
  label?: string
  /** General rating as subgrade material. */
  rating: 'excellent to good' | 'fair to poor' | 'unknown'
  /** Granular when 35% or less passes the No. 200 sieve. */
  granular: boolean
  reason: string
  notes: string[]
}

/**
 * Group index, AASHTO M 145 Eq. 1:
 *   GI = (F − 35)[0.2 + 0.005(LL − 40)] + 0.01(F − 15)(PI − 10)
 * where F is percent passing the No. 200 sieve.
 *
 * The equation is evaluated SIGNED and only the TOTAL is floored at zero, which
 * is what M 145 says: "when the calculated group index is negative, the group
 * index shall be reported as zero". Clamping the individual terms at zero first
 * is a different equation and gives a different answer — a soil with 40% fines
 * at LL 20 / PI 2 comes out as 1 that way and as 0 the standard's way.
 *
 * DOMAIN: M 145 applies this to the silt-clay groups (F > 35) and, in its
 * partial form, to A-2-6 and A-2-7. `classifyAASHTO` only calls it there.
 * Evaluated far outside that domain the expression is simply meaningless —
 * F = LL = PI = 0 returns 2, which is arithmetic, not a soil.
 */
export function groupIndex(passing200: number, LL: number, PI: number): number {
  const F = Math.min(passing200, 100)
  const gi = (F - 35) * (0.2 + 0.005 * (LL - 40)) + 0.01 * (F - 15) * (PI - 10)
  return Math.max(Math.round(gi), 0)
}

/**
 * Group index for the A-2-6 and A-2-7 subgroups, which use only the second
 * (plasticity) term of the full equation — M 145 note.
 */
export function partialGroupIndex(passing200: number, PI: number): number {
  const F = Math.min(passing200, 100)
  return Math.max(Math.round(0.01 * (F - 15) * (PI - 10)), 0)
}

export function classifyAASHTO(i: AashtoInput): AashtoResult {
  const notes: string[] = []
  const { passing10, passing40, passing200 } = i
  const LL = i.liquidLimit
  const PI = i.plasticityIndex

  if (passing200 > passing40 + 1e-9 || passing40 > passing10 + 1e-9) {
    notes.push('Percent passing must not increase with sieve size — check the grading before relying on this.')
  }

  const granular = passing200 <= 35

  // Plasticity is needed for everything except the coarsest granular groups,
  // and guessing it would change the group outright.
  const needsPlasticity = !granular || passing200 > 10
  if (needsPlasticity && (LL == null || PI == null)) {
    return {
      groupIndex: 0, granular, notes, rating: 'unknown',
      reason: 'AASHTO M 145 needs the liquid limit and plasticity index to place this soil — run ASTM D4318.',
    }
  }

  // ── Granular: ≤ 35% passing No. 200 ──
  if (granular) {
    // A-1-a: ≤50 pass No.10, ≤30 pass No.40, ≤15 pass No.200, PI ≤ 6
    if (passing10 <= 50 && passing40 <= 30 && passing200 <= 15 && (PI ?? 0) <= 6) {
      return granularResult('A-1-a', 0, granular, notes,
        'Predominantly stone fragments or gravel: ≤50% passing No. 10, ≤30% passing No. 40, ≤15% fines, PI ≤ 6.')
    }
    // A-1-b: ≤50 pass No.40, ≤25 pass No.200, PI ≤ 6
    if (passing40 <= 50 && passing200 <= 25 && (PI ?? 0) <= 6) {
      return granularResult('A-1-b', 0, granular, notes,
        'Predominantly coarse sand: ≤50% passing No. 40, ≤25% fines, PI ≤ 6.')
    }
    // A-3: ≥51 pass No.40, ≤10 pass No.200, non-plastic
    if (passing40 >= 51 && passing200 <= 10 && (PI ?? 0) === 0) {
      return granularResult('A-3', 0, granular, notes,
        'Fine sand: ≥51% passing No. 40, ≤10% fines, non-plastic.')
    }
    // A-2 family: granular with more fines or more plasticity than A-1 / A-3.
    const ll = LL!, pi = PI!
    const highLL = ll >= 41
    const highPI = pi >= 11
    const sub = highLL ? (highPI ? 'A-2-7' : 'A-2-5') : (highPI ? 'A-2-6' : 'A-2-4')
    // Only the -6 and -7 subgroups carry a group index, from the partial equation.
    const gi = sub === 'A-2-6' || sub === 'A-2-7' ? partialGroupIndex(passing200, pi) : 0
    return granularResult(sub, gi, granular, notes,
      `Granular with ${passing200.toFixed(0)}% fines: LL = ${ll.toFixed(0)} (${highLL ? '≥' : '<'} 41), PI = ${pi.toFixed(0)} (${highPI ? '≥' : '<'} 11) ⇒ ${sub}.`)
  }

  // ── Silt-clay: > 35% passing No. 200 ──
  const ll = LL!, pi = PI!
  const gi = groupIndex(passing200, ll, pi)
  const highLL = ll >= 41
  const highPI = pi >= 11

  let group: string
  let why: string
  if (!highLL && !highPI) {
    group = 'A-4'
    why = 'Silty soil: LL < 41 and PI < 11.'
  } else if (highLL && !highPI) {
    group = 'A-5'
    why = 'Elastic silt: LL ≥ 41 with PI < 11.'
  } else if (!highLL && highPI) {
    group = 'A-6'
    why = 'Clayey soil: LL < 41 with PI ≥ 11.'
  } else {
    // A-7-5 vs A-7-6 turns on PI relative to LL − 30.
    const a75 = pi <= ll - 30
    group = a75 ? 'A-7-5' : 'A-7-6'
    why = a75
      ? `Highly plastic, PI = ${pi.toFixed(0)} ≤ LL − 30 = ${(ll - 30).toFixed(0)} ⇒ A-7-5.`
      : `Highly plastic, PI = ${pi.toFixed(0)} > LL − 30 = ${(ll - 30).toFixed(0)} ⇒ A-7-6.`
  }

  return {
    group,
    groupIndex: gi,
    label: `${group} (${gi})`,
    granular: false,
    rating: 'fair to poor',
    notes,
    reason: `${passing200.toFixed(0)}% passing the No. 200 sieve (> 35%) ⇒ silt-clay. ${why} Group index ${gi}.`,
  }
}

function granularResult(
  group: string, gi: number, granular: boolean, notes: string[], reason: string,
): AashtoResult {
  return {
    group,
    groupIndex: gi,
    label: `${group} (${gi})`,
    granular,
    rating: 'excellent to good',
    notes,
    reason,
  }
}
