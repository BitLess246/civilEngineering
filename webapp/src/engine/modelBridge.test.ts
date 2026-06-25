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
})
