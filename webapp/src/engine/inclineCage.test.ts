import { describe, it, expect } from 'vitest'
import { buildColumnCage, inclineCage, type ColumnCageInput } from './columnCage'
import { cutLength, polylineLength, type Vec3 } from './rebarModel'

// 400 × 600 column, base at (2, 0, 1), 3 m tall, no lap above
const col: ColumnCageInput = {
  mark: 'C1', b: 400, h: 600, cover: 40, barDia: 20, bars: 12, tieDia: 12,
  sConfined: 100, sOutside: 150, lo: 600, centre: [2, 1], yBottom: 0, yTop: 3,
}
const base: Vec3 = [2, 0, 1]
const plumb = buildColumnCage(col)
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

describe('inclineCage — the cage leans with its column', () => {
  it('plumb with the default orientation (depth on X) is the identity', () => {
    const same = inclineCage(plumb, base, [2, 3, 1], [1, 0, 0])
    same.runs.forEach((r, k) => r.path.forEach((p, j) => p.forEach((v, q) => expect(v).toBeCloseTo(plumb.runs[k].path[j][q], 12))))
  })

  // top moved 0.6 m toward +Z: L = √(9 + 0.36) = 3.0594, L/H = 1.01980
  const top: Vec3 = [2, 3, 1.6]
  const L = Math.hypot(3, 0.6), u: Vec3 = [0, 3 / L, 0.6 / L]
  const lean = inclineCage(plumb, base, top, [1, 0, 0])

  it('every vertical bar runs parallel to the axis, at L/H its plumb length', () => {
    const v0 = plumb.runs.filter((r) => r.role === 'vertical'), v1 = lean.runs.filter((r) => r.role === 'vertical')
    expect(v1.length).toBe(v0.length)
    v1.forEach((r, k) => {
      const [a, b] = [r.path[0], r.path[r.path.length - 1]]
      const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], n = Math.hypot(...d)
      expect(dot(d, u) / n).toBeCloseTo(1, 9)
      expect(polylineLength(r.path)).toBeCloseTo(polylineLength(v0[k].path) * L / 3, 9)
    })
  })

  it('every tie lies in a plane PERPENDICULAR to the axis and keeps its cut length', () => {
    const t0 = plumb.runs.filter((r) => r.role === 'tie'), t1 = lean.runs.filter((r) => r.role === 'tie')
    expect(t1.length).toBe(t0.length)
    t1.forEach((r, k) => {
      const s = r.path.map((p) => dot(p, u))
      for (const x of s) expect(x).toBeCloseTo(s[0], 9)
      expect(cutLength(r)).toBeCloseTo(cutLength(t0[k]), 9)
    })
  })

  it('the cage stays centred on the member axis and the depth h stays on X', () => {
    const v = lean.runs.filter((r) => r.role === 'vertical').map((r) => r.path[0])
    const c: Vec3 = [0, 1, 2].map((q) => v.reduce((a, p) => a + p[q], 0) / v.length) as unknown as Vec3
    const s = dot([c[0] - base[0], c[1] - base[1], c[2] - base[2]], u)
    const off = [c[0] - base[0] - s * u[0], c[1] - base[1] - s * u[1], c[2] - base[2] - s * u[2]]
    expect(Math.hypot(...off)).toBeLessThan(1e-9)
    const xs = v.map((p) => p[0])
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(0.4)   // the 600 face spans X
  })

  it('a turned section turns the cage: depth on Z puts the 600 face across Z', () => {
    const turned = inclineCage(plumb, base, [2, 3, 1], [0, 0, 1])
    const v = turned.runs.filter((r) => r.role === 'vertical').map((r) => r.path[0])
    const span = (q: number) => Math.max(...v.map((p) => p[q])) - Math.min(...v.map((p) => p[q]))
    expect(span(2)).toBeGreaterThan(span(0))
  })
})

describe('buildStructureCages — a designed frame with a raking column', () => {
  it("the raking column's verticals run along ITS axis; the plumb ones stay plumb", async () => {
    const { generateGridModel, buildGravityLoads } = await import('./modelBuilder')
    const { designStructure } = await import('./pipeline')
    const { buildStructureCages } = await import('./cageBuilder')
    const S0 = { id: 't', name: 't', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
    const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5], section: S0 })
    m.nodes = m.nodes.map((n) => (n.id === 'n1.0.1' ? { ...n, x: n.x + 0.8 } : n))
    m.loads = buildGravityLoads(m, 1.5, 2.4)
    const design = designStructure(m, { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 } as never)!
    const { cages } = buildStructureCages(m, design)
    const dirOf = (member: string) => {
      const v = cages.find((c) => c.member === member)!.runs.find((r) => r.role === 'vertical')!
      const [a, b] = [v.path[0], v.path[1]]
      const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], n = Math.hypot(...d)
      return d.map((x) => x / n)
    }
    const L = Math.hypot(0.8, 3.5)
    const lean = dirOf('c1.0.0')
    expect(lean[0]).toBeCloseTo(0.8 / L, 6)
    expect(lean[1]).toBeCloseTo(3.5 / L, 6)
    const plumbDir = dirOf('c0.0.0')
    expect(plumbDir[1]).toBeCloseTo(1, 12)
  })
})
