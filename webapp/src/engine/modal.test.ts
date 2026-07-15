import { describe, it, expect } from 'vitest'
import { jacobiEigen, buildSeismicMass, modalAnalysis, GRAVITY } from './modal'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D, type F3Load } from './frame3d'
import { generateGridModel } from './modelBuilder'
import { emptyModel, type RectSection, type StructuralModel } from './model'

const section: RectSection = {
  id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415,
  barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
}

// ── eigen-solver ────────────────────────────────────────────────────────────
describe('jacobiEigen — symmetric eigen-decomposition', () => {
  it('diagonalises a diagonal matrix', () => {
    const { values } = jacobiEigen([[2, 0], [0, 3]])
    expect(values.slice().sort((a, b) => a - b)).toEqual([2, 3])
  })

  it('matches the closed-form eigenpairs of [[2,1],[1,2]]', () => {
    const { values, vectors } = jacobiEigen([[2, 1], [1, 2]])
    expect(values.slice().sort((a, b) => a - b)[0]).toBeCloseTo(1, 9)
    expect(values.slice().sort((a, b) => a - b)[1]).toBeCloseTo(3, 9)
    // each eigenpair satisfies A v = λ v
    for (let k = 0; k < 2; k++) {
      const v = vectors[k], lam = values[k]
      const Av = [2 * v[0] + 1 * v[1], 1 * v[0] + 2 * v[1]]
      expect(Av[0]).toBeCloseTo(lam * v[0], 9)
      expect(Av[1]).toBeCloseTo(lam * v[1], 9)
    }
  })

  it('returns eigenvectors of unit length', () => {
    const { vectors } = jacobiEigen([[4, 1, 0], [1, 3, 1], [0, 1, 2]])
    for (const v of vectors) expect(Math.hypot(...v)).toBeCloseTo(1, 9)
  })
})

// ── mass assembly ─────────────────────────────────────────────────────────
describe('jacobiEigen — 2-storey shear building (textbook closed form)', () => {
  // Chopra, Dynamics of Structures: equal storey masses m and stiffnesses k →
  // K = [[2k, −k], [−k, k]], M = m·I. Eigenvalues ω² = (k/m)·(3 ∓ √5)/2.
  it('eigenvalues are k·(3 ∓ √5)/2 for m = 1', () => {
    const k = 250
    const { values } = jacobiEigen([[2 * k, -k], [-k, k]])
    const sorted = [...values].sort((a, b) => a - b)
    expect(sorted[0]).toBeCloseTo((k * (3 - Math.sqrt(5))) / 2, 8)
    expect(sorted[1]).toBeCloseTo((k * (3 + Math.sqrt(5))) / 2, 8)
    // frequency ratio ω2/ω1 = √(λ2/λ1) ≈ 2.618 (golden-ratio² classic)
    expect(Math.sqrt(sorted[1] / sorted[0])).toBeCloseTo((1 + Math.sqrt(5)) ** 2 / 4, 6)
  })
})

describe('buildSeismicMass', () => {
  it('conserves total member self-mass (Σ nodal = Σ member)', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    const mass = buildSeismicMass(model)
    const total = [...mass.values()].reduce((s, m) => s + m, 0)

    // independently: Σ member (b·h·L·γc)/g
    const pos = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z]]))
    let expected = 0
    for (const m of model.members) {
      const a = pos.get(m.i)!, b = pos.get(m.j)!
      const L = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])
      expected += (0.4 * 0.4 * 24 * L) / GRAVITY   // 400×400 concrete
    }
    // grid has no slabs with sdl by default; allow slab self-mass too
    expect(total).toBeGreaterThan(0)
    expect(total).toBeCloseTo(expected + slabMass(model), 6)
  })
})

function slabMass(model: StructuralModel): number {
  const pos = new Map(model.nodes.map((n) => [n.id, [n.x, n.y, n.z]]))
  const tri = (a: number[], b: number[], c: number[]) => {
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]
    return 0.5 * Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0])
  }
  let m = 0
  for (const p of model.plates) {
    if (p.role !== 'slab') continue
    const c = p.corners.map((id) => pos.get(id)!)
    const area = tri(c[0], c[1], c[2]) + tri(c[0], c[2], c[3])
    m += ((p.thickness / 1000) * 24 * area) / GRAVITY
  }
  return m
}

