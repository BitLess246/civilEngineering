// ─────────────────────────────────────────────────────────────────────────
// The walkthrough for daily progress and delay analysis. View-support layer.
//
// Four steps, and it exists for ONE ordering trap that the page cannot show
// you: every number in the delay analysis is measured against a baseline, and
// a baseline can only be captured now — there is no way to capture one
// retroactively. A user who runs the job for two months and then discovers
// this page has nothing to compare against, and no way to get it.
//
// The guide therefore CAPTURES one on opening (see the tour hooks in the page)
// when the project has none, so the two steps after the first describe a
// populated delay table rather than an empty panel — and REMOVES IT AGAIN on
// close. No baseline before the guide means no baseline after it; one that
// already existed is never touched. A walkthrough that leaves work behind is a
// worse bargain than an unhelpful step.
//
// The second trap is what the comparison actually means. The delta is the
// CURRENT PLAN against the baseline, not actuals against the plan, so an
// activity that is visibly late on site shows no slip until the schedule has
// been changed to reflect it. That is a reasonable design and a surprising
// one, which is exactly the kind of thing a walkthrough is for.
// ─────────────────────────────────────────────────────────────────────────

import type { Tour, TourStep } from './tour'

export const DAILY_STEPS: readonly TourStep[] = [
  {
    id: 'capture',
    anchor: 'capture-baseline',
    title: 'Capture a baseline before work starts',
    body: 'This freezes today’s computed dates and durations as the plan you will be measured against. Do it once the sequence is agreed and before site work begins. If you had none, the guide captured one on opening so the rest of this page has something to show — and removes it again when you close, leaving you exactly as you were.',
    why: 'There is no way to capture a baseline for a date that has passed. A baseline taken mid-project compares the job against a plan that already contains the delay, and reports no slip. The button stays disabled while the schedule has errors.',
  },
  {
    id: 'log',
    anchor: 'progress-log',
    title: 'Log the actuals here each week',
    body: 'One row per activity: per-cent complete, actual start, actual finish and remarks. This is the fastest weekly update in the app — one screen, and every other planning page follows from it.',
    why: 'Per-cent complete and remarks are the same fields as in the grid; editing either changes both. Actual dates also set the default data date on the dashboard.',
  },
  {
    id: 'delays',
    anchor: 'delay-analysis',
    title: 'What the delay figures compare',
    body: 'Δ columns are the current schedule minus the selected baseline — start and finish in calendar days, duration in working days. A CRITICAL flag means the slip is on the critical path and is pushing the project completion.',
    why: 'This measures the PLAN against the baseline, not actuals against the plan. An activity running late on site shows no slip here until its duration or logic in the grid has been changed to reflect what happened.',
  },
  {
    id: 'baselines',
    anchor: 'baseline-select',
    title: 'Keep more than one, and name them',
    body: 'Capture as many as you like — re-baselining after a variation order is normal practice — and choose here which one the analysis measures against. Rename gives a snapshot a name you will recognise in three months; Delete removes one, and asks first.',
    why: '“Baseline 4” tells you nothing about which revision it was, so rename them for what they are: as-tendered, after VO-3, revised programme. Deleting the selected one falls back to the newest that remains.',
  },
]

export const DAILY_TOUR: Tour = {
  id: 'schedule-daily',
  page: 'pages/ScheduleDaily.tsx',
  steps: DAILY_STEPS,
}
