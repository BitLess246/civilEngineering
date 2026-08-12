// ─────────────────────────────────────────────────────────────────────────
// Every registered walkthrough, in one place. View-support layer.
//
// The registry exists for the TEST, not for the pages — each page imports its
// own tour directly. `tours.test.ts` walks this list and checks every step's
// anchor against the page it names, in both directions, so a tour cannot ship
// pointing at an element somebody has since renamed away.
//
// Adding a tour to a page without adding it here means it is not covered by
// that check, which is the whole safety net. `tours.test.ts` also asserts that
// every `*Tour.ts` module in `lib/` appears below, so forgetting is a build
// failure rather than a silent gap.
// ─────────────────────────────────────────────────────────────────────────

import type { Tour } from './tour'
import { SOILS_TOUR } from './soilsTour'
import { MODEL_TOUR } from './modelTour'
import { PLUMBING_TOUR } from './plumbingTour'
import { SCHEDULE_TOUR } from './scheduleTour'
import { DASHBOARD_TOUR } from './scheduleDashboardTour'
import { DAILY_TOUR } from './scheduleDailyTour'

export const TOURS: readonly Tour[] = [
  SOILS_TOUR, MODEL_TOUR, PLUMBING_TOUR,
  SCHEDULE_TOUR, DASHBOARD_TOUR, DAILY_TOUR,
]
