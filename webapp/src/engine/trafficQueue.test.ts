import { describe, expect, it } from 'vitest'
import { solveDD1, solveMM1 } from './trafficQueue'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

// The classic board problem, solved by hand:
//   Arrivals 600 veh/h for 15 min, then 300 veh/h for 30 min (45 min total).
//   Service 400 veh/h constant (20/3 veh/min ≈ 6.6667).
//   Queue builds at 200 veh/h = 10/3 veh/min → 50 veh at t = 15 min.
//   After t = 15 arrivals 5 veh/min < service 6.6667 → queue falls at
//   1.6667 veh/min → 50/(5/3) = 30 min → dissipates at t = 45 min.
//   Total delay = area of the queue polygon:
//     triangle 0→15:  ½·15·50 = 375 veh·min
//     triangle 15→45: ½·30·50 = 750 veh·min
//   = 1125 veh·min. Vehicles delayed = all 300 → average 3.75 min/veh.
const CLASSIC = {
  periods: [
    { rate: 600, minutes: 15 },
    { rate: 300, minutes: 30 },
  ],
  service: 400,
}

describe('solveDD1 — the classic toll-booth problem', () => {
  const res = solveDD1(CLASSIC)

  it('queue grows at (λ−μ) and peaks at 50 veh at t = 15 min', () => {
    near(res.ticks[5].queue, (10 / 3) * 6, 1e-6)
    near(res.maxQueue, 50, 1e-6)
    expect(res.maxQueueMinute).toBe(15)
  })
  it('dissipates at t = 45 min', () => {
    expect(res.dissipation).toBe(45)
    near(res.ticks[44].queue, 0, 1e-9)
  })
  it('total delay = 1125 veh·min, average = 3.75 min/veh over 300 veh', () => {
    near(res.totalDelay, 1125, 1e-6)
    near(res.vehiclesDelayed, 300, 1e-6)
    near(res.avgDelay, 3.75, 1e-6)
  })
  it('cumulative curves close on the same totals', () => {
    near(res.cumArrivals[44], 600 * 0.25 + 300 * 0.5, 1e-6)
    near(res.cumDepartures[44], 400 * (45 / 60), 1e-6)
    near(res.cumDepartures[44], res.cumArrivals[44], 1e-9)
  })
  it('minute-by-minute rates reflect the step (reported in veh/h)', () => {
    near(res.ticks[0].arrivals, 600, 1e-9)
    near(res.ticks[14].arrivals, 600, 1e-9)
    near(res.ticks[15].arrivals, 300, 1e-9)
    near(res.ticks[0].departures, Math.min(600, 400), 1e-9)
  })
})

describe('solveDD1 — undersaturated demand never queues', () => {
  const res = solveDD1({ periods: [{ rate: 300, minutes: 20 }], service: 400 })
  it('zero queue, zero delay, no dissipation event', () => {
    near(res.maxQueue, 0, 1e-12)
    near(res.totalDelay, 0, 1e-12)
    expect(res.dissipation).toBeNull()
    near(res.avgDelay, 0, 1e-12)
  })
})

describe('solveDD1 — queue still standing at the horizon', () => {
  it('never dissipates inside the study', () => {
    const res = solveDD1({ periods: [{ rate: 600, minutes: 30 }], service: 400 })
    expect(res.dissipation).toBeNull()
    near(res.maxQueue, 100, 1e-6)
    expect(res.ticks[29].queue).toBeGreaterThan(0)
  })
})

describe('solveDD1 — input hygiene', () => {
  it('demands whole-minute periods', () => {
    expect(() => solveDD1({ periods: [{ rate: 600, minutes: 15.5 }], service: 400 })).toThrow(/whole minutes/)
  })
  it('refuses negative rates and non-positive service', () => {
    expect(() => solveDD1({ periods: [{ rate: -5, minutes: 10 }], service: 400 })).toThrow(/negative/)
    expect(() => solveDD1({ periods: [{ rate: 600, minutes: 10 }], service: 0 })).toThrow(/Service/)
  })
})

describe('solveMM1 — the stochastic benchmark', () => {
  it('standard values at ρ = 0.8 (λ=80/h, μ=100/h)', () => {
    const r = solveMM1(80, 100)
    near(r.rho, 0.8)
    near(r.L, 4)
    near(r.Lq, 3.2)
    near(r.W, 3) // 1/(100−80) h = 3 min
    near(r.Wq, (80 / (100 * 20)) * 60, 1e-12) // λ/(μ(μ−λ)) = 0.04 h = 2.4 min
    near(r.p0, 0.2)
    expect(r.stable).toBe(true)
  })
  it('is unstable at ρ ≥ 1 and flags it', () => {
    const r = solveMM1(100, 100)
    expect(r.stable).toBe(false)
    expect(r.W).toBe(Infinity)
  })
})
