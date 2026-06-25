import { describe, it, expect } from 'vitest'
import { bucklingFromFrame } from './buckling'
import { rectJ, type F3Node, type F3Member, type F3Support } from './frame3d'

// ── shared section ────────────────────────────────────────────────────────────
// 300×300 mm concrete column  (E = 25 000 MPa)
const E = 25_000, G = E / 2.4
const b = 300, h = 300
const A = b * h
const Iy = (h * b ** 3) / 12
const Iz = (b * h ** 3) / 12
const J  = rectJ(b, h)
const sec = { E, G, A, Iy, Iz, J }

// EI for Euler formula (square section: Iy = Iz)
const EI = E * Iz * 1e-9               // kN·m²  (MPa·mm⁴ → kN·m²)

// ── helpers ───────────────────────────────────────────────────────────────────

/**
 * Fixed–free cantilever column of height H along global Y.
 * Base (node 'a') is fully fixed; tip (node 'b') is free.
 */
function cantileverColumn(H: number): {
  nodes: F3Node[]; members: F3Member[]; supports: F3Support[]
} {
  return {
    nodes:    [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0, y: H, z: 0 }],
    members:  [{ id: 'm', i: 'a', j: 'b', ...sec }],
    supports: [{ node: 'a', fixity: 'fixed' as const }],
  }
}

/**
 * Fixed–fixed column of height H using 2 equal elements and a free mid-node.
 * Both end nodes are fully fixed; the mid-node is entirely free.
 * Euler Pcr = 4π²EI/H²  (effective length K = 0.5).
 *
 * Note: a pure 3D pin–pin column has a torsional rigid-body mode (both ends
 * free to spin about the member axis) that makes K singular.  Fixed–fixed
 * avoids this singularity and places the peak buckling deflection exactly at
 * the mid-node, making it ideal for a 2-element FEM verification.
 */
function fixedFixedColumn2el(H: number): {
  nodes: F3Node[]; members: F3Member[]; supports: F3Support[]
} {
  return {
    nodes: [
      { id: 'a', x: 0, y: 0,   z: 0 },
      { id: 'm', x: 0, y: H/2, z: 0 },
      { id: 'b', x: 0, y: H,   z: 0 },
    ],
    members: [
      { id: 'm1', i: 'a', j: 'm', ...sec },
      { id: 'm2', i: 'm', j: 'b', ...sec },
    ],
    supports: [
      { node: 'a', fixity: 'fixed' as const },
      { node: 'b', fixity: 'fixed' as const },
    ],
  }
}

// ── cantilever column — Euler fixed-free ──────────────────────────────────────

describe('bucklingFromFrame — cantilever column (H = 3 m, P = 1 kN)', () => {
  const H = 3
  const P = 1                           // kN applied compression
  // Euler critical load for fixed-free: Pcr = π²EI / (2H)² = π²EI / 4H²
  const eulerLoad = (Math.PI ** 2 * EI) / (4 * H ** 2)

  it('returns at least one mode for a compressive cantilever', () => {
    const { nodes, members, supports } = cantileverColumn(H)
    const res = bucklingFromFrame(nodes, members, supports, [-P])
    expect(res).not.toBeNull()
    expect(res!.length).toBeGreaterThanOrEqual(1)
  })

  it('λ within 1.5 % of π²EI/(4H²)/P (1-element FEM is slightly stiff)', () => {
    // The 1-element Euler-Bernoulli discretisation overestimates Pcr by ≈0.75 %.
    const { nodes, members, supports } = cantileverColumn(H)
    const res = bucklingFromFrame(nodes, members, supports, [-P])!
    const relErr = Math.abs(res[0].lambda - eulerLoad) / eulerLoad
    expect(relErr).toBeLessThan(0.015)
  })

  it('critical load factor λ > 0 (compressive loading)', () => {
    const { nodes, members, supports } = cantileverColumn(H)
    const res = bucklingFromFrame(nodes, members, supports, [-P])!
    expect(res[0].lambda).toBeGreaterThan(0)
  })

  it('max-normalised buckling shape has max |component| = 1', () => {
    const { nodes, members, supports } = cantileverColumn(H)
    const res = bucklingFromFrame(nodes, members, supports, [-P])!
    const allComps = Object.values(res[0].shape).flatMap((u) => u.map(Math.abs))
    expect(Math.max(...allComps)).toBeCloseTo(1, 6)
  })

  it('tip node has dominant lateral displacement in the mode shape', () => {
    const { nodes, members, supports } = cantileverColumn(H)
    const res = bucklingFromFrame(nodes, members, supports, [-P])!
    const [ux, , uz] = res[0].shape['b']
    // The Euler mode is a lateral sway — ux or uz should be near 1
    expect(Math.abs(ux) + Math.abs(uz)).toBeGreaterThan(0.5)
  })
})

