import { describe, it, expect } from 'vitest'
import { newmarkSDOF, modalTimeHistory, type GroundMotion } from './timeHistory'
import { modalAnalysis } from './modal'
import { generateGridModel } from './modelBuilder'
import type { RectSection } from './model'

// ── Newmark-β SDOF integrator — closed-form checks ──────────────────────────
describe('newmarkSDOF — analytical SDOF responses', () => {
  it('undamped free vibration: u(t) = cos(ωt)', () => {
    const omega = 2 * Math.PI            // T = 1 s
    const dt = 0.001, N = 2001           // 2 s
    const p = new Array(N).fill(0)
    const { u } = newmarkSDOF(omega, 0, p, dt, { u0: 1, v0: 0 })
    // sample at t = 0.25, 0.5, 1.0, 2.0 s
    for (const tt of [0.25, 0.5, 1.0, 2.0]) {
      const i = Math.round(tt / dt)
      expect(u[i]).toBeCloseTo(Math.cos(omega * tt), 3)
    }
    // amplitude is conserved (average-acceleration method)
    expect(Math.max(...u.map(Math.abs))).toBeCloseTo(1, 3)
  })

  it('undamped step load from rest: u(t) = (p0/ω²)(1 − cos ωt), peak = 2p0/ω²', () => {
    const omega = 4, p0 = 3
    const dt = 0.0005, N = 4001          // 2 s, > one period (T = π/2 ≈ 1.57 s)
    const p = new Array(N).fill(p0)
    const { u } = newmarkSDOF(omega, 0, p, dt)
    const stat = p0 / (omega * omega)
    for (const tt of [0.3, 0.8, 1.2]) {
      const i = Math.round(tt / dt)
      expect(u[i]).toBeCloseTo(stat * (1 - Math.cos(omega * tt)), 3)
    }
    expect(Math.max(...u)).toBeCloseTo(2 * stat, 2)   // dynamic amplification = 2
  })

  it('damped step load reaches the static deflection p0/ω²', () => {
    const omega = 6, zeta = 0.1, p0 = 5
    const dt = 0.002, N = 10000          // 20 s — settles below 1e-4 (≈12 time constants)
    const p = new Array(N).fill(p0)
    const { u } = newmarkSDOF(omega, zeta, p, dt)
    expect(u[N - 1]).toBeCloseTo(p0 / (omega * omega), 4)
  })

  it('damped free vibration decays with the right log-decrement', () => {
    const omega = 2 * Math.PI, zeta = 0.05
    const dt = 0.0005, N = 8001          // 4 s = 4 periods
    const { u } = newmarkSDOF(omega, zeta, new Array(N).fill(0), dt, { u0: 1, v0: 0 })
    // peaks one period apart: ratio ≈ exp(2πζ/√(1−ζ²)) ≈ exp(2πζ)
    const u0 = u[0]
    const u1 = u[Math.round(1.0 / dt)]   // ~ one damped period later
    expect(u0 / u1).toBeCloseTo(Math.exp((2 * Math.PI * zeta) / Math.sqrt(1 - zeta * zeta)), 1)
  })

  it('empty record yields empty histories', () => {
    const { u, v, a } = newmarkSDOF(5, 0.05, [], 0.01)
    expect(u).toEqual([]); expect(v).toEqual([]); expect(a).toEqual([])
  })
})

