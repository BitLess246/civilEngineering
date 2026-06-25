import { describe, it, expect } from 'vitest'
import {
  triFrame, cstMembrane, dktBending, dktBmat, triShell, solveShell, rectPlateMesh,
  recoverShellStress, shellNodalContour, bilinearQuad, subdivideQuadPlates,
  type ShellNode, type ShellElem, type ShellSupport, type V3, type QuadPlateSpec,
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

// ── dktBmat: consistency with dktBending ────────────────────────────────────
describe('dktBmat', () => {
  it('integrating Bᵀ D B over the 3 mid-edge Gauss points reproduces dktBending K', () => {
    const f = triFrame([0, 0, 0], [3, 0, 0], [0, 4, 0])
    const t = 150, nu = 0.3, Es = E * 1e3, tm = t / 1000
    const cb = Es / (1 - nu * nu)
    const Db = [[cb, cb * nu, 0], [cb * nu, cb, 0], [0, 0, cb * (1 - nu) / 2]].map((r) => r.map((v) => v * (tm ** 3 / 12)))
    const gps: [number, number][] = [[0.5, 0], [0, 0.5], [0.5, 0.5]]
    const mul = (A: number[][], B: number[][]): number[][] =>
      A.map((row) => B[0].map((_, j) => row.reduce((s, v, k) => s + v * B[k][j], 0)))
    const transpose = (A: number[][]): number[][] => A[0].map((_, j) => A.map((r) => r[j]))
    const zeros9 = () => Array.from({ length: 9 }, () => new Array(9).fill(0))
    let K = zeros9()
    for (const [xi, eta] of gps) {
      const B = dktBmat(f, xi, eta)
      const k = mul(transpose(B), mul(Db, B))
      K = K.map((row, i) => row.map((v, j) => v + (f.A / 3) * k[i][j]))
    }
    const Kref = dktBending(f, E, nu, t)
    for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) expect(K[i][j]).toBeCloseTo(Kref[i][j], 6)
  })
})

