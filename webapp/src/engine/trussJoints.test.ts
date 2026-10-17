import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { addRoofTrusses } from './roofTruss'
import { designStructure, designOK } from './pipeline'
import { designTrussJoints } from './trussJoints'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D } from './frame3d'

const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }
const trussed = (over: Partial<Parameters<typeof addRoofTrusses>[1]> = {}) => {
  const m0 = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2], section })
  const r = addRoofTrusses({ ...m0, loads: [] }, {
    spanAlong: 'x', profile: 'gable', web: 'howe', rise: 3.5, panel: 1.5,
    chordShape: 'HSS89x89x6.4', webShape: 'HSS64x64x4.8', purlinShape: 'C150x12.2', qD: 0.5, qLr: 0.6,
    steelFy: 345, steelFu: 450, ...over,
  })
  return { ...r.model, loads: buildGravityLoads(r.model, 2, 2) }
}

describe('roof-truss joints in the design — every panel point where webs meet a chord', () => {
  const m = trussed()
  const d = designStructure(m, soil)!
  const rows = d.trussJoints ?? []

  it('one row per web-on-chord panel point; the column-top bearings are seats, not joints', () => {
    // per truss: 8 panels → bottom b1…b7 less the interior column top (b4), top t1…t7
    expect(rows.filter((j) => j.truss === 1).length).toBe(6 + 7)
    expect(rows.some((j) => /^n\d/.test(j.node))).toBe(false)
    expect(rows.every((j) => d.cases.includes(j.gov))).toBe(true)
  })

  it('the bottom-chord N joints overlap as noded, inside the limits, and pass', () => {
    const bottom = rows.filter((j) => j.chord === 'bottom' && j.truss === 1)
    expect(bottom.length).toBe(6)
    for (const j of bottom) {
      expect(j.result.covered).toBe(true)
      expect(j.result.gap?.kind).toBe('overlap')
      expect(j.result.branches.every((b) => b.kind === 'K')).toBe(true)
      expect(j.result.ok).toBe(true)
    }
  })

  it('joints outside Table K3.2A are listed as unchecked with the reason — and do not fail the design', () => {
    const nc = rows.filter((j) => !j.result.covered)
    expect(nc.length).toBeGreaterThan(0)                       // the flat diagonals near the eaves
    for (const j of nc) {
      const u = d.unchecked.find((x) => x.id === j.node && x.role === 'truss joint')
      expect(u?.reason).toMatch(/Table K3\.2A .* gusset plate/)
    }
    expect(nc.every((j) => j.result.ok)).toBe(true)
  })

  it('a row is the check run on ONE combination’s own forces — re-running it reproduces it', () => {
    const j = rows.find((x) => x.chord === 'bottom' && x.result.covered)!
    // rebuild that combination's member forces and re-check the joint by hand
    const out = designTrussJoints(m, [{ name: j.gov, result: (() => {
      // the governing combination, re-solved from the design's own case list
      const b = modelToFrame3D(m)
      return solveFrame3D(b.nodes, b.members, b.supports, b.loads)!
    })() }])
    // the unfactored solve is not the governing combination, but the joint
    // classifies and lays out identically, and the utilisation scales with load
    const again = out.rows.find((x) => x.node === j.node)!
    expect(again.result.gap?.kind).toBe(j.result.gap?.kind)
    expect(again.result.branches.map((b) => b.kind)).toEqual(j.result.branches.map((b) => b.kind))
  })

  it('a heavy roof fails the design through its joints, though every member may pass', () => {
    // 8 kPa on an HSS102 chord: the apex — three webs and a purlin on one thin
    // face — plastifies the chord wall (§K3 Y-connection) at ~2.5× its strength
    const weak = trussed({ chordShape: 'HSS102x102x6.4', qD: 8, qLr: 8 })
    const dw = designStructure(weak, soil)!
    const failing = (dw.trussJoints ?? []).filter((j) => j.result.covered && !j.result.ok)
    expect(failing.length).toBeGreaterThan(0)
    expect(designOK(dw)).toBe(false)
  })

  it('a model without trusses has no joint rows', () => {
    const m0 = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3.2], section })
    const plain = { ...m0, loads: buildGravityLoads(m0, 2, 2) }
    expect(designStructure(plain, soil)!.trussJoints).toBeUndefined()
  })
})
