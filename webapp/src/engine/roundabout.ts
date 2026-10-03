// ─────────────────────────────────────────────────────────────────────────
// ROUNDABOUT — Highway Capacity Manual 2010 (Chapter 21) entry capacity and
// level of service for single- and two-lane roundabout entries.
//
// ENTRY CAPACITY (per lane, veh/h, passenger-car equivalents):
//   single-lane entry:          c = 1130 · e^(−1.02×10⁻³ · vc)
//   two-lane entry, right lane: c = 1130 · e^(−0.70×10⁻³ · vc)
//   two-lane entry, left lane:  c = 1130 · e^(−0.75×10⁻³ · vc)
// with vc the circulating flow across the entry, in pc/h. The coefficients
// are exposed so a user can recalibrate to the HCM 6th edition or a local
// study (the 1.13 k intercept is the NCHRP 572 field-fit value).
//
// CIRCULATING FLOW for a given entry (HCM 2010 Exhibit 21-2 geometry):
//   vc = v4 + v11 + v12   for the westbound entry (leg 1), and the
//   pattern rotates around the legs. The page offers a flow helper: enter
//   the four leg volumes and it assembles the three conflicting movements.
//
// CONTROL DELAY & LOS — the HCM applies the unsignalized (two-way-stop)
// delay procedure to roundabouts:
//   d = 3600/c + 900·T·[(x−1) + √((x−1)² + 8·k·B·x/(c·T))]/x
//   T = analysis period (h, default 0.25), k = incremental-delay factor
//   (1.0), B = platoon-arrivals factor (1.0). LOS thresholds on d (s/veh):
//   A ≤ 10, B ≤ 20, C ≤ 35, D ≤ 55, E ≤ 80, F above (and F whenever x > 1).
// ─────────────────────────────────────────────────────────────────────────

/** Base intercept of the HCM 2010 entry-capacity model (veh/h). */
export const CAP_INTERCEPT = 1130

/** HCM 2010 lane coefficients β in c = 1130·e^(−β×10⁻³·vc). */
export type LaneKind = 'single' | 'right' | 'left'
export const LANE_BETA: Record<LaneKind, number> = {
  single: 1.02,
  right: 0.70,
  left: 0.75,
}

/** Lane capacity (veh/h) at a circulating flow vc (pc/h). */
export function laneCapacity(vc: number, kind: LaneKind, beta?: number): number {
  if (!(vc >= 0)) throw new Error('Circulating flow must not be negative.')
  const b = beta ?? LANE_BETA[kind]
  return CAP_INTERCEPT * Math.exp(-b * 1e-3 * vc)
}

/**
 * Circulating flow assembled from the HCM conflict diagram (Exhibit 21-2):
 * an entry is crossed by the circulating stream made of the prior leg's
 * entry, the upstream circulating from further around, and the upstream
 * right-turn... In practice the three conflicting movements are the other
 * three entries' flows that pass in front of this entry. The page's helper
 * takes the four entries (legs 1–4 clockwise) and returns each entry's vc:
 *   vc(i) = v(i−1) + v(i−2) + v(i−3)  — every other entry crosses leg i.
 */
export function circulatingFromLegs(legs: number[]): number[] {
  if (legs.length !== 4) throw new Error('Enter the four leg volumes.')
  return legs.map((_, i) => legs[(i + 1) % 4] + legs[(i + 2) % 4] + legs[(i + 3) % 4])
}

/** Level-of-service letter from control delay (s/veh) and the v/c state. */
export function losFromDelay(d: number, xc: number): 'A' | 'B' | 'C' | 'D' | 'E' | 'F' {
  if (xc > 1) return 'F'
  if (d <= 10) return 'A'
  if (d <= 20) return 'B'
  if (d <= 35) return 'C'
  if (d <= 55) return 'D'
  if (d <= 80) return 'E'
  return 'F'
}