// ── Stress recovery ──────────────────────────────────────────────────────────
describe('recoverShellStress', () => {
  // Reuse the 1×1 m uniaxial-tension setup from the CST membrane test.
  const t = 100
  const nodes: ShellNode[] = [
    { id: 'bl', x: 0, y: 0, z: 0 }, { id: 'br', x: 1, y: 0, z: 0 },
    { id: 'tr', x: 1, y: 1, z: 0 }, { id: 'tl', x: 0, y: 1, z: 0 },
  ]
  const elems: ShellElem[] = [
    { id: 'e0', nodes: ['bl', 'br', 'tr'], E, nu, t },
    { id: 'e1', nodes: ['bl', 'tr', 'tl'], E, nu, t },
  ]
  const sigma = 5   // MPa applied as traction
  const P = (sigma * t * 1000) / 1e3
  const supports: ShellSupport[] = [
    { node: 'bl', ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
    { node: 'tl', ux: true, uz: true, rx: true, ry: true, rz: true },
    { node: 'br', uz: true, rx: true, ry: true, rz: true },
    { node: 'tr', uz: true, rx: true, ry: true, rz: true },
  ]

  it('recovers σx ≈ σ_applied on the axis-aligned element (e0 local frame = global)', () => {
    const r = solveShell(nodes, elems, supports, [{ node: 'br', Fx: P / 2 }, { node: 'tr', Fx: P / 2 }])!
    const st = recoverShellStress(nodes, elems, r)
    // e0 (bl→br→tr) has x̂ aligned with global X → local σx = global σx = 5 MPa = 5000 kN/m²
    const s0 = st.find((s) => s.id === 'e0')!
    expect(s0.sigmaX).toBeCloseTo(sigma * 1e3, 1)
    // e1 (bl→tr→tl) is rotated 45°: local σx = σy_global·sin²45° + σx·cos²45° = 2500 kN/m²
    const s1 = st.find((s) => s.id === 'e1')!
    expect(s1.sigmaX).toBeCloseTo(sigma * 1e3 / 2, 1)
  })

  it('σ1 ≥ σ2 and vonMises ≥ 0 for all elements', () => {
    const r = solveShell(nodes, elems, supports, [{ node: 'br', Fx: P / 2 }, { node: 'tr', Fx: P / 2 }])!
    const st = recoverShellStress(nodes, elems, r)
    for (const s of st) {
      expect(s.sigma1).toBeGreaterThanOrEqual(s.sigma2 - 1e-9)
      expect(s.vonMises).toBeGreaterThanOrEqual(0)
    }
  })

  it('bending moments ≈ 0 for a pure in-plane load', () => {
    const r = solveShell(nodes, elems, supports, [{ node: 'br', Fx: P / 2 }, { node: 'tr', Fx: P / 2 }])!
    const st = recoverShellStress(nodes, elems, r)
    for (const s of st) {
      expect(Math.abs(s.Mx)).toBeLessThan(1e-6)
      expect(Math.abs(s.My)).toBeLessThan(1e-6)
      expect(Math.abs(s.Mxy)).toBeLessThan(1e-6)
    }
  })

  it('bending moments non-zero under out-of-plane pressure (coarser mesh with interior node)', () => {
    // 2×2 mesh gives a free interior node that deflects under pressure → non-zero M
    const { nodes: mn, elems: me, id } = rectPlateMesh(1, 1, 2, 2, E, nu, t)
    const n = 2
    const onEdge = (i: number, j: number) => i === 0 || j === 0 || i === n || j === n
    const sup: ShellSupport[] = []
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) if (onEdge(i, j))
      sup.push({ node: id(i, j), uz: true, ux: true, uy: true, rz: true })
    const pr = me.map((e) => ({ elem: e.id, q: 10 }))
    const r = solveShell(mn, me, sup, [], pr)!
    const st = recoverShellStress(mn, me, r)
    const maxMx = Math.max(...st.map((s) => Math.abs(s.Mx)))
    expect(maxMx).toBeGreaterThan(0)
  })
})

