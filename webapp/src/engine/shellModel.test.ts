import { describe, it, expect } from 'vitest'
import { solveModelShells, designModelSlabsFE, meshModelShells, rotateInPlaneTensor, toPanelFrames } from './shellModel'
import { type ShellNode, type ShellElem, type ElementStress, type V3 } from './shell'
import type { StructuralModel } from './model'

// A single 6×5 m slab panel, clamped at its four corners, under area D + L.
function panel(thickness = 150): StructuralModel {
  return {
    version: 1, name: 'panel',
    nodes: [
      { id: 'n0', x: 0, y: 0, z: 0 }, { id: 'n1', x: 6, y: 0, z: 0 },
      { id: 'n2', x: 6, y: 0, z: 5 }, { id: 'n3', x: 0, y: 0, z: 5 },
    ],
    sections: [], members: [],
    plates: [{ id: 's0', corners: ['n0', 'n1', 'n2', 'n3'], role: 'slab', thickness }],
    walls: [],
    supports: [
      { node: 'n0', fixity: 'fixed' }, { node: 'n1', fixity: 'fixed' },
      { node: 'n2', fixity: 'fixed' }, { node: 'n3', fixity: 'fixed' },
    ],
    loads: [
      { kind: 'area', plate: 's0', q: 6, cat: 'D' },
      { kind: 'area', plate: 's0', q: 4, cat: 'L' },
    ],
    storeys: [],
    shellElements: true,
  }
}

describe('meshModelShells', () => {
  it('reuses the model corner node ids and meshes n×n cells', () => {
    const { nodes, elems } = meshModelShells(panel(), 4)
    // 4×4 grid ⇒ 25 nodes, 2·16 = 32 triangles
    expect(nodes).toHaveLength(25)
    expect(elems).toHaveLength(32)
    for (const id of ['n0', 'n1', 'n2', 'n3']) expect(nodes.some((n) => n.id === id)).toBe(true)
    // every element id is prefixed by its plate id
    expect(elems.every((e) => e.id.startsWith('s0_'))).toBe(true)
  })
})

describe('solveModelShells', () => {
  it('returns null when the model has no plates', () => {
    expect(solveModelShells({ ...panel(), plates: [] })).toBeNull()
  })

  it('recovers a non-trivial bending field under area load', () => {
    const r = solveModelShells(panel(), { subdiv: 4 })!
    expect(r).toBeTruthy()
    expect(r.stresses).toHaveLength(32)
    const peakM = Math.max(...r.stresses.map((s) => Math.max(Math.abs(s.Mx), Math.abs(s.My))))
    expect(peakM).toBeGreaterThan(0)
  })

  it('factored field scales linearly with the load factors', () => {
    const svc = solveModelShells(panel(), { subdiv: 3, factors: { D: 1, L: 1 } })!
    const fac = solveModelShells(panel(), { subdiv: 3, factors: { D: 2, L: 2 } })!
    const peak = (r: typeof svc) => Math.max(...r.stresses.map((s) => Math.abs(s.Mx)))
    expect(peak(fac)).toBeCloseTo(2 * peak(svc), 6)
  })
})

describe('designModelSlabsFE — Wood-Armer reinforcement from the FE field', () => {
  it('designs one row per slab with positive reinforcement', () => {
    const out = designModelSlabsFE(panel(), { subdiv: 4 })!
    expect(out.rows).toHaveLength(1)
    const row = out.rows[0]
    expect(row.plate).toBe('s0')
    expect(row.thickness).toBe(150)
    // at least one face/direction needs flexural steel beyond the minimum
    const strips = [row.design.bottomX, row.design.bottomY, row.design.topX, row.design.topY]
    expect(strips.every((s) => s.As > 0 && s.spacing > 0)).toBe(true)
    expect(strips.some((s) => !s.usedMin)).toBe(true)
    // governing elements belong to this plate
    expect(row.design.govBottom.startsWith('s0_')).toBe(true)
    expect(row.design.govTop.startsWith('s0_')).toBe(true)
  })

  it('uses the NSCP 1.2D + 1.6L factored field by default (heavier than service)', () => {
    const factored = designModelSlabsFE(panel(), { subdiv: 4 })!
    const service = designModelSlabsFE(panel(), { subdiv: 4, dFactor: 1, lFactor: 1 })!
    const env = (o: typeof factored) => o.rows[0].design.moments.mxBottom + o.rows[0].design.moments.myBottom
    expect(env(factored)).toBeGreaterThan(env(service))
  })

  it('factored design never needs less steel than the service field', () => {
    const factored = designModelSlabsFE(panel(), { subdiv: 4 })!.rows[0]
    const service = designModelSlabsFE(panel(), { subdiv: 4, dFactor: 1, lFactor: 1 })!.rows[0]
    expect(factored.design.bottomX.As).toBeGreaterThanOrEqual(service.design.bottomX.As - 1e-6)
    expect(factored.design.topY.As).toBeGreaterThanOrEqual(service.design.topY.As - 1e-6)
  })

  it('skips wall panels', () => {
    const m = panel()
    m.plates[0].role = 'wall'
    const out = designModelSlabsFE(m, { subdiv: 3 })!
    expect(out.rows).toHaveLength(0)
  })
})

