import { describe, it, expect } from 'vitest'
import {
  jacobiEigen, buildSeismicMass, memberNodalMass, nonMemberNodalMass, memberMassPerLength,
  consistentMassLocal, cholesky, modalAnalysis, GRAVITY,
} from './modal'
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

// ─────────────────────────────────────────────────────────────────────────
// CONSISTENT MASS
//
// `modal.ts` was lumped-only, so the rotational DOFs carried no inertia at
// all — and every dynamic result in the app (response spectrum, drift,
// pushover, time history) is built on the frequencies that produces. The
// consistent option is the peer model: ∫ρNᵀN dx over the same cubics the
// stiffness was integrated from.
//
// The anchors below are the textbook ones, and they are unusually sharp
// because the cantilever has a closed form on both sides:
//   exact continuum   ω₁ = 3.5160152 √(EI / m̄L⁴)
//   ONE consistent el. ω₁ = 3.53273   √(EI / m̄L⁴)   (+0.475%)
//   ONE lumped el.     ω₁ = √6        √(EI / m̄L⁴)   (= 2.449490, −30.3%)
// Consistent bounds the exact answer from ABOVE, lumped from BELOW.
// ─────────────────────────────────────────────────────────────────────────
const beamSec: RectSection = {
  id: 's1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415,
  barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
}

/** A horizontal cantilever of span `L` split into `n` equal members. */
function cantilever(L: number, n: number, sec: RectSection = beamSec): StructuralModel {
  return {
    version: 1, name: 'cantilever',
    nodes: Array.from({ length: n + 1 }, (_, k) => ({ id: `n${k}`, x: (L * k) / n, y: 0, z: 0 })),
    sections: [sec],
    members: Array.from({ length: n }, (_, k) => ({
      id: `m${k}`, i: `n${k}`, j: `n${k + 1}`, role: 'beam' as const, section: sec.id,
    })),
    plates: [], supports: [{ node: 'n0', fixity: 'fixed' as const }], loads: [], storeys: [],
  }
}

/** The engine's own EI and m̄ for that cantilever, so the closed form is
 *  evaluated on the same properties the solver used and the comparison is a
 *  check on the DYNAMICS, not on the section library. */
function cantileverProps(L: number, sec: RectSection = beamSec) {
  const br = modelToFrame3D(cantilever(L, 1, sec), { useShells: false })
  const m0 = br.members[0]
  return {
    EIy: m0.E * m0.Iy * 1e-9,           // kN·m² — the soft plane, which governs
    EIz: m0.E * m0.Iz * 1e-9,
    mBar: memberMassPerLength(sec),      // t/m
    A: m0.A, Iy: m0.Iy, Iz: m0.Iz,
  }
}

describe('consistentMassLocal — the 12×12 element matrix', () => {
  const mPerL = 2, L = 5, rSq = 0.03
  const M = consistentMassLocal(mPerL, L, rSq)
  const m = mPerL * L
  const work = (v: number[]) => v.reduce((s, a, i) => s + a * v.reduce((t, b, j) => t + M[i][j] * b, 0), 0)
  const rigid = (idx: number[]) => { const v = new Array(12).fill(0); for (const i of idx) v[i] = 1; return v }

  it('is symmetric and positive definite', () => {
    for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) expect(M[a][b]).toBeCloseTo(M[b][a], 15)
    expect(cholesky(M)).not.toBeNull()
  })

  // THE PROPERTY THAT CATCHES A SIGN ERROR. A rigid-body translation does
  // work equal to the total mass, in EVERY direction — a flipped coupling
  // term leaves the matrix symmetric and positive definite and quietly wrong
  // about coupled modes, and only this catches it.
  it('rigid-body translation does work = the element mass, on all three axes', () => {
    expect(work(rigid([0, 6]))).toBeCloseTo(m, 12)   // axial
    expect(work(rigid([1, 7]))).toBeCloseTo(m, 12)   // x–y plane
    expect(work(rigid([2, 8]))).toBeCloseTo(m, 12)   // x–z plane
  })

  it('rigid twist about its own axis does work = m·r², the polar inertia', () => {
    expect(work(rigid([3, 9]))).toBeCloseTo(m * rSq, 12)
  })

  it('carries the textbook coefficients, with the two bending planes opposed in sign', () => {
    expect(M[1][1]).toBeCloseTo((13 * m) / 35, 12)
    expect(M[5][5]).toBeCloseTo((m * L * L) / 105, 12)
    expect(M[5][11]).toBeCloseTo(-(m * L * L) / 140, 12)
    // v–θz is +11mL/210; w–θy is −11mL/210, because a positive θy moves the
    // section in −z′. Same magnitude, opposite sign.
    expect(M[1][5]).toBeCloseTo((11 * m * L) / 210, 12)
    expect(M[2][4]).toBeCloseTo(-(11 * m * L) / 210, 12)
  })

  it('a weightless or zero-length element contributes nothing', () => {
    expect(consistentMassLocal(0, L, rSq).flat().every((v) => v === 0)).toBe(true)
    expect(consistentMassLocal(mPerL, 0, rSq).flat().every((v) => v === 0)).toBe(true)
  })
})

