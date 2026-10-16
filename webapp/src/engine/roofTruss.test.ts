import { describe, it, expect } from 'vitest'
import { addRoofTrusses, panelPoints, webPairs, roofingLoads, type RoofTrussSpec } from './roofTruss'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { validateMesh, hasMeshErrors } from './meshValidation'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D } from './frame3d'
import type { StructuralModel } from './model'

const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
// 2 × 1 bays (12 m along X, 5 m along Z), two storeys: roof at 6.4 m
const frame = (): StructuralModel => {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2, 3.2], section })
  return { ...m, loads: buildGravityLoads(m, 2, 2) }
}
const spec: RoofTrussSpec = {
  spanAlong: 'x', profile: 'gable', web: 'howe', rise: 1.5, panel: 1.5,
  chordShape: 'HSS89x89x6.4', webShape: 'HSS64x64x4.8', purlinShape: 'C150x12.2', qD: 0.5, qLr: 1.0,
}

describe('panel points', () => {
  it('every existing roof node is a panel point, each bay split evenly', () => {
    expect(panelPoints([0, 6, 12], 1.5, true)).toEqual([0, 1.5, 3, 4.5, 6, 7.5, 9, 10.5, 12])
    // a bay that does not divide: ceil(5/2) = 3 panels of 5/3
    const p = panelPoints([0, 5], 2, false)
    expect(p.length).toBe(4)
    expect(p[1]).toBeCloseTo(5 / 3, 12)
  })

  it('a gable gets a panel point at mid-span for its apex', () => {
    const p = panelPoints([0, 5, 10, 15], 5, true)
    expect(p).toContain(7.5)
    expect(panelPoints([0, 5, 10, 15], 5, false)).not.toContain(7.5)
  })
})

describe('web layout — a planar truss is statically determinate: m = 2j − 3', () => {
  const us = Array.from({ length: 9 }, (_, i) => i * 1.5)        // n = 8 panels
  const n = 8
  it.each(['howe', 'pratt', 'warren'] as const)('gable %s', (web) => {
    const webs = webPairs(us, web, true).length
    const m = 2 * n + webs                  // bottom + top chords + webs
    const j = (n + 1) + (n - 1)             // bottom nodes + interior top nodes
    expect(m).toBe(2 * j - 3)
  })
  it.each(['howe', 'pratt', 'warren'] as const)('flat %s', (web) => {
    const webs = webPairs(us, web, false).length
    expect(2 * n + webs).toBe(2 * (2 * (n + 1)) - 3)
  })

  it('Pratt diagonals fall toward mid-span, Howe diagonals rise toward it', () => {
    // left half, panel 1 (between points 1 and 2): [bottom, top]
    const pratt = webPairs(us, 'pratt', true).filter(([b, t]) => b !== t)
    const howe = webPairs(us, 'howe', true).filter(([b, t]) => b !== t)
    expect(pratt).toContainEqual([2, 1])     // top of the outer point down to the inner bottom
    expect(howe).toContainEqual([1, 2])      // bottom of the outer point up to the inner top
    // mirrored in the right half (panel 6, points 6–7)
    expect(pratt).toContainEqual([6, 7])
    expect(howe).toContainEqual([7, 6])
  })
})

