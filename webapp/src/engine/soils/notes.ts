// ─────────────────────────────────────────────────────────────────────────
// Engine notes, and what they are worth. Layer 8.
//
// Every soils engine returns prose alongside its numbers, and until now that
// prose was a flat `string[]` — which meant the report had no way to tell
// these two apart:
//
//   "Every diameter is an EQUIVALENT SPHERICAL diameter: the size of a sphere
//    that would settle at the speed this fraction settled."
//   "Mass balance is off by 25% — D6913 requires closure within 1%. Re-weigh
//    before using this grading."
//
// The first is a caveat about the METHOD, true of every hydrometer ever run,
// and a reader who does not already know it should. The second says THIS
// RESULT MAY BE WRONG. Printing them in the same grey italic teaches the
// reader to skim both, which is how a real warning gets missed.
//
// So a note carries its severity, and there are exactly two:
//
//   warning  the number beside it may be wrong, unreliable, or absent
//            BECAUSE OF HOW THIS TEST WAS RUN OR REPORTED. There is
//            something to do: re-weigh, re-run, run another test, check an
//            input, or read a value off the plot before quoting it.
//   info     everything else — a convention, a statement of what the method
//            can and cannot do, the provenance of a number, or a finding
//            about the soil. Always true of this run; nothing to fix.
//
// TWO CONSEQUENCES OF DRAWING THE LINE THERE, both deliberate:
//
//   • A NOTE THAT ALWAYS FIRES IS NEVER A WARNING. "Permeability is trusted
//     to within a factor of two or three" is on every permeability result and
//     matters enormously to how the number is used — but there is nothing
//     about this run to check, so it is `info`. A warning that appears on
//     every test is a `string[]` again with extra steps.
//   • SEVERITY IS ABOUT THE RESULT, NOT ABOUT THE SOIL. "Natural moisture is
//     above the liquid limit — the soil may be sensitive or quick" is a
//     hazard, and it is `info`, because the measurement is sound and complete.
//     Soil hazards belong to the parameters and recommendations sections,
//     which reason about behaviour; this field only says how much to trust
//     the number it sits beside.
//
// Severity is decided WHERE THE NOTE IS WRITTEN. The alternative — deciding
// it later by matching on the wording — was tried once in `classifySample`
// and needed a test to hold it in place; doing that across sixty notes would
// be a second copy of every engine's judgement, kept in step by hand.
//
// Severity is decided WHERE THE NOTE IS WRITTEN. The alternative — deciding
// it later by matching on the wording — was tried once in `classifySample`
// and needed a test to hold it in place; doing that across sixty notes would
// be a second copy of every engine's judgement, kept in step by hand.
// ─────────────────────────────────────────────────────────────────────────

export type NoteSeverity = 'warning' | 'info'

export interface LabNote {
  severity: NoteSeverity
  text: string
}

/** This result may be wrong, or rests on something that should be checked. */
export const warn = (text: string): LabNote => ({ severity: 'warning', text })

/** A caveat or convention. Always true of the method; nothing to fix here. */
export const info = (text: string): LabNote => ({ severity: 'info', text })

/** The prose alone, for a caller that only wants to print it. */
export const noteText = (notes: readonly LabNote[]): string[] => notes.map((n) => n.text)

/** Just the notes that cast doubt on a number. */
export const warningsOf = (notes: readonly LabNote[]): LabNote[] =>
  notes.filter((n) => n.severity === 'warning')

/** True when anything in the list questions the result. */
export const hasWarning = (notes: readonly LabNote[]): boolean =>
  notes.some((n) => n.severity === 'warning')
