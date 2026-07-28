import { describe, it, expect } from 'vitest'
import { nonlinearFrame, type NLMember, type NLFrameInput } from './nonlinearFrame'

// EI = 200000 MPa × 1e8 mm⁴ = 20 000 kN·m²
const E = 200000, I = 1e8, A = 1e4
const EI = (E * I) / 1e9

const cantilever = (o: Partial<NLMember> & Partial<NLFrameInput> = {}): NLFrameInput => ({
  nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 3, y: 0 }],
  members: [{ id: 'm', i: 'n1', j: 'n2', E, I, A, Mp: o.Mp, b: o.b }],
  supports: [{ node: 'n1', type: 'fixed' }],
  loads: [{ node: 'n2', Fy: -1 }],
  controlNode: 'n2', controlDir: 'y',
  lambdaMax: o.lambdaMax ?? 10, steps: o.steps ?? 10, schedule: o.schedule,
})

describe('nonlinearFrame — elastic behaviour', () => {
  it('reproduces the cantilever closed form δ = PL³/3EI exactly (no hinges)', () => {
    const r = nonlinearFrame(cantilever({ Mp: Infinity, lambdaMax: 10, steps: 10 }))!
    const last = r.steps[r.steps.length - 1]
    expect(last.disp).toBeCloseTo(-(10 * 3 ** 3) / (3 * EI), 12)
    expect(r.totalDissipated).toBe(0)
    expect(r.converged).toBe(true)
  })

  it('a rigid unyielded hinge does not soften the elastic frame', () => {
    // same push, but with real (unyielded) hinges present — the penalty spring
    // must not measurably change the elastic answer
    const withH = nonlinearFrame(cantilever({ Mp: 1e6, lambdaMax: 10, steps: 10 }))!
    const exact = -(10 * 3 ** 3) / (3 * EI)
    const rel = Math.abs(withH.steps[withH.steps.length - 1].disp / exact - 1)
    expect(rel).toBeLessThan(1e-3)
    expect(withH.hinges).toHaveLength(2)      // one per member end
  })

  it('a linear (elastic) system converges in one Newton iteration', () => {
    const r = nonlinearFrame(cantilever({ Mp: Infinity, lambdaMax: 5, steps: 5 }))!
    expect(Math.max(...r.steps.map((s) => s.iterations))).toBeLessThanOrEqual(2)
  })
})

// ── the decisive checks: classic rigid-plastic collapse loads ──────────
describe('nonlinearFrame — plastic collapse vs limit analysis', () => {
  it('cantilever collapses at P = Mp/L', () => {
    const Mp = 100, L = 3, exact = Mp / L                       // 33.33 kN
    const r = nonlinearFrame(cantilever({ Mp, b: 1e-4, lambdaMax: 45, steps: 180 }))!
    const yieldStep = r.steps.find((s) => s.hinges > 0)!
    expect(yieldStep.lambda).toBeGreaterThan(exact - 0.3)
    expect(yieldStep.lambda).toBeLessThan(exact + 0.3)          // within one increment
    // and the response really does run away once the mechanism forms
    const before = r.steps[r.steps.findIndex((s) => s.hinges > 0) - 1]
    expect(Math.abs(yieldStep.disp)).toBeGreaterThan(50 * Math.abs(before.disp))
  })

  it('fixed–fixed beam under a central load collapses at P = 8·Mp/L', () => {
    const Mp = 100, L = 6, exact = (8 * Mp) / L                 // 133.33 kN
    const r = nonlinearFrame({
      nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'c', x: L / 2, y: 0 }, { id: 'b', x: L, y: 0 }],
      members: [
        { id: 'm1', i: 'a', j: 'c', E, I, A, Mp, b: 1e-4 },
        { id: 'm2', i: 'c', j: 'b', E, I, A, Mp, b: 1e-4 },
      ],
      supports: [{ node: 'a', type: 'fixed' }, { node: 'b', type: 'fixed' }],
      loads: [{ node: 'c', Fy: -1 }],
      controlNode: 'c', controlDir: 'y', lambdaMax: 200, steps: 400,
    })!
    const yieldStep = r.steps.find((s) => s.hinges > 0)!
    expect(yieldStep.lambda).toBeGreaterThan(exact - 0.6)
    expect(yieldStep.lambda).toBeLessThan(exact + 0.6)
    // the 3-hinge mechanism: both supports + midspan (shared by the two members)
    expect(yieldStep.hinges).toBe(4)
  })

  it('more hardening carries more load past first yield', () => {
    const soft = nonlinearFrame(cantilever({ Mp: 100, b: 1e-4, lambdaMax: 40, steps: 160 }))!
    const hard = nonlinearFrame(cantilever({ Mp: 100, b: 0.10, lambdaMax: 40, steps: 160 }))!
    const at = (r: typeof soft) => Math.abs(r.steps[r.steps.length - 1].disp)
    expect(at(hard)).toBeLessThan(at(soft))    // stiffer post-yield ⇒ less drift at the same λ
  })
})

