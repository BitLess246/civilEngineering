import { describe, expect, it } from 'vitest'
import {
  geomAt, manningQ, normalDepth, criticalDepth, criticalDepthRect, specificEnergy,
  froude, hydraulicJump, rectJumpLoss, circularPeakCapacity, momentum,
  type ChannelShape,
} from './openChannel'

const near = (a: number, b: number, tol = 1e-9) => expect(Math.abs(a - b)).toBeLessThan(tol)

const RECT: ChannelShape = { kind: 'rect', b: 2 }
const TRAP: ChannelShape = { kind: 'trap', b: 2, z: 2 }
const TRI: ChannelShape = { kind: 'tri', z: 2 }
const CIRC: ChannelShape = { kind: 'circle', D: 2 }

describe('section geometry', () => {
  it('rectangle: A, P, T, R, Dh', () => {
    const g = geomAt(RECT, 1)
    near(g.A, 2); near(g.P, 4); near(g.T, 2); near(g.R, 0.5); near(g.Dh, 1)
  })
  it('trapezoid b=2 z=2 y=1: A=4, P=2+2√5, T=6', () => {
    const g = geomAt(TRAP, 1)
    near(g.A, 4); near(g.P, 2 + 2 * Math.sqrt(5)); near(g.T, 6)
    near(g.R, 4 / (2 + 2 * Math.sqrt(5)), 1e-12)
  })
  it('triangle z=2 y=1: A=2, P=2√5, T=4', () => {
    const g = geomAt(TRI, 1)
    near(g.A, 2); near(g.P, 2 * Math.sqrt(5)); near(g.T, 4)
  })
  it('circle half full: A = πD²/8, P = πD/2, T = D', () => {
    const g = geomAt(CIRC, 1)
    near(g.A, Math.PI / 2, 1e-12)
    near(g.P, Math.PI, 1e-12)
    near(g.T, 2, 1e-12)
  })
  it('circle full: no free surface, full area and perimeter', () => {
    const g = geomAt(CIRC, 2)
    near(g.A, Math.PI, 1e-12)
    near(g.P, 2 * Math.PI, 1e-12)
    expect(g.T).toBe(0)
  })
})

describe('Manning flow and normal depth', () => {
  it('rect b=2, y=1, n=0.013, S=0.001 → Q = 3.0648 m³/s', () => {
    near(manningQ(RECT, 1, 0.013, 0.001), 3.0648, 1e-3)
  })
  it('normal depth round-trips Manning to machine precision (rect)', () => {
    const yn = normalDepth(RECT, 3.0648, 0.013, 0.001)
    near(yn, 1.0, 1e-4)
    near(manningQ(RECT, yn, 0.013, 0.001), 3.0648, 1e-8)
  })
  it('trapezoid round trip', () => {
    const Q = manningQ(TRAP, 0.75, 0.014, 0.0005)
    const yn = normalDepth(TRAP, Q, 0.014, 0.0005)
    near(yn, 0.75, 1e-6)
  })
  it('deeper-than-wide narrow rect still solves (bracket expansion)', () => {
    const yn = normalDepth({ kind: 'rect', b: 0.3 }, 10, 0.014, 0.001)
    expect(yn).toBeGreaterThan(3)
    near(manningQ({ kind: 'rect', b: 0.3 }, yn, 0.014, 0.001), 10, 1e-7)
  })
  it('circular pipe: half-full capacity matches the closed pipe form', () => {
    // Q at y = D/2 = (1/n)(πD²/8)(D/4)^(2/3)√S
    const D = 1
    const Qhalf = (1 / 0.013) * (Math.PI / 8) * Math.pow(0.25, 2 / 3) * Math.sqrt(0.001)
    const yn = normalDepth({ kind: 'circle', D }, Qhalf, 0.013, 0.001)
    near(yn, 0.5, 1e-6)
  })
  it('circular peak capacity sits near y/D = 0.938 and exceeds full-flow capacity', () => {
    const { Qmax, yPeak } = circularPeakCapacity(1, 0.013, 0.001)
    near(yPeak, 0.938, 0.002)
    const Qfull = (1 / 0.013) * (Math.PI / 4) * Math.pow(0.25, 2 / 3) * Math.sqrt(0.001)
    expect(Qmax / Qfull).toBeGreaterThan(1.07)
    expect(Qmax / Qfull).toBeLessThan(1.08)
  })
  it('rejects a discharge beyond the circular peak capacity', () => {
    // D = 1 pipe peaks at ≈ 0.816 m³/s; 0.9 asks for the impossible
    expect(() => normalDepth({ kind: 'circle', D: 1 }, 0.9, 0.013, 0.001)).toThrow(/peak Manning capacity/)
  })
  it('refuses non-positive inputs', () => {
    expect(() => normalDepth(RECT, 0, 0.013, 0.001)).toThrow()
    expect(() => normalDepth(RECT, 1, 0.013, 0)).toThrow(/slope/)
  })
})

