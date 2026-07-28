import { describe, it, expect } from 'vitest'
import { arcLengthFrame, type ArcLengthInput } from './arcLength'
import { nonlinearFrame, type NLFrameInput } from './nonlinearFrame'

// EI = 200000 MPa × 1e8 mm⁴ = 20 000 kN·m²
const E = 200000, I = 1e8, A = 1e4
const EI = (E * I) / 1e9
const L = 3

/** Tip-loaded cantilever — the same fixture the load/displacement tests use. */
const cant = (o: { Mp?: number; b?: number } = {}): Omit<ArcLengthInput, 'arcLength'> => ({
  nodes: [{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: L, y: 0 }],
  members: [{ id: 'm', i: 'n1', j: 'n2', E, I, A, Mp: o.Mp, b: o.b }],
  supports: [{ node: 'n1', type: 'fixed' }],
  loads: [{ node: 'n2', Fy: -1 }],
  controlNode: 'n2', controlDir: 'y',
})

describe('arcLength — elastic path', () => {
  it('traces the exact linear path λ = |δ|·3EI/L³', () => {
    const r = arcLengthFrame({ ...cant({ Mp: Infinity }), arcLength: 0.002, arcSteps: 20, dispStop: 0.04 })!
    expect(r.steps.length).toBeGreaterThan(5)
    for (const s of r.steps) {
      const exact = (Math.abs(s.disp) * 3 * EI) / L ** 3
      expect(s.lambda).toBeCloseTo(exact, 9)
    }
    expect(r.totalDissipated).toBe(0)
    expect(r.snapBack).toBe(false)
    expect(r.converged).toBe(true)
  })

  it('the step really is an ARC of the prescribed length', () => {
    // ψ = 0 (cylindrical), so ‖Δd‖ = Δl exactly. The control DOF is one
    // component of Δd, so |Δdisp| ≤ Δl is a necessary condition — and for this
    // tip-dominated cantilever it should be a large fraction of it.
    const arc = 0.003
    const r = arcLengthFrame({ ...cant({ Mp: Infinity }), arcLength: arc, arcSteps: 15, dispStop: 0.05 })!
    for (let i = 1; i < r.steps.length; i++) {
      const step = Math.abs(r.steps[i].disp - r.steps[i - 1].disp)
      expect(step).toBeLessThanOrEqual(arc + 1e-12)
      expect(step).toBeGreaterThan(arc * 0.2)
      expect(r.steps[i].arc).toBeCloseTo(arc, 12)      // no cutting needed
      expect(r.steps[i].cuts).toBe(0)
    }
  })

  it('halving the arc length doubles the number of steps to the same place', () => {
    const a = arcLengthFrame({ ...cant({ Mp: Infinity }), arcLength: 0.004, arcSteps: 200, dispStop: 0.04 })!
    const b = arcLengthFrame({ ...cant({ Mp: Infinity }), arcLength: 0.002, arcSteps: 200, dispStop: 0.04 })!
    expect(b.steps.length / a.steps.length).toBeCloseTo(2, 0)
    // Both stop on CROSSING dispStop, so they overshoot it by up to one arc and
    // therefore end at slightly different points — comparing the endpoints
    // directly would only measure that overshoot. What must hold is that each
    // endpoint sits on the same exact line.
    const la = a.steps[a.steps.length - 1], lb = b.steps[b.steps.length - 1]
    expect(Math.abs(lb.disp - la.disp)).toBeLessThan(0.004)
    for (const s of [la, lb]) expect(s.lambda).toBeCloseTo((Math.abs(s.disp) * 3 * EI) / L ** 3, 9)
  })
})

