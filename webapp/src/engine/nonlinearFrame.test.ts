import { describe, it, expect } from 'vitest'
import { nonlinearFrame, assembleFrame, type NLMember, type NLNode, type NLFrameInput } from './nonlinearFrame'

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

// ── displacement control: tracing what load control structurally cannot ──
describe('nonlinearFrame — displacement control', () => {
  const cant = (b: number, extra: Record<string, unknown>) => nonlinearFrame({
    nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 3, y: 0 }],
    members: [{ id: 'm', i: 'n1', j: 'n2', E, I, A, Mp: 100, b }],
    supports: [{ node: 'n1', type: 'fixed' }],
    loads: [{ node: 'n2', Fy: -1 }],
    controlNode: 'n2', controlDir: 'y', ...extra,
  })!

  it('hits the prescribed control displacement at every step', () => {
    const r = cant(1e-4, { control: 'displacement', dispMax: -0.2, steps: 20 })
    for (let i = 0; i < r.steps.length; i++)
      expect(r.steps[i].disp).toBeCloseTo((-0.2 * (i + 1)) / 20, 9)
  })

  it('agrees with the elastic closed form while the response is elastic', () => {
    // elastic tip deflection under λ: δ = λ·L³/3EI  ⇒  λ = |δ|·3EI/L³.
    // Matched to 1e-3 relative, not exactly: the hinge penalty stiffness is
    // 1e4·EI/L rather than infinite, which leaves the same <0.1% softening the
    // 'rigid unyielded hinge' test above bounds.
    const r = cant(1e-4, { control: 'displacement', dispMax: -0.01, steps: 5 })
    for (const s of r.steps) {
      const exact = (Math.abs(s.disp) * 3 * EI) / 3 ** 3
      expect(Math.abs(s.lambda / exact - 1)).toBeLessThan(1e-3)
    }
  })

  it('HOLDS the collapse load flat instead of running away (load control cannot)', () => {
    const r = cant(1e-4, { control: 'displacement', dispMax: -0.4, steps: 40 })
    const exact = 100 / 3                                    // Mp/L = 33.33
    const past = r.steps.filter((s) => Math.abs(s.disp) > 0.05)
    expect(past.length).toBeGreaterThan(20)
    for (const s of past) expect(s.lambda).toBeCloseTo(exact, 1)   // plateau, 6× the drift
    // the same push under LOAD control instead runs the displacement away
    const lc = cant(1e-4, { lambdaMax: 45, steps: 180 })
    expect(Math.abs(lc.steps[lc.steps.length - 1].disp)).toBeGreaterThan(10)
  })

  it('traces a DESCENDING post-peak branch when the hinge softens', () => {
    const r = cant(-0.05, { control: 'displacement', dispMax: -0.4, steps: 40 })
    const peak = Math.max(...r.steps.map((s) => s.lambda))
    const last = r.steps[r.steps.length - 1].lambda
    expect(peak).toBeGreaterThan(30)
    expect(last).toBeLessThan(peak * 0.7)          // genuinely descended
    // and it descends monotonically once past the peak
    const after = r.steps.slice(r.steps.findIndex((s) => s.lambda === peak) + 1)
    for (let i = 1; i < after.length; i++) expect(after[i].lambda).toBeLessThan(after[i - 1].lambda)
  })

  it('reports the solved load factor as an output', () => {
    const r = cant(1e-4, { control: 'displacement', dispMax: -0.3, steps: 30 })
    expect(r.converged).toBe(true)
    for (const s of r.steps) expect(Number.isFinite(s.lambda)).toBe(true)
    expect(r.steps[0].lambda).toBeGreaterThan(0)
  })
})

describe('nonlinearFrame — multi-hinge convergence', () => {
  /** Multi-bay, multi-storey plane frame — dozens of hinges yielding together. */
  function frame(nBays: number, nStoreys: number, span = 5, h = 3) {
    const nodes: NLNode[] = [], members: NLMember[] = []
    const id = (i: number, k: number) => `n${i}_${k}`
    for (let k = 0; k <= nStoreys; k++) for (let i = 0; i <= nBays; i++) nodes.push({ id: id(i, k), x: i * span, y: k * h })
    const E = 25000, I = (400 * 500 ** 3) / 12, A = 400 * 500, Mp = 180
    for (let k = 0; k < nStoreys; k++) for (let i = 0; i <= nBays; i++)
      members.push({ id: `C${i}_${k}`, i: id(i, k), j: id(i, k + 1), E, I, A, Mp, b: 0.02 })
    for (let k = 1; k <= nStoreys; k++) for (let i = 0; i < nBays; i++)
      members.push({ id: `B${i}_${k}`, i: id(i, k), j: id(i + 1, k), E, I, A, Mp, b: 0.02 })
    return {
      nodes, members,
      supports: Array.from({ length: nBays + 1 }, (_, i) => ({ node: id(i, 0), type: 'fixed' as const })),
      loads: Array.from({ length: nStoreys }, (_, k) => ({ node: id(0, k + 1), Fx: (k + 1) / nStoreys })),
      top: id(0, nStoreys), H: nStoreys * h,
    }
  }
  const push = (nBays: number, nStoreys: number, steps: number) => {
    const f = frame(nBays, nStoreys)
    return nonlinearFrame({
      nodes: f.nodes, members: f.members, supports: f.supports, loads: f.loads,
      controlNode: f.top, controlDir: 'x', control: 'displacement',
      dispMax: f.H * 0.05, steps,
    })!
  }

  it('converges at every step of a 56-hinge frame', () => {
    // Regression. Plain full Newton with an increment-based convergence test
    // converged NONE of these steps: the hinge tangent drops by ~k0/(b·k0) at
    // yield, so the full step is wildly wrong once many hinges yield together,
    // and ‖Δd‖/‖d‖ cannot tell a stalled iteration from a converged one.
    const r = push(3, 4, 30)
    expect(r.hinges.length).toBe(56)
    const bad = r.steps.filter((s) => !s.converged)
    expect(bad.length, `${bad.length} of ${r.steps.length} steps short of tolerance`).toBe(0)
    expect(Math.max(...r.steps.map((s) => s.residual))).toBeLessThan(1e-8)
    expect(r.converged).toBe(true)
  })

  it('reports a capacity that does not depend on the step count', () => {
    // The check that the converged answer is actually right, not merely
    // reachable: halving the increment must not move the peak. While the steps
    // were failing to converge this differed by 0.2%.
    const peak = (steps: number) =>
      Math.max(...push(3, 4, steps).steps.filter((s) => s.converged).map((s) => Math.abs(s.lambda)))
    const a = peak(30), b = peak(60)
    expect(Math.abs(a - b) / a).toBeLessThan(2e-3)
    // ~3 s unloaded; under a full parallel suite it exceeds the 5 s default.
  }, 60_000)

  it('reports the residual it actually achieved', () => {
    const r = push(2, 3, 20)
    for (const s of r.steps) {
      expect(Number.isFinite(s.residual)).toBe(true)
      if (s.converged) expect(s.residual).toBeLessThan(1e-8)
    }
  })
})
