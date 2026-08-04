// ─────────────────────────────────────────────────────────────────────────
// A worked sample schedule — a small reinforced-concrete building — used as a
// UI seed and an end-to-end test fixture. Exercises WBS hierarchy, all four
// relation types with lag, PERT three-point estimates, resources, a Mon–Sat
// site calendar with holidays, and a partially-progressed data-date scenario.
// Durations are whole working days.
//
// ── IT HAS TO BRANCH ────────────────────────────────────────────────────
//
// The first version was a single chain: thirteen activities, each waiting on
// exactly one predecessor. It solved through CPM and drew a Gantt fine, but
// the network diagram came out as one straight line thirteen boxes long,
// because that is genuinely what the data was — and a straight line teaches
// the wrong thing about a construction programme.
//
// A real building branches. Below, three streams run off the slab pour —
// masonry/finishes, MEP rough-in, and roofing — and converge again at the
// pre-handover clean-up. Site fencing runs alongside excavation. Every
// branch is a real sequencing decision a planner makes, not filler:
//
//     MOB ─┬─ CLR ─── EXC ─┬─ FTG ─ FTC ─ COL ─ BSF ═ BSR ─ BSC ─┬─ MAS ─┬─ PLA ─ PNT ─┐
//          └─ FEN          └─ UTIL ──────────────────────────────┤       └─ DRW ───────┤
//                                                                ├─ MEP ─── MEPF ──────┼─ CLN ─ HAND
//                                                                └─ ROOF ──────────────┘
//
// (═ is an SS overlap.) That shape is what the network diagram exists to
// show, and it is also what makes the resource histogram and the float
// columns interesting — in a chain every activity is critical by default.
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
      { id: 'mep', name: 'MEP crew', type: 'labor', unit: 'man-day', costPerUnit: 1100, availablePerDay: 6 },
      { id: 'roof', name: 'Roofing crew', type: 'labor', unit: 'man-day', costPerUnit: 1000, availablePerDay: 5 },
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
      { id: 'w3.3', code: '3.3', name: 'Roofing', parentId: 'w3', order: 3 },
      { id: 'w4', code: '4', name: 'Finishes', order: 4 },
      { id: 'w4.1', code: '4.1', name: 'Wet Trades', parentId: 'w4', order: 1 },
      { id: 'w4.2', code: '4.2', name: 'Doors & Windows', parentId: 'w4', order: 2 },
      { id: 'w6', code: '6', name: 'MEP', order: 6 },
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
      // Perimeter fence runs alongside clearing and excavation — it shares
      // no crew with them, so it has float and is not on the critical path.
      a('FEN', 'w1.2', 'Perimeter fencing', 6, [4, 6, 9],
        [{ predecessor: 'MOB', type: 'FS', lag: 0 }], {
        percentComplete: 50, status: 'in-progress', actualStart: '2026-08-10',
        resources: [{ resourceId: 'lab', quantity: 18 }],
      }),
      a('EXC', 'w2.1', 'Excavation', 6, [4, 6, 10],
        [{ predecessor: 'CLR', type: 'FS', lag: 0 }], {
        percentComplete: 60, status: 'in-progress', actualStart: '2026-08-13',
        resources: [{ resourceId: 'exc', quantity: 48 }, { resourceId: 'lab', quantity: 18 }],
      }),
      // Underground drainage goes in while the trenches are still open —
      // the classic reason excavation is not simply followed by footings.
      a('UTIL', 'w6', 'Underground utilities', 7, [5, 7, 11],
        [{ predecessor: 'EXC', type: 'SS', lag: 3 }], {
        resources: [{ resourceId: 'mep', quantity: 21 }, { resourceId: 'lab', quantity: 14 }],
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
      // ── Three streams fan out from the slab pour ────────────────────
      // Masonry after 3-day slab cure.
      a('MAS', 'w4.1', 'Masonry walls', 10, [8, 10, 15],
        [{ predecessor: 'BSC', type: 'FS', lag: 3 }], {
        resources: [{ resourceId: 'mason', quantity: 60 }],
      }),
      // Roofing needs the slab but nothing else, so it runs in parallel with
      // everything happening inside.
      a('ROOF', 'w3.3', 'Roof framing & sheeting', 9, [7, 9, 14],
        [{ predecessor: 'BSC', type: 'FS', lag: 1 }], {
        resources: [{ resourceId: 'roof', quantity: 36 }, { resourceId: 'carp', quantity: 12 }],
      }),
      // MEP rough-in is chased into the walls, so it trails masonry rather
      // than waiting for it (SS+5) — and must FINISH before plastering can
      // finish, which is what an FF link is for.
      a('MEP', 'w6', 'MEP rough-in', 12, [9, 12, 18],
        [{ predecessor: 'MAS', type: 'SS', lag: 5 }], {
        resources: [{ resourceId: 'mep', quantity: 48 }],
      }),
      // Plaster trails masonry (SS+4) and cannot finish before the rough-in.
      a('PLA', 'w4.1', 'Plastering', 8, [6, 8, 12],
        [{ predecessor: 'MAS', type: 'SS', lag: 4 }, { predecessor: 'MEP', type: 'FF', lag: 1 }], {
        resources: [{ resourceId: 'mason', quantity: 40 }],
      }),
      a('PNT', 'w4.1', 'Painting', 6, [5, 6, 9],
        [{ predecessor: 'PLA', type: 'FS', lag: 0 }], {
        resources: [{ resourceId: 'lab', quantity: 18 }],
      }),
      // Doors and windows follow masonry directly — a second finishing branch
      // that does not wait for the wet trades.
      a('DRW', 'w4.2', 'Doors & windows', 7, [5, 7, 11],
        [{ predecessor: 'MAS', type: 'FS', lag: 2 }], {
        resources: [{ resourceId: 'carp', quantity: 28 }],
      }),
      // Testing cannot happen until the underground drainage is in, which is
      // what ties the substructure branch back into the finishing sequence.
      a('MEPF', 'w6', 'MEP fixtures & testing', 5, [4, 5, 8],
        [{ predecessor: 'MEP', type: 'FS', lag: 0 }, { predecessor: 'PNT', type: 'SS', lag: 3 },
         { predecessor: 'UTIL', type: 'FS', lag: 0 }], {
        resources: [{ resourceId: 'mep', quantity: 20 }],
      }),
      // ── and converge ───────────────────────────────────────────────────
      a('CLN', 'w4', 'Clean-up & snagging', 4, [3, 4, 7],
        [{ predecessor: 'PNT', type: 'FS', lag: 0 }, { predecessor: 'DRW', type: 'FS', lag: 0 },
         { predecessor: 'MEPF', type: 'FS', lag: 0 }, { predecessor: 'ROOF', type: 'FS', lag: 0 }], {
        resources: [{ resourceId: 'lab', quantity: 16 }],
      }),
      a('HAND', 'w5', 'Handover', 0, null,
        [{ predecessor: 'CLN', type: 'FS', lag: 0 }], { milestone: true }),
    ],
    baselines: [],
  }
}
