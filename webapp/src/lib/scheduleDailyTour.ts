// ─────────────────────────────────────────────────────────────────────────
// The walkthrough for daily progress and delay analysis. View-support layer.
//
// Four steps, and it exists for ONE ordering trap that the page cannot show
// you: every number in the delay analysis is measured against a baseline, and
// a baseline can only be captured now — there is no way to capture one
// retroactively. A user who runs the job for two months and then discovers
// this page has nothing to compare against, and no way to get it.
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
    body: 'This freezes today’s computed dates and durations as the plan you will be measured against. Do it once the sequence is agreed and before site work begins.',
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
    title: 'Baselines are permanent',
    body: 'Capture as many as you like — a re-baseline after a variation order is normal practice — and choose here which one the analysis measures against.',
    why: 'They cannot be renamed or deleted in the app; each is named by its number and capture date. Removing one means exporting the project, editing the JSON and importing it back.',
  },
]

export const DAILY_TOUR: Tour = {
  id: 'schedule-daily',
  page: 'pages/ScheduleDaily.tsx',
  steps: DAILY_STEPS,
}
