import { describe, it, expect } from 'vitest'
import {
  rayleighCoeffs, rayleighZeta, newmarkDirect, directTimeHistory,
} from './directTimeHistory'
import { newmarkSDOF, modalTimeHistory, type GroundMotion } from './timeHistory'
import { jacobiEigen } from './modal'
import { generateGridModel } from './modelBuilder'
import type { RectSection } from './model'

// ── Rayleigh coefficients ───────────────────────────────────────────────
describe('directTimeHistory — Rayleigh damping model', () => {
  it('reproduces the two target damping ratios exactly', () => {
    const w1 = 2.0, w2 = 9.0, z1 = 0.05, z2 = 0.05
    const c = rayleighCoeffs(w1, z1, w2, z2)
    expect(rayleighZeta(c, w1)).toBeCloseTo(z1, 12)
    expect(rayleighZeta(c, w2)).toBeCloseTo(z2, 12)
  })

  it('supports unequal anchor ratios', () => {
    const c = rayleighCoeffs(3, 0.02, 20, 0.07)
    expect(rayleighZeta(c, 3)).toBeCloseTo(0.02, 12)
    expect(rayleighZeta(c, 20)).toBeCloseTo(0.07, 12)
  })

  it('dips below the target between the anchors and rises outside them', () => {
    const c = rayleighCoeffs(2, 0.05, 10, 0.05)
    expect(rayleighZeta(c, 5)).toBeLessThan(0.05)        // classic Rayleigh sag
    expect(rayleighZeta(c, 25)).toBeGreaterThan(0.05)    // stiff modes over-damped
    expect(rayleighZeta(c, 0.5)).toBeGreaterThan(0.05)   // soft modes over-damped
  })

  it('α alone gives mass-proportional damping ζ = α/2ω', () => {
    const c = { alpha: 0.4, beta: 0 }
    expect(rayleighZeta(c, 4)).toBeCloseTo(0.05, 12)
  })
})

// ── the pure integrator vs the validated SDOF routine ───────────────────
describe('directTimeHistory — newmarkDirect on a 1-DOF system', () => {
  const omega = 3.0, zeta = 0.05, dt = 0.01, n = 400
  const p = Array.from({ length: n }, (_, i) => Math.sin(2.0 * i * dt))

  it('matches newmarkSDOF step for step', () => {
    const r = newmarkDirect([[1]], [[2 * zeta * omega]], [[omega * omega]], p.map((x) => [x]), dt)!
    const s = newmarkSDOF(omega, zeta, p, dt)
    expect(r.steps).toBe(n)
    for (let i = 0; i < n; i += 25) expect(r.u[i][0]).toBeCloseTo(s.u[i], 10)
    expect(r.u[n - 1][0]).toBeCloseTo(s.u[n - 1], 10)
  })

  it('free vibration decays at the logarithmic decrement of ζ', () => {
    // released from u0 = 1 with no forcing: peaks decay by exp(−ζ·ω·T)
    const zeros = Array.from({ length: 3000 }, () => [0])
    const r = newmarkDirect([[1]], [[2 * zeta * omega]], [[omega * omega]], zeros, 0.002, { u0: [1] })!
    const T = (2 * Math.PI) / omega
    const idx = Math.round(T / 0.002)
    // one full cycle later the amplitude is exp(−2πζ/√(1−ζ²)) of the start
    const expected = Math.exp((-2 * Math.PI * zeta) / Math.sqrt(1 - zeta * zeta))
    expect(r.u[idx][0]).toBeCloseTo(expected, 3)
  })

  it('returns null when the effective stiffness is singular', () => {
    expect(newmarkDirect([[0]], [[0]], [[0]], [[1], [1]], 0.01)).toBeNull()
  })
})