describe('cholesky', () => {
  it('factors an SPD matrix so that L Lᵀ reproduces it', () => {
    const M = [[4, 2, 1], [2, 5, 3], [1, 3, 6]]
    const L = cholesky(M)!
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      let s = 0
      for (let k = 0; k < 3; k++) s += L[i][k] * L[j][k]
      expect(s).toBeCloseTo(M[i][j], 12)
    }
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) expect(L[i][j]).toBe(0)
  })

  it('returns null rather than a fudge when the matrix is not positive definite', () => {
    expect(cholesky([[1, 2], [2, 1]])).toBeNull()      // indefinite
    expect(cholesky([[0, 0], [0, 1]])).toBeNull()      // a DOF with no inertia
  })
})

describe('the mass split — lumped and consistent weigh the same members', () => {
  const g = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200 })

  it('member + non-member mass adds back up to the whole', () => {
    const whole = buildSeismicMass(g)
    const mem = memberNodalMass(g), other = nonMemberNodalMass(g)
    for (const [id, m] of whole)
      expect((mem.get(id) ?? 0) + (other.get(id) ?? 0)).toBeCloseTo(m, 12)
    const sum = (x: Map<string, number>) => [...x.values()].reduce((a, b) => a + b, 0)
    expect(sum(mem) + sum(other)).toBeCloseTo(sum(whole), 9)
  })

  it('one expression for a member\'s weight, so the two models cannot disagree about it', () => {
    // 300×500 concrete: 0.3 × 0.5 × 24 kN/m³ ÷ g
    expect(memberMassPerLength(beamSec)).toBeCloseTo((0.3 * 0.5 * 24) / GRAVITY, 12)
  })
})

describe('modalAnalysis — the cantilever closed forms', () => {
  const L = 6
  const { EIy, mBar } = cantileverProps(L)
  const wRef = Math.sqrt(EIy / (mBar * L ** 4))     // ω = coefficient × wRef
  const EXACT = 3.5160152                            // continuum, first mode
  const w1 = (n: number, massModel: 'lumped' | 'consistent') =>
    modalAnalysis(cantilever(L, n), 6, { massModel })!.modes[0].omega / wRef

  it('ONE consistent element gives 3.53273 — the textbook single-element value', () => {
    expect(w1(1, 'consistent')).toBeCloseTo(3.53273, 4)
  })

  it('ONE lumped element gives √6 = 2.44949 — half the mass on a cantilever tip', () => {
    // k = 3EI/L³ against m̄L/2 ⇒ ω = √(6EI/m̄L⁴). Exact, not approximate.
    expect(w1(1, 'lumped')).toBeCloseTo(Math.sqrt(6), 9)
  })

  it('BOUNDS the exact answer: consistent from above, lumped from below', () => {
    for (const n of [1, 2, 4, 8]) {
      expect(w1(n, 'consistent')).toBeGreaterThan(EXACT)
      expect(w1(n, 'lumped')).toBeLessThan(EXACT)
    }
  })

  it('both converge to it, and consistent converges far faster', () => {
    const errC = [1, 2, 4, 8].map((n) => Math.abs(w1(n, 'consistent') / EXACT - 1))
    const errL = [1, 2, 4, 8].map((n) => Math.abs(w1(n, 'lumped') / EXACT - 1))
    for (let k = 1; k < 4; k++) {
      expect(errC[k]).toBeLessThan(errC[k - 1])
      expect(errL[k]).toBeLessThan(errL[k - 1])
    }
    // one consistent element already beats eight lumped ones
    expect(errC[0]).toBeLessThan(errL[3])
    expect(errC[2]).toBeLessThan(1e-4)     // 4 elements: within 0.01%
    expect(errL[2]).toBeGreaterThan(0.02)  // 4 elements lumped: still 2%+ low
  })

  it('a square section gives the same frequency in both bending planes — the sign check, on a real solve', () => {
    const sq: RectSection = { ...beamSec, b: 400, h: 400, name: '400×400' }
    const r = modalAnalysis(cantilever(L, 3, sq), 6, { massModel: 'consistent' })!
    // the two lowest modes are the two bending planes of a doubly symmetric
    // section; a sign error in either plane's v–θ coupling separates them
    expect(r.modes[1].omega / r.modes[0].omega).toBeCloseTo(1, 6)
  })
})

