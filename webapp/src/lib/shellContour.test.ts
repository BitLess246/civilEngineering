/**
 * The contour mesh, as numbers.
 *
 * This project cannot trust a screenshot of a WebGL canvas — the capture reads
 * black often enough that pixels are not evidence (CLAUDE.md). So the geometry
 * is checked here instead: the right number of triangles, a colour on every
 * node, the domain the legend will be labelled with, and the two ways a
 * contour silently lies (a hole in the mesh, and a stray triangle at the
 * origin).
 *
 * Driven through the engine's own mesher and solver rather than a hand-made
 * fixture, so a change in either shows up here.
 */
import { describe, it, expect } from 'vitest'
import {
  rectPlateMesh, solveShell, recoverShellStress,
  type ShellNode, type ShellElem, type ShellSupport,
} from '../engine/shell'
import { contourData, contourGeometry } from './shellContour'
import { normalise, stressColorRGB } from './stressScale'

/** A 4 × 3 m plate, meshed 4×3, clamped on all four edges, under pressure. */
function plate() {
  const { nodes, elems } = rectPlateMesh(4, 3, 4, 3, 25e6, 0.2, 0.2)
  const edge = (n: ShellNode) =>
    Math.abs(n.x) < 1e-9 || Math.abs(n.x - 4) < 1e-9 ||
    Math.abs(n.y) < 1e-9 || Math.abs(n.y - 3) < 1e-9
  const supports: ShellSupport[] = nodes.filter(edge).map((n) => ({
    node: n.id, ux: true, uy: true, uz: true, rx: true, ry: true, rz: true,
  }))
  const result = solveShell(nodes, elems, supports, [], elems.map((e) => ({ elem: e.id, q: -5 })))
  expect(result, 'the shell solve must succeed for this fixture to mean anything').toBeTruthy()
  return { nodes, elems, stresses: recoverShellStress(nodes, elems, result!) }
}

const { nodes, elems, stresses } = plate()

describe('the fixture is a real solve', () => {
  it('meshed and recovered a non-trivial field', () => {
    expect(elems.length).toBe(4 * 3 * 2)          // two triangles per cell
    expect(nodes.length).toBe(5 * 4)
    expect(stresses).toHaveLength(elems.length)
    // A clamped plate under pressure has hogging at the edge and sagging at
    // mid-span, so Mx genuinely changes sign — which is what makes this a
    // useful test of a signed contour.
    const mx = stresses.map((s) => s.Mx)
    expect(Math.min(...mx)).toBeLessThan(0)
    expect(Math.max(...mx)).toBeGreaterThan(0)
  })
})

describe('contourData', () => {
  it('smooths to every node and reports the domain the legend uses', () => {
    const { nodal, domain, peak } = contourData(nodes, elems, stresses, 'Mx')
    expect(nodal.size).toBe(nodes.length)
    for (const n of nodes) expect(Number.isFinite(nodal.get(n.id)!), n.id).toBe(true)
    // Mx is signed → the domain straddles zero symmetrically.
    expect(domain.signed).toBe(true)
    expect(domain.min).toBeCloseTo(-domain.max, 9)
    expect(normalise(0, domain)).toBeCloseTo(0.5, 12)
    // The peak is a real element carrying the largest |Mx|.
    expect(peak).toBeTruthy()
    expect(elems.some((e) => e.id === peak!.id)).toBe(true)
    expect(Math.abs(peak!.value)).toBeCloseTo(Math.max(...stresses.map((s) => Math.abs(s.Mx))), 9)
  })

  it('floors an unsigned quantity at zero', () => {
    const { domain } = contourData(nodes, elems, stresses, 'vonMises')
    expect(domain.signed).toBe(false)
    expect(domain.min).toBe(0)
    expect(domain.max).toBeGreaterThan(0)
  })
})

describe('contourGeometry', () => {
  const { nodal, domain } = contourData(nodes, elems, stresses, 'Mx')
  const g = contourGeometry(nodes, elems, nodal, domain)!

  it('emits one vertex per node and one triangle per element', () => {
    expect(g).toBeTruthy()
    expect(g.position).toHaveLength(nodes.length * 3)
    expect(g.color).toHaveLength(nodes.length * 3)
    expect(g.index).toHaveLength(elems.length * 3)
  })

  it('puts each vertex where its node actually is', () => {
    // The whole point of drawing in 3D rather than one flattened projection.
    nodes.forEach((n, i) => {
      expect(g.position[i * 3]).toBeCloseTo(n.x, 6)
      expect(g.position[i * 3 + 1]).toBeCloseTo(n.y, 6)
      expect(g.position[i * 3 + 2]).toBeCloseTo(n.z, 6)
    })
  })

  it('colours every vertex from the shared ramp', () => {
    nodes.forEach((n, i) => {
      const want = stressColorRGB(normalise(nodal.get(n.id)!, domain), domain.signed)
      for (let c = 0; c < 3; c++) {
        // 6 dp, not more: the buffer is a Float32Array and cannot carry the
        // float64 the ramp returns. Asking for 9 is asking the storage type
        // for precision it does not have.
        expect(g.color[i * 3 + c], `${n.id} ch${c}`).toBeCloseTo(want[c], 6)
        expect(g.color[i * 3 + c]).toBeGreaterThanOrEqual(0)
        expect(g.color[i * 3 + c]).toBeLessThanOrEqual(1)
      }
    })
  })

  it('indexes only nodes that exist', () => {
    // An out-of-range index is the bug that draws a triangle at the origin —
    // a stray shard hanging off the model, which reads as broken geometry
    // rather than as a missing element.
    for (const i of g.index) {
      expect(Number.isInteger(i)).toBe(true)
      expect(i).toBeGreaterThanOrEqual(0)
      expect(i).toBeLessThan(nodes.length)
    }
  })

  it('drops an element naming a node the mesh does not carry', () => {
    const ghost: ShellElem = { id: 'ghost', nodes: ['0_0', 'nope', '1_0'], E: 25e6, nu: 0.2, t: 0.2 }
    const withGhost = contourGeometry(nodes, [...elems, ghost], nodal, domain)!
    // Skipped, not indexed as undefined — and nothing else is disturbed.
    expect(withGhost.index).toHaveLength(elems.length * 3)
    expect(withGhost.index).toEqual(g.index)
  })

  it('returns null rather than an empty mesh', () => {
    expect(contourGeometry([], [], nodal, domain)).toBeNull()
    expect(contourGeometry(nodes, [], nodal, domain)).toBeNull()
    const orphan: ShellElem = { id: 'o', nodes: ['x', 'y', 'z'], E: 25e6, nu: 0.2, t: 0.2 }
    expect(contourGeometry(nodes, [orphan], nodal, domain)).toBeNull()
  })

  it('spans the ramp — a real field is not painted one flat colour', () => {
    // Guards the case where the domain collapses and every vertex takes the
    // same colour, which looks like a working contour and carries no
    // information at all.
    const seen = new Set<string>()
    for (let i = 0; i < nodes.length; i++) {
      seen.add([0, 1, 2].map((c) => g.color[i * 3 + c].toFixed(3)).join(','))
    }
    expect(seen.size).toBeGreaterThan(3)
  })
})
