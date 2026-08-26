import { describe, it, expect } from 'vitest'
import { beamAxisOffsets, addOffsets } from './beamAxisOffsets'
import { modelToFrame3D } from './modelBridge'
import { solveFrame3D } from './frame3d'
import { generateGridModel, buildGravityLoads } from './modelBuilder'
import type { StructuralModel } from './model'

const section = { id: 's1', name: 'C1', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
const model = generateGridModel({ baysX: [6, 6], baysZ: [5], storeyH: [3.2, 3.2], section })
model.loads = buildGravityLoads(model, 4.8, 2.4)

const solve = (beamTopOfSteel: boolean) => {
  const b = modelToFrame3D(model, { beamTopOfSteel })
  return { b, r: solveFrame3D(b.nodes, b.members, b.supports, b.loads)! }
}

describe('beamAxisOffsets', () => {
  const off = beamAxisOffsets(model)

  it('drops every horizontal beam to its own centroid — h/2 below the level', () => {
    const beams = model.members.filter((m) => m.role === 'beam' || m.role === 'girder')
    expect(beams.length).toBeGreaterThan(0)
    for (const m of beams) expect(off.get(m.id)).toEqual([0, -0.25, 0])
  })

  it('leaves columns alone — a column’s node line IS its axis', () => {
    for (const m of model.members.filter((m) => m.role === 'column')) {
      expect(off.has(m.id)).toBe(false)
    }
  })

  it('drops both ends by the SAME vector, so the beam translates and does not tilt', () => {
    // Applied to one end only this would rotate every beam in the frame, which
    // is a different member, not a relocated one.
    const b = modelToFrame3D(model, { beamTopOfSteel: true })
    const bm = b.members.find((m) => m.id === 'bx0.0.1')!
    expect(bm.offI).toEqual(bm.offJ)
  })

  it('skips a sloping member, which has no single level to hang from', () => {
    const ramp: StructuralModel = {
      ...model,
      nodes: [{ id: 'a', x: 0, y: 0, z: 0 }, { id: 'b', x: 6, y: 1, z: 0 }],
      members: [{ id: 'r1', i: 'a', j: 'b', role: 'beam', section: 's1' }],
    }
    expect(beamAxisOffsets(ramp).size).toBe(0)
  })

  it('says nothing about a member whose section it cannot find', () => {
    const orphan: StructuralModel = {
      ...model,
      nodes: [{ id: 'a', x: 0, y: 3, z: 0 }, { id: 'b', x: 6, y: 3, z: 0 }],
      members: [{ id: 'r1', i: 'a', j: 'b', role: 'beam', section: 'nope' }],
    }
    expect(beamAxisOffsets(orphan).size).toBe(0)
  })
})

describe('addOffsets', () => {
  it('sums two arms rather than taking one', () => {
    // A rigid end zone runs ALONG the member and this drop runs DOWN. Taking
    // one and discarding the other silently loses whichever came second.
    expect(addOffsets([0.2, 0, 0], [0, -0.25, 0])).toEqual([0.2, -0.25, 0])
  })

  it('passes either through when the other is absent', () => {
    expect(addOffsets(undefined, [0, -0.25, 0])).toEqual([0, -0.25, 0])
    expect(addOffsets([0.2, 0, 0], undefined)).toEqual([0.2, 0, 0])
    expect(addOffsets(undefined, undefined)).toBeUndefined()
  })
})

describe('the bridge, with and without the drop', () => {
  it('is OFF unless asked — a closed-form benchmark stays on the node line', () => {
    const b = modelToFrame3D(model)
    expect(b.members.find((m) => m.id === 'bx0.0.1')!.offI).toBeUndefined()
  })

  it('keeps statics EXACT — a rigid arm carries force without consuming any', () => {
    const a = solve(false), c = solve(true)
    const sum = (x: typeof a) => x.r.reactions.reduce((t, s) => t + s.F[1], 0)
    expect(sum(c)).toBeCloseTo(sum(a), 6)
  })

  it('does not change the beam’s length — it is translated, not stretched', () => {
    const a = solve(false), c = solve(true)
    const L = (x: typeof a) => x.r.members.find((m) => m.id === 'bx0.0.1')!.L
    expect(L(c)).toBeCloseTo(L(a), 9)
  })

  it('DOES move the column moment, which is the whole point of asking for it', () => {
    // The beam delivers its end forces through a 250 mm arm now, so the column
    // sees that couple. A change of nothing would mean the offsets never
    // reached the element.
    const a = solve(false), c = solve(true)
    const M = (x: typeof a) => x.r.members.find((m) => m.id === 'c0.0.0')!.Mmax
    expect(M(c)).not.toBeCloseTo(M(a), 2)
    expect(Math.abs(M(c) - M(a)) / M(a)).toBeGreaterThan(0.05)
  })
})