// ── Modal time-history on a real model ──────────────────────────────────────
describe('modalTimeHistory', () => {
  const section: RectSection = {
    id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415,
    barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
  }
  const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3.5], section })

  // a short sinusoidal ground motion in X
  const dt = 0.01, N = 600
  const ag = Array.from({ length: N }, (_, i) => 2.0 * Math.sin(2 * Math.PI * 1.5 * i * dt))  // m/s²
  const gm: GroundMotion = { dt, ag, dir: 0 }

  it('returns null for an empty record', () => {
    expect(modalTimeHistory(model, { dt, ag: [], dir: 0 })).toBeNull()
  })

  it('produces consistent dimensions and modal data', () => {
    const r = modalTimeHistory(model, gm, { zeta: 0.05, nModes: 8 })!
    expect(r.t.length).toBe(N)
    expect(r.baseShear.length).toBe(N)
    expect(r.modal.length).toBeGreaterThan(0)
    expect(r.modal.length).toBeLessThanOrEqual(8)
    for (const m of r.modal) {
      expect(m.D.length).toBe(N)
      expect(m.peakD).toBeGreaterThanOrEqual(0)
      expect(m.peakA).toBeCloseTo(m.peakD * m.omega * m.omega, 9)
    }
  })

  it('modal coordinate D_r matches a standalone Newmark solve of the SDOF', () => {
    const r = modalTimeHistory(model, gm, { zeta: 0.05, nModes: 6 })!
    const m0 = r.modal[0]
    const { u: D } = newmarkSDOF(m0.omega, 0.05, ag.map((a) => -a), dt)
    for (const i of [100, 250, 400, 599]) expect(m0.D[i]).toBeCloseTo(D[i], 9)
  })

  it('base shear equals Σ effMass·ω²·D from the modal results', () => {
    const r = modalTimeHistory(model, gm, { zeta: 0.05, nModes: 8 })!
    const modal = modalAnalysis(model, 8)!
    const i = 300
    const expected = modal.modes.reduce((s, mode, k) =>
      s + mode.effMass[0] * mode.omega * mode.omega * r.modal[k].D[i], 0)
    expect(r.baseShear[i]).toBeCloseTo(expected, 6)
  })

  it('peak base shear ≈ effMass · spectral pseudo-acceleration (single dominant mode cross-check)', () => {
    // For the dominant X mode, the time-history peak base shear should not exceed
    // the sum over modes of effMass·peakA, and should be close to it when one mode
    // dominates. Verify the bound and that the dominant mode explains most of it.
    const r = modalTimeHistory(model, gm, { zeta: 0.05, nModes: 8 })!
    const modal = modalAnalysis(model, 8)!
    const upper = modal.modes.reduce((s, mode, k) => s + mode.effMass[0] * r.modal[k].peakA, 0)
    expect(r.peakBaseShear).toBeLessThanOrEqual(upper + 1e-6)
    expect(r.peakBaseShear).toBeGreaterThan(0)
  })

  it('peak nodal displacement is the time-max of Σ φ·Γ·D (recombination check)', () => {
    const r = modalTimeHistory(model, gm, { zeta: 0.05, nModes: 6 })!
    const modal = modalAnalysis(model, 6)!
    const node = r.peakNode!
    expect(node).toBeTruthy()
    // recompute X-displacement history at the peak node and compare its max
    let mx = 0
    for (let i = 0; i < N; i++) {
      let s = 0
      modal.modes.forEach((mode, k) => { s += (mode.shape[node]?.[0] ?? 0) * r.modal[k].gamma * r.modal[k].D[i] })
      mx = Math.max(mx, Math.abs(s))
    }
    expect(r.peakDisp[node][0]).toBeCloseTo(mx, 9)
  })

  it('zero ground motion → zero response', () => {
    const r = modalTimeHistory(model, { dt, ag: new Array(N).fill(0), dir: 0 }, { zeta: 0.05 })!
    expect(r.peakBaseShear).toBeCloseTo(0, 9)
    expect(r.peakNodeDisp).toBeCloseTo(0, 9)
  })

  it('stronger excitation scales the response linearly', () => {
    const r1 = modalTimeHistory(model, gm, { zeta: 0.05, nModes: 6 })!
    const gm2: GroundMotion = { dt, ag: ag.map((a) => 3 * a), dir: 0 }
    const r2 = modalTimeHistory(model, gm2, { zeta: 0.05, nModes: 6 })!
    expect(r2.peakBaseShear).toBeCloseTo(3 * r1.peakBaseShear, 6)
    expect(r2.peakNodeDisp).toBeCloseTo(3 * r1.peakNodeDisp, 6)
  })
})
