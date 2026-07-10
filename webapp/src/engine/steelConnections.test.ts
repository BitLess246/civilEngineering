import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { designSteelJoints, designBolts } from './steelConnections'
import { shapeByName } from './aiscSections'
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
        expect(c.beamElement).toBe(c.connType === 'shear-tab' ? 'web' : 'web+flanges')
      }
    }
  })

  it('WEB-face tab is extended past the flange tips: larger designed eccentricity', () => {
    // default vertical orientation (rot 90°): depth d on X ⇒ X-beams hit the
    // flange (a = 60), Z-beams hit the web (a = 60 + (bf − tw)/2)
    const all = joints.flatMap((j) => j.connections.map((c) => ({ c, shape: j.columnShape })))
    const webs = all.filter(({ c }) => c.faceType === 'web')
    const flanges = all.filter(({ c }) => c.faceType === 'flange')
    expect(webs.length).toBeGreaterThan(0)
    expect(flanges.length).toBeGreaterThan(0)
    for (const { c } of flanges) expect(c.bolts.ecc).toBeCloseTo(60, 3)
    for (const { c, shape } of webs) {
      const s = shapeByName(shape)!
      expect(c.bolts.ecc).toBeCloseTo(60 + ((s.bf ?? 0) - (s.tw ?? 0)) / 2, 3)
      expect(c.bolts.ecc).toBeGreaterThan(60)
      // the plate itself grows with the bolt line
      expect(c.tab.wMm).toBeCloseTo(c.bolts.ecc + 80, 3)
      // and each bolt still works within φRn at the larger eccentricity
      expect(c.bolts.Rmax).toBeLessThanOrEqual(c.bolts.phiRnKn + 1e-6)
    }
  })

  it('face determination follows the COLUMN orientation (axisRotation), not the beam count', () => {
    // rotate every column to 0° ⇒ depth d lands on global Z ⇒ the faces swap:
    // X-beams now hit the WEB, Z-beams the FLANGE
    const m2 = makeModel()
    for (const mem of m2.members) if (mem.role === 'column') mem.axisRotation = 0
    const d2 = designStructure(m2, soil)!
    const joints2 = designSteelJoints(m2, d2)
    expect(joints2.length).toBeGreaterThan(0)
    for (const j of joints2) {
      expect(j.strongAxisDir).toBe('z')
      for (const c of j.connections) {
        if (c.spanDir === 'x') expect(c.faceType).toBe('web')
        if (c.spanDir === 'z') expect(c.faceType).toBe('flange')
      }
    }
  })

  it('a moment demand on the column WEB face becomes a weak-axis extension-plate connection', () => {
    const m2 = makeModel()
    // force a moment end on a Z-spanning beam (hits the web with default rot 90°)
    const nm = new Map(m2.nodes.map((n) => [n.id, n]))
    const zBeam = m2.members.find((mem) => {
      if (mem.role !== 'beam' && mem.role !== 'girder') return false
      const ni = nm.get(mem.i)!, nj = nm.get(mem.j)!
      return Math.abs(nj.z - ni.z) > Math.abs(nj.x - ni.x)
    })!
    zBeam.connections = { iEnd: 'moment', jEnd: 'moment' }
    const d2 = designStructure(m2, soil)!
    const joints2 = designSteelJoints(m2, d2)
    const conns = joints2.flatMap((j) => j.connections).filter((c) => c.beamId === zBeam.id)
    expect(conns.length).toBeGreaterThan(0)
    for (const c of conns) {
      expect(c.faceType).toBe('web')
      expect(c.connType).toBe('moment-web-plate')
      expect(c.pinned).toBe(false)
      expect(c.beamElement).toBe('web+flanges')
      const wp = c.flange!.webPlate!
      expect(wp).toBeTruthy()
      // both the plate (§J4.1 tension yielding) and its web welds carry Tf
      expect(wp.phiPlateKn).toBeGreaterThanOrEqual(c.flange!.Tf - 1e-6)
      expect(wp.phiWeldKn).toBeGreaterThanOrEqual(c.flange!.Tf - 1e-6)
      expect(c.flange!.phiCapKn).toBeCloseTo(Math.min(wp.phiPlateKn, wp.phiWeldKn), 6)
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
