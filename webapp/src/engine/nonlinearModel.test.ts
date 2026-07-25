import { describe, it, expect } from 'vitest'
import { storeyReduction, reducedPeriod, runNonlinearModel } from './nonlinearModel'
import { modalAnalysis } from './modal'
import { generateGridModel } from './modelBuilder'
import type { RectSection, StructuralModel } from './model'
import type { GroundMotion } from './timeHistory'

const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const frame = (storeyH: number[]): StructuralModel =>
  generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH, section, slabThickness: 150 })

describe('nonlinearModel — storey reduction', () => {
  const model = frame([3, 3, 3])
  const st = storeyReduction(model, { dir: 'x' })!

  it('produces one storey entry per framed level, bottom-up', () => {
    expect(st).toHaveLength(3)
    expect(st.map((s) => s.storey)).toEqual([1, 2, 3])
    expect(st.map((s) => s.elevation)).toEqual([3, 6, 9])
    for (const s of st) expect(s.h).toBeCloseTo(3, 9)
  })

  it('gives every storey a positive mass, stiffness and capacity', () => {
    for (const s of st) {
      expect(s.mass).toBeGreaterThan(0)
      expect(s.k0).toBeGreaterThan(0)
      expect(Number.isFinite(s.k0)).toBe(true)
      expect(s.Fy).toBeGreaterThan(0)
      expect(s.columns).toBe(6)            // 3×2 grid of columns
    }
  })

  it('storey stiffness decreases with height (upper storeys are less restrained)', () => {
    expect(st[0].k0).toBeGreaterThan(st[1].k0)
    expect(st[1].k0).toBeGreaterThan(st[2].k0)
  })

  it('capacity follows the shear-type mechanism Σ 2·Mp/h', () => {
    // uniform columns and storey heights ⇒ identical capacity in every storey
    expect(st[1].Fy).toBeCloseTo(st[0].Fy, 6)
    expect(st[2].Fy).toBeCloseTo(st[0].Fy, 6)
    // and it scales inversely with storey height
    const tall = storeyReduction(frame([6]), { dir: 'x' })!
    const short = storeyReduction(frame([3]), { dir: 'x' })!
    expect(tall[0].Fy).toBeCloseTo(short[0].Fy / 2, 6)
  })

  it('returns null for a model with no framed levels', () => {
    const empty = frame([3])
    empty.storeys = []
    expect(storeyReduction(empty)).toBeNull()
  })
})

// ── the decisive check: the reduction must reproduce the real dynamics ──
describe('nonlinearModel — reduced period vs the full 3D modal period', () => {
  it('lands within 10% of modal T₁ for 1-, 2- and 3-storey frames', () => {
    for (const storeyH of [[3], [3, 3], [3, 3, 3]]) {
      const model = frame(storeyH)
      const st = storeyReduction(model, { dir: 'x' })!
      const T = reducedPeriod(st)
      const T1 = modalAnalysis(model, 6)!.modes[0].period
      expect(T).toBeGreaterThan(0)
      expect(Math.abs(T - T1) / T1).toBeLessThan(0.10)
    }
  })

  it('period grows with the number of storeys', () => {
    const t = [[3], [3, 3], [3, 3, 3]].map((h) => reducedPeriod(storeyReduction(frame(h), { dir: 'x' })!))
    expect(t[1]).toBeGreaterThan(t[0])
    expect(t[2]).toBeGreaterThan(t[1])
  })
})

describe('nonlinearModel — response history', () => {
  const model = frame([3, 3, 3])
  const dt = 0.005, n = 1200
  // resonant-ish record; amplitude chosen to drive the frame past storey yield
  const gmAt = (amp: number): GroundMotion => ({
    dt, dir: 0,
    ag: Array.from({ length: n }, (_, i) => amp * Math.sin(15.3 * i * dt) * Math.exp(-0.25 * i * dt)),
  })

  it('carries the reduction, the period and a converged response', () => {
    const r = runNonlinearModel(model, gmAt(3.0))!
    expect(r).toBeTruthy()
    expect(r.storeys).toHaveLength(3)
    expect(r.period).toBeGreaterThan(0)
    expect(r.rayleigh.alpha).toBeGreaterThan(0)
    expect(r.response.converged).toBe(true)
    expect(r.response.peak.every((p) => Number.isFinite(p) && p >= 0)).toBe(true)
  })

  it('the elastic reference run never yields or dissipates', () => {
    const r = runNonlinearModel(model, gmAt(3.0), { elastic: true })!
    expect(r.response.yielded).toBe(false)
    expect(r.response.totalDissipated).toBe(0)
  })

  it('a strong record yields the frame and dissipates energy', () => {
    const r = runNonlinearModel(model, gmAt(3.0))!
    expect(r.response.yielded).toBe(true)
    expect(r.response.totalDissipated).toBeGreaterThan(0)
    expect(Math.max(...r.response.ductility)).toBeGreaterThan(1)
  })

  it('yielding caps the base force below the elastic demand', () => {
    const inel = runNonlinearModel(model, gmAt(3.0))!
    const el = runNonlinearModel(model, gmAt(3.0), { elastic: true })!
    expect(inel.response.peakBaseForce).toBeLessThan(el.response.peakBaseForce)
    // the ground-storey spring cannot exceed its capacity by more than hardening
    expect(inel.response.peakBaseForce).toBeLessThan(inel.storeys[0].Fy * 1.5)
  })

  it('a weak record keeps the frame elastic', () => {
    const r = runNonlinearModel(model, gmAt(0.05))!
    expect(r.response.yielded).toBe(false)
    expect(r.response.totalDissipated).toBe(0)
  })

  it('returns null for an empty record', () => {
    expect(runNonlinearModel(model, { dt, dir: 0, ag: [] })).toBeNull()
  })
})
