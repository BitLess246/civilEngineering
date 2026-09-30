import { describe, it, expect } from 'vitest'
import { nonlinearFrameDynamic, type NLDynamicInput } from './nonlinearFrameDynamic'
import { assembleFrame, type NLFrameInput } from './nonlinearFrame'
import { newmarkDirect, rayleighCoeffs } from './directTimeHistory'

// single-bay portal: pinned bases, columns 3 m, beam 4 m, mass at the two tops
const E = 200000, I = 1e8, A = 1e4
const frame = (Mp: number, b = 0.02): NLFrameInput => ({
  nodes: [
    { id: 'b1', x: 0, y: 0 }, { id: 'b2', x: 4, y: 0 },
    { id: 't1', x: 0, y: 3 }, { id: 't2', x: 4, y: 3 },
  ],
  members: [
    { id: 'c1', i: 'b1', j: 't1', E, I, A, Mp, b },
    { id: 'c2', i: 'b2', j: 't2', E, I, A, Mp, b },
    { id: 'bm', i: 't1', j: 't2', E, I, A, Mp, b },
  ],
  supports: [{ node: 'b1', type: 'fixed' }, { node: 'b2', type: 'fixed' }],
  loads: [], controlNode: 't1', controlDir: 'x',
})
const mass = { t1: 20, t2: 20 }                       // tonnes
const ray = rayleighCoeffs(10, 0.05, 30, 0.05)
const dt = 0.005, n = 800
const agOf = (amp: number) =>
  Array.from({ length: n }, (_, i) => amp * Math.sin(12 * i * dt) * Math.exp(-0.3 * i * dt))

const run = (Mp: number, amp: number, b = 0.02): NLDynamicInput => ({
  ...frame(Mp, b), mass, rayleigh: ray, ag: agOf(amp), dt, dir: 'x',
})

describe('nonlinearFrameDynamic — elastic limit ≡ linear Newmark', () => {
  it('matches newmarkDirect on the same K, M, C when nothing yields', () => {
    const inp = run(Infinity, 1.5)
    const dyn = nonlinearFrameDynamic(inp)!
    // build the same linear system from the shared assembly
    const asm = assembleFrame(inp)!
    const { nf, Kbeam, fpos, nodeIdx, hingeContrib } = asm
    expect(asm.hinges).toHaveLength(0)             // Mp = ∞ ⇒ no hinge DOFs at all
    const { Kh } = hingeContrib(new Array(nf).fill(0))
    const K = Kbeam.map((r, i) => r.map((x, j) => x + Kh[i][j]))
    const mVec = new Array(nf).fill(0)
    const inert: number[] = []
    for (const [id, m] of Object.entries(mass)) {
      const ni = nodeIdx.get(id)!
      for (const off of [0, 1]) {
        const p = fpos.get(ni * 3 + off)
        if (p === undefined) continue
        mVec[p] += m
        if (off === 0) inert.push(p)
      }
    }
    const M = Array.from({ length: nf }, (_, i) => {
      const r = new Array(nf).fill(0); r[i] = mVec[i]; return r
    })
    const C = Array.from({ length: nf }, (_, i) =>
      Array.from({ length: nf }, (_, j) => ray.beta * K[i][j] + (i === j ? ray.alpha * mVec[i] : 0)))
    const P = inp.ag.map((g) => mVec.map((m, i) => (inert.includes(i) ? -m * g : 0)))
    const lin = newmarkDirect(M, C, K, P, dt)!

    const ctrl = fpos.get(nodeIdx.get('t1')! * 3)!
    expect(Math.max(...lin.u.map((r) => Math.abs(r[ctrl])))).toBeGreaterThan(1e-4)
    for (let i = 0; i < n; i += 37) expect(dyn.disp[i]).toBeCloseTo(lin.u[i][ctrl], 9)
    expect(dyn.totalDissipated).toBe(0)
    expect(dyn.converged).toBe(true)
  })

  it('an elastic run converges in one Newton iteration', () => {
    const r = nonlinearFrameDynamic(run(Infinity, 1.5))!
    expect(r.maxIterations).toBeLessThanOrEqual(2)
  })
})