export interface EntryInput {
  /** Entry demand, pc/h. */
  ve: number
  /** Circulating flow across the entry, pc/h. */
  vc: number
  /** Number of lanes on the entry (1 or 2). */
  lanes: 1 | 2
  /** Peak-hour factor (flow split across the period; ≥ 1). */
  phf?: number
  /** Analysis period T, hours (default 0.25). */
  T?: number
}

export interface EntryResult {
  laneCaps: { kind: LaneKind; share: number; cap: number }[]
  capacity: number       // entry capacity, veh/h
  shareRight: number     // fraction of the entry flow assigned to the right lane
  veAdj: number          // entry flow after PHF
  vcAdj: number          // circulating flow after PHF
  xc: number             // v/c
  delay: number          // control delay, s/veh
  reserve: number        // capacity − demand
  los: 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
}

/**
 * Entry analysis. A two-lane entry splits its flow between lanes; the HCM
 * assigns the right lane the larger share of turning traffic — the page
 * exposes the split (default 55 % right / 45 % left, the field-observed
 * balance for mixed turning movements) and capacities follow from each
 * lane's own circulating flow. For simplicity the model applies the same
 * vc to both lanes (HCM's idealized multilane entry) and sizes the entry
 * capacity as the two lanes' caps at the lane shares.
 */
export function analyzeEntry(e: EntryInput, betaRight = LANE_BETA.right, betaLeft = LANE_BETA.left): EntryResult {
  if (!(e.ve >= 0)) throw new Error('Entry flow must not be negative.')
  if (!(e.vc >= 0)) throw new Error('Circulating flow must not be negative.')
  if (!(e.lanes === 1 || e.lanes === 2)) throw new Error('Entry lanes must be 1 or 2.')
  const phf = e.phf ?? 1
  if (!(phf > 0.5 && phf <= 1)) throw new Error('PHF must be between 0.5 and 1.')
  const T = e.T ?? 0.25
  if (!(T > 0)) throw new Error('Analysis period must be positive.')
  const veAdj = e.ve / phf
  const vcAdj = e.vc / phf

  if (e.lanes === 1) {
    const cap = laneCapacity(vcAdj, 'single')
    const xc = cap > 0 ? veAdj / cap : Infinity
    const delay = controlDelay(xc, cap, T)
    return {
      laneCaps: [{ kind: 'single', share: 1, cap }],
      capacity: cap, shareRight: 1, veAdj, vcAdj, xc, delay,
      reserve: cap - veAdj, los: losFromDelay(delay, xc),
    }
  }

  // Two-lane entry: split the entry flow, each lane carries its share and
  // is checked against the capacity of its own kind of lane.
  const shareRight = 0.55
  const capR = laneCapacity(vcAdj, 'right', betaRight)
  const capL = laneCapacity(vcAdj, 'left', betaLeft)
  const vR = veAdj * shareRight
  const vL = veAdj * (1 - shareRight)
  const xR = capR > 0 ? vR / capR : Infinity
  const xL = capL > 0 ? vL / capL : Infinity
  // Entry capacity: keep the split and scale up until the critical lane
  // just reaches saturation — cap = ve at xc = 1 of the governing lane.
  const capEntry = Math.min(capR / shareRight, capL / (1 - shareRight))
  const xc = Math.max(xR, xL)
  const delay = controlDelay(xc, capEntry, T)
  return {
    laneCaps: [
      { kind: 'right', share: shareRight, cap: capR },
      { kind: 'left', share: 1 - shareRight, cap: capL },
    ],
    capacity: capEntry, shareRight, veAdj, vcAdj, xc, delay,
    reserve: capEntry - veAdj, los: losFromDelay(delay, xc),
  }
}

/** HCM unsignalized control delay (s/veh) — the roundabout delay procedure. */
export function controlDelay(xc: number, cap: number, T = 0.25, k = 1.0, B = 1.0): number {
  if (!Number.isFinite(xc) || !(cap > 0)) return Infinity
  const base = 3600 / cap
  if (xc <= 0) return base
  const root = Math.sqrt(Math.max(0, Math.pow(xc - 1, 2) + (8 * k * B * xc) / (cap * T)))
  return base + (900 * T * (xc - 1 + root)) / xc
}
