/**
 * The deformed-shape mesh, as numbers (a WebGL screenshot is not evidence here).
 *
 * The fields themselves are verified in `engine/deformedShape.test.ts` against
 * closed forms and the solver's own interior nodes. This checks what the MESH
 * does with them: that it sits where the field says, amplified only in
 * position; that the colour reads true displacement at any amplification; and
 * that a slab's edge lands exactly on the deformed beam it sits on.
 */
import { describe, it, expect } from 'vitest'
import { deformedGeometry, SLAB_GRID, type DeformedMemberIn, type DeformedSlabIn } from './deformedContour'
import type { MemberDisplacement } from '../engine/deformedShape'
import type { V3 } from '../engine/frame3d'

/** A 6 m beam along +x from (x0,3,z0) sagging sin-shaped, 10 mm peak, plus
 *  a uniform shift `s` (so the ends move too). */
function beam(id: string, x0: number, z0: number, ni: string, nj: string, peak = 0.01, s: V3 = [0, 0, 0]): DeformedMemberIn {
  const n = 25, base: V3[] = [], disp: V3[] = []
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1)
    base.push([x0 + 6 * t, 3, z0])
    disp.push([s[0], s[1] - peak * Math.sin(Math.PI * t), s[2]])
  }
  const field: MemberDisplacement = { id, base, disp }
  return { field, hy: 0.25, hz: 0.15, rotDeg: 0, ni, nj }
}

describe('members', () => {
  const m = beam('b', 0, 0, 'A', 'B')
  const g = deformedGeometry([m], [], 'total', 50)!

  it('draws each ring on the DEFORMED centreline, amplified', () => {
    // Station 12 is midspan: centroid of its ring = base + 50 × (0, −0.01, 0).
    const R = 8, k = 12
    let cy = 0
    for (let c = 0; c < R; c++) cy += g.position[(k * R + c) * 3 + 1]
    expect(cy / R).toBeCloseTo(3 - 50 * 0.01, 9)
  })

  it('colours by TRUE displacement — the amplification moves geometry only', () => {
    const g1 = deformedGeometry([m], [], 'total', 1)!
    expect([...g1.value]).toEqual([...g.value])
    expect(g.domain.max).toBeCloseTo(10, 9)                 // mm
    expect(Math.max(...g.value)).toBeCloseTo(1, 9)          // the peak saturates the ramp
    expect(Math.min(...g.value)).toBeCloseTo(0, 9)          // the supports, at zero
  })

  it('gives a signed component a domain symmetric about zero', () => {
    const d = deformedGeometry([m], [], 'uy', 1)!.domain
    expect(d.signed).toBe(true)
    expect(d.min).toBeCloseTo(-10, 9); expect(d.max).toBeCloseTo(10, 9)
  })

  it('closes both ends', () => {
    // Watertight ⇔ every edge (by position) is shared by two triangles.
    const key = (i: number) => [0, 1, 2].map((c) => g.position[i * 3 + c].toFixed(6)).join(',')
    const edges = new Map<string, number>()
    for (let i = 0; i < g.index.length; i += 3) {
      const t = [g.index[i], g.index[i + 1], g.index[i + 2]].map(key)
      for (let e = 0; e < 3; e++) {
        const [p, q] = [t[e], t[(e + 1) % 3]].sort()
        if (p !== q) edges.set(p + '|' + q, (edges.get(p + '|' + q) ?? 0) + 1)
      }
    }
    expect([...edges.values()].filter((v) => v < 2)).toHaveLength(0)
  })

  it('returns null for nothing to draw', () => {
    expect(deformedGeometry([], [], 'total', 1)).toBeNull()
  })
})