describe('modalAnalysis — the mass model is a reported choice', () => {
  const g = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section, slabThickness: 200 })

  it('defaults to lumped, and says so', () => {
    const r = modalAnalysis(g, 12)!
    expect(r.massModel).toBe('lumped')
    expect(modalAnalysis(g, 12, {})!.massModel).toBe('lumped')
  })

  it('lumped solves the massive TRANSLATIONAL DOFs; consistent solves every free one', () => {
    const l = modalAnalysis(g, 12)!
    const c = modalAnalysis(g, 12, { massModel: 'consistent' })!
    expect(c.activeDofs).toBeGreaterThan(l.activeDofs)
    // three translations per massive free node vs six DOFs per free node
    expect(c.activeDofs % 6).toBe(0)
    expect(l.activeDofs % 3).toBe(0)
    expect(c.massModel).toBe('consistent')
  })

  it('NEITHER MODEL LOSES MASS: asked for every mode, both reach 100% in all three directions', () => {
    for (const massModel of ['lumped', 'consistent'] as const) {
      const r = modalAnalysis(g, 500, { massModel })!
      expect(r.modes).toHaveLength(r.activeDofs)
      for (const k of [0, 1, 2]) expect(r.cumRatio[k]).toBeCloseTo(1, 6)
    }
  })

  it('agrees with lumped on a real building to a fraction of a percent — slab mass dominates', () => {
    const l = modalAnalysis(g, 6)!
    const c = modalAnalysis(g, 6, { massModel: 'consistent' })!
    // consistent is the stiffer idealisation, so its periods are shorter
    expect(c.modes[0].period).toBeLessThan(l.modes[0].period)
    expect(c.modes[0].period / l.modes[0].period).toBeGreaterThan(0.99)
    // and the mode that carries the mass is the same mode
    const gov = (r: typeof l) => r.modes.reduce((a, b) => (b.effMassRatio[0] > a.effMassRatio[0] ? b : a))
    expect(gov(c).effMassRatio[0]).toBeCloseTo(gov(l).effMassRatio[0], 2)
  })

  it('still refuses a singular model under either mass matrix', () => {
    const noSupport = { ...cantilever(6, 2), supports: [] }
    expect(modalAnalysis(noSupport, 4)).toBeNull()
    expect(modalAnalysis(noSupport, 4, { massModel: 'consistent' })).toBeNull()
  })

  it('survives a released member — a rotational DOF the stiffness condensed away still carries inertia', () => {
    // Releases are NOT condensed out of M: a pinned end still has rotational
    // inertia, and condensing it would apply a static operation to a dynamic
    // quantity. On a frame that stays stable the extra DOF is simply solved.
    const g2 = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section, slabThickness: 200 })
    const beamIdx = g2.members.findIndex((x) => x.role !== 'column')
    g2.members[beamIdx] = { ...g2.members[beamIdx], releases: { jEnd: { My: true, Mz: true } } }
    const r = modalAnalysis(g2, 4, { massModel: 'consistent' })
    expect(r).not.toBeNull()
    expect(r!.modes.every((x) => Number.isFinite(x.period) && x.period > 0)).toBe(true)
  })

  // WHERE THE RELEASE DOES BREAK THE MODEL, IT BREAKS K, NOT M. Releasing both
  // bending moments at the far end of a chain leaves the piece beyond it free
  // to pivot about that joint — a real mechanism, and the stiffness is
  // singular before any mass matrix is built. Both models must refuse it, and
  // refuse it for the same reason; a consistent run that "worked" here would
  // be reporting a rigid-body mode as a structural period.
  it('refuses a release that creates a mechanism, under BOTH mass models', () => {
    const m = cantilever(6, 3)
    m.members[1] = { ...m.members[1], releases: { jEnd: { My: true, Mz: true } } }
    expect(modalAnalysis(m, 4)).toBeNull()
    expect(modalAnalysis(m, 4, { massModel: 'consistent' })).toBeNull()
  })
})
