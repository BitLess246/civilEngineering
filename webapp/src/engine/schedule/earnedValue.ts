// ─────────────────────────────────────────────────────────────────────────
// Earned Value Management (EVM) engine.
//
// The three primitives, at a data date:
//   PV  Planned Value   — budget scheduled to be complete   (Σ BACᵢ · plannedᵢ)
//   EV  Earned Value    — budget actually earned             (Σ BACᵢ · %compᵢ)
//   AC  Actual Cost     — cost actually incurred             (Σ ACᵢ, input)
// Derived (PMBOK):
//   SV = EV − PV        CV = EV − AC
//   SPI = EV / PV       CPI = EV / AC
//   EAC = BAC / CPI     VAC = BAC − EAC     ETC = EAC − AC
//   TCPI = (BAC − EV) / (BAC − AC)
// Ratios whose denominator is zero are returned as `null` (undefined, not 0).
//
// BAC/AC are unit-agnostic: currency for cost EVM, or man-days / duration-units
// for a cost-free schedule-performance view — the caller stays consistent.
//
// Time-based schedule performance uses the Earned Schedule method (Lipke): the
// point in project time at which the planned-value curve equals the current EV.
// ─────────────────────────────────────────────────────────────────────────

/** Fraction (0–1) of an activity that should be complete at working-day
 *  `dataDate`, given its early start/finish. Milestones (ef ≤ es) step at ef. */
export function plannedFraction(es: number, ef: number, dataDate: number): number {
  if (ef <= es) return dataDate >= ef ? 1 : 0
  if (dataDate <= es) return 0
  if (dataDate >= ef) return 1
  return (dataDate - es) / (ef - es)
}

/** One activity's EVM inputs at the data date. */
export interface EvmActivityInput {
  id: string
  /** Budget at completion for this activity (cost or work units). */
  bac: number
  /** Actual percent complete, 0–100. */
  percentComplete: number
  /** Actual cost incurred to date (same units as `bac`). */
  actualCost: number
  /** Fraction (0–1) of `bac` scheduled to be complete by the data date. */
  plannedFraction: number
}

export interface EvmResult {
  pv: number
  ev: number
  ac: number
  bac: number
  sv: number
  cv: number
  spi: number | null
  cpi: number | null
  /** Estimate at completion = BAC / CPI. */
  eac: number | null
  /** Estimate to complete = EAC − AC. */
  etc: number | null
  /** Variance at completion = BAC − EAC. */
  vac: number | null
  /** To-complete performance index = (BAC − EV) / (BAC − AC). */
  tcpi: number | null
}

/** Roll up per-activity EVM inputs into project PV/EV/AC and the indices. */
export function earnedValue(activities: EvmActivityInput[]): EvmResult {
  let pv = 0, ev = 0, ac = 0, bac = 0
  for (const a of activities) {
    const pct = Math.min(100, Math.max(0, a.percentComplete)) / 100
    pv += a.bac * a.plannedFraction
    ev += a.bac * pct
    ac += a.actualCost
    bac += a.bac
  }
  const spi = pv > 0 ? ev / pv : null
  const cpi = ac > 0 ? ev / ac : null
  const eac = cpi != null && cpi !== 0 ? bac / cpi : null
  const vac = eac != null ? bac - eac : null
  const etc = eac != null ? eac - ac : null
  const tcpi = bac - ac !== 0 ? (bac - ev) / (bac - ac) : null
  return { pv, ev, ac, bac, sv: ev - pv, cv: ev - ac, spi, cpi, eac, etc, vac, tcpi }
}

// ── Earned Schedule (time-based) ────────────────────────────────────────────

/** An activity's scheduled span and budget for building the PV curve. */
export interface PvActivity {
  es: number
  ef: number
  bac: number
}

/** Cumulative planned value at working-day offset `t` (monotonic in t). */
export function pvAtOffset(activities: PvActivity[], t: number): number {
  let pv = 0
  for (const a of activities) pv += a.bac * plannedFraction(a.es, a.ef, t)
  return pv
}

/**
 * Earned Schedule: the project-time offset at which the planned-value curve
 * first reaches the current `ev`. PV is monotonic non-decreasing in t, so a
 * bounded bisection converges. Returns 0 for ev ≤ 0 and `tMax` if ev exceeds
 * the total planned value at `tMax`.
 */
export function earnedScheduleOffset(
  activities: PvActivity[],
  ev: number,
  tMax: number,
): number {
  if (ev <= 0) return 0
  if (pvAtOffset(activities, tMax) <= ev) return tMax
  let lo = 0, hi = tMax
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (pvAtOffset(activities, mid) < ev) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/**
 * Schedule variance in time units at the data date: Earned Schedule − data date.
 * Positive ⇒ ahead of schedule, negative ⇒ behind.
 */
export function scheduleVarianceTime(
  activities: PvActivity[],
  ev: number,
  dataDate: number,
  tMax: number,
): number {
  return earnedScheduleOffset(activities, ev, tMax) - dataDate
}

// ── Project-level cost EVM from resource budgets ────────────────────────────

/** Minimal activity shape for the project EVM roll-up (full `Activity` fits). */
export interface EvmActivity {
  id: string
  percentComplete?: number
  resources?: { resourceId: string; quantity: number }[]
}

/**
 * Project cost EVM at a data date, from resource budgets. Each activity's BAC =
 * Σ(quantity · rate); PV spreads BAC by the schedule's planned fraction; EV by
 * actual %; the entered `actualCost` is fed at the project level (a single
 * aggregate row) so AC is honoured even when EV = 0. `hasCost` is false when no
 * activity carries a costed resource (the caller can hide the cost panel).
 * Shared by the dashboard and the report so they can't drift.
 */
export function projectEvm(
  activities: EvmActivity[],
  cpmActivities: Map<string, { es: number; ef: number }>,
  dataOffset: number,
  costOf: Map<string, number>,
  actualCost: number,
): { result: EvmResult; hasCost: boolean } {
  let bac = 0, pv = 0, ev = 0, hasCost = false
  for (const a of activities) {
    const c = cpmActivities.get(a.id)
    const b = (a.resources ?? []).reduce((s, r) => s + r.quantity * (costOf.get(r.resourceId) ?? 0), 0)
    if (b > 0) hasCost = true
    bac += b
    pv += b * (c ? plannedFraction(c.es, c.ef, dataOffset) : 0)
    ev += b * (Math.min(100, Math.max(0, a.percentComplete ?? 0)) / 100)
  }
  const item: EvmActivityInput = {
    id: 'project', bac,
    percentComplete: bac > 0 ? (ev / bac) * 100 : 0,
    plannedFraction: bac > 0 ? pv / bac : 0,
    actualCost,
  }
  return { result: earnedValue([item]), hasCost }
}
