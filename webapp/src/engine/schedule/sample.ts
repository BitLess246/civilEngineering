// ─────────────────────────────────────────────────────────────────────────
// A worked sample schedule — a small reinforced-concrete building — used as a
// UI seed and an end-to-end test fixture. Exercises WBS hierarchy, all four
// relation types with lag, PERT three-point estimates, resources, a Mon–Sat
// site calendar with holidays, and a partially-progressed data-date scenario.
// Durations are whole working days.
// ─────────────────────────────────────────────────────────────────────────

import type { Activity, ScheduleProject, WorkingCalendar } from './model'
import { MON_SAT } from './calendar'

const siteCalendar: WorkingCalendar = {
  id: 'site',
  name: 'Site (Mon–Sat)',
  workweek: [...MON_SAT],
  holidays: ['2026-08-21', '2026-08-31'],   // Ninoy Aquino Day, National Heroes Day
  hoursPerDay: 8,
}

/** Terse activity builder for the fixture. */
function a(
  id: string, wbsId: string, name: string, duration: number,
  omp: [number, number, number] | null,
  predecessors: Activity['predecessors'],
  extra: Partial<Activity> = {},
): Activity {
  const [optimistic, mostLikely, pessimistic] = omp ?? [duration, duration, duration]
  return {
    id, wbsId, name, duration, unit: 'days', calendarId: 'site',
    predecessors, optimistic, mostLikely, pessimistic, ...extra,
  }
}

