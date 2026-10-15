import { describe, it, expect } from 'vitest'
import { oneWayShearDepth, oneWayVc } from '../../engine/shear'
import { designSquareFooting } from '../../engine/isolatedFooting'
import { generateGridModel } from '../../engine/modelBuilder'
import { designStructure } from '../../engine/pipeline'
import type { RectSection } from '../../engine/model'
import { DEFAULT_FOOTING_SHEAR, footingShearExample } from './footingShear'
import { provisionById, runProvision, flowOf, flowPath, shelves } from './index'
import { fieldsFromQuery } from './links'
import { inspectDesign } from './inspector'
import type { FootingShearInput } from './types'

const p = provisionById('footing-one-way-shear')!
const run = (i: Partial<FootingShearInput>) => runProvision(p, { ...DEFAULT_FOOTING_SHEAR, ...i })

describe('one-way shear in a footing — the worked example', () => {
  it('matches a hand calculation: 2.4 m pad, 400 column, d = 409, qu = 250 kPa', () => {
    // av = (2.4 − 0.4)/2 − 0.409 = 0.591 m; Vu = 250·2.4·0.591 = 354.6 kN
    // Vc = 0.17·√28·2400·409/1000 = 883.0 kN; φVc = 662.3 kN
    const v = run({}).values
    expect(v.arm).toBeCloseTo(0.591, 9)
    expect(v.Vu).toBeCloseTo(354.6, 6)
    expect(v.Vc).toBeCloseTo(0.17 * Math.sqrt(28) * 2400 * 409 / 1000, 9)
    expect(v.Vc).toBeCloseTo(883.0, 0)
    expect(v.phiVc).toBeCloseTo(662.3, 0)
    expect(run({}).checks[0].state).toBe('pass')
  })

  it('is the engine: the depth oneWayShearDepth sizes is exactly where this check turns', () => {
    for (const [qu, B, c, fc] of [[250, 2.4, 400, 28], [180, 3.2, 500, 21], [320, 1.8, 300, 35]]) {
      const d = oneWayShearDepth({ qu, B, c: c / 1000, fc })
      const at = (dd: number) => runProvision(p, { B, L: B, c, h: dd + 100, d: dd, fc, lambda: 1, qu }).values
      expect(at(d).Vu).toBeLessThanOrEqual(at(d).phiVc)
      expect(at(d - 1).Vu).toBeGreaterThan(at(d - 1).phiVc)
      expect(at(d).Vc).toBe(oneWayVc({ fc, b: B * 1000, d }))
    }
  })

  it('reads zero shear when the section at d falls past the edge', () => {
    const v = run({ L: 1.2, B: 1.2, c: 600, d: 350, h: 450 }).values
    expect(v.arm).toBe(0)
    expect(v.Vu).toBe(0)
    expect(flowPath(flowOf(p, { ...DEFAULT_FOOTING_SHEAR, L: 1.2, B: 1.2, c: 600, d: 350, h: 450 })!).branched).toBe(true)
  })

  it('agrees with the footing designer on the pad it designed', () => {
    const f = designSquareFooting({ serviceLoad: 900, ultimateLoad: 1300, columnWidth: 400, fc: 28, fy: 415, qAllow: 150, gammaSoil: 18, gammaConc: 24, H: 1.5, barDia: 16, cover: 75 })
    const v = runProvision(p, { B: f.B, L: f.B, c: 400, h: f.Dc, d: f.dProvided, fc: 28, lambda: 1, qu: f.qu }).values
    expect(f.beamOK).toBe(true)
    expect(v.Vu).toBeLessThanOrEqual(v.phiVc)
    expect(f.dProvided).toBeGreaterThanOrEqual(f.dBeam)
  })

  it('branches to the remedy when it fails, and refuses impossible geometry', () => {
    const bad = flowOf(p, { ...DEFAULT_FOOTING_SHEAR, d: 200, h: 300, qu: 600 })!
    const path = flowPath(bad)
    expect(path.branched).toBe(true)
    expect(bad.steps[path.last].branch!.to.state).toBe('fail')
    expect(footingShearExample({ ...DEFAULT_FOOTING_SHEAR, c: 3000 })).toBeNull()
    expect(run({ d: 600, h: 500 }).checks).toHaveLength(0)
  })

  it('sits on the Foundations shelf beside punching', () => {
    const ids = shelves().find((s) => s.category === 'foundations')!.items.map((x) => x.id)
    expect(ids).toEqual(expect.arrayContaining(['two-way-punching-shear', 'footing-one-way-shear']))
  })
})

describe('Model Space footings link both shear checks', () => {
  const section: RectSection = { id: 'S1', name: '400×400', b: 400, h: 400, fc: 28, fy: 415, barDia: 20, tieDia: 10, cover: 40 }
  const loaded = (baysX: number[], baysZ: number[]) => {
    const m = generateGridModel({ baysX, baysZ, storeyH: [3], section, slabThickness: 200 })
    m.loads = m.plates.flatMap((pl) => [
      { kind: 'area' as const, plate: pl.id, q: 4.8, cat: 'D' as const },
      { kind: 'area' as const, plate: pl.id, q: 2.4, cat: 'L' as const },
    ])
    return m
  }

  it('an isolated pad: one-way shear itemised at the built d, reopening to the same ratio', () => {
    const model = loaded([6, 6], [5])
    const d = designStructure(model, { qAllow: 200, gammaSoil: 18, gammaConc: 24, H: 1.5 })!
    const feet = inspectDesign(model, d).filter((x) => x.kind === 'footing')
    expect(feet.length).toBeGreaterThan(0)
    for (const f of feet) {
      const c = f.checks.find((x) => x.name === 'One-way shear')!
      expect(c.explain).toMatch(/^\/codes\/footing-one-way-shear\?/)
      const back = fieldsFromQuery(new URLSearchParams(c.explain!.split('?')[1]), p)
      expect(back.carried.length).toBe(p.fields.length)
      const v = runProvision(p, back.inp).values
      expect(v.Vu / v.phiVc).toBeCloseTo(c.util!, 9)
      expect(c.util!).toBeLessThanOrEqual(1)
      expect(c.state).not.toBe('fail')
    }
  })

  it('a combined pad: punching at its critical column, linked, within the capacity it was sized to', () => {
    // close columns on weak soil overlap, so the pipeline combines them (pipeline.test)
    const model = loaded([6, 1.2, 6], [6])
    const d = designStructure(model, { qAllow: 80, gammaSoil: 18, gammaConc: 24, H: 1.5 })!
    expect(d.combined.length).toBeGreaterThan(0)
    const punch = provisionById('two-way-punching-shear')!
    for (const cf of inspectDesign(model, d).filter((x) => x.kind === 'combined')) {
      const c = cf.checks.find((x) => x.name.startsWith('Two-way'))!
      expect(c.explain).toMatch(/^\/codes\/two-way-punching-shear\?/)
      const back = fieldsFromQuery(new URLSearchParams(c.explain!.split('?')[1]), punch)
      const v = runProvision(punch, back.inp).values
      expect(v.Vu / v.phiVc).toBeCloseTo(c.util!, 9)
      // Dc is at least the punching depth plus cover and bar, so it passes
      expect(c.util!).toBeLessThanOrEqual(1)
      const row = d.combined.find((r) => r.nodes.join(' + ') === cf.id)!
      const crit = row.design.Pu2 >= row.design.Pu1 ? row.nodes[1] : row.nodes[0]
      expect(c.name).toContain(crit)
    }
  })
})
