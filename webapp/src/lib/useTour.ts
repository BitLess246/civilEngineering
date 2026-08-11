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

import { useCallback, useRef, useState } from 'react'
import { nextIndex, prevIndex, tourLifecycle, type TourStep } from './tour'

/**
 * Optional lifecycle for a tour that has to SET SOMETHING UP to be worth
 * running. The 3D Model Space is the case that forced it: its walkthrough
 * points at a tab bar, a properties table and a design button, and on a first
 * visit every one of those is empty — a guided tour of a blank canvas.
 *
 * `onStart` may load a demo; `onEnd` puts things back. They are paired: `onEnd`
 * runs only if `onStart` ran, exactly once, whether the tour ended at the last
 * step, by Esc, or by the close button. A tour that leaves a demo model behind
 * when the user dismisses it has destroyed their work, which is a far worse
 * failure than an unhelpful tour.
 */
export interface TourHooks {
  onStart?: () => void
  onEnd?: () => void
}

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
  hooks?: TourHooks,
): TourController {
  const [on, setOn] = useState(false)
  const [at, setAt] = useState(0)
  // Whether `onStart` has run and `onEnd` is therefore owed. A ref, not state:
  // it must be readable and writable inside the same handler that flips `on`,
  // and it must never trigger a render of its own.
  const started = useRef(false)
  const onStart = hooks?.onStart
  const onEnd = hooks?.onEnd

  const go = useCallback((i: number) => {
    setAt(i)
    const t = steps[i]?.tab
    if (t) setTab(t)
  }, [steps, setTab])

  return {
    on, at, total: steps.length,
    step: steps[Math.min(at, steps.length - 1)],
    start: useCallback(() => {
      const t = tourLifecycle(started.current, 'start')
      started.current = t.started
      if (t.fire === 'start') onStart?.()
      setOn(true); go(0)
    }, [go, onStart]),
    next: useCallback(() => go(nextIndex(at, steps.length)), [at, go, steps.length]),
    prev: useCallback(() => go(prevIndex(at)), [at, go]),
    close: useCallback(() => {
      setOn(false)
      const t = tourLifecycle(started.current, 'close')
      started.current = t.started
      if (t.fire === 'end') onEnd?.()
    }, [onEnd]),
  }
}
