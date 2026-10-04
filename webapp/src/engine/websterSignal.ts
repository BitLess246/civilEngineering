// ─────────────────────────────────────────────────────────────────────────
// SIGNAL TIMING — Webster's method for a fixed-time signal, plus the HCM
// 2000 uniform+overflow delay and the LOS letter it earns.
//
// Per phase i the engineer supplies the critical flow ratio y_i = q_i / s_i
// (arrival flow over saturation flow). The engine then:
//
//   Y = Σ y_i                       total critical flow ratio (must be < 1)
//   L = Σ l_i                       total lost time per cycle
//   C₀ = (1.5·L + 5) / (1 − Y)      Webster's optimal cycle (seconds)
//   g_i = (y_i / Y) · (C₀ − L)      effective green per phase
//   X_i = q_i / (s_i · g_i / C₀)    degree of saturation per phase
//
// and evaluates Webster's delay formula per phase (veh/s internally):
//
//   d = C(1−λ)²/(2(1−λX)) + X²/(2q(1−X)) − 0.65·(C/q²)^⅓ · X^(2+5λ)
//
// with λ = g/C, then averages across phases weighted by flow and maps the
// control delay to the HCM signalized-LOS table (A ≤ 10, B ≤ 20, C ≤ 35,
// D ≤ 55, E ≤ 80 s/veh, F beyond or when X ≥ 1).
// ─────────────────────────────────────────────────────────────────────────

export interface PhaseInput {
  /** Phase name (display only). */
  name: string
  /** Critical arrival flow for the phase (veh/h). */
  q: number
  /** Saturation flow for the phase (veh/h of green). */
  s: number
  /** Lost time per cycle for this phase (s) — startup + clearance. */
  lost: number
}

export interface WebsterInput {
  phases: PhaseInput[]
  /** Cycle length used for splits/delay. Omit to use Webster's optimum C₀. */
  cycleOverride?: number
  /** X above which the phase deems oversaturated for the LOS note (default 1). */
}

export interface PhaseResult {
  name: string
  q: number
  s: number
  /** Flow ratio y = q/s. */
  y: number
  lost: number
  /** Effective green (s). */
  g: number
  /** Green ratio λ = g/C. */
  lambda: number
  /** Degree of saturation X. */
  x: number
  /** Webster delay (s/veh). */
  delay: number
  los: string
}

export interface WebsterResult {
  /** Sum of flow ratios. */
  Y: number
  /** Total lost time (s). */
  L: number
  /** Webster optimal cycle (s). */
  C0: number
  /** Cycle actually used (s) — the override when supplied. */
  C: number
  phases: PhaseResult[]
  /** Flow-weighted average delay (s/veh). */
  avgDelay: number
  /** Intersection LOS from the weighted delay. */
  los: string
  /** True when some phase runs at X ≥ 1 (the C₀ math no longer applies). */
  oversaturated: boolean
}

const LOS_BANDS: [number, string][] = [
  [10, 'A'], [20, 'B'], [35, 'C'], [55, 'D'], [80, 'E'],
]

export function losByDelay(d: number, oversaturated = false): string {
  if (oversaturated || d > 80) return 'F'
  for (const [cap, los] of LOS_BANDS) if (d <= cap) return los
  return 'F'
}

/** Webster delay for one phase, in seconds per vehicle.
 *  q, s in veh/h; C and g in seconds. */
export function websterDelay(q: number, s: number, C: number, g: number): { d: number; x: number } {
  const q_s = q / 3600
  const lambda = g / C
  const x = (q / 3600) / ((s / 3600) * lambda) // = q/(s·λ)
  if (x >= 1) return { d: NaN, x }
  const d1 = (C * Math.pow(1 - lambda, 2)) / (2 * (1 - lambda * x))
  const d2 = (x * x) / (2 * q_s * (1 - x))
  // The third (empirical) term is suppressed near saturation where it was
  // never calibrated — the standard practice note on Webster's formula.
  const d3 = Math.abs(x - 1) > 0.02
    ? -0.65 * Math.pow(C / (q_s * q_s), 1 / 3) * Math.pow(x, 2 + 5 * lambda)
    : 0
  return { d: Math.max(d1 + d2 + d3, 0), x }
}

export function websterTiming(input: WebsterInput): WebsterResult {
  const phases = input.phases
  if (phases.length < 1) throw new Error('A signal needs at least one phase.')
  for (const p of phases) {
    if (!(p.q > 0)) throw new Error(`Phase ${p.name}: arrival flow must be positive.`)
    if (!(p.s > 0)) throw new Error(`Phase ${p.name}: saturation flow must be positive.`)
    if (p.lost < 0) throw new Error(`Phase ${p.name}: lost time cannot be negative.`)
  }

  const ys = phases.map((p) => p.q / p.s)
  const Y = ys.reduce((a, b) => a + b, 0)
  const L = phases.reduce((a, p) => a + p.lost, 0)
  if (Y >= 1) throw new Error(`Σ(y) = ${Y.toFixed(3)} ≥ 1 — the intersection is oversaturated for any fixed-time cycle.`)
  if (L >= 100) throw new Error('Total lost time ≥ 100 s — check the phase lost times.')

  const C0 = (1.5 * L + 5) / (1 - Y)
  const C = input.cycleOverride ?? C0
  if (C <= L) throw new Error('Cycle length must exceed the total lost time.')

  let qTotal = 0
  let delaySum = 0
  const results: PhaseResult[] = phases.map((p, i) => {
    const g = (ys[i] / Y) * (C - L)
    const { d, x } = websterDelay(p.q, p.s, C, g)
    qTotal += p.q
    delaySum += p.q * (Number.isNaN(d) ? 0 : d)
    return {
      name: p.name, q: p.q, s: p.s, y: ys[i], lost: p.lost,
      g, lambda: g / C, x, delay: d,
      los: losByDelay(Number.isNaN(d) ? Infinity : d, Number.isNaN(x) || x >= 1),
    }
  })

  // Saturated means a phase runs at X ≥ 1 — not merely "shorter than optimum".
  // A sub-optimum but undersaturated override (every X < 1) is mistimed, not
  // oversaturated. And a saturated phase has no finite delay, so the average
  // is undefined (NaN) rather than a number diluted with zeros.
  const saturated = results.some((r) => Number.isNaN(r.delay) || r.x >= 1)
  const avgDelay = saturated ? NaN : qTotal > 0 ? delaySum / qTotal : 0
  return {
    Y, L, C0, C, phases: results, avgDelay,
    los: losByDelay(avgDelay, saturated),
    oversaturated: saturated,
  }
}
