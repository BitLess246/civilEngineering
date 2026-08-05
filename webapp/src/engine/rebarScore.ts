// ─────────────────────────────────────────────────────────────────────────
// CHOOSING A REINFORCEMENT LAYOUT — enumerate every feasible arrangement,
// score it, and adopt the best overall. Not the first that works, and not
// the one with the least steel.
//
// ── WHY NOT "FIRST VALID" ────────────────────────────────────────────────
//
// The engines used to take a bar diameter as an INPUT and compute
// n = ceil(As/Ab). Whatever the user typed was what got detailed, and the
// one place that did search — `barSelection`, used by the model-space
// pipeline — ranked purely on steel area with a smaller-bar tie-break.
//
// Both are wrong for the same reason: a layout is not just an area. 6⌀16 and
// 3⌀25 carry almost the same steel, and on a drawing they are not remotely
// the same thing. The first distributes crack width across twice as many
// bars; the second is quicker to tie and easier to vibrate around. Which one
// wins depends on the section, and picking whichever the loop reached first
// is not an answer to that question.
//
// ── THE PRIORITY ORDER ───────────────────────────────────────────────────
//
//   1. COMPLIANCE      — a HARD GATE, never a score. NSCP 2015 / ACI 318-14
//                        strength AND detailing. A layout that fails any
//                        check is infeasible and is never ranked, however
//                        attractive it looks on the other four.
//   2. SERVICEABILITY  — crack control: bar distribution and spacing, with a
//                        preference for smaller diameters — but not at the
//                        cost of a cage nobody can build.
//   3. CONSTRUCTABILITY— congestion, layers, room for a vibrator, labour.
//   4. ECONOMY         — steel weight, over-provision waste, fabrication.
//   5. SIMPLICITY      — symmetric, regular, standard sizes.
//
// The weights below encode that order and sum to 1. They are exported and
// named so they can be argued with rather than reverse-engineered from
// behaviour.
//
// ── THE NEAR-TIE RULE ────────────────────────────────────────────────────
//
// Two layouts within `NEAR_TIE` of each other on total score are treated as
// equivalent, and the tie is broken on serviceability + constructability
// alone. Without this, a 1% economy edge silently outranks a materially
// better-distributed cage — which is the behaviour this module exists to
// prevent.
//
// It is applied as a LEADING-GROUP promotion, not as a comparator. Written as
// a comparator it is not transitive — A ties B, B ties C, but A and C differ
// by more than the band — and `Array.sort` with a non-transitive comparator
// gives an implementation-defined order, which is no way to produce a
// schedule. So: rank by total (a genuine total order), take everything within
// NEAR_TIE of the leader, and pick the winner out of that group on
// serviceability + constructability.
//
// ── NORMALISATION ────────────────────────────────────────────────────────
//
// "Smaller bar", "less steel" and "fewer bars" are RELATIVE claims, so they
// are normalised across the candidate set actually generated, not against
// hard-coded reference values. A set where every option is a ⌀20 scores them
// all equally on diameter rather than all badly.
//
// Units: db and spacings mm, areas mm².
// ─────────────────────────────────────────────────────────────────────────

/** Priority weights. Sum to 1; the order is the requirement, the values are
 *  a calibration and may be tuned without changing the ranking's meaning. */
export const PRIORITY_WEIGHTS = {
  serviceability: 0.40,
  constructability: 0.30,
  economy: 0.20,
  simplicity: 0.10,
} as const

/** Total-score band inside which two layouts count as equivalent. */
export const NEAR_TIE = 0.03

/**
 * Bar sizes a Philippine yard stocks and a bender handles without comment.
 * Simplicity only — never a compliance matter, and never a reason to reject.
 */
export const COMMON_BARS = new Set([12, 16, 20, 25])
/** Sizes that are ordinary but less universally stocked. */
export const STOCKED_BARS = new Set([10, 28, 32])

// ── The thing being scored ────────────────────────────────────────────────

export interface RebarLayout {
  /** Bar diameter, mm. */
  db: number
  /** Total bars in the group, after any detailing bump. */
  bars: number
  /** Bars per layer, extreme (tension-face) layer first. */
  layers: number[]
  /** Steel provided by this layout, mm². */
  AsProv: number
  /** Steel the strength check demanded AT THIS LAYOUT's effective depth. */
  AsReq: number
  /** Clear spacing in the fullest layer, mm. */
  clearSpacing: number
  /** Centre-to-centre spacing of the bars nearest the tension face, mm. */
  spacing: number
  /** Effective depth this arrangement achieves, mm — layers reduce it. */
  d: number
  /** Demand / capacity at this layout. ≤ 1 when the section is adequate. */
  utilization: number
}