/** Build a fresh copy of the sample project (safe to mutate). */
export function sampleProject(): ScheduleProject {
  return {
    meta: {
      name: 'Two-Storey RC Building — Lot 7',
      description: 'Sample schedule: reinforced-concrete residential building.',
      client: 'ABC Development Corp.',
      contractor: 'BuildRight Construction',
      engineer: 'R. Valdepeñas',
      start: '2026-08-03',
      plannedFinish: '2026-11-30',
    },
    calendars: [siteCalendar],
    defaultCalendarId: 'site',
    resources: [
      { id: 'lab', name: 'Laborers', type: 'labor', unit: 'man-day', costPerUnit: 650, availablePerDay: 12 },
      { id: 'carp', name: 'Carpenter crew', type: 'labor', unit: 'man-day', costPerUnit: 900, availablePerDay: 6 },
      { id: 'steel', name: 'Steel fixer', type: 'labor', unit: 'man-day', costPerUnit: 950, availablePerDay: 6 },
      { id: 'mason', name: 'Mason crew', type: 'labor', unit: 'man-day', costPerUnit: 900, availablePerDay: 8 },
      { id: 'exc', name: 'Excavator', type: 'equipment', unit: 'hr', costPerUnit: 1800, availablePerDay: 1 },
      { id: 'mix', name: 'Concrete mixer', type: 'equipment', unit: 'hr', costPerUnit: 400, availablePerDay: 2 },
    ],
    wbs: [
      { id: 'w1', code: '1', name: 'Site Works', order: 1 },
      { id: 'w1.1', code: '1.1', name: 'Mobilization', parentId: 'w1', order: 1 },
      { id: 'w1.2', code: '1.2', name: 'Clearing & Layout', parentId: 'w1', order: 2 },
      { id: 'w2', code: '2', name: 'Substructure', order: 2 },
      { id: 'w2.1', code: '2.1', name: 'Excavation', parentId: 'w2', order: 1 },
      { id: 'w2.2', code: '2.2', name: 'Footings', parentId: 'w2', order: 2 },
      { id: 'w3', code: '3', name: 'Superstructure', order: 3 },
      { id: 'w3.1', code: '3.1', name: 'Columns', parentId: 'w3', order: 1 },
      { id: 'w3.2', code: '3.2', name: 'Beams & Slab', parentId: 'w3', order: 2 },
      { id: 'w4', code: '4', name: 'Finishes', order: 4 },
      { id: 'w5', code: '5', name: 'Milestones', order: 5 },
    ],
    activities: [
      a('MOB', 'w1.1', 'Mobilization', 5, [4, 5, 8], [], {
        percentComplete: 100, status: 'completed',
        actualStart: '2026-08-03', actualFinish: '2026-08-07',
        resources: [{ resourceId: 'lab', quantity: 30 }],
      }),
      a('CLR', 'w1.2', 'Site clearing & layout', 4, [3, 4, 6],
        [{ predecessor: 'MOB', type: 'FS', lag: 0 }], {
        percentComplete: 100, status: 'completed', actualStart: '2026-08-08',
        resources: [{ resourceId: 'lab', quantity: 24 }, { resourceId: 'exc', quantity: 8 }],
      }),
      a('EXC', 'w2.1', 'Excavation', 6, [4, 6, 10],
        [{ predecessor: 'CLR', type: 'FS', lag: 0 }], {
        percentComplete: 60, status: 'in-progress', actualStart: '2026-08-13',
        resources: [{ resourceId: 'exc', quantity: 48 }, { resourceId: 'lab', quantity: 18 }],
      }),
      a('FTG', 'w2.2', 'Footing formwork & rebar', 5, [4, 5, 7],
        [{ predecessor: 'EXC', type: 'FS', lag: 0 }], {
        resources: [{ resourceId: 'carp', quantity: 20 }, { resourceId: 'steel', quantity: 15 }],
      }),
      a('FTC', 'w2.2', 'Footing concrete', 3, [2, 3, 5],
        [{ predecessor: 'FTG', type: 'FS', lag: 0 }], {
        resources: [{ resourceId: 'mix', quantity: 12 }, { resourceId: 'lab', quantity: 12 }],
      }),
      // 2-day curing lag before columns rise.
      a('COL', 'w3.1', 'Columns (GF)', 8, [6, 8, 12],
        [{ predecessor: 'FTC', type: 'FS', lag: 2 }], {
        resources: [{ resourceId: 'carp', quantity: 32 }, { resourceId: 'steel', quantity: 24 }, { resourceId: 'mix', quantity: 16 }],
      }),
      a('BSF', 'w3.2', 'Beams & slab formwork', 6, [5, 6, 9],
        [{ predecessor: 'COL', type: 'FS', lag: 0 }], {
        resources: [{ resourceId: 'carp', quantity: 30 }],
      }),
      // Rebar starts 2 days after formwork begins (SS+2), overlapping.
      a('BSR', 'w3.2', 'Beams & slab rebar', 5, [4, 5, 8],
        [{ predecessor: 'BSF', type: 'SS', lag: 2 }], {
        resources: [{ resourceId: 'steel', quantity: 25 }],
      }),
      a('BSC', 'w3.2', 'Beams & slab concrete', 3, [2, 3, 5],
        [{ predecessor: 'BSR', type: 'FS', lag: 0 }, { predecessor: 'BSF', type: 'FS', lag: 0 }], {
        resources: [{ resourceId: 'mix', quantity: 16 }, { resourceId: 'lab', quantity: 15 }],
      }),
      // Masonry after 3-day slab cure.
      a('MAS', 'w4', 'Masonry walls', 10, [8, 10, 15],
        [{ predecessor: 'BSC', type: 'FS', lag: 3 }], {
        resources: [{ resourceId: 'mason', quantity: 60 }],
      }),
      // Plaster trails masonry (SS+4).
      a('PLA', 'w4', 'Plastering', 8, [6, 8, 12],
        [{ predecessor: 'MAS', type: 'SS', lag: 4 }], {
        resources: [{ resourceId: 'mason', quantity: 40 }],
      }),
      a('PNT', 'w4', 'Painting', 6, [5, 6, 9],
        [{ predecessor: 'PLA', type: 'FS', lag: 0 }], {
        resources: [{ resourceId: 'lab', quantity: 18 }],
      }),
      a('HAND', 'w5', 'Handover', 0, null,
        [{ predecessor: 'PNT', type: 'FS', lag: 0 }], { milestone: true }),
    ],
    baselines: [],
  }
}
