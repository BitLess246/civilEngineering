import { describe, it, expect } from 'vitest'
import { autoRigidOffsets } from './rigidEndZones'
import { shapeByName } from './aiscSections'
import { emptyModel, type StructuralModel, type RectSection } from './model'

const col: RectSection = { id: 'C', name: 'col', b: 400, h: 600, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const beam: RectSection = { id: 'B', name: 'beam', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }

// Portal: column bl→tl (vertical), beam tl→tr (along X). Beam frames into the
// column at tl; column frames into nothing else at tl besides the beam.
function portal(): StructuralModel {
  return {
    ...emptyModel('t'),
    nodes: [
      { id: 'bl', x: 0, y: 0, z: 0 }, { id: 'tl', x: 0, y: 4, z: 0 }, { id: 'tr', x: 6, y: 4, z: 0 },
    ],
    sections: [col, beam],
    members: [
      { id: 'cL', i: 'bl', j: 'tl', role: 'column', section: 'C' },
      { id: 'bm', i: 'tl', j: 'tr', role: 'beam', section: 'B' },
    ],
    supports: [{ node: 'bl', fixity: 'fixed' }],
  }
}

describe('autoRigidOffsets', () => {
  it('returns an empty map for factor ≤ 0', () => {
    expect(autoRigidOffsets(portal(), 0).size).toBe(0)
  })

  it('beam gets an inward i-end offset = factor·(column DEPTH/2) along +X (ETABS face offset)', () => {
    const m = autoRigidOffsets(portal(), 1)
    const bm = m.get('bm')!
    expect(bm).toBeTruthy()
    // Columns are oriented depth-along-X in this app (Member3D/MemberSteel3D,
    // joint designer): h=600 lies along X, b=400 along Z. The X-beam's offset is
    // the support half-DEPTH h/2 = 0.3 m — matching ETABS auto end offsets.
    expect(bm.offI![0]).toBeCloseTo(0.3, 6)
    expect(bm.offI![1]).toBeCloseTo(0, 9)
    expect(bm.offI![2]).toBeCloseTo(0, 9)
    // beam free end (tr) has no other member → no jEnd offset
    expect(bm.offJ).toBeUndefined()
  })

  it('a Z-girder at the same joint gets the column WIDTH/2 (weak-direction face)', () => {
    const model = portal()
    model.nodes.push({ id: 'tz', x: 0, y: 4, z: 5 })
    model.members.push({ id: 'gz', i: 'tl', j: 'tz', role: 'girder', section: 'B' })
    const gz = autoRigidOffsets(model, 1).get('gz')!
    expect(gz.offI![2]).toBeCloseTo(0.2, 6)   // b/2 = 400/2 mm along +Z
  })

  it('column gets an inward j-end offset = factor·(beam depth/2) along +Y', () => {
    const m = autoRigidOffsets(portal(), 1)
    const cL = m.get('cL')!
    // beam at tl: along X, depth h=500 along... for a horizontal member local y'≈up(Y),
    // so the beam's extent along the column axis (Y) = h/2 = 0.25 m. offJ points j→i (−Y).
    expect(cL.offJ![1]).toBeCloseTo(-0.25, 6)
    expect(cL.offI).toBeUndefined()   // base node bl has no other member
  })

  it('scales linearly with the rigid-zone factor', () => {
    const full = autoRigidOffsets(portal(), 1).get('bm')!.offI![0]
    const half = autoRigidOffsets(portal(), 0.5).get('bm')!.offI![0]
    expect(half).toBeCloseTo(full / 2, 9)
  })

  it('per-member rigidZoneFactor overrides the model factor (0 excludes the member)', () => {
    const model = portal()
    model.members[1].rigidZoneFactor = 0   // exclude the beam
    const m = autoRigidOffsets(model, 1)
    expect(m.get('bm')).toBeUndefined()    // beam excluded
    expect(m.get('cL')).toBeTruthy()       // column still gets its zone

    const model2 = portal()
    model2.members[1].rigidZoneFactor = 0.5
    expect(autoRigidOffsets(model2, 1).get('bm')!.offI![0]).toBeCloseTo(0.15, 6)  // 0.5 × h/2 = 0.5 × 0.3
  })

  it('resolves steel AISC shape dimensions, not the bounding-box b/h', () => {
    const shp = shapeByName('W310x97')!
    const colSteel: RectSection = {
      id: 'CS', name: 'W310x97', b: 1, h: 1,           // bogus bounding box
      fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
      material: 'steel', shape: 'W310x97', steelFy: 345,
    }
    const model: StructuralModel = {
      ...emptyModel('t'),
      nodes: [{ id: 'bl', x: 0, y: 0, z: 0 }, { id: 'tl', x: 0, y: 4, z: 0 }, { id: 'tr', x: 6, y: 4, z: 0 }],
      sections: [colSteel, beam],
      members: [
        { id: 'cL', i: 'bl', j: 'tl', role: 'column', section: 'CS' },
        { id: 'bm', i: 'tl', j: 'tr', role: 'beam', section: 'B' },
      ],
      supports: [{ node: 'bl', fixity: 'fixed' }],
    }
    // beam i-end zone uses the steel column's DEPTH d along X (flanges face ±X
    // per the app orientation — the X-beam frames into the flange), not b/h = 1 mm.
    const bm = autoRigidOffsets(model, 1).get('bm')!
    expect(bm.offI![0]).toBeCloseTo((shp.d! / 1000) / 2, 6)
  })

  it('caps the total offset so the clear span stays positive', () => {
    // a very short member between two big columns would otherwise over-shrink
    const model: StructuralModel = {
      ...emptyModel('t'),
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 0.3, y: 0, z: 0 },
        { id: 'a2', x: 0, y: 3, z: 0 }, { id: 'b2', x: 0.3, y: 3, z: 0 }],
      sections: [col],
      members: [
        { id: 'short', i: 'a', j: 'b', role: 'beam', section: 'C' },
        { id: 'cA', i: 'a', j: 'a2', role: 'column', section: 'C' },
        { id: 'cB', i: 'b', j: 'b2', role: 'column', section: 'C' },
      ],
      supports: [{ node: 'a', fixity: 'fixed' }, { node: 'b', fixity: 'fixed' }],
    }
    const e = autoRigidOffsets(model, 1).get('short')!
    const li = Math.hypot(...(e.offI ?? [0, 0, 0]))
    const lj = Math.hypot(...(e.offJ ?? [0, 0, 0]))
    expect(li + lj).toBeLessThanOrEqual(0.9 * 0.3 + 1e-9)
  })
})
