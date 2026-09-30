import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { designSteelJoints } from './steelConnections'
import { modelToFrame3D } from './modelBridge'
import { resolveSteelConnections } from './steelJoints'
import type { RectSection, StructuralModel } from './model'

const steel: RectSection = {
  id: 'S1', name: 'W310x79', b: 306, h: 310, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
  material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448,
}
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function grid(sec: RectSection = steel): StructuralModel {
  const m = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3], section: sec })
  m.loads = buildGravityLoads(m, 4.8, 2.4)
  return m
}

/** A through girder ga–gm–gb (fixed ends, so its line is held against twist)
 *  carrying a secondary beam gm–sc that frames into its web at gm. */
function beamOnGirder(): StructuralModel {
  const m = grid()
  m.nodes.push({ id: 'ga', x: 0, y: 3, z: 2.5 }, { id: 'gm', x: 3, y: 3, z: 2.5 }, { id: 'gb', x: 6, y: 3, z: 2.5 }, { id: 'sc', x: 3, y: 3, z: 0 })
  m.sections.push({ ...steel, id: 'g1s', shape: 'W360x51' }, { ...steel, id: 'g2s', shape: 'W360x51' }, { ...steel, id: 'sbs', shape: 'W310x38.7' })
  m.members.push(
    { id: 'g1', i: 'ga', j: 'gm', role: 'girder', section: 'g1s' },
    { id: 'g2', i: 'gm', j: 'gb', role: 'girder', section: 'g2s' },
    { id: 'sb', i: 'gm', j: 'sc', role: 'beam', section: 'sbs' },
  )
  m.supports.push({ node: 'ga', fixity: 'fixed' }, { node: 'gb', fixity: 'fixed' }, { node: 'sc', fixity: 'pin' })
  m.loads = buildGravityLoads(m, 4.8, 2.4)
  return m
}

const PIN = [false, false, false, false, true, true]

describe('resolveSteelConnections — one decision, before the analysis', () => {
  it('a steel beam end on a column is a moment connection; the analysis holds it rigid', () => {
    const m = grid()
    const r = resolveSteelConnections(m)
    for (const mem of m.members.filter((x) => x.role !== 'column')) expect(r.get(mem.id)).toEqual({ iEnd: 'moment', jEnd: 'moment' })
    for (const f of modelToFrame3D(m).members) { expect(f.relI).toBeUndefined(); expect(f.relJ).toBeUndefined() }
  })

  it('concrete and timber members are not resolved', () => {
    expect(resolveSteelConnections(grid({ ...steel, material: undefined, shape: undefined })).size).toBe(0)
    expect(resolveSteelConnections(grid({ ...steel, material: 'wood', shape: undefined })).size).toBe(0)
  })

  it('a beam carried by a through girder is a pin there; the girder runs through continuous', () => {
    const m = beamOnGirder()
    const r = resolveSteelConnections(m)
    expect(r.get('sb')?.iEnd).toBe('simple')
    expect(r.get('g1')?.jEnd).toBeUndefined()
    expect(r.get('g2')?.iEnd).toBeUndefined()
    const f = modelToFrame3D(m).members
    expect(f.find((x) => x.id === 'sb')!.relI).toEqual(PIN)
    expect(f.find((x) => x.id === 'g1')!.relJ).toBeUndefined()
  })

  it('an explicit connection always wins', () => {
    const m = grid()
    const b = m.members.find((x) => x.role === 'beam')!
    b.connections = { iEnd: 'simple' }
    const r = resolveSteelConnections(m)
    expect(r.get(b.id)).toEqual({ iEnd: 'simple', jEnd: 'moment' })
    expect(modelToFrame3D(m).members.find((x) => x.id === b.id)!.relI).toEqual(PIN)
  })
})

describe('connection design builds the joint that was analysed', () => {
  it('no beam-to-column end is downgraded to a pin the analysis did not have', () => {
    // It was: every end under 20% of φMn became a shear tab labelled "pin".
    const m = grid()
    const conns = designSteelJoints(m, designStructure(m, soil)!).flatMap((j) => j.connections)
    expect(conns.length).toBeGreaterThan(0)
    for (const c of conns) { expect(c.pinned).toBe(false); expect(c.connType).not.toBe('shear-tab') }
  })

  it('a Simple end is a shear tab, and pinned in the analysis too', () => {
    const m = grid()
    const b = m.members.find((x) => x.role === 'beam')!
    b.connections = { iEnd: 'simple', jEnd: 'simple' }
    const conns = designSteelJoints(m, designStructure(m, soil)!).flatMap((j) => j.connections).filter((c) => c.beamId === b.id)
    expect(conns).toHaveLength(2)
    for (const c of conns) { expect(c.connType).toBe('shear-tab'); expect(c.pinned).toBe(true) }
  })

  it('the fin plate at the girder is designed as the pin it was analysed as', () => {
    const d = designStructure(beamOnGirder(), soil)!
    const c = d.beamJoints.find((j) => j.nodeId === 'gm')!.connections.find((x) => x.beamId === 'sb')!
    expect(c.pinned).toBe(true)
    expect(c.ok).toBe(true)
    expect(c.note).toBeUndefined()
  })

  it('a beam set rigid to a girder is flagged, not passed as a fin plate', () => {
    const m = beamOnGirder()
    m.members.find((x) => x.id === 'sb')!.connections = { iEnd: 'moment' }
    const d = designStructure(m, soil)!
    const c = d.beamJoints.find((j) => j.nodeId === 'gm')!.connections.find((x) => x.beamId === 'sb')!
    expect(c.ok).toBe(false)
    expect(c.note).toMatch(/Simple/)
  })
})