// ── 2-element fixed–fixed column — Euler clamped-clamped ─────────────────────

describe('bucklingFromFrame — fixed–fixed column 2 elements (H = 4 m, P = 1 kN)', () => {
  const H = 4
  const P = 1
  // Euler critical load for fixed-fixed: Pcr = 4π²EI / H²  (K = 0.5)
  const eulerLoad = 4 * (Math.PI ** 2 * EI) / H ** 2

  it('λ within 2 % of 4π²EI/H²/P (2-element FEM)', () => {
    const { nodes, members, supports } = fixedFixedColumn2el(H)
    const res = bucklingFromFrame(nodes, members, supports, [-P, -P])
    expect(res).not.toBeNull()
    const relErr = Math.abs(res![0].lambda - eulerLoad) / eulerLoad
    expect(relErr).toBeLessThan(0.02)
  })

  it('buckling shape: mid-node has peak lateral displacement; fixed ends have zero', () => {
    const { nodes, members, supports } = fixedFixedColumn2el(H)
    const res = bucklingFromFrame(nodes, members, supports, [-P, -P])!
    const midLat = Math.hypot(res[0].shape['m'][0], res[0].shape['m'][2])
    const aLat = Math.hypot(res[0].shape['a'][0], res[0].shape['a'][2])
    const bLat = Math.hypot(res[0].shape['b'][0], res[0].shape['b'][2])
    // Fixed ends are constrained → zero shape displacement
    expect(aLat).toBeLessThan(1e-10)
    expect(bLat).toBeLessThan(1e-10)
    // Mid-node carries the entire mode shape
    expect(midLat).toBeGreaterThanOrEqual(1)
  })
})

// ── sign / trivial cases ──────────────────────────────────────────────────────

describe('bucklingFromFrame — sign and edge cases', () => {
  it('tension member (N > 0) → null (no positive buckling mode)', () => {
    const { nodes, members, supports } = cantileverColumn(4)
    const res = bucklingFromFrame(nodes, members, supports, [+1])
    expect(res === null || res.length === 0).toBe(true)
  })

  it('zero axial force → null (no geometric stiffness)', () => {
    const { nodes, members, supports } = cantileverColumn(4)
    const res = bucklingFromFrame(nodes, members, supports, [0])
    expect(res).toBeNull()
  })

  it('cantilever: λ scales as 1/H² (Pcr ∝ 1/H²)', () => {
    // Doubling H should reduce λ by factor 4
    const P = 1
    const r1 = bucklingFromFrame(
      ...(Object.values(cantileverColumn(3)) as [F3Node[], F3Member[], F3Support[]]),
      [-P],
    )!
    const r2 = bucklingFromFrame(
      ...(Object.values(cantileverColumn(6)) as [F3Node[], F3Member[], F3Support[]]),
      [-P],
    )!
    expect(r1[0].lambda / r2[0].lambda).toBeCloseTo(4, 1)
  })
})