describe('solveModelShells — load direction and accumulation', () => {
  it('sums D and L area loads on the same panel (no last-category-wins)', () => {
    // The old pressure map keyed by element id kept only the LAST category.
    // 6 D + 4 L must equal one 10 kPa load exactly (linear solve, vmSurf is
    // homogeneous of degree 1 in the load).
    const combined = solveModelShells(panel(150), { subdiv: 3 })!
    const single = solveModelShells({ ...panel(150), loads: [{ kind: 'area', plate: 's0', q: 10, cat: 'D' }] }, { subdiv: 3 })!
    const onlyD = solveModelShells({ ...panel(150), loads: [{ kind: 'area', plate: 's0', q: 6, cat: 'D' }] }, { subdiv: 3 })!
    const peak = (r: { stresses: { vmSurf: number }[] }) => Math.max(...r.stresses.map((s) => s.vmSurf))
    expect(peak(combined)).toBeCloseTo(peak(single), 6)
    expect(peak(combined)).toBeGreaterThan(peak(onlyD))
  })

  it('gravity area loads act along global −Y regardless of plate winding', () => {
    const wound = panel(150)
    const flipped = panel(150)
    // reverse the corner cycle → element normals flip from −Y to +Y
    flipped.plates = [{ ...flipped.plates[0], corners: ['n1', 'n0', 'n3', 'n2'] }]
    const a = solveModelShells(wound, { subdiv: 3 })!
    const b = solveModelShells(flipped, { subdiv: 3 })!
    const peak = (r: { stresses: { vmSurf: number }[] }) => Math.max(...r.stresses.map((s) => s.vmSurf))
    expect(peak(a)).toBeCloseTo(peak(b), 4)
  })

  it('maps pin supports to translations-only (rotations stay free)', () => {
    const pins = panel(150)
    pins.supports = pins.supports.map((s) => ({ ...s, fixity: 'pin' as const }))
    // With free corner rotations the slab is SOFTER than fully clamped corners.
    const clamped = solveModelShells(panel(150), { subdiv: 3 })!
    const pinned = solveModelShells(pins, { subdiv: 3 })!
    const peak = (r: { stresses: { vmSurf: number }[] }) => Math.max(...r.stresses.map((s) => s.vmSurf))
    expect(pinned).toBeTruthy()
    expect(peak(pinned)).not.toBeCloseTo(peak(clamped), 6)
  })
})

describe('rotateInPlaneTensor / toPanelFrames', () => {
  it('rotates a uniaxial tensor by 90° into the transverse component', () => {
    const xy: [V3, V3, V3] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]]
    // panel frame = element frame rotated 90° about z
    const c = Math.cos(Math.PI / 2), s = Math.sin(Math.PI / 2)
    const rot: [V3, V3, V3] = [[c, s, 0], [-s, c, 0], [0, 0, 1]]
    const [sx, sy, txy] = rotateInPlaneTensor([100, 0, 0], xy, rot)
    expect(sx).toBeCloseTo(0, 9)
    expect(sy).toBeCloseTo(100, 9)
    expect(txy).toBeCloseTo(0, 9)
  })

  it('reports both triangle families of one panel in the SAME frame', () => {
    // Two triangles of one cell — x̂ along +X and x̂ along the 45° diagonal —
    // carrying the SAME global uniaxial stress [100, 0, 0] (expressed in each
    // triangle's own frame: [100,0,0] and [50,50,−50]). After the panel
    // transform both must report identical components, and the invariant must
    // stay 100. (The old code averaged these raw per-triangle values as if
    // comparable — the checkerboard the contour used to show.)
    const nodes: ShellNode[] = [
      { id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 1, y: 0, z: 0 },
      { id: 'c', x: 1, y: 1, z: 0 }, { id: 'd', x: 0, y: 1, z: 0 },
    ]
    const elems: ShellElem[] = [
      { id: 'p_0', nodes: ['a', 'b', 'c'], E: 25000, nu: 0.2, t: 150 },
      { id: 'p_1', nodes: ['a', 'c', 'd'], E: 25000, nu: 0.2, t: 150 },
    ]
    const s0 = 100, c45 = Math.SQRT1_2
    const stresses: ElementStress[] = [
      { id: 'p_0', sigmaX: s0, sigmaY: 0, tauXY: 0, sigma1: s0, sigma2: 0, vonMises: s0, vmSurf: s0, Mx: 0, My: 0, Mxy: 0 },
      { id: 'p_1', sigmaX: s0 * c45 * c45, sigmaY: s0 * c45 * c45, tauXY: -s0 * c45 * c45, sigma1: s0, sigma2: 0, vonMises: s0, vmSurf: s0, Mx: 0, My: 0, Mxy: 0 },
    ]
    const out = toPanelFrames(nodes, elems, stresses)
    const [a, b] = out
    expect(a.sigmaX).toBeCloseTo(b.sigmaX, 6)
    expect(a.sigmaY).toBeCloseTo(b.sigmaY, 6)
    expect(a.tauXY).toBeCloseTo(b.tauXY, 6)
    expect(b.vonMises).toBeCloseTo(100, 6)
    // and the rotated components are the exact tensor projection at 22.5°
    const th = Math.atan2(Math.SQRT1_2, 1 + Math.SQRT1_2)   // area-weighted mean x̂
    expect(a.sigmaX).toBeCloseTo(100 * Math.cos(th) ** 2, 6)
  })
})
