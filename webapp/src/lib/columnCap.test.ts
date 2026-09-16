/**
 * Where a terminating column's solid stops.
 *
 * The defect this exists for: the viewport took the rise from
 * `autoRigidOffsets`, which measures half the framing depth. That was right
 * when a beam was drawn CENTRED on its node; once beams were dropped so their
 * TOP is the node, the same number became pure overshoot and every roof column
 * grew a stub above its own slab. These pin the rise against what is actually
 * drawn, so the two conventions cannot drift apart again.
 */
import { describe, it, expect } from 'vitest'
import { columnCapRise } from './columnCap'
import { autoRigidOffsets } from '../engine/rigidEndZones'
import { generateGridModel } from '../engine/modelBuilder'
import type { RectSection, StructuralModel } from '../engine/model'

const section: RectSection = {
  id: 'S1', name: '300×500', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
}
const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3, 3], section })
const rise = columnCapRise(model)
const nodeById = new Map(model.nodes.map((n) => [n.id, n]))
const topY = Math.max(...model.nodes.map((n) => n.y))
const columns = model.members.filter((m) => m.role === 'column')
const upper = (m: { i: string; j: string }) =>
  nodeById.get(m.i)!.y >= nodeById.get(m.j)!.y ? nodeById.get(m.i)! : nodeById.get(m.j)!

describe('a beam that hangs asks for no cap at all', () => {
  it('gives every roof column a rise of zero', () => {
    // The beams at the roof hang below their nodes, so their top IS the node
    // and there is nothing above it for the column to reach.
    const roof = columns.filter((m) => Math.abs(upper(m).y - topY) < 1e-9)
    expect(roof.length, 'fixture must have roof columns').toBeGreaterThan(0)
    for (const m of roof) expect(rise.get(m.id) ?? 0, m.id).toBe(0)
  })

  it('leaves intermediate columns alone — the storey above fills the joint', () => {
    const mid = columns.filter((m) => Math.abs(upper(m).y - topY) > 1e-9)
    expect(mid.length).toBeGreaterThan(0)
    for (const m of mid) expect(rise.get(m.id) ?? 0, m.id).toBe(0)
  })

  it('asks for nothing anywhere on this frame', () => {
    expect(rise.size).toBe(0)
  })
})

describe('the number it replaces', () => {
  it('measures the overshoot the rigid-zone offset was producing', () => {
    // `autoRigidOffsets` gives a roof column an offJ of half the framing beam
    // depth, and the viewport SUBTRACTED it — raising the top by that much.
    // For a 500 mm beam that is 0.25 m of column standing above its own roof.
    const off = autoRigidOffsets(model, 1)
    const roof = columns.find((m) => Math.abs(upper(m).y - topY) < 1e-9)!
    const upIsJ = nodeById.get(roof.j)!.y >= nodeById.get(roof.i)!.y
    const o = off.get(roof.id)
    const v = upIsJ ? o?.offJ : o?.offI
    expect(v, 'the old source of the rise must still exist to compare against').toBeTruthy()
    expect(Math.abs(v![1])).toBeCloseTo(0.25, 9)
    // and the drawn answer is zero, so the stub was the whole 0.25 m
    expect(rise.get(roof.id) ?? 0).toBe(0)
  })
})

describe('a member that does NOT hang still gets its cap', () => {
  // A column terminating under something centred on the node — a brace, a
  // sloping member — genuinely has concrete above the node to reach. The rule
  // is "measure what is drawn", not "always zero", and this is the half of it
  // that would be lost by special-casing beams to nothing.
  // Built standalone, NOT spread from the grid model: `generateGridModel`
  // gives every member its own section id, so a fixture that spreads it and
  // then references 'S1' resolves to no section at all and silently measures a
  // zero-depth member. That is how the first version of this case passed for
  // the wrong reason.
  const braced: StructuralModel = {
    ...model,
    sections: [section],
    plates: [],
    nodes: [
      { id: 'n0', x: 0, y: 0, z: 0 }, { id: 'n1', x: 0, y: 3, z: 0 },
      { id: 'n2', x: 4, y: 3, z: 0 },
    ],
    members: [
      { id: 'c1', i: 'n0', j: 'n1', role: 'column', section: 'S1' },
      { id: 'br', i: 'n1', j: 'n2', role: 'brace', section: 'S1' },
    ],
  } as StructuralModel

  it('rises by the framing member’s half-extent', () => {
    const r = columnCapRise(braced)
    // A horizontal 'brace' is not in HANGS_BELOW_NODE, so it is drawn centred
    // on the node and its top is half a depth above it.
    expect(r.get('c1')).toBeCloseTo(0.25, 9)
  })

  it('drops back to zero the moment that member is made a beam', () => {
    const asBeam: StructuralModel = {
      ...braced,
      members: braced.members.map((m) => (m.id === 'br' ? { ...m, role: 'beam' as const } : m)),
    }
    expect(columnCapRise(asBeam).get('c1') ?? 0).toBe(0)
  })
})

describe('a continuing stack never gets a cap', () => {
  // Found by sabotage: deleting the "storey above fills it" guard left the
  // whole suite green, because on an ordinary frame every intermediate node
  // carries only hanging beams and the rise is zero for that reason instead.
  // A brace at the intermediate node separates the two: without the guard the
  // LOWER column would grow a cap up into the column that already occupies it.
  const stacked: StructuralModel = {
    ...model,
    sections: [section],
    plates: [],
    nodes: [
      { id: 'a0', x: 0, y: 0, z: 0 }, { id: 'a1', x: 0, y: 3, z: 0 },
      { id: 'a2', x: 0, y: 6, z: 0 }, { id: 'b1', x: 4, y: 3, z: 0 },
    ],
    members: [
      { id: 'lower', i: 'a0', j: 'a1', role: 'column', section: 'S1' },
      { id: 'upper', i: 'a1', j: 'a2', role: 'column', section: 'S1' },
      { id: 'br', i: 'a1', j: 'b1', role: 'brace', section: 'S1' },
    ],
  } as StructuralModel

  it('caps the column that ENDS and not the one that continues', () => {
    const r = columnCapRise(stacked)
    expect(r.get('lower') ?? 0, 'the storey above fills this joint').toBe(0)
    // The upper column ends at a2, where nothing frames in at all.
    expect(r.get('upper') ?? 0).toBe(0)
  })

  it('would cap the lower column if the brace were the only thing there', () => {
    // Same node, same brace, without the column above: now the cap is real.
    const ended: StructuralModel = {
      ...stacked,
      members: stacked.members.filter((m) => m.id !== 'upper'),
    }
    expect(columnCapRise(ended).get('lower')).toBeCloseTo(0.25, 9)
  })
})

describe('degenerate input', () => {
  it('never returns a negative rise', () => {
    for (const v of rise.values()) expect(v).toBeGreaterThan(0)
  })

  it('survives a member naming a node the model does not carry', () => {
    const broken: StructuralModel = {
      ...model,
      members: [...model.members, { id: 'ghost', i: 'nope', j: 'alsonope', role: 'beam', section: 'S1' }],
    } as StructuralModel
    expect(() => columnCapRise(broken)).not.toThrow()
  })

  it('survives a zero-length member', () => {
    const zero: StructuralModel = {
      ...model,
      nodes: [...model.nodes, { id: 'zA', x: 0, y: 0, z: 0 }],
      members: [...model.members, { id: 'z', i: 'zA', j: 'zA', role: 'beam', section: 'S1' }],
    } as StructuralModel
    expect(() => columnCapRise(zero)).not.toThrow()
  })
})
