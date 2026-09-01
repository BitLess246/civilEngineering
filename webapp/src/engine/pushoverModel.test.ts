import { describe, it, expect } from 'vitest'
import { plasticMoment, axialCapacity, runPushoverModel } from './pushoverModel'
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
    // The textbook form carries a ROUNDED 0.59 where the algebra gives
    // 1/1.7 = 0.588235… — As·fy·(d − a/2) with a = As·fy/(0.85f'c·b) is the
    // same expression exactly. The engine now solves C = T, so it lands on the
    // exact one; the 0.59 version is 0.045% low and is asserted as such rather
    // than as the answer.
    const exact = (rho * 300 * d * d * 415 * (1 - (rho * 415) / (1.7 * 28))) / 1e6
    const rounded = (rho * 300 * d * d * 415 * (1 - (0.59 * rho * 415) / 28)) / 1e6
    expect(plasticMoment(s, rho)).toBeCloseTo(exact, 6)
    expect(rounded / exact).toBeCloseTo(0.99955, 5)
  })

  it('concrete: an over-reinforced ρ no longer inflates the hinge', () => {
    // ρ is a caller's modelling choice, not a designed area, so nothing bounds
    // it. The old closed form assumed the steel reached fy at any ρ: it peaked,
    // turned over, and went NEGATIVE — a negative plastic moment handed
    // straight to the hinges.
    const s: RectSection = {
      id: 'S', name: '300×600', b: 300, h: 600, fc: 21, fy: 550,
      barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
    }
    const d = 540
    const oldForm = (r: number) => (r * 300 * d * d * 550 * (1 - (0.59 * r * 550) / 21)) / 1e6
    expect(oldForm(0.065)).toBeLessThan(0)                    // the old one, negative
    expect(plasticMoment(s, 0.065)).toBeGreaterThan(0)        // …and the new one, not
    // monotone in ρ, and asymptotic rather than parabolic
    const seq = [0.02, 0.04, 0.06, 0.08, 0.12].map((r) => plasticMoment(s, r))
    expect(seq.every((v, i) => i === 0 || v > seq[i - 1])).toBe(true)
    expect(seq[4] / seq[0]).toBeLessThan(1.5)                 // it flattens out
    // and it is BELOW the yield assumption wherever the steel does not yield
    for (const r of [0.025, 0.03, 0.04]) expect(plasticMoment(s, r)).toBeLessThan(oldForm(r))
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

  it('pmInteraction defaults off; flag is reported in the result', () => {
    expect(runPushoverModel(model, { dir: 0 })!.pmInteraction).toBe(false)
    expect(runPushoverModel(model, { dir: 0, pmInteraction: true })!.pmInteraction).toBe(true)
  })

  it('P–M interaction lowers (or matches) the peak base shear', () => {
    const peak = (r: NonNullable<ReturnType<typeof runPushoverModel>>) =>
      Math.max(...r.result.curve.map((p) => Math.abs(p.baseShear)))
    const off = runPushoverModel(model, { dir: 0, pmInteraction: false })!
    const on = runPushoverModel(model, { dir: 0, pmInteraction: true })!
    expect(peak(on)).toBeLessThanOrEqual(peak(off) + 1e-6)
  })

  it('pDelta defaults off; flag is reported in the result', () => {
    expect(runPushoverModel(model, { dir: 0 })!.pDelta).toBe(false)
    expect(runPushoverModel(model, { dir: 0, pDelta: true })!.pDelta).toBe(true)
  })

  it('P-Δ lowers (or matches) the first-yield base shear from gravity softening', () => {
    // compare at the first yield event, where both analyses share the same (elastic)
    // hinge state — P-Δ amplifies the demand so yield arrives at a lower load factor.
    // (Peak-over-curve isn't a clean invariant: the two runs can terminate on
    // different events — a mechanism vs a drift-target partial step.)
    const firstYield = (r: NonNullable<ReturnType<typeof runPushoverModel>>) =>
      Math.abs(r.result.curve[1].baseShear)
    const off = runPushoverModel(model, { dir: 0, pDelta: false })!
    const on = runPushoverModel(model, { dir: 0, pDelta: true })!
    expect(firstYield(on)).toBeLessThanOrEqual(firstYield(off) + 1e-6)
    expect(firstYield(on)).toBeGreaterThan(firstYield(off) * 0.9)   // small gravity ⇒ close
  })
})

describe('axialCapacity', () => {
  it('concrete: Pn0 = 0.85·f′c·Ag', () => {
    const s: RectSection = {
      id: 'S', name: '400×400', b: 400, h: 400, fc: 28, fy: 415,
      barDia: 20, tieDia: 10, cover: 40, material: 'concrete',
    }
    expect(axialCapacity(s)).toBeCloseTo((0.85 * 28 * 400 * 400) / 1e3, 6)
  })

  it('steel: Py = Fy·A from the AISC shape', () => {
    const name = 'W310x79'
    const shape = shapeByName(name)!
    const s: RectSection = {
      id: 'S', name, b: 305, h: 310, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40,
      material: 'steel', shape: name, steelFy: 345,
    }
    expect(axialCapacity(s)).toBeCloseTo((345 * shape.A) / 1e3, 6)
  })
})