describe('critical depth and Froude', () => {
  it('rectangular closed form: Q=3, b=2 → yc = 0.6121', () => {
    near(criticalDepthRect(3, 2), 0.61213, 1e-4)
    near(criticalDepth(RECT, 3), criticalDepthRect(3, 2), 1e-6)
  })
  it('minimum specific energy of a rectangle is 1.5·yc', () => {
    const yc = criticalDepthRect(3, 2)
    near(specificEnergy(RECT, yc, 3), 1.5 * yc, 1e-6)
  })
  it('Froude number is 1 at critical depth', () => {
    near(froude(TRAP, criticalDepth(TRAP, 3), 3), 1, 1e-6)
    near(froude(CIRC, criticalDepth(CIRC, 0.5), 0.5), 1, 1e-6)
  })
  it('trapezoid critical depth agrees with an independent scan', () => {
    const yc = criticalDepth(TRAP, 3)
    // f(y) = Q²T/(gA³) − 1 must cross zero here
    const f = (y: number) => 9 * geomAt(TRAP, y).T / (9.81 * Math.pow(geomAt(TRAP, y).A, 3)) - 1
    expect(f(yc)).toBeLessThan(1e-9)
    expect(f(yc - 1e-4)).toBeGreaterThan(0)
    expect(f(yc + 1e-4)).toBeLessThan(0)
  })
})

describe('hydraulic jump', () => {
  it('rectangle: Q=3, b=2, y1=0.5 → Fr1=1.3546, y2=0.73991', () => {
    const j = hydraulicJump(RECT, 3, 0.5)
    near(j.Fr1, 1.35457, 1e-4)
    near(j.y2, 0.73991, 1e-4)
    expect(j.closedForm).toBe(true)
    near(j.dE, rectJumpLoss(0.5, j.y2), 1e-12)
  })
  it('momentum is conserved on both sides (general shapes too)', () => {
    const j = hydraulicJump(TRAP, 3, 0.4)
    near(momentum(TRAP, j.y2, 3), momentum(TRAP, 0.4, 3), 1e-7)
    expect(j.y2).toBeGreaterThan(criticalDepth(TRAP, 3))
    expect(j.closedForm).toBe(false)
  })
  it('circular jump conserves momentum', () => {
    const j = hydraulicJump(CIRC, 0.8, 0.2)
    near(momentum(CIRC, j.y2, 0.8), momentum(CIRC, 0.2, 0.8), 1e-6)
  })
  it('dissipated power = γ·Q·ΔE', () => {
    const j = hydraulicJump(RECT, 3, 0.5)
    near(j.powerKW, 9.81 * 3 * j.dE, 1e-12)
  })
  it('jump length uses the classical 6.1·y₂ average', () => {
    const j = hydraulicJump(RECT, 3, 0.5)
    near(j.Lj, 6.1 * j.y2, 1e-12)
  })
  it('a subcritical approach flow cannot jump', () => {
    expect(() => hydraulicJump(RECT, 3, 1.2)).toThrow(/subcritical/)
  })
  it('Fr₁ = 2 classic: y2 = 1.186 for y1 = 0.5 (rect)', () => {
    // choose Q so Fr1 = 2: Fr1² = Q²b/(g(b·y1)³) → Q = y1·b·√(2²·g·y1/b)
    const b = 1, y1 = 0.5
    const Q = y1 * b * Math.sqrt(4 * 9.81 * y1 / b)
    const j = hydraulicJump({ kind: 'rect', b }, Q, y1)
    near(j.Fr1, 2, 1e-9)
    near(j.y2, 0.5 * (Math.sqrt(1 + 32) - 1) / 2, 1e-9)
  })
})
