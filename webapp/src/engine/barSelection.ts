// ─────────────────────────────────────────────────────────────────────────
// CHOOSING A BAR DIAMETER — the five stages, in order, as an explicit gate
// chain rather than a single boolean.
//
//   1. STRENGTH          does the section carry the demand?
//   2. SERVICEABILITY    crack control — §24.3.2 bar-spacing limit.
//   3. DETAILING         clear spacing, layers, minimum bar count.
//   4. CONSTRUCTABILITY  can a person actually tie this cage?
//   5. ECONOMY           least steel; on a tie, the SMALLER bar.
//
// The order is not cosmetic. Stages 1–4 are PASS/FAIL FILTERS applied in
// sequence; stage 5 only ever ranks what survived. A candidate that fails an
// earlier stage can never be rescued by being cheaper, and — the part that
// matters when reading a result — the reason a size was rejected is the FIRST
// stage it failed, not a mixture.
//
// WHY SMALLER WINS THE TIE. Two sizes with the same steel area are not equal
// on site: more, smaller bars distribute crack width better (the same physics
// behind §24.3.2), bend to a tighter radius, weigh less per stick to place,
// and are more likely to be in the yard. Larger bars win only when they cut
// the AREA, which stage 5 measures directly.
//
// The old selector was one loop that adopted "the smallest size that passes
// capacity and fits". That silently conflated four different questions and
// could not say why anything was rejected.
// ─────────────────────────────────────────────────────────────────────────

/** The five stages, in the order they are applied. */
export const STAGES = ['strength', 'serviceability', 'detailing', 'constructability'] as const
export type Stage = typeof STAGES[number]

/** What one candidate diameter was found to do. */
export interface BarCandidate {
  /** Bar diameter, mm. */
  db: number
  /** Stage 1 — the section carries the demand at this size. */
  strength: boolean
  /** Stage 2 — crack control and any deflection-driven limit. */
  serviceability: boolean
  /** Stage 3 — clear spacing, layer fit, minimum count. */
  detailing: boolean
  /** Stage 4 — buildable: not a congested cage, not an absurd bar count. */
  constructability: boolean
  /**
   * Stage 5 — steel area PROVIDED, mm². Lower is cheaper. Area, not bar
   * count: a bar count says nothing about tonnage, and tonnage is what is
   * bought.
   */
  steelArea: number
}

export interface BarChoice {
  /** The adopted diameter, or null when every candidate failed. */
  db: number | null
  /** Why each rejected candidate lost — the FIRST stage it failed. */
  rejected: { db: number; stage: Stage }[]
  /** Candidates that passed all four filters, in the order stage 5 ranked them. */
  ranked: number[]
}

/** The first stage a candidate fails, or null when it passes all four. */
export function firstFailure(c: BarCandidate): Stage | null {
  if (!c.strength) return 'strength'
  if (!c.serviceability) return 'serviceability'
  if (!c.detailing) return 'detailing'
  if (!c.constructability) return 'constructability'
  return null
}

/**
 * Apply the five stages and return the choice.
 *
 * Deterministic for a given input: the ranking is total, because ties on steel
 * area are broken by diameter and two candidates cannot share a diameter.
 */
export function chooseBar(candidates: readonly BarCandidate[]): BarChoice {
  const rejected: { db: number; stage: Stage }[] = []
  const passed: BarCandidate[] = []

  for (const c of candidates) {
    const fail = firstFailure(c)
    if (fail) rejected.push({ db: c.db, stage: fail })
    else passed.push(c)
  }

  // Stage 5. Least steel first; on a tie, the smaller bar — see the header.
  // The epsilon keeps two areas that differ only by floating-point noise from
  // reversing the size preference.
  const ranked = [...passed].sort((a, b) =>
    Math.abs(a.steelArea - b.steelArea) > 1e-6 ? a.steelArea - b.steelArea : a.db - b.db)

  return { db: ranked[0]?.db ?? null, rejected, ranked: ranked.map((c) => c.db) }
}

// ── Stage 2 and 4, as reusable checks ─────────────────────────────────────

/**
 * §24.3.2 / NSCP §424.3.2 — maximum centre-to-centre spacing of the bars
 * nearest the tension face, for crack control:
 *
 *     s ≤ min( 380·(280/fs) − 2.5cc , 300·(280/fs) )
 *
 * with fs taken as ⅔fy per §24.3.2.1 when the stress is not computed, and cc
 * the clear cover to the tension bars. This is the SERVICEABILITY gate: a
 * section can be strong enough and still crack visibly because its bars are
 * too far apart, which is exactly the failure a strength-only chooser misses.
 */
export function crackSpacingLimit(fy: number, clearCover: number): number {
  const fs = (2 / 3) * Math.max(fy, 1)
  const k = 280 / fs
  return Math.min(380 * k - 2.5 * clearCover, 300 * k)
}

/** Whether the provided bar spacing satisfies the crack-control limit. */
export const crackControlOK = (spacing: number, fy: number, clearCover: number): boolean =>
  spacing <= crackSpacingLimit(fy, clearCover) + 1e-6

/**
 * Constructability limits.
 *
 * These are not code clauses — they are the difference between a cage a crew
 * can tie and one they will improvise around, and improvising is how a design
 * stops matching the drawing. Stated as named numbers so they can be argued
 * with rather than discovered.
 */
export const BUILDABLE = {
  /** Below two bars there is nothing to tie a stirrup to at the corners. */
  minBars: 2,
  /** More than this in one member is a congested cage and a slow pour. */
  maxBars: 24,
  /** More than this many layers and the effective depth is being thrown away. */
  maxLayers: 3,
} as const

export function constructabilityOK(bars: number, layers: number): boolean {
  return bars >= BUILDABLE.minBars && bars <= BUILDABLE.maxBars && layers <= BUILDABLE.maxLayers
}

/** A one-line explanation of a rejection, for a schedule note or a tooltip. */
export function rejectionNote(db: number, stage: Stage): string {
  switch (stage) {
    case 'strength': return `⌀${db}: section does not carry the demand`
    case 'serviceability': return `⌀${db}: bar spacing exceeds the §24.3.2 crack-control limit`
    case 'detailing': return `⌀${db}: bars do not fit at the required clear spacing`
    case 'constructability': return `⌀${db}: cage is not practically buildable (bar count or layers)`
  }
}