describe('addRoofTrusses on a 12 m × 5 m roof', () => {
  const r = addRoofTrusses(frame(), spec)
  const m = r.model
  const at = (id: string) => m.nodes.find((n) => n.id === id)!

  it('one truss per grid line along X, the roof beams under them replaced, the roof slabs gone', () => {
    expect(r.reason).toBeUndefined()
    expect(r.lines).toEqual([0, 5])
    // 2 roof beams along X per line become bottom chord; 2 roof slabs go
    expect(r.removed.filter((id) => id.startsWith('bx')).length).toBe(4)
    expect(r.removed.filter((id) => id.startsWith('s')).length).toBe(2)
    expect(m.plates.some((p) => p.corners.every((c) => at(c).y > 6.39))).toBe(false)
    // the eaves girders along Z stay
    expect(m.members.filter((x) => x.id.startsWith('bz') && x.id.endsWith('.2')).length).toBe(3)
  })

  it('bears on the column tops, apex at the rise, and adds no duplicate or dangling member', () => {
    const tops = m.nodes.filter((n) => Math.abs(n.y - 6.4) < 1e-9)
    expect(Math.max(...m.nodes.map((n) => n.y))).toBeCloseTo(6.4 + 1.5, 12)
    // the existing column tops at x = 0, 6, 12 are panel points, not new nodes
    const chords = m.members.filter((x) => /^rt1\.bc/.test(x.id))
    expect(chords.length).toBe(8)
    expect(chords.some((c) => c.i === 'n0.0.2' || c.j === 'n0.0.2')).toBe(true)
    expect(tops.length).toBeGreaterThan(6)
    const issues = validateMesh(m)
    expect(hasMeshErrors(issues)).toBe(false)
    expect(issues.some((i) => i.code === 'duplicate-member')).toBe(false)
  })

  it('chords are continuous, webs pinned, everything steel; purlins join the two trusses', () => {
    const sec = new Map(m.sections.map((s) => [s.id, s]))
    const truss = m.members.filter((x) => x.id.startsWith('rt'))
    expect(truss.length).toBe(2 * (16 + 13))                   // per truss: 16 chords + 13 webs
    for (const x of truss) {
      expect(sec.get(x.section)?.material).toBe('steel')
      const bearing = (id: string) => /^n\d/.test(id)                   // an existing column-top node
      if (/\.w\d/.test(x.id)) expect(x.releases?.iEnd?.Mz && x.releases?.jEnd?.My).toBe(true)
      else {
        expect(!!x.releases?.iEnd?.Mz).toBe(bearing(x.i))              // chords: pinned only at a seat
        expect(!!x.releases?.jEnd?.Mz).toBe(bearing(x.j))
      }
    }
    const purlins = m.members.filter((x) => x.id.startsWith('pu'))
    expect(purlins.length).toBe(7)                               // one per interior top-chord point
    for (const p of purlins) expect(Math.abs(at(p.i).z - at(p.j).z)).toBeCloseTo(5, 12)
  })

  it('roofing loads total q × plan area, and a rebuild neither drops nor doubles them', () => {
    const area = 12 * 5
    const tot = (mm: StructuralModel, cat: 'D' | 'Lr') => mm.loads
      .filter((l) => l.kind === 'node' && l.roof && l.cat === cat)
      .reduce((s, l) => s + -((l as { Fy?: number }).Fy ?? 0), 0)
    const once = { ...m, loads: buildGravityLoads(m, 2, 2) }
    expect(tot(once, 'D')).toBeCloseTo(0.5 * area, 9)
    expect(tot(once, 'Lr')).toBeCloseTo(1.0 * area, 9)
    const twice = { ...once, loads: buildGravityLoads(once, 2, 2) }
    expect(tot(twice, 'D')).toBeCloseTo(0.5 * area, 9)
    expect(tot(twice, 'Lr')).toBeCloseTo(1.0 * area, 9)
    // loads only ever land on top-chord points (or the bearing, where a gable's chords meet)
    for (const p of m.roofing!.points) expect(at(p.node)).toBeDefined()
    expect(roofingLoads({ nodes: [], roofing: m.roofing })).toEqual([])
  })

  it('over two bays the truss is continuous on the middle column — its bottom chord there is in COMPRESSION', () => {
    const loaded = { ...m, loads: roofingLoads(m).filter((l) => l.cat === 'D') }
    const b = modelToFrame3D(loaded)
    const res = solveFrame3D(b.nodes, b.members, b.supports, b.loads)!
    const mid = res.members.find((x) => x.id === 'rt1.bc3')!       // last panel before the interior column
    expect(mid.N[Math.floor(mid.N.length / 2)]).toBeLessThan(0)
  })
})

