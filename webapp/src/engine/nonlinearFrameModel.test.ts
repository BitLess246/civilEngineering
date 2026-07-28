import { describe, it, expect } from 'vitest'
import {
  equivalentPlaneFrame, equivalentFramePeriod, frameInputOf, runNonlinearFrameModel,
} from './nonlinearFrameModel'
import { modalAnalysis, buildSeismicMass } from './modal'
import { generateGridModel } from './modelBuilder'
import { nonlinearFrame } from './nonlinearFrame'
import type { RectSection } from './model'
import type { GroundMotion } from './timeHistory'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const grid = (storeyH: number[], baysZ = [5]) =>
  generateGridModel({ baysX: [6, 6], baysZ, storeyH, section, slabThickness: 150 })

describe('nonlinearFrameModel — condensing 3D to an equivalent plane frame', () => {
  const model = grid([3, 3, 3])
  const eq = equivalentPlaneFrame(model, { dir: 'x' })!

  it('collapses the perpendicular coordinate onto one frame line', () => {
    // 3 x-positions × 4 levels = 12 planar nodes, from 3×2×4 = 24 3D nodes
    expect(eq.nodes).toHaveLength(12)
    expect(eq.framesCombined).toBe(2)                 // two frame lines at z = 0, 5
    expect(model.nodes.length).toBe(24)
  })

  it('drops transverse members and keeps the in-plane ones', () => {
    expect(eq.transverseDropped).toBeGreaterThan(0)
    // every kept member must span two DISTINCT planar nodes
    for (const m of eq.members) expect(m.i).not.toBe(m.j)
  })

  it('preserves the total seismic mass', () => {
    const total3d = [...buildSeismicMass(model).values()].reduce((a, b) => a + b, 0)
    const total2d = Object.values(eq.mass).reduce((a, b) => a + b, 0)
    // base-level mass sits on supported nodes and is carried through too
    expect(total2d).toBeCloseTo(total3d, 6)
  })

  it('sums stiffness and capacity across the combined parallel frames', () => {
    const single = equivalentPlaneFrame(grid([3], [5]), { dir: 'x' })!    // 2 frame lines
    const triple = equivalentPlaneFrame(grid([3], [5, 5]), { dir: 'x' })! // 3 frame lines
    const col = (e: typeof single) => e.members.find((m) => m.i.split('|')[0] === m.j.split('|')[0])!
    expect(triple.framesCombined).toBe(3)
    // one more parallel frame ⇒ 3/2 the stiffness and 3/2 the capacity
    expect(col(triple).I / col(single).I).toBeCloseTo(1.5, 6)
    expect(col(triple).Mp! / col(single).Mp!).toBeCloseTo(1.5, 6)
  })

  it('marks the roof node as the control node and keeps the supports', () => {
    const maxY = Math.max(...eq.nodes.map((n) => n.y))
    expect(eq.nodes.find((n) => n.id === eq.controlNode)!.y).toBe(maxY)
    expect(eq.supports.length).toBeGreaterThan(0)
    for (const s of eq.supports) expect(s.type).toBe('fixed')
  })

  it('returns null when nothing lies in the loading plane', () => {
    const m = grid([3])
    m.members = []
    expect(equivalentPlaneFrame(m, { dir: 'x' })).toBeNull()
  })
})

// ── the decisive check: the condensation must keep the real dynamics ──
describe('nonlinearFrameModel — equivalent period vs the full 3D modal T₁', () => {
  it('lands within 10% for 1-, 2- and 3-storey frames', () => {
    for (const storeyH of [[3], [3, 3], [3, 3, 3]]) {
      const model = grid(storeyH)
      const T = equivalentFramePeriod(equivalentPlaneFrame(model, { dir: 'x' })!)
      const T1 = modalAnalysis(model, 6)!.modes[0].period
      expect(T).toBeGreaterThan(0)
      expect(Math.abs(T - T1) / T1).toBeLessThan(0.10)
    }
  })

  it('period grows with height', () => {
    const t = [[3], [3, 3], [3, 3, 3]].map((h) =>
      equivalentFramePeriod(equivalentPlaneFrame(grid(h), { dir: 'x' })!))
    expect(t[1]).toBeGreaterThan(t[0])
    expect(t[2]).toBeGreaterThan(t[1])
  })
})

describe('nonlinearFrameModel — analyses on the condensed frame', () => {
  const model = grid([3, 3])
  const dt = 0.005, n = 700
  const gm = (amp: number): GroundMotion => ({
    dt, dir: 0,
    ag: Array.from({ length: n }, (_, i) => amp * Math.sin(14 * i * dt) * Math.exp(-0.3 * i * dt)),
  })

  it('runs a nonlinear time history and reports the frame + period', () => {
    const r = runNonlinearFrameModel(model, gm(4), { zeta: 0.05 })!
    expect(r).toBeTruthy()
    expect(r.period).toBeGreaterThan(0)
    expect(r.response.converged).toBe(true)
    expect(r.response.hinges.length).toBe(r.frame.members.length * 2)
    expect(r.response.peakDisp).toBeGreaterThan(0)
  })

  it('an elastic reference run never yields', () => {
    const r = runNonlinearFrameModel(model, gm(4), { elastic: true })!
    expect(r.response.yieldedHinges).toBe(0)
    expect(r.response.totalDissipated).toBe(0)
  })

  it('a strong record hinges the frame and cuts base shear below elastic', () => {
    const el = runNonlinearFrameModel(model, gm(12), { elastic: true })!
    const inel = runNonlinearFrameModel(model, gm(12))!
    expect(inel.response.yieldedHinges).toBeGreaterThan(0)
    expect(inel.response.totalDissipated).toBeGreaterThan(0)
    expect(inel.response.peakBaseShear).toBeLessThan(el.response.peakBaseShear)
  })

  it('the same condensed frame also pushes over statically', () => {
    const eq = equivalentPlaneFrame(model, { dir: 'x' })!
    const push = nonlinearFrame({
      ...frameInputOf(eq),
      loads: [{ node: eq.controlNode, Fx: 1 }],
      lambdaMax: 4000, steps: 400,
    })!
    expect(push.steps.length).toBeGreaterThan(0)
    expect(push.steps.some((s) => s.hinges > 0)).toBe(true)   // it does reach yield
  })

  it('returns null for an empty record', () => {
    expect(runNonlinearFrameModel(model, { dt, dir: 0, ag: [] })).toBeNull()
  })
})
