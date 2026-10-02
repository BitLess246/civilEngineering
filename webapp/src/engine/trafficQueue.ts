// ─────────────────────────────────────────────────────────────────────────
// TRAFFIC QUEUES — deterministic D/D/1 accumulation and the M/M/1 benchmark.
//
// DETERMINISTIC (D/D/1). Arrivals stream in at piecewise-constant rates
// λ₁, λ₂, … (veh/h) while the bottleneck serves a constant μ. The engine
// integrates the arrival and departure curves minute by minute (exact for
// constant rates — every breakpoint is a grid point, no interpolation):
//
//   queue(t) = Σ arrivals(t) − Σ departures(t) ≥ 0
//   total delay = ∫ queue dt  (the area between the two curves, veh·min)
//   average delay = total delay / vehicles delayed
//   dissipation = the minute the queue returns to zero for good
//
// That is the classic board problem: "vehicles arrive at 600 veh/h for 15
// minutes at a toll booth serving 400 veh/h; the rate then drops to 300
// veh/h. Find the longest queue, total and average delay, and when the
// line clears."
//
// STOCHASTIC (M/M/1). For comparison, the Poisson-arrivals/exponential-
// service benchmark at the same λ and μ:
//   ρ = λ/μ, L = ρ/(1−ρ), Lq = ρ²/(1−ρ), W = 1/(μ−λ), Wq = λ/(μ(μ−λ))
//
// Rates are veh/h throughout; results come back in minutes.
// ─────────────────────────────────────────────────────────────────────────

export interface ArrivalPeriod {
  /** Constant arrival rate during this period (veh/h). */
  rate: number
  /** Period length (minutes). */
  minutes: number
}

export interface DD1Input {
  periods: ArrivalPeriod[]
  /** Service rate of the bottleneck (veh/h), constant. */
  service: number
}

export interface DD1Tick {
  /** Minute t (end of minute t since the start). */
  t: number
  arrivals: number
  departures: number
  queue: number
}

export interface DD1Result {
  ticks: DD1Tick[]
  /** Longest queue (vehicles) and the minute it occurs. */
  maxQueue: number
  maxQueueMinute: number
  /** When the queue last served everyone (minutes); null if it never clears. */
  dissipation: number | null
  /** Total delay = area between arrival and departure curves (veh·min). */
  totalDelay: number
  /** Vehicles that were ever queued (all arrivals if a queue ever forms). */
  vehiclesDelayed: number
  /** Total delay / vehicles delayed (min/veh). */
  avgDelay: number
  /** Cumulative arrival/departure curves at each minute, for the page plot. */
  cumArrivals: number[]
  cumDepartures: number[]
  λmean: number
  service: number
}

/** Solve the deterministic queue. Rates constant per period; the timeline is
 *  integrated at 1-minute steps (every period boundary is a whole minute). */
export function solveDD1(input: DD1Input): DD1Result {
  const periods = input.periods.filter((p) => p.minutes > 0)
  if (periods.length < 1) throw new Error('At least one arrival period with positive length is needed.')
  if (!(input.service > 0)) throw new Error('Service rate must be positive.')
  for (const p of periods) {
    if (!(p.rate >= 0)) throw new Error('Arrival rates cannot be negative.')
    if (Math.abs(p.minutes - Math.round(p.minutes)) > 1e-9) {
      throw new Error('Period lengths must be whole minutes for the exact deterministic solution.')
    }
  }

  const totalMin = periods.reduce((s, p) => s + p.minutes, 0)
  const rateAt = new Array<number>(Math.round(totalMin))
  let idx = 0
  for (const p of periods) {
    for (let k = 0; k < Math.round(p.minutes); k++) rateAt[idx++] = p.rate / 60 // veh/min
  }

  const ticks: DD1Tick[] = []
  const cumArrivals: number[] = []
  const cumDepartures: number[] = []
  let arrivals = 0
  let departures = 0
  let queue = 0
  let maxQueue = 0
  let maxQueueMinute = 0
  let totalDelay = 0
  let dissipation: number | null = null
  let everQueued = false

  for (let t = 1; t <= rateAt.length; t++) {
    arrivals += rateAt[t - 1]
    const served = Math.min(queue + rateAt[t - 1], input.service / 60)
    departures += served
    queue = arrivals - departures
    totalDelay += queue // veh queued for one more minute
    if (queue > 1e-9) everQueued = true
    if (queue > maxQueue + 1e-9) { maxQueue = queue; maxQueueMinute = t }
    if (queue <= 1e-9) { queue = 0; if (everQueued && dissipation === null) dissipation = t }
    ticks.push({ t, arrivals: rateAt[t - 1] * 60, departures: Math.min(rateAt[t - 1], input.service / 60) * 60, queue })
    cumArrivals.push(arrivals)
    cumDepartures.push(departures)
  }
  // A queue still standing at the horizon never dissipates inside the study.
  if (queue > 1e-9) dissipation = null

  const λmean = rateAt.length > 0 ? (arrivals / rateAt.length) * 60 : 0
  const vehiclesDelayed = everQueued ? arrivals : 0

  return {
    ticks, maxQueue: Math.round(maxQueue * 1e6) / 1e6, maxQueueMinute,
    dissipation, totalDelay, vehiclesDelayed,
    avgDelay: everQueued ? totalDelay / vehiclesDelayed : 0,
    cumArrivals, cumDepartures, λmean, service: input.service,
  }
}

export interface MM1Result {
  rho: number
  /** Mean number in system / in queue (vehicles). */
  L: number
  Lq: number
  /** Mean time in system / in queue (minutes). */
  W: number
  Wq: number
  /** Probability the server is idle. */
  p0: number
  stable: boolean
}

/** M/M/1 benchmark. λ, μ in veh/h; times in minutes. */
export function solveMM1(lambda: number, mu: number): MM1Result {
  if (!(lambda > 0) || !(mu > 0)) throw new Error('Arrival and service rates must be positive.')
  const rho = lambda / mu
  const stable = rho < 1
  const perHourToMin = (h: number) => h * 60
  return {
    rho,
    L: stable ? rho / (1 - rho) : Infinity,
    Lq: stable ? (rho * rho) / (1 - rho) : Infinity,
    W: stable ? perHourToMin(1 / (mu - lambda)) : Infinity,
    Wq: stable ? perHourToMin(lambda / (mu * (mu - lambda))) : Infinity,
    p0: stable ? 1 - rho : 0,
    stable,
  }
}
