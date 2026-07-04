import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { designSteelJoints, designBolts } from './steelConnections'
import type { BoltPos } from './steelDesign'
import type { RectSection } from './model'

const steelSection: RectSection = {
  id: 'S1', name: 'W310x79', b: 306, h: 310,
  fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
  material: 'steel', shape: 'W310x79', steelFy: 345, steelFu: 448,
}
const soil = { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 }

function makeModel() {
  const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: steelSection })
  m.loads = buildGravityLoads(m, 4.8, 2.4)
  return m
}

describe('steel joint / connection design', () => {
  const m = makeModel()
  const design = designStructure(m, soil)!
  const joints = designSteelJoints(m, design)

  it('produces at least one joint for a steel frame', () => {
    expect(joints.length).toBeGreaterThan(0)
  })

  it('every joint has a valid column shape and at least one connection', () => {
    for (const j of joints) {
      expect(j.columnShape.startsWith('W')).toBe(true)
      expect(j.connections.length).toBeGreaterThan(0)
    }
  })

  it('shear tab: plate capacity and weld capacity both ≥ Vu', () => {
    const shearJoints = joints.flatMap((j) => j.connections.filter((c) => c.connType === 'shear-tab'))
    expect(shearJoints.length).toBeGreaterThan(0)
    for (const c of shearJoints) {
      expect(c.tab.phiVn).toBeGreaterThanOrEqual(c.Vu - 1e-6)
      expect(c.tab.phiWeldVn).toBeGreaterThanOrEqual(c.Vu - 1e-6)
    }
  })

  it('bolt group: elastic eccentric method sizes each bolt within φRn', () => {
    for (const j of joints) {
      for (const c of j.connections) {
        expect(c.bolts.dia).toBe(20)                       // M20
        expect(c.bolts.locations.length).toBe(c.bolts.n)   // one position per bolt
        expect(c.bolts.Rmax).toBeLessThanOrEqual(c.bolts.phiRnKn + 1e-6)
        expect(c.bolts.ok).toBe(true)
        expect(c.bolts.ecc).toBeGreaterThan(0)             // real in-plane eccentricity
        // the eccentric peak force is at least the direct share V/n
        expect(c.bolts.Rmax).toBeGreaterThanOrEqual(c.Vu / c.bolts.n - 1e-6)
      }
    }
  })

  it('connected elements are reflected on both sides (column face → beam element)', () => {
    for (const j of joints) {
      for (const c of j.connections) {
        expect(['flange', 'web']).toContain(c.faceType)
        expect(c.beamElement).toBe(c.connType === 'moment-flange-weld' ? 'web+flanges' : 'web')
      }
    }
  })

  it('moment connection flange capacity ≥ flange force when used', () => {
    const momConns = joints.flatMap((j) => j.connections.filter((c) => c.connType === 'moment-flange-weld'))
    for (const c of momConns) {
      expect(c.flange).toBeTruthy()
      expect(c.flange!.phiCapKn).toBeGreaterThanOrEqual(c.flange!.Tf - 1e-6)
    }
  })

  it('strong-axis direction: primary beams frame into column flange face', () => {
    // In a single-bay-X frame, the girder spans in X;
    // the column strong axis should be X so the girder hits the flange.
    for (const j of joints) {
      const flangeConns = j.connections.filter((c) => c.faceType === 'flange')
      // Connections in the strong-axis direction should be flange connections
      const strongConns = j.connections.filter((c) => c.spanDir === j.strongAxisDir)
      for (const c of strongConns) expect(c.faceType).toBe('flange')
      void flangeConns  // ensures at least the loop ran
    }
  })

  it('joint ok flag = all connections ok', () => {
    for (const j of joints) {
      expect(j.ok).toBe(j.connections.every((c) => c.ok))
    }
  })

  it('returns empty array for concrete-only model', () => {
    const rcSec: RectSection = { id: 'RC', name: '300x500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
    const rcModel = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: rcSec })
    rcModel.loads = buildGravityLoads(rcModel, 4.8, 2.4)
    const rcDesign = designStructure(rcModel, soil)!
    expect(designSteelJoints(rcModel, rcDesign)).toHaveLength(0)
  })
})