/** One code requirement, evaluated. Compliance is a gate, so every one of
 *  these must pass for the layout to be ranked at all. */
export interface ComplianceCheck {
  id: string
  /** The clause it comes from — what a checker looks up. */
  clause: string
  label: string
  pass: boolean
  detail?: string
}

/** Limits the member type supplies. Everything here is a property of the
 *  section and the code, not of the layout being scored. */
export interface ScoreContext {
  /** §24.3.2 crack-control spacing limit, mm. */
  sMax: number
  /** Minimum clear spacing the code permits, mm — §25.2.1. */
  sMinCode: number
  /**
   * Clear spacing below which placing and vibrating concrete gets awkward.
   * Not a code limit — a site one. A 25 mm gap is legal and unpleasant.
   */
  sComfort?: number
  /** Layers past which the cage reads as congested. */
  maxLayers?: number
  /** Bar count past which tying labour starts to dominate. */
  barComfort?: number
  /** Whether an even (symmetric) bar count is preferred. Beams and columns
   *  yes; a slab mat has no centreline to be symmetric about. */
  wantSymmetric?: boolean
}

export interface LayoutScores {
  serviceability: number
  constructability: number
  economy: number
  simplicity: number
}

export interface ScoredLayout {
  layout: RebarLayout
  feasible: boolean
  compliance: ComplianceCheck[]
  /** The first clause it failed, when infeasible. */
  failedGate: ComplianceCheck | null
  scores: LayoutScores
  /** Weighted total, 0..1. Meaningless for an infeasible layout. */
  total: number
  /** One line naming what this layout is and what it is good at. */
  reason: string
}

export interface RebarSelection {
  /** The adopted layout, or null when nothing in the set complies. */
  best: ScoredLayout | null
  /** Feasible layouts, best first. */
  ranked: ScoredLayout[]
  /** Infeasible layouts, each with the gate it failed. */
  rejected: ScoredLayout[]
  /** How the winner beat the runner-up — or why there was no contest. */
  margin: string
}

// ── Small helpers ─────────────────────────────────────────────────────────

const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0)

/**
 * Map a value into 0..1 across the range present in the candidate set, with
 * `best` = 1. Returns 1 for every candidate when they all share a value —
 * a dimension on which nothing differs should not separate anything.
 */
function normalise(v: number, all: number[], smallerIsBetter: boolean): number {
  const lo = Math.min(...all), hi = Math.max(...all)
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1e-9) return 1
  const t = (v - lo) / (hi - lo)
  return clamp01(smallerIsBetter ? 1 - t : t)
}

// ── The four scores ───────────────────────────────────────────────────────

/**
 * SERVICEABILITY — how well this layout controls cracking.
 *
 * Crack width at the tension face is governed by how far apart the bars are
 * (§24.3.2 exists for exactly this) and by how much of the steel sits in the
 * layer nearest that face. A smaller bar at the same area means more bars,
 * closer together, and a finer crack pattern.
 *
 * The spacing term measures MARGIN against the §24.3.2 limit rather than
 * pass/fail: compliance already gated on the limit, so what is left to
 * reward is how far inside it the layout sits.
 */
function serviceability(l: RebarLayout, ctx: ScoreContext, allDb: number[]): number {
  const crack = clamp01(1 - l.spacing / Math.max(ctx.sMax, 1e-9))
  const diameter = normalise(l.db, allDb, true)
  // Fraction of the bars in the extreme tension layer — the ones the crack
  // actually forms around. A deep stack buries steel where it does least for
  // crack control.
  const atFace = l.bars > 0 ? clamp01((l.layers[0] ?? 0) / l.bars) : 0
  return 0.45 * crack + 0.35 * diameter + 0.20 * atFace
}

/**
 * CONSTRUCTABILITY — whether a crew can build this without improvising, and
 * improvising is how a cage stops matching the drawing.
 *
 * Layers dominate: a second layer means spacers, a lost effective depth and a
 * much slower tie. Clear spacing is measured against a COMFORT figure, not
 * the code minimum — 25 mm is legal and still too tight to get a poker down.
 */
