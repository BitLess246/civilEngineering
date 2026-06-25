import { describe, it, expect } from 'vitest'
import { modelToFrame3D } from './modelBridge'
import { emptyModel, type StructuralModel, type RectSection } from './model'

const section: RectSection = {
  id: 'S', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
}

function baseModel(): StructuralModel {
  return {
    ...emptyModel('t'),
    nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }],
    sections: [section],
    members: [{ id: 'm', i: 'a', j: 'b', role: 'beam', section: 'S' }],
    supports: [{ node: 'a', fixity: 'fixed' }],
  }
}

describe('modelToFrame3D — rigid offsets', () => {
  it('maps member offsets to F3Member offI / offJ', () => {
    const model = baseModel()
    model.members[0].offsets = { iEnd: [0, 0.3, 0], jEnd: [0, -0.2, 0] }
    const br = modelToFrame3D(model)
    const m = br.members.find((x) => x.id === 'm')!
    expect(m.offI).toEqual([0, 0.3, 0])
    expect(m.offJ).toEqual([0, -0.2, 0])
  })

  it('omits offI / offJ when no offsets are set', () => {
    const br = modelToFrame3D(baseModel())
    const m = br.members.find((x) => x.id === 'm')!
    expect(m.offI).toBeUndefined()
    expect(m.offJ).toBeUndefined()
  })

  it('applies auto rigid end zones when rigidEndZones is on', () => {
    // beam a→b plus a column at node a so the beam gets an auto i-end zone
    const model: StructuralModel = {
      ...baseModel(),
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }, { id: 'c', x: 0, y: 3, z: 0 }],
      members: [
        { id: 'm', i: 'a', j: 'b', role: 'beam', section: 'S' },
        { id: 'col', i: 'a', j: 'c', role: 'column', section: 'S' },
      ],
      rigidEndZones: true, rigidZoneFactor: 1,
    }
    const br = modelToFrame3D(model)
    const m = br.members.find((x) => x.id === 'm')!
    expect(m.offI).toBeDefined()           // auto zone at the shared joint
    expect(m.offI![0]).toBeGreaterThan(0)  // inward along +X
  })

  it('manual offsets take precedence over auto rigid zones', () => {
    const model: StructuralModel = {
      ...baseModel(),
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 4, y: 0, z: 0 }, { id: 'c', x: 0, y: 3, z: 0 }],
      members: [
        { id: 'm', i: 'a', j: 'b', role: 'beam', section: 'S', offsets: { iEnd: [0, 0.9, 0] } },
        { id: 'col', i: 'a', j: 'c', role: 'column', section: 'S' },
      ],
      rigidEndZones: true, rigidZoneFactor: 1,
    }
    const m = modelToFrame3D(model).members.find((x) => x.id === 'm')!
    expect(m.offI).toEqual([0, 0.9, 0])    // manual wins
  })
})