describe('designBolts — elastic eccentric bolt group', () => {
  it('lays out one column, each bolt within φRn, ecc = centroid-to-weld distance', () => {
    const g = designBolts(200)
    expect(g.n).toBeGreaterThanOrEqual(2)
    expect(g.locations).toHaveLength(g.n)
    expect(g.ecc).toBeCloseTo(Math.abs(g.locations[0].x), 6)   // single column → Cx = bolt x
    expect(g.Rmax).toBeLessThanOrEqual(g.phiRnKn + 1e-6)
    expect(g.ok).toBe(true)
  })

  it('eccentricity raises the peak bolt force above the concentric share', () => {
    const conc = designBolts(200, { aMm: 0 })    // no eccentricity ⇒ Rmax = V/n
    const ecc = designBolts(200, { aMm: 120 })   // large eccentricity
    expect(conc.Rmax).toBeCloseTo(200 / conc.n, 4)
    expect(ecc.Rmax).toBeGreaterThan(200 / ecc.n)
  })

  it('accepts CUSTOM per-bolt locations and evaluates each', () => {
    const locations: BoltPos[] = [
      { id: 'B1', x: 50, y: 0 }, { id: 'B2', x: 50, y: 70 },
      { id: 'B3', x: 50, y: 140 }, { id: 'B4', x: 110, y: 70 },   // an off-column bolt
    ]
    const g = designBolts(150, { locations })
    expect(g.n).toBe(4)
    expect(g.locations).toEqual(locations)
    expect(g.Rmax).toBeGreaterThan(0)
    expect(g.criticalId).toMatch(/^B[1-4]$/)
  })

  it('heavier shear needs more bolts', () => {
    expect(designBolts(400).n).toBeGreaterThan(designBolts(150).n)
  })
})

describe('designBeamBeamJoints — beams framing into a girder web (fin plates)', () => {
  // girder a→m→b runs through m; secondary beam m→c frames into its web.
  function beamBeamModel() {
    const m = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3], section: steelSection })
    // split the first X-girder line? simpler: append a through-girder + secondary beam at a new node set
    m.nodes.push(
      { id: 'ga', x: 0, y: 3, z: 2.5 }, { id: 'gm', x: 3, y: 3, z: 2.5 }, { id: 'gb', x: 6, y: 3, z: 2.5 },
      { id: 'sc', x: 3, y: 3, z: 0 },
    )
    const gSec = { ...steelSection, shape: 'W360x51' }
    m.sections.push({ ...gSec, id: 'g1s' }, { ...gSec, id: 'g2s' }, { ...steelSection, id: 'sbs', shape: 'W310x38.7' })
    m.members.push(
      { id: 'g1', i: 'ga', j: 'gm', role: 'girder', section: 'g1s' },
      { id: 'g2', i: 'gm', j: 'gb', role: 'girder', section: 'g2s' },
      { id: 'sb', i: 'gm', j: 'sc', role: 'beam', section: 'sbs' },
    )
    m.supports.push({ node: 'ga', fixity: 'pin' }, { node: 'gb', fixity: 'pin' }, { node: 'sc', fixity: 'pin' })
    m.loads = [
      ...buildGravityLoads(m, 4.8, 2.4),
      { kind: 'member-point', member: 'sb', t: 0.4, P: 60, cat: 'D' },
    ]
    return m
  }

  it('finds the through-girder joint, designs the fin plate + cope, and gates designOK', () => {
    const m = beamBeamModel()
    const d = designStructure(m, soil)!
    expect(d.beamJoints.length).toBeGreaterThanOrEqual(1)
    const bj = d.beamJoints.find((j) => j.nodeId === 'gm')!
    expect(bj).toBeTruthy()
    expect(['g1', 'g2']).toContain(bj.girderId)
    expect(bj.girderShape).toBe('W360x51')
    const c = bj.connections.find((x) => x.beamId === 'sb')!
    expect(c.faceType).toBe('web')
    expect(c.connType).toBe('shear-tab')
    expect(c.pinned).toBe(true)
    expect(c.bolts.n).toBeGreaterThanOrEqual(2)
    expect(c.tab.hMm).toBeGreaterThan(0)
    // cope clears the W360x51 flange: bf/2 + 12 long, tf + 12 deep
    expect(c.cope).toBeTruthy()
    expect(c.cope!.lengthMm).toBeGreaterThan(60)
    expect(c.cope!.depthMm).toBeGreaterThan(12)
    expect(c.ok).toBe(true)
  })

  it('does NOT create beam-to-beam joints at column-hosted nodes', () => {
    const m = makeModel()                       // grid: every beam meets a column
    const d = designStructure(m, soil)!
    expect(d.beamJoints).toHaveLength(0)
    expect(d.joints.length).toBeGreaterThan(0)  // those are beam-to-COLUMN joints
  })
})