function constructability(l: RebarLayout, ctx: ScoreContext, allBars: number[]): number {
  const maxL = ctx.maxLayers ?? 3
  const nL = Math.max(1, l.layers.length)
  // 1 for a single layer, falling away and reaching 0 at the layer cap.
  const layerScore = clamp01(1 - (nL - 1) / Math.max(1, maxL - 1))

  const comfort = ctx.sComfort ?? 40
  const room = comfort > ctx.sMinCode
    ? clamp01((l.clearSpacing - ctx.sMinCode) / (comfort - ctx.sMinCode))
    : 1

  // Bar count is a labour proxy. Below the comfort threshold everything is
  // equally easy, so only the crowded end is separated.
  const bc = ctx.barComfort ?? 8
  const count = l.bars <= bc ? 1 : normalise(l.bars, allBars.filter((n) => n > bc), true)

  return 0.45 * layerScore + 0.35 * room + 0.20 * count
}

/**
 * ECONOMY — steel bought, steel wasted, and bars handled.
 *
 * Deliberately the third-ranked term and only 20% of the total. Where two
 * layouts perform equivalently it decides between them; it is never allowed
 * to buy a worse-distributed or harder-to-build cage.
 */
function economy(l: RebarLayout, allAs: number[], allBars: number[]): number {
  const steel = normalise(l.AsProv, allAs, true)
  // Over-provision: how much of the steel bought is actually working.
  const waste = l.AsProv > 0 ? clamp01(l.AsReq / l.AsProv) : 0
  const fabrication = normalise(l.bars, allBars, true)
  return 0.50 * steel + 0.25 * waste + 0.25 * fabrication
}

/**
 * SIMPLICITY — how easily this gets drawn, scheduled and read on site.
 *
 * An even bar count is symmetric about the web centreline; equal layers are a
 * regular stack; a common bar size is one the yard has and the schedule
 * already lists. None of it is structural, which is why it carries the
 * smallest weight — but between two equal cages it is a real difference.
 */
function simplicity(l: RebarLayout, ctx: ScoreContext): number {
  const wantSym = ctx.wantSymmetric ?? true
  const even = !wantSym || l.bars % 2 === 0 ? 1 : 0.6

  const regular = l.layers.length <= 1
    ? 1
    : new Set(l.layers).size === 1 ? 0.85 : 0.7

  const standard = COMMON_BARS.has(l.db) ? 1 : STOCKED_BARS.has(l.db) ? 0.8 : 0.6

  return 0.35 * even + 0.30 * regular + 0.35 * standard
}

// ── Compliance ────────────────────────────────────────────────────────────

/** The first failing check, or null when every one passes. */
export function firstFailure(checks: readonly ComplianceCheck[]): ComplianceCheck | null {
  return checks.find((c) => !c.pass) ?? null
}

// ── Scoring and ranking ───────────────────────────────────────────────────

export interface Candidate {
  layout: RebarLayout
  compliance: ComplianceCheck[]
}

function describe(l: RebarLayout, s: LayoutScores): string {
  const arrangement = l.layers.length > 1
    ? `${l.bars}⌀${l.db} in ${l.layers.length} layers (${l.layers.join('+')})`
    : `${l.bars}⌀${l.db} in one layer`
  const strengths: string[] = []
  if (s.serviceability >= 0.7) strengths.push('well distributed for crack control')
  if (s.constructability >= 0.8) strengths.push('easy to place')
  if (s.economy >= 0.8) strengths.push('economical')
  if (s.simplicity >= 0.9) strengths.push('symmetric and standard')
  return strengths.length
    ? `${arrangement} — ${strengths.join(', ')}.`
    : `${arrangement}.`
}

/**
 * Score every candidate and rank the compliant ones.
 *
 * Compliance is applied FIRST and as a gate: an infeasible layout is scored
 * (so the report can show how close it was) but never ranked and never
 * adopted. The comparator implements the near-tie rule.
 */