describe('slabs follow their deformed edge beams', () => {
  // A 6 × 5 panel A(0,3,0) B(6,3,0) C(6,3,5) D(0,3,5): beams on A–B and D–C
  // (the long edges), none on the short edges.
  const ab = beam('ab', 0, 0, 'A', 'B', 0.01)
  const dc = beam('dc', 0, 5, 'D', 'C', 0.02)
  const slab: DeformedSlabIn = {
    corners: ['A', 'B', 'C', 'D'],
    pos: [[0, 3, 0], [6, 3, 0], [6, 3, 5], [0, 3, 5]],
    disp: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  }
  const amp = 40
  const g = deformedGeometry([ab, dc], [slab], 'total', amp)!
  const N = SLAB_GRID
  const slabFirst = g.position.length / 3 - (N + 1) * (N + 1)
  const vert = (i: number, j: number) => slabFirst + j * (N + 1) + i

  it('puts the slab edge ON the beam\'s deflected line', () => {
    for (let i = 0; i <= N; i++) {
      const u = i / N
      const y = g.position[vert(i, 0) * 3 + 1]
      expect(y).toBeCloseTo(3 - amp * 0.01 * Math.sin(Math.PI * u), 6)
      const y2 = g.position[vert(i, N) * 3 + 1]
      expect(y2).toBeCloseTo(3 - amp * 0.02 * Math.sin(Math.PI * u), 6)
    }
  })

  it('blends between them inside — halfway across, halfway between', () => {
    const y = g.position[vert(N / 2, N / 2) * 3 + 1]
    expect(y).toBeCloseTo(3 - amp * 0.015, 6)
  })

  it('draws a beam-less edge straight between its corners', () => {
    // The short edge B–C has no member: every point on it has zero displacement.
    for (let j = 0; j <= N; j++) expect(g.position[vert(N, j) * 3 + 1]).toBeCloseTo(3, 9)
  })

  it('finds an edge member whichever way it runs', () => {
    const flipped: DeformedMemberIn = { ...ab, ni: 'B', nj: 'A',
      field: { ...ab.field, base: [...ab.field.base].reverse(), disp: [...ab.field.disp].reverse() } }
    const g2 = deformedGeometry([flipped, dc], [slab], 'total', amp)!
    const first2 = g2.position.length / 3 - (N + 1) * (N + 1)
    for (let i = 0; i <= N; i++) {
      expect(g2.position[(first2 + i) * 3 + 1]).toBeCloseTo(g.position[vert(i, 0) * 3 + 1], 9)
    }
  })
})

// ── From a real model and its analysis ─────────────────────────────────────
import { deformedInputs } from './deformedContour'
import { generateGridModel } from '../engine/modelBuilder'
import { modelToFrame3D } from '../engine/modelBridge'
import { solveFrame3D, localAxes } from '../engine/frame3d'
import { maxDisplacement } from '../engine/deformedShape'

