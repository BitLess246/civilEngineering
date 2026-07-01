import { describe, it, expect } from 'vitest'
import { solveBoltedConnection } from './boltedConnection'
import type { BoltPos } from './steelDesign'

const square: BoltPos[] = [
  { id: 'B1', x: 0, y: 0 }, { id: 'B2', x: 100, y: 0 },
  { id: 'B3', x: 0, y: 100 }, { id: 'B4', x: 100, y: 100 },
]

describe('solveBoltedConnection — concentric load', () => {
  it('no eccentricity ⇒ every bolt carries the equal direct share P/N', () => {
    // vertical load through the centroid (50,50)
    const r = solveBoltedConnection({
      bolts: square, dia: 20, allowableStress: 150,
      load: { P: 40, angleDeg: -90, px: 50, py: 50 },
    })
    expect(r.ex).toBeCloseTo(0, 9); expect(r.ey).toBeCloseTo(0, 9)
    expect(r.T).toBeCloseTo(0, 9)
    for (const b of r.bolts) expect(b.R).toBeCloseTo(40 / 4, 6)   // 10 kN each
    expect(r.Rmax).toBeCloseTo(10, 6)
  })
})

describe('solveBoltedConnection — in-plane eccentricity (hand check)', () => {
  // 4 bolts at a 100×100 square; centroid (50,50); J = Σ(x²+y²) = 4·(50²+50²) = 20000.
  // Vertical load P = 100 kN at (150,50) ⇒ ex = 100, ey = 0, T = −100P.
  // Corner bolts at x = +50 govern: R = √(0.25² + 0.5²)·P = 0.559·P.
  const r = solveBoltedConnection({
    bolts: square, dia: 22, allowableStress: 150,
    load: { P: 100, angleDeg: -90, px: 150, py: 50 },
  })

  it('polar inertia J = Σ(x² + y²) about the centroid', () => {
    expect(r.J).toBeCloseTo(20000, 6)
    expect(r.ex).toBeCloseTo(100, 6)
    expect(r.T).toBeCloseTo(-100 * 100, 6)   // Py·ex, Py = −100 kN
  })

  it('most-loaded bolt R ≈ 0.559·P; least-loaded ≈ 0.25·P', () => {
    expect(r.Rmax).toBeCloseTo(55.9, 1)
    expect(r.Rmin).toBeCloseTo(25, 1)
    // the two right-hand bolts (x = 100) are critical
    expect(['B2', 'B4']).toContain(r.criticalId)
    expect(['B1', 'B3']).toContain(r.leastId)
  })

  it('max shear stress = Rmax/Ab and drives the allowable-P back-calc', () => {
    const Ab = (Math.PI / 4) * 22 * 22
    expect(r.tauMax).toBeCloseTo((r.Rmax * 1000) / Ab, 4)
    // maxP scales linearly: maxP = P · (τallow·Ab) / Rmax
    const cap = (150 * Ab) / 1000
    expect(r.maxP).toBeCloseTo((100 * cap) / r.Rmax, 4)
  })

  it('the load at an inclined angle splits into Px, Py components', () => {
    const inc = solveBoltedConnection({
      bolts: square, dia: 22, allowableStress: 150,
      load: { P: 80, angleDeg: -40, px: 200, py: 50 },
    })
    expect(inc.Px).toBeCloseTo(80 * Math.cos((-40 * Math.PI) / 180), 6)
    expect(inc.Py).toBeCloseTo(80 * Math.sin((-40 * Math.PI) / 180), 6)
    expect(inc.Rmax).toBeGreaterThan(inc.Rmin)
  })
})

describe('solveBoltedConnection — custom bolt pattern', () => {
  it('accepts an arbitrary (non-grid) bolt layout and finds the critical bolt', () => {
    const custom: BoltPos[] = [
      { id: 'A', x: 0, y: 0 }, { id: 'B', x: 60, y: 20 },
      { id: 'C', x: 30, y: 90 }, { id: 'D', x: 120, y: 60 },
    ]
    const r = solveBoltedConnection({
      bolts: custom, dia: 20, allowableStress: 150,
      load: { P: 50, angleDeg: -90, px: 200, py: 40 },
    })
    expect(r.bolts).toHaveLength(4)
    expect(r.Rmax).toBeGreaterThan(0)
    expect(r.criticalId).toMatch(/^[ABCD]$/)
    expect(r.maxP).toBeGreaterThan(0)
  })
})
