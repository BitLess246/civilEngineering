/**
 * Check coverage — how much of a design was actually evaluated.
 *
 * A verdict panel shows the checks a calculator ran. The question this module
 * answers is the one the panel could not: how many checks EXIST for this
 * design, and how many of them produced a number.
 *
 * `ratio: null` is the third state, distinct from pass and fail: the check
 * applies to the design but its inputs were not supplied, so it never ran.
 * That state has to reach the printed sheet, because the sheet is signed. A
 * report headed `DESIGN OK` that silently omits a check the code requires is
 * indistinguishable, to the person signing it, from one where every check
 * passed.
 *
 * Lives outside `components/calc.tsx` because a component module may only
 * export components (react-refresh), and because the arithmetic here is worth
 * testing without mounting anything.
 */

/** Anything with a ratio. Structural, so both the screen and print row fit. */
export interface Rated { ratio: number | null }

/** How many checks produced a number, and how many exist. */
export function checkCoverage(checks: readonly Rated[]): { run: number; total: number } {
  return { run: checks.filter((c) => c.ratio !== null).length, total: checks.length }
}

/**
 * The qualifier a verdict headline carries when it is not the whole truth.
 *
 * Empty when every check ran — `DESIGN OK` is then complete and adding a count
 * to it would be noise. Otherwise ` (3 of 4 checks)`, appended to the headline
 * rather than printed beside it, so it cannot be laid out away from the verdict
 * it qualifies or dropped by a narrow container.
 */
export function coverageSuffix(checks: readonly Rated[]): string {
  const { run, total } = checkCoverage(checks)
  return run === total ? '' : ` (${run} of ${total} checks)`
}

/**
 * Is this design fully evaluated?
 *
 * Note the asymmetry with `ok`: a calculator's `ok` speaks for the checks that
 * ran. This speaks for whether that is the whole story.
 */
export const fullyChecked = (checks: readonly Rated[]): boolean =>
  checks.every((c) => c.ratio !== null)