describe('deformedInputs — the page\'s path, on a generated 2×1-bay, 2-storey frame', () => {
  const sec = { id: 'S', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.5, 3], section: sec })
  const br = modelToFrame3D(model, { useShells: false })
  // The generator adds no loads (the Loading step does); give every
  // horizontal member a gravity UDL so the frame actually deflects.
  const y = new Map(br.nodes.map((n) => [n.id, n.y]))
  const udl = br.members.filter((m) => Math.abs(y.get(m.i)! - y.get(m.j)!) < 1e-9)
    .map((m) => ({ kind: 'member-udl' as const, member: m.id, w: 20, cat: 'D' as const }))
  const r = solveFrame3D(br.nodes, br.members, br.supports, [...br.loads, ...udl])!
  const inp = deformedInputs(model, r.d, r.members, br)

  it('gives every member a field and every slab a patch', () => {
    expect(r, 'fixture must solve').toBeTruthy()
    expect(inp.members).toHaveLength(model.members.length)
    expect(inp.slabs).toHaveLength(model.plates.length)
  })

  it('pins each member ends to the solver nodal displacements', () => {
    const k = new Map(model.nodes.map((n, i) => [n.id, i]))
    for (const m of inp.members) {
      const di = r.d.slice(6 * k.get(m.ni)!, 6 * k.get(m.ni)! + 3), dj = r.d.slice(6 * k.get(m.nj)!, 6 * k.get(m.nj)! + 3)
      const f = m.field.disp
      for (let c = 0; c < 3; c++) {
        expect(f[0][c]).toBeCloseTo(di[c], 12)
        expect(f[f.length - 1][c]).toBeCloseTo(dj[c], 12)
      }
    }
  })

  it('finds the in-span sag: the peak is inside a beam, below both its ends', () => {
    const { value, id } = maxDisplacement(inp.fields)
    expect(value).toBeGreaterThan(0)
    const m = inp.members.find((x) => x.field.id === id)!
    const mag = (v: readonly number[]) => Math.hypot(v[0], v[1], v[2])
    const ends = Math.max(mag(m.field.disp[0]), mag(m.field.disp[m.field.disp.length - 1]))
    expect(value).toBeGreaterThan(ends)
  })

  it('uses the EI the analysis solved with — every beam leaves its joint at the solved rotation', () => {
    // Pinned ends and an in-span peak hold for ANY EI (a sabotage doubling E
    // passed both). The end SLOPE does not: invert the first Hermite step with
    // the bridge's true EI and it must equal θ at the joint, about the beam's
    // own z′ — only when the drawn curve was integrated with that same EI.
    const k = new Map(model.nodes.map((n, i) => [n.id, i]))
    const props = new Map(br.members.map((m) => [m.id, m]))
    const res = new Map(r.members.map((m) => [m.id, m]))
    let checked = 0, worst = 0, scale = 0
    for (const m of inp.members) {
      if (Math.abs(m.field.base[0][1] - m.field.base[m.field.base.length - 1][1]) > 1e-9) continue   // beams only
      const pr = props.get(m.field.id)!, fr = res.get(m.field.id)!
      const EI = pr.E * pr.Iz * 1e-9
      const dir = [0, 1, 2].map((c) => m.field.base[m.field.base.length - 1][c] - m.field.base[0][c]) as [number, number, number]
      const [, ey, ez] = localAxes(dir, m.rotDeg)
      const v = (i: number) => m.field.disp[i][0] * ey[0] + m.field.disp[i][1] * ey[1] + m.field.disp[i][2] * ey[2]
      const x1 = fr.xs[1] - fr.xs[0]
      const p0 = fr.Mz[0] / EI, p1 = fr.Mz[1] / EI, d0 = fr.Vy[0] / EI, d1 = fr.Vy[1] / EI
      const slope = (v(1) - v(0)) / x1 - x1 * (7 * p0 + 3 * p1) / 20 - x1 * x1 * (d0 / 20 - d1 / 30)
      const ki = k.get(m.ni)!
      const theta = r.d[6 * ki + 3] * ez[0] + r.d[6 * ki + 4] * ez[1] + r.d[6 * ki + 5] * ez[2]
      worst = Math.max(worst, Math.abs(slope - theta)); scale = Math.max(scale, Math.abs(theta)); checked++
    }
    expect(checked).toBeGreaterThan(4)
    expect(scale).toBeGreaterThan(1e-5)
    expect(worst / scale).toBeLessThan(1e-6)
  })

  it('hangs a beam half a depth below its node, and not a column', () => {
    const roles = new Map(model.members.map((m) => [m.id, m.role]))
    for (const m of inp.members) {
      const role = roles.get(m.field.id)
      if (role === 'column') expect(m.drop).toBe(0)
      else expect(m.drop).toBeCloseTo(0.25, 9)
    }
    expect(inp.diagonal).toBeGreaterThan(12)
  })

  it('builds the whole mesh from it', () => {
    const g = deformedGeometry(inp.members, inp.slabs, 'total', 100)!
    expect(g.index.length).toBeGreaterThan(0)
    expect(g.domain.max).toBeGreaterThan(0)
  })
})

describe('the page wires it the way the analysis ran', () => {
  const src = import.meta.glob('../pages/ModelSpace.tsx', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
  const page = Object.values(src)[0]
  const memo = page.slice(page.indexOf('const deformInfo = useMemo('), page.indexOf('const deformActive'))
  // the bridge is shared with the shell stress contour (`anaBridge`)
  const bridge = page.slice(page.indexOf('const anaBridge = useMemo('), page.indexOf('const shellFactors'))
  it('rebuilds the bridge with the SAME three options the solver worker used', () => {
    // The curve is ∬M/EI pinned to solved joints: a different EI draws a
    // member that misses its own nodes.
    expect(memo).toContain('const br = anaBridge')
    expect(memo).not.toContain('modelToFrame3D')
    expect(bridge).toMatch(/modelToFrame3D\(model, \{ crackedSections: cracked, shearDeformation: shearDef, beamTopOfSteel: beamTopSteel \}\)/)
    const worker = import.meta.glob('../engine/solverWorker.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>
    expect(Object.values(worker)[0]).toMatch(/modelToFrame3D\(msg\.model, \{ crackedSections: msg\.crackedSections, shearDeformation: msg\.shearDeformation, beamTopOfSteel: msg\.beamTopOfSteel \}\)/)
  })
  it('reads the governing combo\'s displacements and member results', () => {
    expect(memo).toContain('deformedInputs(model, govRes.d, govRes.members, br)')
  })
  it('replaces the solid model while it is on, rather than drawing over it', () => {
    expect(page).toContain('{!deformActive && model.members.map((m) => {')
    expect(page).toContain('{!deformActive && model.plates.map((p) => {')
    expect(page).toMatch(/<DeformedShape3D geo=\{deformInfo\.geo\} bands=\{bands\} \/>/)
  })
})
