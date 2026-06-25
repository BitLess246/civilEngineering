import { describe, it, expect } from 'vitest'
import {
  triFrame, cstMembrane, dktBending, triShell, solveShell, rectPlateMesh,
  type ShellNode, type ShellElem, type ShellSupport,
} from './shell'

const E = 25000, nu = 0.3   // MPa, concrete-ish; ν=0.3 matches Timoshenko tables

describe('triFrame', () => {
  it('builds a right-handed local frame with n1 at origin and n2 on +x̂', () => {
    const f = triFrame([0, 0, 0], [2, 0, 0], [0, 3, 0])
    expect(f.A).toBeCloseTo(3, 9)              // ½·2·3
    expect(f.x).toEqual([0, 2, 0])
    expect(f.y[0]).toBeCloseTo(0, 9)
    expect(f.y[2]).toBeCloseTo(3, 9)
    // normal of an X-Y triangle is +z
    expect(f.R[2][2]).toBeCloseTo(1, 9)
  })

  it('handles a tilted (X-Z plane) triangle — area is orientation-independent', () => {
    const f = triFrame([0, 0, 0], [2, 0, 0], [0, 0, 3])
    expect(f.A).toBeCloseTo(3, 9)
  })
})

describe('element stiffness sanity', () => {
  const f = triFrame([0, 0, 0], [4, 0, 0], [0, 3, 0])

  it('membrane & bending stiffness are symmetric', () => {
    const Km = cstMembrane(f, E, nu, 200)
    const Kb = dktBending(f, E, nu, 200)
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) expect(Km[i][j]).toBeCloseTo(Km[j][i], 6)
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) expect(Kb[i][j]).toBeCloseTo(Kb[j][i], 6)
  })

  it('a rigid-body motion produces zero element forces', () => {
    const { Ke } = triShell([0, 0, 0], [4, 0, 0], [1, 3, 0], E, nu, 200)
    // rigid translation in x: u=1 at every node
    const tx = new Array(18).fill(0)
    for (const a of [0, 1, 2]) tx[6 * a + 0] = 1
    const fx = Ke.map((row) => row.reduce((s, v, k) => s + v * tx[k], 0))
    expect(Math.max(...fx.map(Math.abs))).toBeLessThan(1e-6)
    // rigid translation in z (out of plane): w=1 everywhere
    const tz = new Array(18).fill(0)
    for (const a of [0, 1, 2]) tz[6 * a + 2] = 1
    const fz = Ke.map((row) => row.reduce((s, v, k) => s + v * tz[k], 0))
    expect(Math.max(...fz.map(Math.abs))).toBeLessThan(1e-6)
  })
})

