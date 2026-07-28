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
