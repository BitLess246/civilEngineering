// ─────────────────────────────────────────────────────────────────────────
// The walkthrough for the schedule dashboard. View-support layer.
//
// Four steps for one hidden dependency: EVERY FIGURE ON THIS PAGE IS "AS OF"
// A DATE, and that date is a small input in the corner rather than anything
// the KPIs mention. Read SPI without noticing it and you are reading
// performance as of whenever the page happened to default to.
//
// The second thing worth saying is which half of the page needs cost data.
// The KPI row is duration-based and always works; the earned-value block needs
// resource rates, which cannot be created in the app at all — so on a
// hand-built project that panel is permanently empty, and saying why beats
// leaving the user to wonder what they did wrong.
// ─────────────────────────────────────────────────────────────────────────

import type { Tour, TourStep } from './tour'

export const DASHBOARD_STEPS: readonly TourStep[] = [
  {
    id: 'data-date',
    anchor: 'data-date',
    title: 'Everything here is “as of” this date',
    body: 'Set the data date first. Planned progress, the schedule variance, SPI, days ahead or behind and the whole S-curve are all measured at this point in the programme, not at today.',
    why: 'It defaults to the latest of today and any actual date you have already recorded, clamped inside the project. For a progress meeting, set it to the cut-off you are reporting against rather than the day you happen to be presenting.',
  },
  {
    id: 'kpis',
    anchor: 'kpi-row',
    title: 'Six numbers for a progress meeting',
    body: 'Actual against planned progress, the gap as a percentage and as an SPI, the same gap in working days, and a forecast completion beside the planned one.',
    why: 'Days ahead or behind is usually the one to lead with — SPI of 0.94 means little across a table, while “eight working days behind” is immediately actionable. All of it is duration-weighted and needs no cost data.',
  },
  {
    id: 'curve',
    anchor: 's-curve',
    title: 'The S-curve shows the gap, drawn',
    body: 'The blue line is planned cumulative progress across the programme; the red dashed vertical is your data date and the red dot is where you actually are. The vertical distance between dot and curve is the variance.',
    why: 'The status breakdown beside it counts activities by state. Note that it derives “delayed” from the schedule — an activity that should have started and has not is counted here even though the Gantt still colours it grey.',
  },
  {
    id: 'evm',
    anchor: 'evm',
    title: 'Cost EVM needs resource rates',
    body: 'Enter your actual cost to date and this gives you CPI, EAC, VAC and the rest. Planned and earned value come from the schedule and the resource rates on each activity.',
    why: 'If it reports no resource costs, that is why the panel is empty — resources cannot be created in the app, so only the sample or an imported project carries them. The actual-cost figure is typed per visit and is not saved with the project.',
  },
]

export const DASHBOARD_TOUR: Tour = {
  id: 'schedule-dashboard',
  page: 'pages/ScheduleDashboard.tsx',
  steps: DASHBOARD_STEPS,
}