// ── what the event-to-event pushover structurally cannot do ────────────
describe('nonlinearFrame — cyclic response (hinges unload and re-yield)', () => {
  // push past yield, unload to zero, reverse past yield, return
  const ramp = (from: number, to: number, n: number) =>
    Array.from({ length: n }, (_, i) => from + ((to - from) * (i + 1)) / n)
  const schedule = [...ramp(0, 38, 76), ...ramp(38, 0, 38), ...ramp(0, -38, 76), ...ramp(-38, 0, 38)]

  const cyc = nonlinearFrame(cantilever({ Mp: 100, b: 0.05, schedule, lambdaMax: 38, steps: schedule.length }))!

  it('leaves a permanent set after unloading to zero load', () => {
    const back = cyc.steps[75 + 38]              // λ back to 0 after the first excursion
    expect(Math.abs(back.lambda)).toBeLessThan(1e-9)
    expect(Math.abs(back.disp)).toBeGreaterThan(1e-3)   // residual displacement remains
  })

  it('dissipates energy and records plastic rotation at the hinge', () => {
    expect(cyc.totalDissipated).toBeGreaterThan(0)
    const base = cyc.hinges.find((h) => h.end === 'i')!
    expect(base.yielded).toBe(true)
    expect(Math.abs(base.plastic)).toBeGreaterThan(0)
    expect(base.dissipated).toBeGreaterThan(0)
  })

  it('yields in BOTH directions over a full cycle', () => {
    // the reversed half must also produce yielding steps
    const fwd = cyc.steps.slice(0, 114).some((s) => s.hinges > 0)
    const rev = cyc.steps.slice(114).some((s) => s.hinges > 0)
    expect(fwd).toBe(true)
    expect(rev).toBe(true)
  })

  it('an elastic cycle dissipates nothing and returns to the origin', () => {
    const small = [...ramp(0, 10, 20), ...ramp(10, 0, 20), ...ramp(0, -10, 20), ...ramp(-10, 0, 20)]
    const r = nonlinearFrame(cantilever({ Mp: 100, schedule: small, lambdaMax: 10, steps: small.length }))!
    expect(r.totalDissipated).toBe(0)
    expect(Math.abs(r.steps[r.steps.length - 1].disp)).toBeLessThan(1e-9)
  })
})

describe('nonlinearFrame — guards', () => {
  it('returns null for an empty model', () => {
    expect(nonlinearFrame({ nodes: [], members: [], supports: [], loads: [], controlNode: 'x' })).toBeNull()
  })
  it('returns null when a member references a missing node', () => {
    expect(nonlinearFrame({
      nodes: [{ id: 'a', x: 0, y: 0 }],
      members: [{ id: 'm', i: 'a', j: 'ghost', E, I, A }],
      supports: [{ node: 'a', type: 'fixed' }], loads: [], controlNode: 'a',
    })).toBeNull()
  })
})
