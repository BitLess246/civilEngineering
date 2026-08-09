// ─────────────────────────────────────────────────────────────────────────
// Walkthroughs, shared. View-support layer.
//
// The soil-investigation tour proved the shape; this is that shape with the
// soils taken out, so a second page costs a step list and some attributes
// rather than a second copy of the machinery.
//
// A TOUR IS A LIST OF STEPS, EACH NAMING A TAB AND AN ANCHOR. The tab is an
// opaque string here — every page has its own union and interprets it — and
// the anchor is a `data-tour` value the overlay measures. Keeping both as data
// is what lets `tours.test.ts` check every registered tour against its page
// source without rendering anything.
//
// WHICH PAGES GET ONE. Not every tabbed page needs a walkthrough, and adding
// one where it is not needed trains users to dismiss the button. The test is
// whether the tabs carry a DEPENDENCY ORDER that is invisible from the tab bar:
//
//   Soil investigation  borehole → layer → sample → test → classification.
//                       The sample step is invisible and blocks everything.
//   3D Model Space      geometry → properties → supports → loading →
//                       analysis → design. Each tab needs the ones before it,
//                       and 'Design structure' silently does nothing until an
//                       analysis has run.
//   Plumbing            one fixture schedule feeds all three tabs; a user who
//                       starts on Drainage designs from nothing.
//
// Steel Design has three tabs and gets NO tour: beam, column and connection
// are independent calculators with separate state, in no order. A walkthrough
// there would say "there are three tabs", which the tab bar already says.
// ─────────────────────────────────────────────────────────────────────────

export interface TourStep {
  id: string
  /**
   * Tab the step lives on. Opaque here; the page casts it to its own union,
   * and `tours.test.ts` checks the string against the page source.
   */
  tab?: string
  /** `data-tour` value to spotlight. Absent ⇒ a centred card. */
  anchor?: string
  title: string
  /** What to do here, in one or two sentences. */
  body: string
  /** Why it works this way — shown smaller. Omit when the title says it all. */
  why?: string
}

export interface Tour {
  id: string
  /** Page source file, relative to `src/`, for the anchor test to read. */
  page: string
  steps: readonly TourStep[]
}

/** Next index, stopping at the end rather than wrapping. */
export const nextIndex = (i: number, total: number): number => Math.min(i + 1, total - 1)

/** Previous index, stopping at the start. */
export const prevIndex = (i: number): number => Math.max(i - 1, 0)

/** True when this index is the last step, so the button can read “Done”. */
export const isLast = (i: number, total: number): boolean => i >= total - 1

/** Step at an index, clamped into range. */
export const stepAt = (steps: readonly TourStep[], i: number): TourStep | undefined =>
  steps[Math.min(Math.max(i, 0), steps.length - 1)]

/** Every distinct anchor a tour points at. */
export const anchorsOf = (steps: readonly TourStep[]): string[] =>
  [...new Set(steps.map((s) => s.anchor).filter((a): a is string => Boolean(a)))]