// ── the decisive check: direct ≡ modal superposition under Rayleigh ─────
// With C = αM + βK the mode shapes diagonalize M, C and K simultaneously, and
// Newmark is a linear one-step method — so integrating the coupled system must
// reproduce the mode-by-mode SDOF integration to roundoff.
describe('directTimeHistory — direct integration ≡ modal superposition (2-DOF)', () => {
  // 2-storey shear building: m = 1 each, k = 1 each
  const M = [[1, 0], [0, 1]]
  const K = [[2, -1], [-1, 1]]
  const zeta = 0.04, dt = 0.01, n = 1200
  const ag = Array.from({ length: n }, (_, i) => Math.sin(1.3 * i * dt) * Math.exp(-0.3 * i * dt))

  // exact modes (M = I ⇒ standard eigenproblem); ω² = (3∓√5)/2
  const { values, vectors } = jacobiEigen(K)
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b])
  const omegas = order.map((i) => Math.sqrt(values[i]))
  const phis = order.map((i) => vectors[i])   // jacobiEigen returns modes as ROWS

  it('the eigen-solution matches the golden-ratio closed form', () => {
    expect(omegas[0]).toBeCloseTo(Math.sqrt((3 - Math.sqrt(5)) / 2), 10)
    expect(omegas[1]).toBeCloseTo(Math.sqrt((3 + Math.sqrt(5)) / 2), 10)
  })

  const ray = rayleighCoeffs(omegas[0], zeta, omegas[1], zeta)

  it('Rayleigh gives exactly ζ in BOTH modes (so the two paths are comparable)', () => {
    expect(rayleighZeta(ray, omegas[0])).toBeCloseTo(zeta, 12)
    expect(rayleighZeta(ray, omegas[1])).toBeCloseTo(zeta, 12)
  })

  it('agrees with mode-by-mode superposition to roundoff', () => {
    const C = [[ray.alpha * 1 + ray.beta * K[0][0], ray.beta * K[0][1]],
      [ray.beta * K[1][0], ray.alpha * 1 + ray.beta * K[1][1]]]
    const iota = [1, 1]
    const P = ag.map((g) => [-M[0][0] * iota[0] * g, -M[1][1] * iota[1] * g])
    const direct = newmarkDirect(M, C, K, P, dt)!

    // modal: q_r = Γ_r·D_r with D̈+2ζωḊ+ω²D = −a_g
    const p = ag.map((g) => -g)
    const modalU: number[][] = Array.from({ length: n }, () => [0, 0])
    for (let r = 0; r < 2; r++) {
      const phi = phis[r]
      const Mstar = phi[0] * phi[0] + phi[1] * phi[1]
      const L = phi[0] * iota[0] + phi[1] * iota[1]
      const G = L / Mstar
      const { u: D } = newmarkSDOF(omegas[r], zeta, p, dt)
      for (let i = 0; i < n; i++) {
        modalU[i][0] += phi[0] * G * D[i]
        modalU[i][1] += phi[1] * G * D[i]
      }
    }

    let peak = 0
    for (const row of modalU) peak = Math.max(peak, Math.abs(row[0]), Math.abs(row[1]))
    expect(peak).toBeGreaterThan(0.01)                 // the record actually excites it
    for (let i = 0; i < n; i += 17) {
      expect(direct.u[i][0]).toBeCloseTo(modalU[i][0], 9)
      expect(direct.u[i][1]).toBeCloseTo(modalU[i][1], 9)
    }
  })
})

// ── model-level driver ──────────────────────────────────────────────────
describe('directTimeHistory — model level', () => {
  const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section, slabThickness: 150 })
  const n = 500, dt = 0.02
  const gm: GroundMotion = {
    dt, dir: 0,
    ag: Array.from({ length: n }, (_, i) => 2.0 * Math.sin(6.0 * i * dt) * Math.exp(-0.15 * i * dt)),
  }

  it('runs the full free-DOF system and reports the Rayleigh anchors', () => {
    const r = directTimeHistory(model, gm, { zeta: 0.05, anchorModes: [1, 2] })!
    expect(r).toBeTruthy()
    expect(r.ndof).toBeGreaterThan(6)                    // full MDOF, not a modal subset
    expect(r.t).toHaveLength(n)
    expect(r.anchors).toHaveLength(2)
    for (const a of r.anchors) expect(a.zeta).toBeCloseTo(0.05, 10)
    expect(r.rayleigh.alpha).toBeGreaterThan(0)
    expect(r.rayleigh.beta).toBeGreaterThan(0)
  })

  it('produces finite peaks and a non-trivial base-shear history', () => {
    const r = directTimeHistory(model, gm, { zeta: 0.05 })!
    expect(Number.isFinite(r.peakNodeDisp)).toBe(true)
    expect(r.peakNodeDisp).toBeGreaterThan(0)
    expect(r.peakNode).toBeTruthy()
    expect(r.peakBaseShear).toBeGreaterThan(0)
    expect(r.baseShear).toHaveLength(n)
    expect(r.baseShear.every((v) => Number.isFinite(v))).toBe(true)
  })

  it('lands in the same ballpark as modal superposition', () => {
    const d = directTimeHistory(model, gm, { zeta: 0.05, anchorModes: [1, 2] })!
    const m = modalTimeHistory(model, gm, { zeta: 0.05, nModes: 12 })!
    // different damping models (Rayleigh ζ(ω) vs constant modal ζ) + mode
    // truncation ⇒ not identical, but the same order of magnitude
    expect(d.peakNodeDisp).toBeGreaterThan(0.2 * m.peakNodeDisp)
    expect(d.peakNodeDisp).toBeLessThan(5 * m.peakNodeDisp)
  })

  it('returns the requested node displacement history', () => {
    const top = model.nodes.reduce((b, nd) => (nd.y > b.y ? nd : b))
    const r = directTimeHistory(model, gm, { zeta: 0.05, historyNode: top.id })!
    expect(r.nodeHistory?.node).toBe(top.id)
    expect(r.nodeHistory?.u).toHaveLength(n)
    const peakX = Math.max(...r.nodeHistory!.u.map((u) => Math.abs(u[0])))
    expect(peakX).toBeCloseTo(r.peakDisp[top.id][0], 12)
  })

  it('heavier damping reduces the peak response', () => {
    const light = directTimeHistory(model, gm, { zeta: 0.02 })!
    const heavy = directTimeHistory(model, gm, { zeta: 0.15 })!
    expect(heavy.peakNodeDisp).toBeLessThan(light.peakNodeDisp)
  })

  it('returns null for an empty record', () => {
    expect(directTimeHistory(model, { dt: 0.02, dir: 0, ag: [] })).toBeNull()
  })
})