// ── Membrane: exact for constant strain ─────────────────────────────────────
describe('membrane (CST) — constant-strain exactness', () => {
  // 1×1 m square, t=100 mm, two triangles, in X-Y plane. Pull the right edge
  // with uniform traction σ; left edge restrained in x, bottom-left pinned in y.
  const t = 100
  const nodes: ShellNode[] = [
    { id: 'bl', x: 0, y: 0, z: 0 }, { id: 'br', x: 1, y: 0, z: 0 },
    { id: 'tr', x: 1, y: 1, z: 0 }, { id: 'tl', x: 0, y: 1, z: 0 },
  ]
  const elems: ShellElem[] = [
    { id: 'e0', nodes: ['bl', 'br', 'tr'], E, nu, t },
    { id: 'e1', nodes: ['bl', 'tr', 'tl'], E, nu, t },
  ]

  it('uniaxial tension reproduces ε = σ/E exactly', () => {
    const sigma = 5          // MPa
    const P = (sigma * t * 1000) / 1e3   // edge total force kN: σ[MPa]·area[mm²]/1e3; area = 1m·t = 1000·t mm²
    // left edge ux = 0; pin one node in y/z and lock drilling/out-of-plane rigid modes
    const supports: ShellSupport[] = [
      { node: 'bl', ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
      { node: 'tl', ux: true, uz: true, rx: true, ry: true, rz: true },
      { node: 'br', uz: true, rx: true, ry: true, rz: true },
      { node: 'tr', uz: true, rx: true, ry: true, rz: true },
    ]
    const r = solveShell(nodes, elems, supports, [
      { node: 'br', Fx: P / 2 }, { node: 'tr', Fx: P / 2 },
    ])!
    // expected elongation of a 1 m bar at strain σ/E (E in MPa → /1e3 for consistency with σ MPa)
    const expected = (sigma / E) * 1   // ε·L
    expect(r.disp.get('br')![0]).toBeCloseTo(expected, 6)
    expect(r.disp.get('tr')![0]).toBeCloseTo(expected, 6)
    // lateral Poisson contraction at the free top edge: −ν·ε·L
    expect(r.disp.get('tl')![1]).toBeCloseTo(-nu * (sigma / E) * 1, 6)
  })
})

// ── Bending: DKT vs Timoshenko thin-plate theory ────────────────────────────
describe('DKT plate bending — Timoshenko benchmarks', () => {
  const L = 5, t = 200, q = 10            // m, mm, kN/m²
  const Es = E * 1e3, tm = t / 1000
  const D = (Es * tm ** 3) / (12 * (1 - nu * nu))   // plate rigidity kN·m

  function central(mesh: ReturnType<typeof rectPlateMesh>, clamped: boolean) {
    const { nodes, elems, id } = mesh
    const n = Math.round(Math.sqrt(nodes.length)) - 1
    const onEdge = (i: number, j: number) => i === 0 || j === 0 || i === n || j === n
    const supports: ShellSupport[] = []
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) if (onEdge(i, j)) {
      // simply supported: w=0 (+ in-plane & drilling restrained, decoupled from bending);
      // clamped: additionally lock the rotations.
      supports.push({ node: id(i, j), uz: true, ux: true, uy: true, rz: true, ...(clamped ? { rx: true, ry: true } : {}) })
    }
    const pressures = elems.map((e) => ({ elem: e.id, q }))
    const r = solveShell(nodes, elems, supports, [], pressures)!
    const c = Math.floor(n / 2)
    return Math.abs(r.disp.get(id(c, c))![2])
  }

  it('simply-supported square plate central deflection ≈ 0.00406 q L⁴/D', () => {
    const w = central(rectPlateMesh(L, L, 8, 8, E, nu, t), false)
    const exact = 0.00406 * q * L ** 4 / D
    expect(w / exact).toBeGreaterThan(0.95)
    expect(w / exact).toBeLessThan(1.05)
  })

  it('clamped square plate central deflection ≈ 0.00126 q L⁴/D', () => {
    const w = central(rectPlateMesh(L, L, 8, 8, E, nu, t), true)
    const exact = 0.00126 * q * L ** 4 / D
    expect(w / exact).toBeGreaterThan(0.93)
    expect(w / exact).toBeLessThan(1.07)
  })

  it('converges toward the analytical value as the mesh refines', () => {
    const exact = 0.00406 * q * L ** 4 / D
    const e4 = Math.abs(central(rectPlateMesh(L, L, 4, 4, E, nu, t), false) / exact - 1)
    const e8 = Math.abs(central(rectPlateMesh(L, L, 8, 8, E, nu, t), false) / exact - 1)
    expect(e8).toBeLessThan(e4 + 1e-9)
  })
})

// ── Orientation independence: a slab in the X-Z plane behaves identically ────
describe('orientation independence', () => {
  it('an X-Z-plane plate gives the same central deflection as an X-Y-plane plate', () => {
    const L = 4, t = 150, q = 8
    const mXY = rectPlateMesh(L, L, 6, 6, E, nu, t)
    // remap the X-Y mesh into the X-Z plane (y→z), pressure normal becomes ±y
    const nodesXZ: ShellNode[] = mXY.nodes.map((n) => ({ id: n.id, x: n.x, y: 0, z: n.y }))
    const n = 6
    const onEdge = (i: number, j: number) => i === 0 || j === 0 || i === n || j === n
    const ssXY: ShellSupport[] = [], ssXZ: ShellSupport[] = []
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) if (onEdge(i, j)) {
      ssXY.push({ node: mXY.id(i, j), uz: true, ux: true, uy: true, rz: true })
      ssXZ.push({ node: mXY.id(i, j), uy: true, ux: true, uz: true, ry: true })
    }
    const pr = mXY.elems.map((e) => ({ elem: e.id, q }))
    const rXY = solveShell(mXY.nodes, mXY.elems, ssXY, [], pr)!
    const rXZ = solveShell(nodesXZ, mXY.elems, ssXZ, [], pr)!
    const c = 3
    const wXY = Math.abs(rXY.disp.get(mXY.id(c, c))![2])   // out-of-plane = z
    const wXZ = Math.abs(rXZ.disp.get(mXY.id(c, c))![1])   // out-of-plane = y
    expect(wXZ).toBeCloseTo(wXY, 6)
  })
})