describe('the truss carries its roof the way a truss does — method of sections', () => {
  // ONE 9 m bay along X, so each truss is simply carried by two columns;
  // three lines at z = 0, 5, 10 — the middle one takes a 5 m strip
  const m0 = generateGridModel({ baysX: [9], baysZ: [5, 5], storeyH: [3.2], section })
  const r = addRoofTrusses({ ...m0, loads: [] }, { ...spec, panel: 1.5, purlinShape: undefined })
  const m = { ...r.model, loads: roofingLoads(r.model).filter((l) => l.cat === 'D') }
  const b = modelToFrame3D(m)
  const res = solveFrame3D(b.nodes, b.members, b.supports, b.loads)!
  const N = (id: string) => { const mr = res.members.find((x) => x.id === id)!; return mr.N[Math.floor(mr.N.length / 2)] }

  it('solves', () => { expect(res).not.toBeNull() })

  it('bottom chord beside mid-span pulls M/h less the spread the columns take — the cut meets at the apex', () => {
    // middle line: w = qD × 5 m = 2.5 kN/m; M at mid-span = wL²/8; h = rise.
    // The seats are pins but not rollers: the two column tops resist the
    // spread with a shear H, which acts on the bottom-chord line and so comes
    // straight off the chord force. H is read from the columns' base shear.
    const w = 0.5 * 5, L = 9, h = 1.5
    const M = (w * L * L) / 8                                       // 25.31 kN·m
    const H = Math.abs(res.reactions.find((q) => q.node === 'n0.1.0')!.F[0])
    expect(H).toBeGreaterThan(0)
    expect(H).toBeLessThan(0.25 * M / h)                            // the columns take a share, not the tie
    expect(N('rt2.bc2')).toBeCloseTo(M / h - H, 0)
    expect(N('rt2.tc2')).toBeLessThan(0)                            // top chord pushes
  })

  it('an edge truss carries half the strip, so half the force', () => {
    expect(N('rt1.bc2') / N('rt2.bc2')).toBeCloseTo(0.5, 1)
  })
})

describe('meshValidation — the roofing rule', () => {
  it('flags a panel point whose node was deleted, and a negative load', () => {
    const m = addRoofTrusses(frame(), spec).model
    const node = m.roofing!.points.find((p) => p.node.startsWith('rt'))!.node
    const gone = { ...m, nodes: m.nodes.filter((n) => n.id !== node), members: m.members.filter((x) => x.i !== node && x.j !== node) }
    expect(validateMesh(gone).some((i) => i.code === 'ROOFING_POINT_MISSING' && i.refs.includes(node))).toBe(true)
    expect(validateMesh({ ...m, roofing: { ...m.roofing!, qD: -1 } }).some((i) => i.code === 'ROOFING_BAD_LOAD' && i.severity === 'error')).toBe(true)
    expect(validateMesh(m).some((i) => i.code.startsWith('ROOFING'))).toBe(false)
  })
})

describe('refusals', () => {
  it('says why instead of placing a broken truss', () => {
    expect(addRoofTrusses(frame(), { ...spec, rise: 0 }).reason).toMatch(/rise/)
    expect(addRoofTrusses(frame(), { ...spec, chordShape: 'NOPE' }).reason).toMatch(/AISC/)
    // a second set would stand on the first set's apex, which is now the highest level
    expect(addRoofTrusses(addRoofTrusses(frame(), spec).model, spec).reason).toMatch(/already carries trusses/)
    const r = addRoofTrusses(frame(), { ...spec, rise: 0 })
    expect(r.model).toEqual(frame())
  })

  it('spans the other way when asked', () => {
    const r = addRoofTrusses(frame(), { ...spec, spanAlong: 'z', panel: 1.25 })
    expect(r.lines).toEqual([0, 6, 12])
    expect(r.removed.filter((id) => id.startsWith('bz')).length).toBe(3)
  })
})