describe('shellNodalContour', () => {
  const t = 100
  const nodes: ShellNode[] = [
    { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1, y: 0, z: 0 },
    { id: 'c', x: 0.5, y: 1, z: 0 },
  ]
  const elems: ShellElem[] = [{ id: 'e0', nodes: ['a', 'b', 'c'], E, nu, t }]
  const supports: ShellSupport[] = [
    { node: 'a', ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
    { node: 'b', ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
    { node: 'c', ux: true, uy: true, uz: true, rx: true, ry: true, rz: true },
  ]

  it('returns a value for every node', () => {
    const r = solveShell(nodes, elems, supports)!
    const st = recoverShellStress(nodes, elems, r)
    const contour = shellNodalContour(nodes, elems, st, 'vonMises')
    expect(contour.size).toBe(3)
    for (const n of nodes) expect(contour.has(n.id)).toBe(true)
  })

  it('all values finite and non-negative for vonMises', () => {
    const r = solveShell(nodes, elems, supports, [{ node: 'c', Fx: 1 }])!
    const st = recoverShellStress(nodes, elems, r)
    const contour = shellNodalContour(nodes, elems, st, 'vonMises')
    for (const v of contour.values()) {
      expect(isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
    }
  })
})

// ── Quad subdivision / auto-meshing (D10) ────────────────────────────────────
describe('bilinearQuad', () => {
  const c: [V3, V3, V3, V3] = [[0, 0, 0], [2, 0, 0], [2, 3, 0], [0, 3, 0]]
  it('reproduces the four corners at the parametric corners', () => {
    expect(bilinearQuad(c, 0, 0)).toEqual([0, 0, 0])
    expect(bilinearQuad(c, 1, 0)).toEqual([2, 0, 0])
    expect(bilinearQuad(c, 1, 1)).toEqual([2, 3, 0])
    expect(bilinearQuad(c, 0, 1)).toEqual([0, 3, 0])
  })
  it('gives the centroid at (½,½) and edge midpoints', () => {
    expect(bilinearQuad(c, 0.5, 0.5)).toEqual([1, 1.5, 0])
    expect(bilinearQuad(c, 0.5, 0)).toEqual([1, 0, 0])
  })
})

describe('subdivideQuadPlates', () => {
  const sq: QuadPlateSpec = {
    id: 'P', corners: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], E: 25000, nu: 0.3, t: 200,
  }

  it('n = 1 reproduces the 2-triangle, 4-node quad', () => {
    const m = subdivideQuadPlates([sq], 1)
    expect(m.nodes.length).toBe(4)
    expect(m.elems.length).toBe(2)
  })

  it('n = 4 yields (n+1)² nodes and 2n² triangles', () => {
    const m = subdivideQuadPlates([sq], 4)
    expect(m.nodes.length).toBe(25)
    expect(m.elems.length).toBe(32)
  })

  it('adjacent plates share the common-edge nodes (conforming mesh)', () => {
    const q2: QuadPlateSpec = {
      id: 'Q', corners: [[1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0]], E: 25000, nu: 0.3, t: 200,
    }
    const n = 2
    const m = subdivideQuadPlates([sq, q2], n)
    // 2·(n+1)² − (n+1) shared edge nodes
    expect(m.nodes.length).toBe(2 * (n + 1) ** 2 - (n + 1))
    expect(m.elems.length).toBe(2 * (2 * n ** 2))
  })

  it('cornerId reuses existing model node ids at coincident positions', () => {
    const named: [V3, string][] = [
      [[0, 0, 0], 'A'], [[1, 0, 0], 'B'], [[1, 1, 0], 'C'], [[0, 1, 0], 'D'],
    ]
    // exact-coordinate match only (edge/interior points return undefined → synthetic)
    const cornerId = (p: V3) =>
      named.find(([q]) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]) < 1e-6)?.[1]
    const m = subdivideQuadPlates([sq], 2, cornerId)
    const byId = new Map(m.nodes.map((nd) => [nd.id, nd]))
    expect(byId.has('A')).toBe(true)
    expect(byId.has('C')).toBe(true)
    expect(byId.get('C')).toMatchObject({ x: 1, y: 1, z: 0 })
    // interior + edge midside nodes are synthetic
    expect(m.nodes.some((nd) => nd.id.startsWith('sv'))).toBe(true)
  })

  it('refining the subdivision converges a simply-supported plate toward Timoshenko', () => {
    const L = 5, t = 200, q = 10, Es = E * 1e3, tm = t / 1000
    const D = (Es * tm ** 3) / (12 * (1 - nu * nu))
    const exact = 0.00406 * q * L ** 4 / D
    const plate: QuadPlateSpec = {
      id: 'S', corners: [[0, 0, 0], [L, 0, 0], [L, L, 0], [0, L, 0]], E, nu, t,
    }
    const central = (nsub: number) => {
      const { nodes, elems } = subdivideQuadPlates([plate], nsub)
      const edge = (v: number) => Math.abs(v) < 1e-6 || Math.abs(v - L) < 1e-6
      const supports: ShellSupport[] = nodes
        .filter((nd) => edge(nd.x) || edge(nd.y))
        .map((nd) => ({ node: nd.id, uz: true, ux: true, uy: true, rz: true }))
      const r = solveShell(nodes, elems, supports, [], elems.map((e) => ({ elem: e.id, q })))!
      const mid = nodes.find((nd) => Math.abs(nd.x - L / 2) < 1e-6 && Math.abs(nd.y - L / 2) < 1e-6)!
      return Math.abs(r.disp.get(mid.id)![2])
    }
    const e2 = Math.abs(central(2) / exact - 1)
    const e8 = Math.abs(central(8) / exact - 1)
    expect(e8).toBeLessThan(e2)            // finer mesh is closer
    expect(central(8) / exact).toBeGreaterThan(0.9)
    expect(central(8) / exact).toBeLessThan(1.1)
  })
})
