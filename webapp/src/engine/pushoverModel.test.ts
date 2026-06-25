import { describe, it, expect } from 'vitest'
import { plasticMoment, runPushoverModel } from './pushoverModel'
import { shapeByName } from './aiscSections'
import { deriveWSection } from './steelDesign'
import { generateGridModel } from './modelBuilder'
import type { RectSection } from './model'

describe('plasticMoment', () => {
  it('concrete: ρ·b·d²·fy·(1−0.59ρfy/fc)', () => {
    const s: RectSection = {
      id: 'S', name: '300×500', b: 300, h: 500, fc: 28, fy: 415,
      barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
    }
    const rho = 0.015
    const d = 500 - 40 - 10 - 10           // 440
    const expected = (rho * 300 * d * d * 415 * (1 - (0.59 * rho * 415) / 28)) / 1e6
    expect(plasticMoment(s, rho)).toBeCloseTo(expected, 6)
  })

  it('steel W: Mp = Fy·Zx', () => {
    const name = 'W310x79'
    const shape = shapeByName(name)!
    const s: RectSection = {
      id: 'S', name, b: 305, h: 310, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
      material: 'steel', shape: name, steelFy: 345,
    }
    expect(plasticMoment(s)).toBeCloseTo((345 * deriveWSection(shape).Zx) / 1e6, 6)
  })

  it('scales with the concrete ratio ρ (monotone increasing under-reinforced)', () => {
    const s: RectSection = {
      id: 'S', name: 'x', b: 300, h: 500, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
    }
    expect(plasticMoment(s, 0.02)).toBeGreaterThan(plasticMoment(s, 0.01))
  })
})

describe('runPushoverModel', () => {
  const section: RectSection = {
    id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415,
    barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
  }
  const model = generateGridModel({ baysX: [6], baysZ: [5], storeyH: [3.5, 3], section })

  it('runs and returns a capacity curve with a roof control node', () => {
    const r = runPushoverModel(model, { dir: 0, pattern: 'triangular' })!
    expect(r).toBeTruthy()
    expect(r.nHingeable).toBeGreaterThan(0)
    expect(r.totalHeight).toBeCloseTo(6.5, 6)
    // control node is at the roof (max y)
    const ctrl = model.nodes.find((n) => n.id === r.controlNode)!
    const yMax = Math.max(...model.nodes.map((n) => n.y))
    expect(ctrl.y).toBeCloseTo(yMax, 6)
    // capacity curve starts at the origin and grows
    expect(r.result.curve[0]).toMatchObject({ event: 0, baseShear: 0, roofDisp: 0 })
    expect(r.result.curve.length).toBeGreaterThan(1)
  })

  it('curve is monotonic in displacement (event-to-event)', () => {
    const r = runPushoverModel(model, { dir: 0 })!
    const pts = r.result.curve
    for (let k = 1; k < pts.length; k++)
      expect(Math.abs(pts[k].roofDisp)).toBeGreaterThan(Math.abs(pts[k - 1].roofDisp) - 1e-12)
  })

  it('mpScale lifts the capacity proportionally at first yield', () => {
    const a = runPushoverModel(model, { dir: 0, mpScale: 1 })!
    const b = runPushoverModel(model, { dir: 0, mpScale: 2 })!
    // first-yield base shear doubles when every Mp doubles
    expect(Math.abs(b.result.curve[1].baseShear)).toBeCloseTo(2 * Math.abs(a.result.curve[1].baseShear), 4)
  })

  it('returns null for an empty model', () => {
    expect(runPushoverModel({ ...model, nodes: [], members: [] })).toBeNull()
  })
})
