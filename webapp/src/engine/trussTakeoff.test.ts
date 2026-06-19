import { describe, it, expect } from 'vitest'
import { generateTruss, solveTrussEnvelope, selfWeightLoads, type EnvForce } from './truss'
import { effectiveSection } from './aiscSections'
import { trussTakeoff, costTrussBill } from './trussTakeoff'

const STEEL_DENSITY = 7850   // kg/m³

function makeForces(): EnvForce[] {
  const model = generateTruss({ type: 'pratt', span: 12, height: 2, panels: 4, panelLoad: 10 })
  const eff = effectiveSection({ name: 'L102x102x9.5', family: 'L', A: 1890, rx: 31.7, ry: 31.7, rz: 20.1 } as Parameters<typeof effectiveSection>[0])
  const dead = [
    ...selfWeightLoads(model, eff.A),
    ...model.loads.map((l) => ({ ...l, fy: l.fy })),
  ]
  const live = model.loads.map((l) => ({ ...l }))
  const env = solveTrussEnvelope(model, dead, live)!
  return env.forces
}

describe('trussTakeoff', () => {
  const eff = effectiveSection({ name: 'L102x102x9.5', family: 'L', A: 1890, rx: 31.7, ry: 31.7, rz: 20.1 } as Parameters<typeof effectiveSection>[0])
  const forces = makeForces()

  it('computes kgPerM from section area', () => {
    const t = trussTakeoff(forces, eff)
    const expected = (eff.A / 1e6) * STEEL_DENSITY
    expect(t.kgPerM).toBeCloseTo(expected, 6)
  })

  it('per-member weight = L × kgPerM', () => {
    const t = trussTakeoff(forces, eff)
    for (const m of t.byMember) {
      expect(m.netWeightKg).toBeCloseTo(m.L * t.kgPerM, 9)
    }
  })

  it('netSteelKg is the sum of all member weights', () => {
    const t = trussTakeoff(forces, eff)
    const sum = t.byMember.reduce((s, m) => s + m.netWeightKg, 0)
    expect(t.netSteelKg).toBeCloseTo(sum, 9)
  })

  it('default 10 % gusset allowance', () => {
    const t = trussTakeoff(forces, eff)
    expect(t.gussetFraction).toBe(0.10)
    expect(t.gussetKg).toBeCloseTo(t.netSteelKg * 0.10, 9)
    expect(t.totalKg).toBeCloseTo(t.netSteelKg * 1.10, 9)
  })

  it('custom gusset fraction is applied', () => {
    const t = trussTakeoff(forces, eff, { gussetFraction: 0.15 })
    expect(t.gussetKg).toBeCloseTo(t.netSteelKg * 0.15, 9)
  })

  it('byKind subtotals sum to the net total', () => {
    const t = trussTakeoff(forces, eff)
    const kindNet = t.byKind.reduce((s, k) => s + k.netKg, 0)
    expect(kindNet).toBeCloseTo(t.netSteelKg, 6)
  })

  it('all members accounted for in byKind', () => {
    const t = trussTakeoff(forces, eff)
    const kindCount = t.byKind.reduce((s, k) => s + k.members, 0)
    expect(kindCount).toBe(t.byMember.length)
  })
})

describe('costTrussBill', () => {
  const eff = effectiveSection({ name: 'L102x102x9.5', family: 'L', A: 1890, rx: 31.7, ry: 31.7, rz: 20.1 } as Parameters<typeof effectiveSection>[0])
  const forces = makeForces()
  const t = trussTakeoff(forces, eff)

  it('bill total = net steel + gusset at the same unit price', () => {
    const bill = costTrussBill(t, { steelKg: 80 })
    expect(bill.total).toBeCloseTo(t.totalKg * 80, 4)
  })

  it('two rows: sections and gusset plates', () => {
    const bill = costTrussBill(t, { steelKg: 80 })
    expect(bill.rows).toHaveLength(2)
    expect(bill.rows[0].qty).toBeCloseTo(t.netSteelKg, 6)
    expect(bill.rows[1].qty).toBeCloseTo(t.gussetKg, 6)
  })
})
