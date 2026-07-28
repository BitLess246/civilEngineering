import { describe, it, expect } from 'vitest'
import { nonlinearFrame, assembleFrame, type NLMember, type NLFrameInput } from './nonlinearFrame'

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

// ── P–M interaction on the hinge capacity ───────────────────────────────
describe('nonlinearFrame — P–M interaction reduces the hinge capacity', () => {
  // Portal frame: a lateral push puts the windward column in tension and the
  // leeward one in compression, so their hinge capacities diverge under P–M.
  // NOTE all pushes below stop near the collapse load (~110). Load control
  // cannot equilibrate past collapse — displacement runs away and the tiny
  // hardening lets moments creep above Mp, which is meaningless. Arc-length /
  // displacement control is the fix and is on the backlog.
  const portal = (pm: boolean, Pcap = 900) => ({
    nodes: [
      { id: 'b1', x: 0, y: 0 }, { id: 'b2', x: 4, y: 0 },
      { id: 't1', x: 0, y: 3 }, { id: 't2', x: 4, y: 3 },
    ],
    members: [
      { id: 'c1', i: 'b1', j: 't1', E, I, A, Mp: 100, b: 1e-4, ...(pm ? { Pcap, pmKind: 'concrete' as const } : {}) },
      { id: 'c2', i: 'b2', j: 't2', E, I, A, Mp: 100, b: 1e-4, ...(pm ? { Pcap, pmKind: 'concrete' as const } : {}) },
      { id: 'bm', i: 't1', j: 't2', E, I, A, Mp: 100, b: 1e-4 },
    ],
    supports: [{ node: 'b1', type: 'fixed' as const }, { node: 'b2', type: 'fixed' as const }],
    loads: [{ node: 't1', Fx: 1 }],
    controlNode: 't1', controlDir: 'x' as const,
  })
  const push = (pm: boolean, Pcap?: number) =>
    nonlinearFrame({ ...portal(pm, Pcap), lambdaMax: 130, steps: 520 })!

  it('yields EARLIER with P–M than without — the unconservative case it fixes', () => {
    const first = (r: ReturnType<typeof push>) => r.steps.find((s) => s.hinges > 0)!.lambda
    expect(first(push(true))).toBeLessThan(first(push(false)))
  })

  it('is inert when Pcap is not supplied — capacity stays at the pure-bending Mp', () => {
    const inp = { ...portal(false), lambdaMax: 60, steps: 240 }
    const asm = assembleFrame(inp)!
    const r = nonlinearFrame(inp)!
    for (const h of asm.hinges) expect(asm.hingeCapacity(r.d, h)).toBeCloseTo(100, 9)
  })

  it('reduces the COLUMN capacities below Mp while the beam keeps its own', () => {
    const inp = { ...portal(true), lambdaMax: 60, steps: 240 }
    const asm = assembleFrame(inp)!
    const r = nonlinearFrame(inp)!
    for (const h of asm.hinges) {
      const cap = asm.hingeCapacity(r.d, h)
      if (h.member.startsWith('c')) { expect(cap).toBeLessThan(100); expect(cap).toBeGreaterThan(0) }
      else expect(cap).toBeCloseTo(100, 9)      // beam carries no P–M data
    }
  })

  it('recovers opposite axial forces in the two columns', () => {
    const inp = { ...portal(true), lambdaMax: 60, steps: 240 }
    const asm = assembleFrame(inp)!
    const r = nonlinearFrame(inp)!
    const N1 = asm.axialForce(r.d, 'c1'), N2 = asm.axialForce(r.d, 'c2')
    expect(Math.abs(N1)).toBeGreaterThan(1)
    expect(Math.sign(N1)).toBe(-Math.sign(N2))        // one tension, one compression
    expect(N1 + N2).toBeCloseTo(0, 6)                 // and they balance
  })

  it('a smaller axial capacity means a bigger reduction and earlier yield', () => {
    const first = (r: ReturnType<typeof push>) => r.steps.find((s) => s.hinges > 0)!.lambda
    expect(first(push(true, 300))).toBeLessThan(first(push(true, 900)))
  })
})
