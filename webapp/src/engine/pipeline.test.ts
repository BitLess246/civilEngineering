import { describe, it, expect } from 'vitest'
import { generateGridModel } from './modelBuilder'
import { designStructure } from './pipeline'
import type { RectSection } from './model'

const section: RectSection = { id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeModel() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
  m.loads = m.plates.flatMap((p) => [
    { kind: 'area' as const, plate: p.id, q: 4.8, cat: 'D' as const },
    { kind: 'area' as const, plate: p.id, q: 2.4, cat: 'L' as const },
  ])
  return m
}

describe('design pipeline — single-bay single-storey grid', () => {
  const r = designStructure(makeModel(), soil)!

  it('covers every element down the load path', () => {
    expect(r.govName).toContain('1.2D + 1.6L')
    expect(r.beams).toHaveLength(4)          // 2 beams + 2 girders
    expect(r.columns).toHaveLength(4)
    expect(r.footings).toHaveLength(4)
    expect(r.orphanEdges).toBe(0)
  })

  it('beams: every section designs cleanly with positive demands', () => {
    for (const b of r.beams) {
      expect(b.sections.length).toBeGreaterThanOrEqual(1)
      expect(b.ok).toBe(true)
      // the interior section of a loaded edge beam sags (+M)
      const interior = b.sections.find((s) => s.label.startsWith('Interior'))
      if (interior) expect(interior.Mu).toBeGreaterThan(0)
      for (const s of b.sections) expect(s.design.bars).toBeGreaterThanOrEqual(2)
    }
  })

  it('columns: Pu shares the floor load and the design closes', () => {
    const wu = 1.2 * 4.8 + 1.6 * 2.4                  // 9.6 kPa
    const total = wu * 6 * 5                          // 288 kN
    const sumPu = r.columns.reduce((s, c) => s + c.Pu, 0)
    // column axial sums to ≈ the floor load (members carry a bit of frame shear)
    expect(sumPu).toBeGreaterThan(total * 0.9)
    expect(sumPu).toBeLessThan(total * 1.1)
    for (const c of r.columns) {
      expect(c.ok).toBe(true)
      expect(c.bars).toBeGreaterThanOrEqual(4)
      expect(c.util).toBeLessThanOrEqual(1)
    }
  })

  it('footings: service P < Pu, plan sized, checks pass', () => {
    for (const f of r.footings) {
      expect(f.P).toBeLessThan(f.Pu)
      expect(f.design.B).toBeGreaterThan(0.5)
      expect(f.ok).toBe(true)
    }
    // factored reactions reproduce the floor load
    const sumPu = r.footings.reduce((s, f) => s + f.Pu, 0)
    expect(sumPu).toBeCloseTo(9.6 * 30, 1)
  })

  it('concrete totals: members + slab', () => {
    // 4 columns ×3 m + (2×6 + 2×5) m of beams = 12 + 22 = 34 m of 0.15 m² section
    expect(r.totals.concreteMembers).toBeCloseTo(34 * 0.3 * 0.5, 6)
    expect(r.totals.concreteSlabs).toBeCloseTo(6 * 5 * 0.15, 6)
  })
})