describe('nonlinearFrameDynamic — inelastic response', () => {
  it('adds a hinge DOF per hinged member end', () => {
    const r = nonlinearFrameDynamic(run(60, 4))!
    expect(r.hinges).toHaveLength(6)              // 3 members × 2 ends
    expect(r.ndof).toBeGreaterThan(6)
  })

  it('stays elastic under a weak record', () => {
    const r = nonlinearFrameDynamic(run(400, 0.2))!
    expect(r.yieldedHinges).toBe(0)
    expect(r.totalDissipated).toBe(0)
  })

  it('yields, dissipates energy and reports which hinges formed', () => {
    const r = nonlinearFrameDynamic(run(40, 6))!
    expect(r.converged).toBe(true)
    expect(r.yieldedHinges).toBeGreaterThan(0)
    expect(r.totalDissipated).toBeGreaterThan(0)
    for (const h of r.hinges) expect(Math.abs(h.moment)).toBeLessThan(40 * 1.5)
  })

  it('yielding cuts the base shear below the elastic demand', () => {
    const el = nonlinearFrameDynamic(run(Infinity, 6))!
    const inel = nonlinearFrameDynamic(run(40, 6))!
    expect(inel.peakBaseShear).toBeLessThan(el.peakBaseShear)
  })

  it('a weaker frame shows more hinging and larger plastic rotation demand', () => {
    // NOTE: dissipated ENERGY is deliberately not asserted here. E ≈ Mp × plastic
    // rotation, and over this range Mp shrinks faster than the rotation grows, so
    // the STRONGER frame can dissipate more — the same non-monotonicity already
    // documented in nonlinearTimeHistory. Plastic rotation demand is the robust
    // ordering, exactly as ductility was there.
    const strong = nonlinearFrameDynamic(run(120, 6))!
    const weak = nonlinearFrameDynamic(run(30, 6))!
    const maxPlastic = (r: typeof weak) => Math.max(...r.hinges.map((h) => Math.abs(h.plastic)))
    expect(weak.yieldedHinges).toBeGreaterThanOrEqual(strong.yieldedHinges)
    expect(maxPlastic(weak)).toBeGreaterThan(maxPlastic(strong))
    expect(weak.totalDissipated).toBeGreaterThan(0)
  })

  it('returns null for an empty record or a massless frame', () => {
    expect(nonlinearFrameDynamic({ ...run(60, 4), ag: [] })).toBeNull()
    expect(nonlinearFrameDynamic({ ...run(60, 4), mass: {} })).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────
// THE ENVELOPE — what a "yielded" hinge actually reached.
//
// The report's moment/rotation are the state the record ENDS in, but `yielded`
// is true if the hinge yielded at any step. A 2×2-bay 5-storey frame printed
// "yielded at −8.3 kN·m, θp 0.0" for a beam end that met its 617 kN·m capacity
// at 0.85 s and then rang down. The envelope carries the demand that made it
// yield.
// ─────────────────────────────────────────────────────────────────────────
describe('nonlinearFrameDynamic — whole-record hinge envelope', () => {
  // a strong 0.4 s pulse, then 3.6 s of free vibration that rings down
  const pulse = (amp: number) => Array.from({ length: n }, (_, i) => (i * dt < 0.4 ? amp * Math.sin(12 * i * dt) : 0))
  const Mp = 40
  const r = nonlinearFrameDynamic({ ...run(Mp, 0), ag: pulse(8) })!
  const yielded = r.hinges.filter((h) => h.yielded)

  it('a yielded hinge peaked AT its capacity, and says when it first yielded', () => {
    expect(yielded.length).toBeGreaterThan(0)
    for (const h of yielded) {
      const e = h.envelope!
      expect(e.capacity).toBeCloseTo(Mp, 9)                      // no P–M on this frame
      // bilinear: at yield |M| = Fy, above it only the (tiny) hardening slope
      expect(Math.abs(e.peakMoment)).toBeGreaterThanOrEqual(Mp * (1 - 1e-6))
      expect(Math.abs(e.peakMoment)).toBeLessThan(Mp * 1.05)
      expect(e.firstYield).not.toBeNull()
      expect(e.firstYield!).toBeGreaterThan(0)
      expect(e.firstYield!).toBeLessThanOrEqual(e.time + 1e-12 + 0.4)
      expect(e.maxPlastic).toBeGreaterThan(0)
      expect(e.maxPlastic).toBeGreaterThanOrEqual(Math.abs(h.plastic) - 1e-15)
    }
  })

  it('…while the moment it ENDS on is a residual below that peak — the number the table used to print', () => {
    // After the pulse the frame rings down. What is left is partly free
    // vibration and partly the self-equilibrating moment a yielded
    // indeterminate frame keeps, so it need not decay to zero — here it is
    // ~85 % of Mp — but it is never the demand that caused the yield.
    for (const h of yielded) {
      expect(Math.abs(h.moment)).toBeLessThan(Math.abs(h.envelope!.peakMoment) * (1 - 1e-3))
    }
  })

  it('a hinge that never yields has no first-yield time and peaks below capacity', () => {
    const el = nonlinearFrameDynamic(run(400, 0.2))!
    for (const h of el.hinges) {
      expect(h.yielded).toBe(false)
      expect(h.envelope!.firstYield).toBeNull()
      expect(Math.abs(h.envelope!.peakMoment)).toBeLessThan(h.envelope!.capacity)
      expect(h.envelope!.maxPlastic).toBe(0)
    }
  })
})