export function selectRebar(candidates: readonly Candidate[], ctx: ScoreContext): RebarSelection {
  if (candidates.length === 0) {
    return { best: null, ranked: [], rejected: [], margin: 'no candidates were generated' }
  }

  const compliant = candidates.filter((c) => firstFailure(c.compliance) === null)
  // Normalise across the FEASIBLE set: an infeasible outlier must not stretch
  // the scale and flatten the differences between the real options.
  const pool = compliant.length > 0 ? compliant : candidates
  const allDb = pool.map((c) => c.layout.db)
  const allAs = pool.map((c) => c.layout.AsProv)
  const allBars = pool.map((c) => c.layout.bars)

  const scored: ScoredLayout[] = candidates.map((c) => {
    const gate = firstFailure(c.compliance)
    const scores: LayoutScores = {
      serviceability: serviceability(c.layout, ctx, allDb),
      constructability: constructability(c.layout, ctx, allBars),
      economy: economy(c.layout, allAs, allBars),
      simplicity: simplicity(c.layout, ctx),
    }
    const total =
      PRIORITY_WEIGHTS.serviceability * scores.serviceability +
      PRIORITY_WEIGHTS.constructability * scores.constructability +
      PRIORITY_WEIGHTS.economy * scores.economy +
      PRIORITY_WEIGHTS.simplicity * scores.simplicity
    return {
      layout: c.layout,
      feasible: gate === null,
      compliance: c.compliance,
      failedGate: gate,
      scores,
      total,
      reason: gate
        ? `${c.layout.bars}⌀${c.layout.db} — rejected: ${gate.label} (${gate.clause}).`
        : describe(c.layout, scores),
    }
  })

  // Rank on the total — a real total order, so the sort is well defined.
  const byTotal = scored.filter((s) => s.feasible).sort(compareByTotal)
  const rejected = scored.filter((s) => !s.feasible)
    .sort((a, b) => a.layout.db - b.layout.db || a.layout.bars - b.layout.bars)

  // Then promote the best of the leading group. Everything within NEAR_TIE of
  // the top total counts as equivalent on the weighted score, so the choice
  // between them is made on serviceability + constructability alone.
  const leader = byTotal[0]
  const contenders = leader
    ? byTotal.filter((s) => leader.total - s.total <= NEAR_TIE)
    : []
  const best = contenders.length > 0 ? [...contenders].sort(comparePair)[0] : null

  const ranked = best
    ? [best, ...byTotal.filter((s) => s !== best)]
    : byTotal

  const margin = !best
    ? `no layout satisfies every check — ${rejected.length} candidate${rejected.length === 1 ? '' : 's'} rejected`
    : ranked.length === 1
      ? 'the only compliant layout in the set'
      : marginText(best, ranked[1], contenders.length > 1)

  return { best, ranked, rejected, margin }
}

/** Rank by weighted total, with deterministic tie-breaks all the way down so
 *  the same input always yields the same schedule. */
export function compareByTotal(a: ScoredLayout, b: ScoredLayout): number {
  if (Math.abs(a.total - b.total) > 1e-12) return b.total - a.total
  return breakTies(a, b)
}

/** Within the leading group: serviceability + constructability decides. */
export function comparePair(a: ScoredLayout, b: ScoredLayout): number {
  const pairA = a.scores.serviceability + a.scores.constructability
  const pairB = b.scores.serviceability + b.scores.constructability
  if (Math.abs(pairA - pairB) > 1e-9) return pairB - pairA
  return breakTies(a, b)
}

/** Prefer the smaller bar (finer distribution), then fewer layers, then
 *  fewer bars. Never leaves two candidates genuinely equal. */
function breakTies(a: ScoredLayout, b: ScoredLayout): number {
  if (a.layout.db !== b.layout.db) return a.layout.db - b.layout.db
  if (a.layout.layers.length !== b.layout.layers.length) return a.layout.layers.length - b.layout.layers.length
  return a.layout.bars - b.layout.bars
}

function marginText(best: ScoredLayout, next: ScoredLayout, nearTie: boolean): string {
  const label = (s: ScoredLayout) => `${s.layout.bars}⌀${s.layout.db}`
  if (!nearTie) {
    const driver = biggestGain(best, next)
    return `${label(best)} scores ${best.total.toFixed(3)} against ${label(next)} at ` +
      `${next.total.toFixed(3)} — decided on ${driver}`
  }
  const pair = (s: ScoredLayout) => (s.scores.serviceability + s.scores.constructability).toFixed(2)
  return `${label(best)} and ${label(next)} are within ${NEAR_TIE} on total score, so they count ` +
    `as equivalent; ${label(best)} wins on serviceability + constructability ` +
    `(${pair(best)} vs ${pair(next)})`
}

/** Which weighted term contributed most of the winner's lead. */
function biggestGain(best: ScoredLayout, next: ScoredLayout): string {
  const terms: [keyof LayoutScores, number][] = (
    Object.keys(PRIORITY_WEIGHTS) as (keyof LayoutScores)[]
  ).map((k) => [k, PRIORITY_WEIGHTS[k] * (best.scores[k] - next.scores[k])])
  terms.sort((x, y) => y[1] - x[1])
  return terms[0][1] > 0 ? terms[0][0] : 'the weighted total'
}
