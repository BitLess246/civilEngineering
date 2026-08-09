// ─────────────────────────────────────────────────────────────────────────
// The hook a page uses to run a walkthrough. View-support layer.
//
// Wiring a tour used to be twenty lines of state in the page — an index, an
// on/off flag, and three handlers that each had to remember to switch the tab
// as well as move the step. Forgetting the tab switch in ONE of them is a tour
// that silently stops navigating halfway through, which is exactly the failure
// a walkthrough exists to prevent.
//
// So the tab switch lives here, beside the step move, and a page passes its
// own `setTab`. There is no way to advance without navigating.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from 'react'
import { nextIndex, prevIndex, type TourStep } from './tour'

export interface TourController {
  /** Whether the overlay is showing. */
  on: boolean
  /** Index of the current step. */
  at: number
  step: TourStep
  total: number
  start: () => void
  next: () => void
  prev: () => void
  close: () => void
}

/**
 * @param steps  the tour, in order
 * @param setTab called with each step's `tab` so the page follows along.
 *               Typed loosely because every page has its own tab union; the
 *               strings are checked against the page source by `tours.test.ts`.
 */
export function useTour(
  steps: readonly TourStep[],
  setTab: (tab: string) => void,
): TourController {
  const [on, setOn] = useState(false)
  const [at, setAt] = useState(0)

  const go = useCallback((i: number) => {
    setAt(i)
    const t = steps[i]?.tab
    if (t) setTab(t)
  }, [steps, setTab])

  return {
    on, at, total: steps.length,
    step: steps[Math.min(at, steps.length - 1)],
    start: useCallback(() => { setOn(true); go(0) }, [go]),
    next: useCallback(() => go(nextIndex(at, steps.length)), [at, go, steps.length]),
    prev: useCallback(() => go(prevIndex(at)), [at, go]),
    close: useCallback(() => setOn(false), []),
  }
}
