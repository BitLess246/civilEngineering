import { describe, it, expect } from 'vitest'
import { interaction, capacityAtEccentricity, designAxialColumn } from '../../engine/columnDesign'
import { designTBeam } from '../../engine/tbeam'
import { DEFAULT_COLUMN, columnExample } from './rcColumn'
import { provisionById, rcBeamProvision, runProvision, flowOf, flowPath, searchProvisions, shelves } from './index'
import { codeLink, exampleFromQuery, fieldsFromQuery } from './links'
import type { ColumnExampleInput } from './types'

const p = provisionById('rc-column-pm')!
const run = (i: Partial<ColumnExampleInput>) => runProvision(p, { ...DEFAULT_COLUMN, ...i })

describe('a tied column under P and M — the worked example', () => {
  it('matches a hand calculation at the axial end: 400×400, 8-⌀28, f′c 28, fy 415', () => {
    // Ast = 8·π/4·28² = 4926.0 mm²
    // Po = 0.85·28·(160000 − 4926.0) + 415·4926.0 = 3690.8 + 2044.3 = 5735.1 kN
    // φPn,max = 0.65·0.80·Po = 2982.3 kN
    const v = run({}).values
    const Ast = 8 * Math.PI / 4 * 28 ** 2
    expect(v.Ast).toBeCloseTo(Ast, 6)
    expect(v.Po).toBeCloseTo((0.85 * 28 * (160000 - Ast) + 415 * Ast) / 1000, 6)
    expect(v.Po).toBeCloseTo(5735.1, 0)
    expect(v.phiPnMax).toBeCloseTo(2982.3, 0)
  })

  it('places the balanced point at cb = 600/(600 + fy)·dt, where the far bars just yield', () => {
    const v = run({ layout: 'two-face' }).values
    const dt = 400 - (40 + 10 + 14)
    expect(v.dt).toBe(dt)
    expect(v.cb).toBeCloseTo((600 / 1015) * dt, 9)
  })

  it('is the engine: the capacity along e = Mu/Pu is capacityAtEccentricity\'s, the axial cap designAxialColumn\'s', () => {
    for (const layout of ['two-face', 'all-around'] as const) {
      for (const [Pu, Mu] of [[2944, 200], [1500, 260], [600, 220], [2500, 30]]) {
        const i = { ...DEFAULT_COLUMN, layout, Pu, Mu }
        const cap = capacityAtEccentricity(i, Mu / Pu)
        const v = runProvision(p, i).values
        expect(v.phiPn).toBe(cap.phi * cap.Pn)
        expect(v.phi).toBe(cap.phi)
        expect(v.PnMax).toBe(interaction(i).PnMax)
      }
    }
    const ax = designAxialColumn({ shape: 'tied', b: 400, h: 400, cover: 40, barDia: 28, tieDia: 10, fc: 28, fy: 415, Pu: 2944, numBars: 8 })
    expect(run({}).values.phiPnMax).toBeCloseTo(ax.phiPnMax, 9)
  })

  it('earns φ = 0.90 under small axial load and keeps 0.65 under large', () => {
    expect(run({ Pu: 50, Mu: 300 }).values.phi).toBeCloseTo(0.9, 9)
    expect(run({ Pu: 2800, Mu: 20 }).values.phi).toBe(0.65)
  })

  it('fails along the ray, or on the cap, and the flow says which', () => {
    const ray = flowOf(p, { ...DEFAULT_COLUMN, Pu: 1500, Mu: 600 })!
    const rp = flowPath(ray)
    expect(rp.branched).toBe(true)
    expect(ray.steps[rp.last].branch!.to.text).toMatch(/outside the design curve/)
    const capped = flowOf(p, { ...DEFAULT_COLUMN, Pu: 3500, Mu: 10 })!
    expect(capped.steps[flowPath(capped).last].branch!.to.text).toMatch(/Too much axial load/)
    expect(run({ Pu: 1500, Mu: 600 }).checks[0].state).toBe('fail')
  })

  it('refuses a section that cannot exist', () => {
    expect(columnExample({ ...DEFAULT_COLUMN, numBars: 2 })).toBeNull()
    expect(run({ h: 100 }).checks).toHaveLength(0)
  })

  it('is on the concrete shelf and found by search', () => {
    expect(shelves().find((s) => s.category === 'concrete')!.items.map((x) => x.id)).toContain('rc-column-pm')
    expect(searchProvisions('interaction diagram')[0].id).toBe('rc-column-pm')
  })

  it('carries a Column Design column through a link exactly', () => {
    const ex = { b: 450, h: 500, cover: 40, tieDia: 10, barDia: 25, numBars: 12, layout: 'two-face', fc: 32, fy: 415, Pu: 1873.25, Mu: 215.6 }
    const url = codeLink('rc-column-pm', ex, { route: '/column-design', label: 'Column Design' })
    const back = fieldsFromQuery(new URLSearchParams(url.split('?')[1]), p)
    expect(back.inp).toEqual(ex)
    expect(back.from?.route).toBe('/column-design')
  })
})

describe('T-Beam Design explains its flexure only where the beam page is the same check', () => {
  it('a single-layer, flange-held section is a bf-wide rectangle: the same φMn, and the link carries bf', () => {
    for (const Mu of [150, 250]) {
      const r = designTBeam({ kind: 'interior', bw: 300, h: 600, hf: 100, ln: 6, sw: 3, cover: 40, stirrupDia: 10, barDia: 20, fc: 28, fy: 415, Mu })
      expect(r.tBehavior).toBe(false)
      expect(r.layers).toHaveLength(1)
      const ex = { b: r.bf, h: 600, cover: 40, stirrupDia: 10, nBars: r.bars, barDia: 20, fc: 28, fy: 415, fyt: 415, Mu }
      const back = exampleFromQuery(new URLSearchParams(codeLink('rc-beam-flexure', ex).split('?')[1]))
      expect(back.inp.b).toBe(r.bf)                 // a 1500 mm flange passes the link screen
      expect(rcBeamProvision('rc-beam-flexure')!.evaluate(back.inp).values.phiMn).toBeCloseTo(r.phiMn, 9)
    }
  })
})