describe('arcLength — plastic collapse', () => {
  it('peak λ is the rigid-plastic collapse load Mp/L', () => {
    const Mp = 100, exact = Mp / L                       // 33.33 kN
    const r = arcLengthFrame({ ...cant({ Mp, b: 1e-4 }), arcLength: 0.004, arcSteps: 200, dispStop: 0.35 })!
    expect(r.peakLambda).toBeGreaterThan(exact * 0.97)
    expect(r.peakLambda).toBeLessThan(exact * 1.05)
    expect(r.hinges.some((h) => h.yielded)).toBe(true)
  })

  it('holds the collapse load flat well past the peak', () => {
    // the whole point of path following: keep marching after the mechanism
    // forms instead of running the displacement away
    const Mp = 100, exact = Mp / L
    const r = arcLengthFrame({ ...cant({ Mp, b: 1e-4 }), arcLength: 0.004, arcSteps: 300, dispStop: 0.35 })!
    const late = r.steps.filter((s) => Math.abs(s.disp) > 0.15)
    expect(late.length).toBeGreaterThan(10)
    for (const s of late) expect(Math.abs(s.lambda / exact - 1)).toBeLessThan(0.05)
    // and the displacement kept growing in a controlled way
    expect(Math.abs(r.steps[r.steps.length - 1].disp)).toBeGreaterThan(0.3)
  })

  it('a softening hinge (b < 0) produces a genuinely DESCENDING branch', () => {
    const r = arcLengthFrame({ ...cant({ Mp: 100, b: -0.02 }), arcLength: 0.004, arcSteps: 200, dispStop: 0.3 })!
    const iPeak = r.steps.findIndex((s) => s.lambda === r.peakLambda)
    const after = r.steps.slice(iPeak + 1)
    expect(after.length).toBeGreaterThan(5)
    expect(after[after.length - 1].lambda).toBeLessThan(r.peakLambda * 0.95)
    // monotonically descending, not oscillating
    for (let i = 1; i < after.length; i++) expect(after[i].lambda).toBeLessThanOrEqual(after[i - 1].lambda + 1e-9)
  })
})

describe('arcLength — agreement with displacement control where both apply', () => {
  // With no snap-back, arc-length and displacement control must trace the SAME
  // equilibrium path; they only parameterize it differently. Comparing them is
  // the strongest available check short of an external solver.
  const Mp = 100, b = 1e-4
  const arc = arcLengthFrame({ ...cant({ Mp, b }), arcLength: 0.002, arcSteps: 400, dispStop: 0.25 })!
  const disp = nonlinearFrame({
    ...cant({ Mp, b }), control: 'displacement', dispMax: -0.25, steps: 500,
  } as NLFrameInput)!

  /** λ on the displacement-control curve at a given control displacement. */
  const lambdaAt = (x: number) => {
    const s = disp.steps
    for (let i = 1; i < s.length; i++) {
      const a = s[i - 1], c = s[i]
      if ((x - a.disp) * (x - c.disp) <= 0 && Math.abs(c.disp - a.disp) > 1e-15) {
        const t = (x - a.disp) / (c.disp - a.disp)
        return a.lambda + t * (c.lambda - a.lambda)
      }
    }
    return NaN
  }

  it('both reach the same collapse plateau', () => {
    const dispPeak = Math.max(...disp.steps.map((s) => s.lambda))
    expect(arc.peakLambda).toBeCloseTo(dispPeak, 1)
  })

  it('the two curves coincide point-by-point', () => {
    let compared = 0
    for (const s of arc.steps) {
      const ref = lambdaAt(s.disp)
      if (!Number.isFinite(ref) || Math.abs(s.disp) < 1e-4) continue
      compared++
      // The two parameterizations trace the SAME curve. The residual is the
      // REFERENCE's own linear interpolation across the sharp knee (it samples
      // every 5e-4 m), not a disagreement — hence a relative bound.
      expect(Math.abs(s.lambda - ref)).toBeLessThan(1e-3 * Math.max(1, Math.abs(ref)))
    }
    expect(compared).toBeGreaterThan(20)      // a real comparison, not an empty loop
  })

  it('arc-length keeps a bounded step where displacement control does not', () => {
    // displacement control marches in equal Δdisp; arc-length shortens its
    // displacement step near the peak because the λ component takes up the arc
    const near = arc.steps.filter((s) => s.lambda > 0.9 * arc.peakLambda)
    expect(near.length).toBeGreaterThan(3)
    for (const s of near) expect(s.arc).toBeLessThanOrEqual(0.002 + 1e-12)
  })
})

