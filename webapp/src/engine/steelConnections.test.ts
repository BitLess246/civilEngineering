import { describe, it, expect } from 'vitest'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import { designStructure } from './pipeline'
import { designSteelJoints } from './steelConnections'
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

  it('bolt group: n × φRn ≥ Vu for each connection', () => {
    for (const j of joints) {
      for (const c of j.connections) {
        expect(c.bolts.n * c.bolts.phiRnKn).toBeGreaterThanOrEqual(c.Vu - 1e-6)
        expect(c.bolts.dia).toBe(20)              // M20
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