// ── closed-form SDOF column ─────────────────────────────────────────────────
describe('modalAnalysis — SDOF cantilever column', () => {
  // single column, base fixed; only its own self-mass. Half lumps to the fixed
  // base (no DOF), half to the free top → an SDOF in each lateral direction.
  const H = 4
  const model: StructuralModel = {
    ...emptyModel('col'),
    nodes: [{ id: 'base', x: 0, y: 0, z: 0 }, { id: 'top', x: 0, y: H, z: 0 }],
    sections: [section],
    members: [{ id: 'c', i: 'base', j: 'top', role: 'column', section: 'S1' }],
    supports: [{ node: 'base', fixity: 'fixed' }],
  }

  it('fundamental period matches 2π√(m/k) with k from a static unit load', () => {
    const mTop = buildSeismicMass(model).get('top')!     // tonnes
    expect(mTop).toBeGreaterThan(0)

    // lateral stiffness at the top in X and Z from unit static loads
    const br = modelToFrame3D(model)
    const kOf = (axis: 'Fx' | 'Fz') => {
      const load: F3Load = { kind: 'node', node: 'top', [axis]: 1, cat: 'D' } as F3Load
      const r = solveFrame3D(br.nodes, br.members, br.supports, [load])!
      const comp = axis === 'Fx' ? 0 : 2
      const top = br.nodes.findIndex((n) => n.id === 'top')
      return 1 / Math.abs(r.d[6 * top + comp])           // kN/m
    }
    const kx = kOf('Fx'), kz = kOf('Fz')
    const kMin = Math.min(kx, kz)
    const Tlong = 2 * Math.PI * Math.sqrt(mTop / kMin)   // s

    const res = modalAnalysis(model, 6)!
    expect(res.modes.length).toBeGreaterThan(0)
    // periods are sorted descending; the longest is the weak-axis lateral mode
    expect(res.modes[0].period).toBeCloseTo(Tlong, 4)
  })

  it('the lateral modes account for ~100% of the mass in their direction', () => {
    const res = modalAnalysis(model, 6)!
    // square section ⇒ kx≈kz ⇒ both lateral modes present; combined X+Z+Y → full
    expect(res.cumRatio[0]).toBeCloseTo(1, 2)
    expect(res.cumRatio[2]).toBeCloseTo(1, 2)
  })

  it('mode shape is a record with max |component| = 1 and only the free top node', () => {
    const res = modalAnalysis(model, 6)!
    for (const mode of res.modes) {
      const vals = Object.values(mode.shape)
      expect(vals.length).toBeGreaterThan(0)
      // max absolute component must be exactly 1 (normalization)
      const maxAbs = Math.max(...vals.flatMap((v) => v.map(Math.abs)))
      expect(maxAbs).toBeCloseTo(1, 9)
      // fixed base node carries no mass → not in shape
      expect(mode.shape['base']).toBeUndefined()
      // free top node is present
      expect(mode.shape['top']).toBeDefined()
    }
  })
})

// ── full model sanity ───────────────────────────────────────────────────────
describe('modalAnalysis — generated grid', () => {
  it('returns positive periods in descending order with growing cumulative mass', () => {
    const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section })
    const res = modalAnalysis(model, 12)!
    expect(res.modes.length).toBeGreaterThan(0)
    for (const m of res.modes) {
      expect(m.period).toBeGreaterThan(0)
      expect(Number.isFinite(m.period)).toBe(true)
    }
    for (let i = 1; i < res.modes.length; i++)
      expect(res.modes[i].period).toBeLessThanOrEqual(res.modes[i - 1].period + 1e-9)
    // effective mass ratios are within [0,1] and accumulate
    for (const m of res.modes)
      for (const r of m.effMassRatio) { expect(r).toBeGreaterThanOrEqual(-1e-9); expect(r).toBeLessThanOrEqual(1 + 1e-6) }
    expect(res.cumRatio[0]).toBeGreaterThan(0)
  })

  it('returns null for a model with no supports (singular K)', () => {
    const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section })
    model.supports = []
    expect(modalAnalysis(model)).toBeNull()
  })
})