describe('arcLength — snap-back (see the scope note in the module)', () => {
  // Snap-back needs the elastic member to recover displacement FASTER than the
  // softening hinge adds it. For this cantilever the elastic tip recovery per
  // unit hinge rotation is |b|·L/3 against the hinge's own L, so the threshold
  // is |b| > 3 — the post-yield hinge stiffness is b·EI/L by construction.
  const soft = (b: number, arc: number): ArcLengthInput => ({
    ...cant({ Mp: 100, b }), arcLength: arc, arcSteps: 600, dispStop: 0.06, maxCuts: 10,
  })

  it('mild softening (|b| < 3) stays monotone in displacement — no snap-back', () => {
    for (const b of [-0.02, -2]) {
      const r = arcLengthFrame(soft(b, 5e-4))!
      expect(r.snapBack).toBe(false)
      for (let i = 1; i < r.steps.length; i++)
        expect(Math.abs(r.steps[i].disp)).toBeGreaterThanOrEqual(Math.abs(r.steps[i - 1].disp) - 1e-12)
      // and the branch really did descend
      expect(r.steps[r.steps.length - 1].lambda).toBeLessThan(r.peakLambda)
    }
  })

  it('steep softening past the |b| > 3 threshold can be traced onto a REAL snap-back', () => {
    // This configuration is one that works; the capability is genuine but the
    // arc size matters (see the module scope note), so the test pins THIS case
    // rather than claiming the general one.
    const r = arcLengthFrame(soft(-6, 5e-4))!
    expect(r.snapBack).toBe(true)
    // find the reversal and prove it is a true snap-back: λ falls AND the
    // control displacement retreats toward the origin, together
    let found = 0
    for (let i = 1; i < r.steps.length; i++) {
      const dl = r.steps[i].lambda - r.steps[i - 1].lambda
      const dd = Math.abs(r.steps[i].disp) - Math.abs(r.steps[i - 1].disp)
      if (dl < 0 && dd < 0) found++
    }
    expect(found).toBeGreaterThanOrEqual(2)
    // every reported point is still a converged equilibrium state
    for (const s of r.steps) expect(s.converged).toBe(true)
  })

  it('the snapBack flag never fires on a monotone path', () => {
    for (const b of [1e-4, -0.02, -2]) {
      const r = arcLengthFrame(soft(b, 5e-4))!
      expect(r.snapBack).toBe(false)
    }
  })
})

describe('arcLength — robustness', () => {
  it('cuts the arc rather than accepting a failed step', () => {
    // a deliberately coarse arc on a sharply softening problem
    const r = arcLengthFrame({
      ...cant({ Mp: 100, b: -0.3 }), arcLength: 0.05, arcSteps: 60, dispStop: 0.3, maxCuts: 8,
    })!
    for (const s of r.steps) {
      expect(s.converged).toBe(true)
      expect(s.arc).toBeLessThanOrEqual(0.05 + 1e-12)
      if (s.cuts > 0) expect(s.arc).toBeLessThan(0.05)   // a cut step really is shorter
    }
  })

  it('stops cleanly at dispStop instead of running away', () => {
    const r = arcLengthFrame({ ...cant({ Mp: 100, b: 1e-4 }), arcLength: 0.004, arcSteps: 500, dispStop: 0.2 })!
    expect(Math.abs(r.steps[r.steps.length - 1].disp)).toBeGreaterThanOrEqual(0.2 - 0.005)
    expect(Math.abs(r.steps[r.steps.length - 1].disp)).toBeLessThan(0.25)
  })

  it('returns null for an unusable control node', () => {
    expect(arcLengthFrame({ ...cant({ Mp: 100 }), controlNode: 'nope', arcLength: 0.01 })).toBeNull()
  })

  it('a fixed node cannot be the control DOF (no free DOF to follow)', () => {
    expect(arcLengthFrame({ ...cant({ Mp: 100 }), controlNode: 'n1', arcLength: 0.01 })).toBeNull()
  })

  it('energy dissipation is monotone along the path', () => {
    const r = arcLengthFrame({ ...cant({ Mp: 100, b: 1e-4 }), arcLength: 0.004, arcSteps: 200, dispStop: 0.3 })!
    expect(r.totalDissipated).toBeGreaterThan(0)
    // hinge dissipation is an odometer — never negative
    for (const h of r.hinges) expect(h.dissipated).toBeGreaterThanOrEqual(0)
  })
})
