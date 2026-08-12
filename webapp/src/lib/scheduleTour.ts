// ─────────────────────────────────────────────────────────────────────────
// The walkthrough for the project schedule grid. View-support layer.
//
// This page passes `tour.ts`'s test for needing one more clearly than any page
// so far, and for a reason none of the others have: THE CONTROLS ARE HIDDEN
// INSIDE EACH OTHER. The grid nests two levels deep behind two expanders that
// use the same ▸ glyph in the same column, and the things a schedule is
// actually made of — the WBS assignment, the milestone switch, and above all
// the dependency editor — exist only inside the second one. A user who never
// clicks a ▸ sees a table of durations with no way to connect them, which is
// not a schedule at all.
//
// So this tour DRIVES THE GRID rather than describing it. Its `tab` values are
// read by `Schedule.tsx` as which rows must be open, and the steps that talk
// about the detail panel arrive with the panel already expanded.
//
// WHAT IS DELIBERATELY LEFT OUT. The Gantt, network, resources and reports
// pages get no tour of their own: they are views over this data with two or
// three self-evident controls each, and `tour.ts` is explicit that adding a
// guide where none is needed trains people to dismiss the button. The two
// planning pages that DO carry a hidden order — the dashboard's data date and
// the daily page's capture-a-baseline-first — have their own short ones.
// ─────────────────────────────────────────────────────────────────────────

import type { Tour, TourStep } from './tour'

export const SCHEDULE_STEPS: readonly TourStep[] = [
  {
    id: 'projects',
    anchor: 'project-bar',
    title: 'Your schedules live in this browser',
    body: 'New starts an empty programme, Load sample opens a worked two-storey building, and the dropdown switches between them. Export writes a JSON file and Import reads it back.',
    why: 'Nothing here is stored on a server or tied to your account. Export is the only backup, and the only way to move a programme to another machine — clearing site data removes every schedule.',
  },
  {
    id: 'header',
    anchor: 'project-card',
    title: 'The start date is day zero',
    body: 'Name the project and set its start date. Every date you will see on every planning page is this date pushed forward through the working calendar.',
    why: 'Changing it never alters durations, logic or float — the schedule is solved in working days and only projected onto the calendar afterwards, so all dates move together.',
  },
  {
    id: 'summary',
    anchor: 'summary',
    title: 'Duration, finish and the error count',
    body: 'These six tiles are the whole programme at a glance. Watch the last one: while it shows errors in red, nothing solves — no dates, no float, and every other planning page stays blank until you clear them.',
    why: 'Errors list themselves in a panel just below, all at once rather than one at a time. Warnings are advisory and never block the solve.',
  },
  {
    id: 'add',
    anchor: 'add-activity',
    title: 'Add the activities first, logic later',
    body: 'Each new row gets the next free id, a duration of one day and no predecessors. Get the whole list of work down with durations before you connect anything.',
    why: 'With no logic yet, everything shows zero float and looks critical. That is expected — float only means something once the sequence exists.',
  },
  {
    id: 'grid',
    tab: 'grid',
    anchor: 'activity-grid',
    title: 'Four columns are editable in place',
    body: 'Activity name, Dur and % complete are typed straight into the table. Start, Finish and Float are computed and update as you type. A pink row is on the critical path.',
    why: 'Dur is what the critical-path calculation actually uses. The Predecessors column is a read-only summary — you edit links one level down.',
  },
  {
    id: 'group',
    tab: 'grid',
    anchor: 'wbs-group',
    title: 'The grey bands are WBS groups',
    body: 'This ▸ collapses a whole section of the programme so you can work on one part of the building at a time. Several can be collapsed at once.',
    why: 'Purely visual — collapsing changes no dates and nothing that gets exported. Activities with no WBS assigned collect in an “Unassigned” band at the end.',
  },
  {
    id: 'row',
    tab: 'grid',
    anchor: 'activity-row',
    title: 'Every activity has a second level',
    body: 'The ▸ on an activity row opens its detail panel. This is the one control people miss, and everything a schedule needs beyond a duration is behind it.',
    why: 'Only one activity can be expanded at a time — opening another closes this one.',
  },
  {
    id: 'detail',
    tab: 'detail',
    anchor: 'detail-fields',
    title: 'WBS, responsibility and milestones',
    body: 'Assign the activity to a WBS group here — that is what sorts it into a band in the grid, the Gantt and the reports. Milestone → Yes also sets the duration to zero and draws it as a diamond everywhere.',
    why: 'The WBS list only offers nodes that already exist, and nodes cannot be created in the app — a blank project has none, so its activities all stay Unassigned. Starting from the sample gives you a ready-made 15-node structure.',
  },
  {
    id: 'deps',
    tab: 'detail',
    anchor: 'dep-editor',
    title: 'This is where the programme is built',
    body: 'Pick what this activity waits for, choose FS / SS / FF / SF, add a lag if you need one, then press Add. Links are stored on the later activity, so you always open the one that comes second.',
    why: 'The dropdown only offers legal choices — anything that would create a loop is filtered out before you can pick it. If the add row disappears entirely, every remaining activity would close a cycle. Use a lag for curing rather than inventing a “cure” activity: FS+7 reads truer than a fake bar.',
  },
  {
    id: 'cpm',
    tab: 'detail',
    anchor: 'cpm-cells',
    title: 'Where the float comes from',
    body: 'Earliest and latest start and finish, in working days from day zero, plus both floats. Total float is how long this can slip before the project finish moves; zero total float is the definition of critical.',
    why: 'Free float is the more useful number when re-sequencing one trade: it is how long you can slip before the NEXT activity is affected, rather than the whole job.',
  },
  {
    id: 'next',
    title: 'Then read it on the other planning pages',
    body: 'The Gantt, network diagram, dashboard, resource histogram and reports all read this same project — there is nothing to re-enter. Check the network diagram first: if the critical path is not the route you expected, the logic is wrong rather than the arithmetic.',
    why: 'Once the sequence is right, capture a baseline on the Daily page before work starts. A baseline taken mid-project measures nothing useful, and it is what every delay figure is compared against.',
  },
]

export const SCHEDULE_TOUR: Tour = {
  id: 'schedule',
  page: 'pages/Schedule.tsx',
  steps: SCHEDULE_STEPS,
}
